import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram } from '../../src/music/score';
import {
  applyDimensions,
  musicCandidateIdOf,
  searchSymbolic,
  validateMusicSearchSpec,
  type MusicSearchSpecV1,
} from '../../src/music/search';
import { ProtocolError } from '../../src/protocol/errors';
import {
  loadMusicSearchSpec,
  promoteMusicCandidate,
  runMusicSearch,
} from '../../src/protocol/musicSearch';
import type { MusicLocation } from '../../src/protocol/music';
import { createTestRepo, type TestRepo } from '../protocol/repo';
import { musicBrief, unitProgram } from './fixtures';

/*
 * Müzik testleri GERÇEK ses render eder; kapsam ölçümü (v8 + AST yeniden
 * eşleme) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan süre
 * dolar. Süre sınırı bu yüzden blok başına açıkça verilir — ölçülen bir
 * kısıt, keyfi bir sayı değil.
 */
const HEAVY = { timeout: 120_000 };

const MUSIC_ROOT = 'devtools/audio-synth/audio-music';

function spec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'MusicSearchSpecV1',
    searchId: 'unit-balance',
    musicId: 'unit-loop',
    seed: 4242,
    strategy: 'scrambled-halton',
    candidates: 12,
    finalists: 2,
    dimensions: [
      { name: 'lead-gain', target: { kind: 'lane-gain', lane: 'lead' }, range: [0.2, 0.6] },
      { name: 'swing', target: { kind: 'groove-swing', groove: 'human' }, range: [0, 0.3] },
      { name: 'keys-thin', target: { kind: 'density-thinning', lane: 'keys' }, range: [0, 0.6] },
    ],
    objectives: [
      { metric: 'notesPerBar', target: 5 },
      { metric: 'melodicSalience', target: 0.3, weight: 3 },
    ],
    ...overrides,
  };
}

describe('MusicSearchSpecV1', HEAVY, () => {
  it('geçerli spec’i doğrular', () => {
    const parsed = validateMusicSearchSpec(spec());
    expect(parsed.dimensions).toHaveLength(3);
    expect(parsed.objectives[1].weight).toBe(3);
  });

  it.each([
    ['şema', { schema: 'MusicSearchSpecV2' }],
    ['strateji', { strategy: 'grid' }],
    ['aday sayısı', { candidates: 1 }],
    ['finalist sayısı', { finalists: 99 }],
    ['boş boyut', { dimensions: [] }],
    ['metrik', { objectives: [{ metric: 'swing', target: 1 }] }],
  ])('%s hatalıysa reddedilir', (_label, patch) => {
    expect(() => validateMusicSearchSpec(spec(patch))).toThrow(AudioParamError);
  });

  it('aynı boyut adı iki kez yazılamaz', () => {
    const duplicate = spec({
      dimensions: [
        { name: 'x', target: { kind: 'lane-gain', lane: 'lead' }, range: [0, 1] },
        { name: 'x', target: { kind: 'lane-gain', lane: 'bass' }, range: [0, 1] },
      ],
    });
    expect(() => validateMusicSearchSpec(duplicate)).toThrow(/tekrar etti/);
  });

  it('aday kimliği programın özetinden türer', () => {
    const parsed = validateMusicSearchSpec(spec());
    const hash = 'sha256:'.concat('a'.repeat(64)) as `sha256:${string}`;
    expect(musicCandidateIdOf(hash, parsed)).toBe(musicCandidateIdOf(hash, parsed));
    expect(musicCandidateIdOf(hash, parsed)).toMatch(/^c-[0-9a-f]{16}$/);
    const otherSeed = { ...parsed, seed: 7 } as MusicSearchSpecV1;
    expect(musicCandidateIdOf(hash, otherSeed)).not.toBe(musicCandidateIdOf(hash, parsed));
  });
});

