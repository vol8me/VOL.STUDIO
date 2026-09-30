import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { summarizeAudio, type DescriptorSummaryV1 } from '../../src/analysis/summary';
import { AudioParamError } from '../../src/guard/errors';
import { renderProgram } from '../../src/program/render';
import { hashCanonical } from '../../src/kernel/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import { readJsonFile } from '../../src/protocol/fs';
import { listFits, readFitReport, runFit } from '../../src/protocol/fit';
import { descriptorDelta, descriptorDistance, fitBox, validateFitSpec } from '../../src/search/fit';
import {
  buildFitReport,
  FIT_DESCRIPTOR_NAMES,
  validateFitReport,
  type AcousticFitReportV1,
} from '../../src/search/fit';
import type { Sha256 } from '../../src/kernel/canonical';
import { createTestRepo, type TestRepo } from './repo';
import { RENDER_TIMEOUT } from '../support/timeouts';

const FITS = 'devtools/audio-synth/records/fits';

let repo: TestRepo;
beforeEach(() => (repo = createTestRepo()));
afterEach(() => repo.cleanup());

/** Gizli hedefin gövdesi: sine osilatör + AHDSR zarfı. */
function toneProgram(frequency: number, waveform = 'sine'): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.4,
    seed: 11,
    layers: [
      {
        name: 'tone',
        source: {
          primitive: 'source.oscillator',
          version: 2,
          params: { waveform, frequency },
        },
        articulation: {
          primitive: 'articulation.envelope',
          version: 1,
          params: { attack: 0.01, decay: 0.08, sustainLevel: 0.7, sustain: 0.15, release: 0.1 },
        },
      },
    ],
    master: { normalize: 'peak', peakDbfs: -6 },
  };
}

/** Yanlış topoloji: aynı katman adı, perdesiz gürültü kaynağı. */
function noiseProgram(): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.4,
    seed: 11,
    layers: [
      {
        name: 'tone',
        source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
        articulation: {
          primitive: 'articulation.envelope',
          version: 1,
          params: { attack: 0.01, decay: 0.08, sustainLevel: 0.7, sustain: 0.15, release: 0.1 },
        },
      },
    ],
    master: { normalize: 'peak', peakDbfs: -6 },
  };
}

function descriptorsOf(program: Record<string, unknown>): DescriptorSummaryV1 {
  const r = renderProgram(program);
  const report = analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
  return summarizeAudio(r.channels, r.sampleRate, report);
}

/** Hedefin ölçülen betimleyicilerinden spec hedefi; `null` ölçümler atılır. */
function targetOf(measured: DescriptorSummaryV1): Record<string, unknown> {
  const entry = (v: number | null, weight = 1) => ({ value: v, weight });
  return Object.fromEntries(
    Object.entries({
      pitchHz: entry(measured.pitchHz),
      spectralPeakHz: entry(measured.spectralPeakHz),
      integratedLufs: entry(measured.integratedLufs),
      attackSeconds: entry(measured.attackSeconds, 0.5),
    }).filter(([, e]) => e.value !== null),
  );
}

function fitSpec(
  fitId: string,
  base: Record<string, unknown>,
  target: Record<string, unknown>,
  dimensions: unknown[],
): Record<string, unknown> {
  return {
    schema: 'AcousticFitSpecV1',
    fitId,
    seed: 23,
    base: { kind: 'program', program: base },
    dimensions,
    target: { descriptors: target },
    search: { candidates: 10, rounds: 4, shrink: 0.4 },
    tolerance: 0.2,
  };
}

const TONE_DIMENSIONS = [
  {
    name: 'frequency',
    target: {
      kind: 'node-param',
      layer: 'tone',
      slot: 'source',
      primitive: 'source.oscillator',
      param: 'frequency',
    },
    range: { min: 100, max: 2000, scale: 'log', unit: 'Hz' },
  },
  {
    name: 'waveform',
    target: {
      kind: 'node-param',
      layer: 'tone',
      slot: 'source',
      primitive: 'source.oscillator',
      param: 'waveform',
    },
    options: ['sine', 'triangle', 'sawtooth', 'square'],
  },
];

