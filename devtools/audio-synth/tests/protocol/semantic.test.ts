/**
 * F6c — isteğe bağlı semantic scorer adaptörü. Kilitlenen sözleşme:
 *
 *  - Scorer HARİCİ süreçtir (stdin/stdout JSON); core model bağımlılığı yok.
 *  - Varsayılan KAPALI: `--semantic` verilmedikçe hiçbir süreç koşmaz.
 *  - Skorlar danışmandır: `semantic.json` + sıralama; aday durumu, karar ve
 *    publish kapıları mekanik rapora bağlı kalır.
 *  - Scorer hatası aramayı geri almaz: rapor önce yazılır, hata `toolchain`
 *    ya da `invalid` olarak yüzeye çıkar.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtocolError, runSearch } from '../../src/protocol';
import {
  checkSemanticTerms,
  rankedOrder,
  SEMANTIC_REQUEST_SCHEMA,
  SEMANTIC_SCHEMA,
  SEMANTIC_SCORER_ENV,
  validateSemanticResponse,
  type SearchSemanticV1,
  type SemanticScoreRequestV1,
} from '../../src/search';
import { AudioParamError } from '../../src/guard/errors';
import { programSpec } from '../search/fixtures';
import { createTestRepo, type TestRepo } from './repo';

const ROOT = 'devtools/audio-synth/audio-searches';
const SCORER = fileURLToPath(new URL('../fixtures/fakeScorer.mjs', import.meta.url));
const scorerCmd = `"${process.execPath}" "${SCORER}"`;

let repo: TestRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
  delete process.env[SEMANTIC_SCORER_ENV];
  delete process.env.FAKE_SCORER_MODE;
  delete process.env.FAKE_SCORER_DUMP;
});

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirdi');
}

const TERMS = { positive: ['parlak'], negative: [] };

describe('semantic terimleri ve yanıt şeması', () => {
  it('boş terim, örtüşme ve sınır aşımı reddedilir', () => {
    expect(() => checkSemanticTerms({ positive: [], negative: [] }, 't')).toThrow(AudioParamError);
    expect(() => checkSemanticTerms({ positive: ['parlak'], negative: ['parlak'] }, 't')).toThrow(
      AudioParamError,
    );
    expect(() =>
      checkSemanticTerms({ positive: Array.from({ length: 17 }, (_, i) => `t${i}`) }, 't'),
    ).toThrow(AudioParamError);
    expect(() => checkSemanticTerms({ positive: ['x'.repeat(81)] }, 't')).toThrow(AudioParamError);
  });

  it('yanıt: şema, bilinen kimlik, tek kimlik ve sonlu skor zorunlu', () => {
    const allowed = new Set(['c-1', 'c-2']);
    const bad = (doc: unknown) => () => validateSemanticResponse(doc, allowed);
    expect(bad({ schema: 'X', scores: [] })).toThrow(AudioParamError);
    expect(
      bad({
        schema: 'SemanticScoreResponseV1',
        scores: [{ candidateId: 'c-9', score: 1 }],
      }),
    ).toThrow(AudioParamError);
    expect(
      bad({
        schema: 'SemanticScoreResponseV1',
        scores: [
          { candidateId: 'c-1', score: 1 },
          { candidateId: 'c-1', score: 0 },
        ],
      }),
    ).toThrow(AudioParamError);
    expect(
      bad({
        schema: 'SemanticScoreResponseV1',
        scores: [{ candidateId: 'c-1', score: Number.NaN }],
      }),
    ).toThrow(AudioParamError);
    expect(
      bad({
        schema: 'SemanticScoreResponseV1',
        scores: [{ candidateId: 'c-1', score: 1, note: 7 }],
      }),
    ).toThrow(AudioParamError);
  });

  it('sıralama: skor azalan, eşitlikte kimlik', () => {
    expect(
      rankedOrder([
        { candidateId: 'c-3', score: 0.5, note: null },
        { candidateId: 'c-1', score: 0.9, note: null },
        { candidateId: 'c-2', score: 0.5, note: null },
      ]),
    ).toEqual(['c-1', 'c-2', 'c-3']);
  });
});

describe('semantic scorer koşusu', () => {
  it('kapalıyken süreç koşmaz: semantic null, semantic.json yok', () => {
    repo = createTestRepo();
    process.env[SEMANTIC_SCORER_ENV] = scorerCmd;
    process.env.FAKE_SCORER_DUMP = join(repo.root, 'dump.json');
    const outcome = runSearch(repo.root, ROOT, programSpec({ searchId: 'sem-off' }));
    expect(outcome.semantic).toBeNull();
    expect(existsSync(join(repo.root, ROOT, 'sem-off', 'semantic.json'))).toBe(false);
    expect(existsSync(join(repo.root, 'dump.json'))).toBe(false);
  });

  it('skorer koşar: semantic.json + sıralama; aday durumları değişmez', () => {
    repo = createTestRepo();
    const plain = runSearch(repo.root, ROOT, programSpec({ searchId: 'sem-plain' }));
    const scored = runSearch(repo.root, ROOT, programSpec({ searchId: 'sem-on' }), {
      semantic: { command: scorerCmd, terms: TERMS },
    });
    expect(scored.semantic).not.toBeNull();
    // Danışman sınırı: aynı spec'in aday durumları skorlama ile birebir aynı.
    expect(scored.report.candidates.map((c) => c.state)).toEqual(
      plain.report.candidates.map((c) => c.state),
    );
    const file = join(repo.root, ROOT, 'sem-on', 'semantic.json');
    expect(existsSync(file)).toBe(true);
    const doc = JSON.parse(readFileSync(file, 'utf8')) as SearchSemanticV1;
    expect(doc.schema).toBe(SEMANTIC_SCHEMA);
    expect(doc.reportHash).toBe(scored.reportHash);
    expect(doc.terms).toEqual(TERMS);
    expect(doc.scorer.command).toBe(scorerCmd);
    const scoredIds = scored.report.candidates
      .map((c) => c.candidateId)
      .filter((id): id is string => id !== null);
    expect(doc.scores.map((s: { candidateId: string }) => s.candidateId).sort()).toEqual(
      scoredIds.sort(),
    );
    expect(doc.ranked.length).toBe(scoredIds.length);
    // Skorer WAV'ları export ağacında (arama dizininde DEĞİL, git'e girmez).
    for (const id of scoredIds) {
      expect(
        existsSync(
          join(
            repo.root,
            'devtools/audio-synth/export/audio-searches/sem-on/semantic',
            `${id}.wav`,
          ),
        ),
      ).toBe(true);
    }
  });

  it('istek belgesi: şema, kimlikler, terimler ve WAV yolları', () => {
    repo = createTestRepo();
    process.env.FAKE_SCORER_DUMP = join(repo.root, 'dump.json');
    const outcome = runSearch(repo.root, ROOT, programSpec({ searchId: 'sem-req' }), {
      semantic: { command: scorerCmd, terms: TERMS },
    });
    const request = JSON.parse(
      readFileSync(join(repo.root, 'dump.json'), 'utf8'),
    ) as SemanticScoreRequestV1;
    expect(request.schema).toBe(SEMANTIC_REQUEST_SCHEMA);
    expect(request.searchId).toBe('sem-req');
    expect(request.reportHash).toBe(outcome.reportHash);
    expect(request.terms).toEqual(TERMS);
    for (const item of request.items) {
      expect(item.wav).toMatch(
        /^devtools\/audio-synth\/export\/audio-searches\/sem-req\/semantic\//,
      );
      expect(item.descriptors).not.toBeNull();
    }
  });

  it('scorer komutu ortam değişkeninden de okunur', () => {
    repo = createTestRepo();
    process.env[SEMANTIC_SCORER_ENV] = scorerCmd;
    const outcome = runSearch(repo.root, ROOT, programSpec({ searchId: 'sem-env' }), {
      semantic: { terms: TERMS },
    });
    expect(outcome.semantic?.document.scores.length).toBeGreaterThan(0);
  });

  it('scorer yoksa `invalid`; rapor yine de tamamlanmış kalır', () => {
    repo = createTestRepo();
    expect(
      codeOf(() =>
        runSearch(repo!.root, ROOT, programSpec({ searchId: 'sem-missing' }), {
          semantic: { terms: TERMS },
        }),
      ),
    ).toBe('invalid');
    expect(existsSync(join(repo.root, ROOT, 'sem-missing', 'report.json'))).toBe(true);
  });

  it.each([
    ['exit', 'toolchain'],
    ['garbage', 'toolchain'],
    ['silent', 'toolchain'],
    ['unknown', 'toolchain'],
  ] as const)('scorer kipi %s → %s; rapor tamamlanmış kalır', (mode, code) => {
    repo = createTestRepo();
    process.env.FAKE_SCORER_MODE = mode;
    expect(
      codeOf(() =>
        runSearch(repo!.root, ROOT, programSpec({ searchId: `sem-${mode}` }), {
          semantic: { command: scorerCmd, terms: TERMS },
        }),
      ),
    ).toBe(code);
    expect(existsSync(join(repo.root, ROOT, `sem-${mode}`, 'report.json'))).toBe(true);
    expect(existsSync(join(repo.root, ROOT, `sem-${mode}`, 'semantic.json'))).toBe(false);
  });

  it('boş terimler reddedilir (AudioParamError); rapor tamamlanmış kalır', () => {
    repo = createTestRepo();
    expect(() =>
      runSearch(repo!.root, ROOT, programSpec({ searchId: 'sem-noterms' }), {
        semantic: { command: scorerCmd, terms: { positive: [], negative: [] } },
      }),
    ).toThrow(AudioParamError);
    expect(existsSync(join(repo.root, ROOT, 'sem-noterms', 'report.json'))).toBe(true);
  });
});