describe('boyut uygulaması', HEAVY, () => {
  const base = () => validateMusicProgram(unitProgram());

  it('kazanç, groove, register, voicing, yoğunluk ve motif hedefleri uygulanır', () => {
    const parsed = validateMusicSearchSpec(
      spec({
        dimensions: [
          { name: 'gain', target: { kind: 'lane-gain', lane: 'lead' }, range: [0.9, 0.9] },
          { name: 'swing', target: { kind: 'groove-swing', groove: 'human' }, range: [0.25, 0.25] },
          { name: 'vel', target: { kind: 'groove-velocity', groove: 'human' }, range: [0.4, 0.4] },
          { name: 'shift', target: { kind: 'register-shift', lane: 'lead' }, range: [1, 1] },
          { name: 'spread', target: { kind: 'voicing-spread', section: 'body' }, range: [1, 1] },
          { name: 'thin', target: { kind: 'density-thinning', lane: 'bass' }, range: [0.5, 0.5] },
          { name: 'motif', target: { kind: 'motif-transpose', lane: 'lead' }, range: [2, 2] },
        ],
        finalists: 1,
      }),
    );
    const applied = applyDimensions(base(), parsed, [0, 0, 0, 0, 0, 0, 0]);
    expect(applied.lanes.find((l) => l.id === 'lead')?.gain).toBe(0.9);
    expect(applied.lanes.find((l) => l.id === 'lead')?.octave).toBe(1);
    expect(applied.grooves.find((g) => g.id === 'human')?.swing).toBe(0.25);
    expect(applied.grooves.find((g) => g.id === 'human')?.velocityJitter).toBe(0.4);
    expect(applied.sections[0].harmony?.voicing.spread).toBe('open');
    const bassPart = applied.sections[0].parts.find((p) => p.lane === 'bass');
    expect(bassPart?.source === 'notes' && bassPart.notes).toHaveLength(1);
    const motifPart = applied.sections[0].parts.find((p) => p.lane === 'lead');
    expect(motifPart?.source === 'motif' && motifPart.transforms).toHaveLength(1);
  });

  it('uygulanan program yeniden doğrulanır (bozuk aday erken düşer)', () => {
    const parsed = validateMusicSearchSpec(
      spec({
        dimensions: [
          { name: 'shift', target: { kind: 'register-shift', lane: 'bass' }, range: [4, 4] },
        ],
        finalists: 1,
      }),
    );
    expect(() => applyDimensions(base(), parsed, [0])).toThrow(AudioParamError);
  });
});

describe('sembolik arama', HEAVY, () => {
  const parsed = () => validateMusicSearchSpec(spec());
  const base = () => validateMusicProgram(unitProgram());

  it('aynı tohum aynı sembolik sırayı verir', () => {
    const first = searchSymbolic(parsed(), base(), {});
    const second = searchSymbolic(parsed(), base(), {});
    expect(first.candidates.map((c) => c.candidateId)).toEqual(
      second.candidates.map((c) => c.candidateId),
    );
    expect(first.ranked).toEqual(second.ranked);
  });

  it('başka tohum başka sıra verir', () => {
    const other = validateMusicSearchSpec(spec({ seed: 99 }));
    const a = searchSymbolic(parsed(), base(), {});
    const b = searchSymbolic(other, base(), {});
    expect(a.ranked).not.toEqual(b.ranked);
  });

  it('adaylar ses render EDİLMEDEN ölçülür ve sıralanır', () => {
    const outcome = searchSymbolic(parsed(), base(), {});
    expect(outcome.candidates.length).toBeGreaterThan(1);
    expect(outcome.candidates.every((c) => c.symbolic !== null)).toBe(true);
    const distances = outcome.ranked.map(
      (id) => outcome.candidates.find((c) => c.candidateId === id)?.distance ?? 0,
    );
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(outcome.programs.size).toBe(outcome.candidates.length);
  });

  it('brief uyumsuz adaylar sıralamadan düşer', () => {
    const strict = musicBrief({ rhythmicDensity: 'sparse' });
    const outcome = searchSymbolic(parsed(), base(), {
      brief: (() => {
        const brief = strict;
        return brief as never;
      })(),
    });
    expect(outcome.ranked.length).toBeLessThan(outcome.candidates.length);
  });

  it('geçersiz aday reddiyle kaydedilir', () => {
    const risky = validateMusicSearchSpec(
      spec({
        dimensions: [
          { name: 'shift', target: { kind: 'register-shift', lane: 'bass' }, range: [0, 4] },
        ],
        candidates: 6,
        finalists: 1,
      }),
    );
    const outcome = searchSymbolic(risky, base(), {});
    expect(outcome.candidates.some((c) => c.rejection !== null)).toBe(true);
    expect(outcome.candidates.find((c) => c.rejection !== null)?.symbolic).toBeNull();
  });

  it('genişletilmiş score aday programından türer', () => {
    const outcome = searchSymbolic(parsed(), base(), {});
    const [id] = outcome.ranked;
    const program = outcome.programs.get(id);
    expect(program).toBeDefined();
    expect(expandProgram(program!).events.length).toBeGreaterThan(0);
  });
});