const NOISE_DIMENSIONS = [
  {
    name: 'color',
    target: {
      kind: 'node-param',
      layer: 'tone',
      slot: 'source',
      primitive: 'source.noise',
      param: 'color',
    },
    options: ['white', 'pink', 'brown'],
  },
  {
    name: 'attack',
    target: {
      kind: 'node-param',
      layer: 'tone',
      slot: 'articulation',
      primitive: 'articulation.envelope',
      param: 'attack',
    },
    range: { min: 0.001, max: 0.1, scale: 'log', unit: 's' },
  },
];

describe('fit spec şeması', () => {
  it('bilinmeyen betimleyici adı reddedilir', () => {
    const spec = fitSpec('f-bad', toneProgram(440), { loudness: { value: -20 } }, TONE_DIMENSIONS);
    expect(() => validateFitSpec(spec)).toThrowError(AudioParamError);
  });

  it('manifestsiz hedef değer ister; shrink ve rounds aralıklıdır', () => {
    const base = fitSpec('f-bad2', toneProgram(440), { pitchHz: {} }, TONE_DIMENSIONS);
    expect(() => validateFitSpec(base)).toThrowError(AudioParamError);
    const shrink = fitSpec(
      'f-bad3',
      toneProgram(440),
      { pitchHz: { value: 440 } },
      TONE_DIMENSIONS,
    );
    (shrink.search as Record<string, unknown>).shrink = 0;
    expect(() => validateFitSpec(shrink)).toThrowError(AudioParamError);
    (shrink.search as Record<string, unknown>).shrink = 0.4;
    (shrink.search as Record<string, unknown>).rounds = 0;
    expect(() => validateFitSpec(shrink)).toThrowError(AudioParamError);
  });

  it('manifest hedefinde taşınmayan betimleyici reddedilir', () => {
    const spec = fitSpec('f-bad4', toneProgram(440), { pitchHz: { weight: 1 } }, TONE_DIMENSIONS);
    (spec.target as Record<string, unknown>).manifest = 'x/y.json';
    expect(() => validateFitSpec(spec)).toThrowError(AudioParamError);
    const ok = fitSpec('f-bad5', toneProgram(440), { centroidHz: { weight: 1 } }, TONE_DIMENSIONS);
    (ok.target as Record<string, unknown>).manifest = 'x/y.json';
    expect(() => validateFitSpec(ok)).not.toThrow();
  });
});

