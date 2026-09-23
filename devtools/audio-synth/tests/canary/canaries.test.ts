import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CANARIES_ROOT,
  canaryReviews,
  loadCanaries,
  recordCanaryReview,
  runCanary,
  validateCanary,
} from '../../src/protocol/canary';
import { AudioParamError } from '../../src/guard/errors';
import { repoSampleResolver } from '../../src/protocol/samples';
import { edited, getAt } from '../support/json';
import { createTestRepo, type TestRepo } from '../protocol/repo';

/**
 * Organik canary derlemi. Mekanik beklentiler motorun ölçülebilir
 * davranışını kilitler; "organik" kanıtı DEĞİLDİR. İnsan dinleme durumu
 * yalnız insan beyanıyla değişir — bu testler onu hiçbir zaman yazmaz.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const IDS = [
  'alien-fluid-call',
  'breath',
  'bubble',
  'campfire',
  'cat-like-gesture',
  'contact-metal',
  'contact-rubber',
  'droplet',
  'friction-rolling',
  'friction-scrape',
  'granular-breath',
  'insect-like-chirp',
  'membrane-pulse',
  'pressure-blast',
  'rain',
  'shifted-note',
  'stretched-note',
  'wet-squish',
  'wind-gusts',
];

describe('organik canary derlemi (gerçek depo)', () => {
  const canaries = loadCanaries(REPO);
  const samples = repoSampleResolver(REPO);

  it('her görev sürümlü, dinleme rehberli ve deterministik kaynaklıdır', () => {
    expect(canaries.map((c) => c.id)).toEqual(IDS);
    for (const c of canaries) {
      expect(c.version).toBeGreaterThanOrEqual(1);
      expect(c.listeningGuide.length).toBeGreaterThan(0);
      expect(c.expectations.length).toBeGreaterThan(0);
    }
  });

  /*
   * 19 canary × 2 render: 3 saniyelik sesi GERÇEK render eder; kapsam
   * ölçümü (v8) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan
   * dolar (ölçülen: en ağır canary 10 sn). Süre sınırı bu yüzden verilir —
   * ölçülen bir kısıt, keyfi bir sayı değil.
   */
  it.each(IDS)(
    '%s: mekanik beklentiler geçer ve iki render aynı PCM’i verir',
    (id) => {
      const canary = canaries.find((c) => c.id === id);
      if (!canary) throw new Error(id);
      const first = runCanary(canary, samples).result;
      expect(first.checks.filter((c) => !c.pass)).toEqual([]);
      expect(runCanary(canary, samples).result.pcmHash).toBe(first.pcmHash);
    },
    60_000,
  );

  it('insan dinlemesi uydurulmaz: bütün incelemeler pending-human', () => {
    expect(canaryReviews(REPO).map((r) => [r.id, r.status, r.note])).toEqual(
      IDS.map((id) => [id, 'pending-human', null]),
    );
  });
});