describe('arama protokolü', HEAVY, () => {
  let repo: TestRepo;
  let loc: MusicLocation;
  beforeEach(() => {
    repo = createTestRepo();
    loc = { repoRoot: repo.root, musicRoot: MUSIC_ROOT, musicId: 'unit-loop' };
    const write = (relative: string, document: unknown) => {
      const file = join(repo.root, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    };
    write(`${MUSIC_ROOT}/unit-loop/music.json`, unitProgram());
    write(`${MUSIC_ROOT}/unit-loop/brief.json`, musicBrief());
    write(`${MUSIC_ROOT}/unit-loop/search.json`, spec());
  });
  afterEach(() => repo.cleanup());

  const read = (relative: string) =>
    JSON.parse(readFileSync(join(repo.root, relative), 'utf8')) as Record<string, unknown>;

  it('spec dizinle aynı müziği hedeflemeli', () => {
    const file = join(repo.root, `${MUSIC_ROOT}/unit-loop/search.json`);
    writeFileSync(file, JSON.stringify(spec({ musicId: 'baska-parca' })));
    expect(() => loadMusicSearchSpec(loc)).toThrow(ProtocolError);
  });

  it('yalnız finalistler render edilir ve rapor kanıtı taşır', () => {
    const report = runMusicSearch(loc);
    expect(report.evidence.expanded).toBeGreaterThan(report.evidence.rendered);
    expect(report.finalists).toHaveLength(2);
    expect(report.finalists.every((f) => f.audio.frames > 0)).toBe(true);
    expect(report.finalists.every((f) => f.policy.verdict === 'pass')).toBe(true);
    const stored = read(`${MUSIC_ROOT}/unit-loop/search-report.json`);
    expect(stored.schema).toBe('MusicSearchReportV1');
  });

  it('terfi programı sürüm artırarak ve kökeniyle yazar', () => {
    const report = runMusicSearch(loc);
    const candidateId = report.finalists[0].candidateId;
    const promotion = promoteMusicCandidate(loc, candidateId);
    expect(promotion.version).toBe(2);
    const program = read(`${MUSIC_ROOT}/unit-loop/music.json`);
    expect((program.provenance as { candidateId: string }).candidateId).toBe(candidateId);
    expect(program.version).toBe(2);
    expect(validateMusicProgram(program).provenance?.searchId).toBe('unit-balance');
  });

  it('finalist olmayan aday terfi edilemez', () => {
    runMusicSearch(loc);
    expect(() => promoteMusicCandidate(loc, 'c-0000000000000000')).toThrow(/finalist değil/);
  });

  it('rapor başka bir temel programdan geldiyse terfi reddedilir', () => {
    const report = runMusicSearch(loc);
    const file = join(repo.root, `${MUSIC_ROOT}/unit-loop/music.json`);
    writeFileSync(file, JSON.stringify(unitProgram({ seed: 1234, version: 2 })));
    expect(() => promoteMusicCandidate(loc, report.finalists[0].candidateId)).toThrow(
      /temel programdan/,
    );
  });

  it('rapor yoksa terfi yoktur', () => {
    expect(() => promoteMusicCandidate(loc, 'c-0000000000000000')).toThrow(ProtocolError);
  });
});