describe('fit spec — hedef ve rapor hata dalları', () => {
  const validSpec = () =>
    fitSpec('f-ok', toneProgram(440), { pitchHz: { value: 440 } }, TONE_DIMENSIONS);

  it('manifest yolu: tip, boşluk ve uzunluk reddedilir', () => {
    for (const manifest of [42, '', 'x'.repeat(401)]) {
      const spec = validSpec();
      (spec.target as Record<string, unknown>).manifest = manifest;
      expect(() => validateFitSpec(spec), String(manifest).slice(0, 12)).toThrowError(
        AudioParamError,
      );
    }
  });

  it('descriptors nesne/boş/izinli-anahtar-sayısı denetlenir', () => {
    for (const descriptors of [null, [], 5]) {
      const spec = validSpec();
      (spec.target as Record<string, unknown>).descriptors = descriptors;
      expect(() => validateFitSpec(spec)).toThrowError(AudioParamError);
    }
    const empty = validSpec();
    (empty.target as Record<string, unknown>).descriptors = {};
    expect(() => validateFitSpec(empty)).toThrowError(/betimleyici/);
    // İzinli betimleyici sayısından fazla anahtar: aralık denetimi adlandırmadan önce düşer.
    const tooMany = validSpec();
    (tooMany.target as Record<string, unknown>).descriptors = Object.fromEntries(
      [...FIT_DESCRIPTOR_NAMES, 'bogus'].map((n) => [n, { value: 1 }]),
    );
    expect(() => validateFitSpec(tooMany)).toThrowError(/betimleyici/);
  });

  it('değer tipi, ağırlık ve filtre sınırı denetlenir', () => {
    // Manifestli hedef + manifest alanında olmayan betimleyici → value tip denetimi.
    const badValue = validSpec();
    (badValue.target as Record<string, unknown>).manifest = 'x/y.json';
    (badValue.target as Record<string, unknown>).descriptors = {
      centroidHz: { value: 'abc' },
    };
    expect(() => validateFitSpec(badValue)).toThrowError(/sayı ya da null/);
    // Ağırlık aralığı: 0 ve üst sınır üstü reddedilir.
    const badWeight = validSpec();
    (badWeight.target as Record<string, unknown>).descriptors = {
      pitchHz: { value: 440, weight: 0 },
    };
    expect(() => validateFitSpec(badWeight)).toThrowError(AudioParamError);
    // Filtreler: 32'den fazla reddedilir; geçerli filtre doğrulayıcıdan geçer.
    const tooManyFilters = validSpec();
    tooManyFilters.filters = Array.from({ length: 33 }, () => ({ kind: 'clipping' }));
    expect(() => validateFitSpec(tooManyFilters)).toThrowError(/en çok 32/);
    const withFilter = validSpec();
    withFilter.filters = [{ kind: 'clipping' }, { kind: 'clicks', max: 0 }];
    expect(validateFitSpec(withFilter).filters).toHaveLength(2);
    const badFilter = validSpec();
    badFilter.filters = [{ kind: 'ufo' }];
    expect(() => validateFitSpec(badFilter)).toThrowError(AudioParamError);
  });

  it('şema, fitId ve açıklama denetlenir', () => {
    const badSchema = validSpec();
    badSchema.schema = 'WrongSchema';
    expect(() => validateFitSpec(badSchema)).toThrowError(AudioParamError);
    const badId = validSpec();
    badId.fitId = 'Büyük Harf!';
    expect(() => validateFitSpec(badId)).toThrowError(AudioParamError);
    const longDesc = validSpec();
    longDesc.description = 'd'.repeat(2001);
    expect(() => validateFitSpec(longDesc)).toThrowError(/2000/);
  });

  it('rapor doğrulaması: şema, özet ve karar reddedilir', () => {
    const report = buildFitReport(
      validateFitSpec(validSpec()),
      ('sha256:' + 'a'.repeat(64)) as Sha256,
      ('sha256:' + 'b'.repeat(64)) as Sha256,
      { pitchHz: { value: 440, weight: 1 } },
      'descriptors',
      [],
      [],
    );
    // Boş skor → no-evaluable; en-iyi alanları null kalır.
    expect(report.verdict).toBe('no-evaluable');
    expect(report.best.candidateId).toBeNull();
    expect(report.best.distance).toBeNull();
    expect(validateFitReport(report).verdict).toBe('no-evaluable');
    const badSchema = { ...report, schema: 'X' } as unknown as AcousticFitReportV1;
    expect(() => validateFitReport(badSchema)).toThrowError(AudioParamError);
    const badHash = { ...report, specHash: 'kısa' } as unknown as AcousticFitReportV1;
    expect(() => validateFitReport(badHash)).toThrowError(/sha256/);
    const badTargetHash = {
      ...report,
      target: { ...report.target, hash: 'bozuk' },
    } as unknown as AcousticFitReportV1;
    expect(() => validateFitReport(badTargetHash)).toThrowError(/sha256/);
    const badVerdict = { ...report, verdict: 'tweaked' } as unknown as AcousticFitReportV1;
    expect(() => validateFitReport(badVerdict)).toThrowError(AudioParamError);
  });
});