describe('canary beklentilerinin dişi var (mutasyon)', () => {
  const byId = (id: string) => {
    const c = loadCanaries(REPO).find((x) => x.id === id);
    if (!c) throw new Error(id);
    return c;
  };

  it('zar nabız hızı değişince pulse-rate beklentisi düşer', () => {
    const doc = JSON.parse(
      readFileSync(join(REPO, CANARIES_ROOT, 'membrane-pulse.json'), 'utf8'),
    ) as unknown;
    const mutated = validateCanary(
      edited(doc, [['source', 'program', 'layers', 0, 'source', 'params', 'rate'], 40]),
    );
    expect(runCanary(mutated).result.checks.find((c) => c.kind === 'pulse-rate')?.pass).toBe(false);
  });

  it('kedimsi jestin perde eğrisi düzleşince kontur beklentisi düşer', () => {
    const doc = JSON.parse(
      readFileSync(join(REPO, CANARIES_ROOT, 'cat-like-gesture.json'), 'utf8'),
    ) as unknown;
    const flat = getAt(doc, ['source', 'program', 'gestures', 'pitch', 'points']) as [
      number,
      number,
    ][];
    const mutated = validateCanary(
      edited(doc, [
        ['source', 'program', 'gestures', 'pitch', 'points'],
        flat.map(([t]) => [t, 500]),
      ]),
    );
    expect(runCanary(mutated).result.checks.find((c) => c.kind === 'pitch-contour')?.pass).toBe(
      false,
    );
    expect(byId('cat-like-gesture').expectations.map((e) => e.kind)).toContain('pitch-contour');
  });

  it('nefese ton eklenince perdesizlik beklentisi düşer', () => {
    const doc = JSON.parse(
      readFileSync(join(REPO, CANARIES_ROOT, 'breath.json'), 'utf8'),
    ) as unknown;
    const layers = getAt(doc, ['source', 'program', 'layers']) as unknown[];
    const tone = {
      name: 'tone',
      source: { primitive: 'source.oscillator', version: 1, params: { frequency: 300 } },
    };
    const mutated = validateCanary(
      edited(doc, [
        ['source', 'program', 'layers'],
        [...layers, tone],
      ]),
    );
    expect(runCanary(mutated).result.checks.find((c) => c.kind === 'aperiodic')?.pass).toBe(false);
  });

  const failing = (id: string, edit: [readonly (string | number)[], unknown]) => {
    const doc = JSON.parse(
      readFileSync(join(REPO, CANARIES_ROOT, `${id}.json`), 'utf8'),
    ) as unknown;
    const result = runCanary(validateCanary(edited(doc, edit)), repoSampleResolver(REPO)).result;
    return result.checks.filter((c) => !c.pass).map((c) => c.kind);
  };

  it('metal temas lastiğe dönünce parlaklık ve perde beklentileri düşer', () => {
    const path = ['source', 'program', 'layers', 0, 'source', 'params', 'materialA'];
    expect(failing('contact-metal', [path, 'rubber'])).toContain('descriptor');
  });

  it('germe bağlı yöntemle yapılınca perde beklentisi düşer (resample oktav indirir)', () => {
    const path = ['source', 'program', 'layers', 0, 'source', 'params', 'method'];
    expect(failing('stretched-note', [path, 'resample'])).toContain('pitch');
  });
});

describe('canary inceleme kaydı', () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = createTestRepo();
    mkdirSync(join(repo.root, CANARIES_ROOT), { recursive: true });
    cpSync(join(REPO, CANARIES_ROOT, 'bubble.json'), join(repo.root, CANARIES_ROOT, 'bubble.json'));
  });
  afterEach(() => repo.cleanup());

  it('beyan not ister; canary sürümü artınca inceleme bayatlar ve pending-human sayılır', () => {
    expect(canaryReviews(repo.root)).toEqual([
      { id: 'bubble', status: 'pending-human', version: 1, note: null, stale: false },
    ]);
    expect(() => recordCanaryReview(repo.root, 'bubble', 'heard-acceptable', null)).toThrow(
      /not ister/,
    );
    expect(() => recordCanaryReview(repo.root, 'yok', 'heard-acceptable', 'x')).toThrow(
      /canary yok/,
    );
    recordCanaryReview(repo.root, 'bubble', 'heard-problem', 'test beyanı');
    expect(canaryReviews(repo.root)[0]).toMatchObject({ status: 'heard-problem', stale: false });

    const file = join(repo.root, CANARIES_ROOT, 'bubble.json');
    writeFileSync(
      file,
      JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), version: 2 }),
    );
    expect(canaryReviews(repo.root)[0]).toMatchObject({ status: 'pending-human', stale: true });
  });

  it('dosya adı kimlikle eşleşmeli; bilinmeyen alan reddedilir', () => {
    cpSync(
      join(REPO, CANARIES_ROOT, 'bubble.json'),
      join(repo.root, CANARIES_ROOT, 'kabarcik.json'),
    );
    expect(() => loadCanaries(repo.root)).toThrow(/bubble\.json olmalı/);
    const doc = JSON.parse(
      readFileSync(join(REPO, CANARIES_ROOT, 'bubble.json'), 'utf8'),
    ) as unknown;
    expect(() => validateCanary(edited(doc, [['score'], 1]))).toThrow(AudioParamError);
  });
});