describe('uzaklık ve kutu matematiği', () => {
  it('null↔sayı uyuşmazlığı 1 birim cezadır; log2 genişliği uygulanır', () => {
    expect(descriptorDelta('pitchHz', null, 440)).toBe(1);
    expect(descriptorDelta('pitchHz', 440, null)).toBe(1);
    expect(descriptorDelta('pitchHz', 440, 440)).toBe(0);
    // pitchHz genişliği 0.25 oktav: 880↔440 tam bir oktav = 4 birim.
    expect(descriptorDelta('pitchHz', 880, 440)).toBeCloseTo(4, 6);
    // İki taraf da ölçülemediyse fark yok; sonlu olmayan fark tavana kırpılır.
    expect(descriptorDelta('pitchHz', null, null)).toBe(0);
    expect(descriptorDelta('pitchHz', Number.POSITIVE_INFINITY, 440)).toBe(16);
  });

  it('descriptorDistance ağırlıklı RMS verir', () => {
    const measured = descriptorsOf(toneProgram(440));
    const d = descriptorDistance(measured, {
      pitchHz: { value: measured.pitchHz, weight: 2 },
      integratedLufs: { value: measured.integratedLufs, weight: 1 },
    });
    expect(d.distance).toBe(0);
    expect(d.deltas.pitchHz).toBe(0);
  });

  it('fitBox merkez etrafında kalır ve birim küpü aşmaz', () => {
    const b = fitBox([0.05, 0.9], [0.4, 0.4]);
    expect(b.lo[0]).toBe(0);
    expect(b.hi[0]).toBeCloseTo(0.25, 9);
    expect(b.lo[1]).toBeCloseTo(0.7, 9);
    expect(b.hi[1]).toBe(1);
    // Sıfır genişlikte kutu: lo==hi olursa lo bir adım geri çekilir.
    const degenerate = fitBox([0.5], [0]);
    expect(degenerate.lo[0]).toBeLessThan(degenerate.hi[0]);
  });
});

describe('gizli hedef deneyi', () => {
  it(
    'bilinen sentetik hedefin parametreleri yakalanır',
    () => {
      const hidden = toneProgram(660);
      const measured = descriptorsOf(hidden);
      expect(measured.pitchHz).not.toBeNull();
      const spec = fitSpec('hidden-660', toneProgram(440), targetOf(measured), TONE_DIMENSIONS);
      const outcome = runFit(repo.root, FITS, spec, { workers: 1 });
      expect(outcome.report.verdict).toBe('converged');
      expect(outcome.report.evaluated).toBeGreaterThan(0);
      const best = outcome.report.best;
      expect(best.distance).not.toBeNull();
      expect(best.distance!).toBeLessThanOrEqual(0.2);
      const values = best.values as Record<string, unknown>;
      // Frekans ±%5 bandında; dalga biçimi sine (perde hedefi testere/karede de
      // tutabilir — desimetre hedefi sine'i ayırt etmeli: integratedLufs/attack
      // sınırlayıcıdır). Kesin topoloji kanıtı: best-program.json yeniden render
      // edilip betimleyicileri hedefle karşılaştırılır.
      expect(Math.abs(Math.log2((values.frequency as number) / 660))).toBeLessThan(Math.log2(1.05));
      const bestDoc = readJsonFile(
        join(repo.root, FITS, 'hidden-660', 'best-program.json'),
        'best-program',
      ) as Record<string, unknown>;
      const reMeasured = descriptorsOf(bestDoc);
      for (const name of [
        'pitchHz',
        'spectralPeakHz',
        'integratedLufs',
        'attackSeconds',
      ] as const) {
        const target = outcome.report.target.descriptors[name].value;
        expect(descriptorDelta(name, reMeasured[name], target)).toBeLessThanOrEqual(0.2);
      }
      expect(existsSync(join(repo.root, FITS, 'hidden-660', 'spec.json'))).toBe(true);
      expect(existsSync(join(repo.root, FITS, 'hidden-660', 'report.json'))).toBe(true);
    },
    RENDER_TIMEOUT,
  );

  it(
    'yanlış topoloji hedefe yakınsayamaz',
    () => {
      const measured = descriptorsOf(toneProgram(660));
      const spec = fitSpec('wrong-topo', noiseProgram(), targetOf(measured), NOISE_DIMENSIONS);
      const outcome = runFit(repo.root, FITS, spec, { workers: 1 });
      expect(outcome.report.verdict).toBe('exhausted');
      expect(outcome.report.best.distance!).toBeGreaterThan(0.2);
      // Perdesiz kaynak pitchHz hedefinde en az 1 birim ceza öder (null↔sayı).
      expect(outcome.report.best.deltas!.pitchHz).toBeGreaterThanOrEqual(1);
    },
    RENDER_TIMEOUT,
  );

  it(
    'aynı spec iki kez aynı sonucu verir (fitId ad alanı dışında)',
    () => {
      const measured = descriptorsOf(toneProgram(660));
      const a = runFit(
        repo.root,
        FITS,
        fitSpec('det-a', toneProgram(440), targetOf(measured), TONE_DIMENSIONS),
        { workers: 1 },
      );
      const b = runFit(
        repo.root,
        FITS,
        fitSpec('det-b', toneProgram(440), targetOf(measured), TONE_DIMENSIONS),
        { workers: 1 },
      );
      expect(a.report.rounds).toEqual(b.report.rounds);
      expect(a.report.best.distance).toBe(b.report.best.distance);
      expect(a.report.best.values).toEqual(b.report.best.values);
      expect(a.report.target.hash).toBe(b.report.target.hash);
      expect(hashCanonical(a.report.rounds)).toBe(hashCanonical(b.report.rounds));
    },
    RENDER_TIMEOUT,
  );

  it(
    'tamamlanmış fit yeniden koşulamaz (overwrite reddi) ve okunabilir',
    () => {
      const measured = descriptorsOf(toneProgram(660));
      const spec = fitSpec('once', toneProgram(440), targetOf(measured), TONE_DIMENSIONS);
      runFit(repo.root, FITS, spec, { workers: 1 });
      let code = '';
      try {
        runFit(repo.root, FITS, spec, { workers: 1 });
      } catch (error) {
        code = error instanceof ProtocolError ? error.code : '';
      }
      expect(code).toBe('overwrite');
      const report = readFitReport(repo.root, FITS, 'once');
      expect(report.fitId).toBe('once');
      expect(listFits(repo.root, FITS)).toContain('once');
    },
    RENDER_TIMEOUT,
  );

  it(
    'manifest hedefi analysis.encoded alanlarından okunur',
    () => {
      const manifestPath = 'devtools/audio-synth/scratch-target.json';
      const manifest = {
        analysis: {
          encoded: {
            level: { integratedLufs: -33.25 },
            spectral: { centroidHz: 1234 },
          },
        },
      };
      const abs = join(repo.root, manifestPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, JSON.stringify(manifest));
      const spec = fitSpec(
        'manifest-target',
        toneProgram(440),
        { integratedLufs: { weight: 1 }, centroidHz: { weight: 1 } },
        TONE_DIMENSIONS,
      );
      (spec.target as Record<string, unknown>).manifest = manifestPath;
      const outcome = runFit(repo.root, FITS, spec, { workers: 1 });
      expect(outcome.report.target.source).toBe('manifest');
      expect(outcome.report.target.descriptors.integratedLufs.value).toBe(-33.25);
      expect(outcome.report.target.descriptors.centroidHz.value).toBe(1234);
      expect(outcome.report.verdict).not.toBe('no-evaluable');
    },
    RENDER_TIMEOUT,
  );

  it('eksik manifest yolu okunamaz', () => {
    const spec = fitSpec('no-manifest', toneProgram(440), { centroidHz: {} }, TONE_DIMENSIONS);
    (spec.target as Record<string, unknown>).manifest = 'devtools/audio-synth/yok.json';
    let code = '';
    try {
      runFit(repo.root, FITS, spec, { workers: 1 });
    } catch (error) {
      code = error instanceof ProtocolError ? error.code : '';
    }
    expect(code).toBe('not-found');
  });
});
