import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError, type AudioParamIssue } from '../../src/guard/errors';
import { expandArchetype } from '../../src/program/archetype';
import { ARCHETYPES } from '../../src/program/primitives/archetypes';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import type { AcousticProgramV1 } from '../../src/program/schema';
import { hashPcm } from '../../src/protocol/canonical';
import { clone } from '../support/json';
import {
  envelopeRate,
  harmonicPitch,
  interharmonicRatio,
  isStrictlyMonotone,
  peakFrequency,
} from '../support/measure';

const RATE = 48000;
const request = (archetype: string, variation: number, params: Record<string, number> = {}) => ({
  schema: 'ArchetypeRequestV1',
  archetype,
  version: 1,
  variation,
  params,
});

const layers = (program: AcousticProgramV1) => renderProgramLayers(program);
const report = (x: Float32Array) => analyzeAudio([x], RATE, 'source-pcm');

/** 2 ms zarfta tepeden −40 dB üstünde 4× sıçrama sayısı. */
function onsets(x: Float32Array): number {
  const hop = 96;
  const energy: number[] = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + hop; k++) e += x[k] * x[k];
    energy.push(e);
  }
  const floor = Math.max(...energy) * 1e-4;
  return energy.filter((e, i) => i > 0 && e > floor && e > 4 * energy[i - 1]).length;
}

/**
 * Perde ölçümü için programı sadeleştirir: glottal kaynaktaki pürüz
 * kaynakları (alt-harmonik, nefes, jitter, shimmer) sıfırlanır ve perde
 * konturu `pick` ile seçilen sabit değere indirilir. Perde YOLU (gesture
 * değeri + makro çarpanları) aynen kalır; yalnız ölçümü bozan düzensizlik
 * çıkar. `keepRoughness` alt-harmoniği korur (pürüz iddiası için).
 */
function steadyVoice(
  program: AcousticProgramV1,
  pick: (values: number[]) => number,
  keepRoughness = false,
): AcousticProgramV1 {
  const copy = clone(program) as unknown as {
    gestures?: Record<string, { points: [number, number][] }>;
    layers: { source: { primitive: string; params?: Record<string, unknown> } }[];
  };
  const pitch = copy.gestures?.pitch;
  if (pitch) pitch.points = [[0, pick(pitch.points.map(([, v]) => v))]];
  for (const layer of copy.layers) {
    if (layer.source.primitive !== 'source.glottal') continue;
    layer.source.params = {
      ...layer.source.params,
      breath: 0,
      jitter: 0,
      shimmer: 0,
      ...(keepRoughness ? {} : { subharmonic: 0 }),
    };
  }
  return copy as unknown as AcousticProgramV1;
}

const maxOf = (values: number[]) => Math.max(...values);
const meanOf = (values: number[]) => values.reduce((a, b) => a + b) / values.length;

/** Sadeleştirilmiş programda `name` katmanının temel frekansı. */
const voicePitch = (program: AcousticProgramV1, name: string, lo: number, hi: number) =>
  harmonicPitch(layers(steadyVoice(program, meanOf)).get(name) as Float32Array, RATE, lo, hi);

describe('AcousticArchetype — yapısal sözleşme ve deterministik varyasyon', () => {
  it.each(ARCHETYPES.map((a) => [a.id, a] as const))(
    '%s: 8 varyasyon geçerli, farklı, topolojisi sabit, deterministik',
    (id, entry) => {
      const hashes = new Set<string>();
      for (let k = 0; k < entry.variation.guaranteed; k++) {
        const program = expandArchetype(request(id, k));
        expect(JSON.stringify(expandArchetype(request(id, k)))).toBe(JSON.stringify(program));
        const topology = program.layers.map((layer) => ({
          layer: layer.name,
          chain: [
            layer.source.primitive,
            ...(layer.resonators ?? []).map((r) => r.primitive),
            ...(layer.articulation ? [layer.articulation.primitive] : []),
          ],
        }));
        expect(topology).toEqual(entry.topology);
        expect((program.controls ?? []).map((c) => c.control)).toEqual(entry.macros);
        const out = renderProgram(program);
        expect(out.channels[0].every(Number.isFinite)).toBe(true);
        expect(out.channels[0].length).toBe(Math.ceil(program.durationSeconds * RATE));
        const peak = report(out.channels[0]).level.samplePeakDbfs ?? -Infinity;
        expect(peak).toBeCloseTo(-3, 1);
        hashes.add(hashPcm(out.channels, out.sampleRate));
      }
      expect(hashes.size).toBe(entry.variation.guaranteed);
      const otherRoot = expandArchetype({ ...request(id, 0), seed: 99 });
      expect(JSON.stringify(otherRoot)).not.toBe(JSON.stringify(expandArchetype(request(id, 0))));
    },
  );
});

describe('aile değişmezleri (8 varyasyonun HER birinde)', () => {
  const each = (id: string, check: (program: AcousticProgramV1) => void) => {
    for (let k = 0; k < 8; k++) check(expandArchetype(request(id, k)));
  };

  it('fluid-creature: kabarcık katmanı olaylı, ses katmanı pes (f₀ < 200 Hz)', () => {
    each('archetype.fluid-creature', (program) => {
      const parts = layers(program);
      expect(onsets(parts.get('bubbles') as Float32Array)).toBeGreaterThan(5);
      const highest = layers(steadyVoice(program, maxOf)).get('voice') as Float32Array;
      expect(harmonicPitch(highest, RATE, 30, 400)).toBeLessThan(200);
    });
  });

  it('membrane-creature: timbal katmanı periyodik tık dizisi (≥ 10 tık/sn)', () => {
    each('archetype.membrane-creature', (program) => {
      const tymbal = layers(program).get('tymbal') as Float32Array;
      expect(envelopeRate(tymbal, RATE, 5, 400)).toBeGreaterThan(10);
    });
  });

  it('air-sac-creature: çağrı pes (f₀ < 160 Hz), enerji alt/alçak bantta', () => {
    each('archetype.air-sac-creature', (program) => {
      const highest = layers(steadyVoice(program, maxOf)).get('call') as Float32Array;
      expect(harmonicPitch(highest, RATE, 30, 300)).toBeLessThan(160);
      const bands = report(renderProgram(program).channels[0]).spectral.bandsDb;
      expect(Math.max(bands.sub ?? -200, bands.low ?? -200)).toBeGreaterThan(bands.high ?? -200);
    });
  });

  it('chitin-clicker: çok sayıda tık, parlak (ağırlık merkezi > 1.5 kHz)', () => {
    each('archetype.chitin-clicker', (program) => {
      const x = renderProgram(program).channels[0];
      expect(onsets(x)).toBeGreaterThan(3);
      expect(report(x).spectral.centroidHz ?? 0).toBeGreaterThan(1500);
    });
  });

  it('resonant-shell: tek vuruş başta, çınlama −40 dB’ye 0.2 sn’den uzun sürede iner', () => {
    each('archetype.resonant-shell', (program) => {
      const temporal = report(renderProgram(program).channels[0]).temporal;
      expect(temporal.peakTimeSeconds ?? 1).toBeLessThan(0.05);
      expect(temporal.decay40Seconds ?? 10).toBeGreaterThan(0.2);
    });
  });

  it('vocal-tube: sesli (f₀ 80–450 Hz aralığında)', () => {
    each('archetype.vocal-tube', (program) => {
      const f0 = voicePitch(program, 'voice', 50, 600);
      expect(f0).toBeGreaterThan(80);
      expect(f0).toBeLessThan(450);
    });
  });
});

type Measure = (program: AcousticProgramV1) => number;
const layer =
  (name: string, measure: (x: Float32Array) => number): Measure =>
  (program) =>
    measure(layers(program).get(name) as Float32Array);
const full =
  (measure: (x: Float32Array) => number): Measure =>
  (program) =>
    measure(renderProgram(program).channels[0]);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
const centroid = (x: Float32Array) => report(x).spectral.centroidHz ?? 0;
const flatness = (x: Float32Array) => report(x).spectral.flatness ?? 0;
const decay40 = (x: Float32Array) => report(x).temporal.decay40Seconds ?? 10;
const lengthOf = (x: Float32Array) => x.length / RATE;
/** Sabit perdeli çağrıda harmonikler-arası güç oranı (alt-harmonik → (k+½)·f₀). */
const subharmonic: Measure = (program) => {
  const steady = steadyVoice(program, meanOf, true);
  const f0 = (steady.gestures?.pitch.points ?? [[0, 90]])[0][1];
  return interharmonicRatio(layers(steady).get('call') as Float32Array, RATE, f0);
};
/** Enerji olay sayısıyla orantılıdır (ilintisiz olay toplamı): yoğunluk ölçüsü. */
const energy = (x: Float32Array) => x.reduce((a, v) => a + v * v, 0);
/** Kitin çubuğunun temel modu: taban frekansın 0.4–1.7 katı (2.76× ikinci mod dışarıda). */
const chitinMode: Measure = (program) => {
  const base = Number(program.layers[0].resonators?.[0].params?.frequency);
  return peakFrequency(layers(program).get('clicks') as Float32Array, RATE, 0, 65536, [
    0.4 * base,
    1.7 * base,
  ]);
};

/** Registry'deki HER archetype yön iddiası için ölçüm (`id:param`). */
const CLAIMS: Record<string, Measure> = {
  'archetype.fluid-creature:size': (program) => voicePitch(program, 'voice', 25, 400),
  'archetype.fluid-creature:wetness': layer('bubbles', onsets),
  'archetype.fluid-creature:viscosity': layer('bubbles', rms),
  'archetype.fluid-creature:activity': layer('bubbles', onsets),
  'archetype.fluid-creature:durationSeconds': full(lengthOf),
  'archetype.membrane-creature:size': layer('tymbal', (x) =>
    peakFrequency(x, RATE, 0, 32768, [300, 8000]),
  ),
  'archetype.membrane-creature:tension': layer('tymbal', (x) =>
    peakFrequency(x, RATE, 0, 32768, [300, 8000]),
  ),
  'archetype.membrane-creature:activity': layer('tymbal', (x) => envelopeRate(x, RATE, 5, 400)),
  'archetype.membrane-creature:durationSeconds': full(lengthOf),
  'archetype.air-sac-creature:size': (program) => voicePitch(program, 'call', 25, 300),
  'archetype.air-sac-creature:inflation': layer('rush', (x) =>
    peakFrequency(x, RATE, 0, 65536, [10, 2000]),
  ),
  'archetype.air-sac-creature:roughness': subharmonic,
  'archetype.air-sac-creature:durationSeconds': full(lengthOf),
  'archetype.chitin-clicker:size': chitinMode,
  'archetype.chitin-clicker:activity': layer('clicks', energy),
  'archetype.chitin-clicker:burstiness': layer('clicks', onsets),
  'archetype.chitin-clicker:hardness': layer('clicks', centroid),
  'archetype.chitin-clicker:durationSeconds': full(lengthOf),
  'archetype.resonant-shell:size': layer('strike', (x) =>
    peakFrequency(x, RATE, 0, 65536, [60, 4000]),
  ),
  'archetype.resonant-shell:hardness': layer('strike', centroid),
  'archetype.resonant-shell:damping': layer('strike', decay40),
  'archetype.resonant-shell:roughness': layer('strike', flatness),
  'archetype.resonant-shell:durationSeconds': full(lengthOf),
  'archetype.vocal-tube:size': (program) => voicePitch(program, 'voice', 40, 600),
  'archetype.vocal-tube:tension': (program) => voicePitch(program, 'voice', 40, 600),
  'archetype.vocal-tube:airiness': layer('voice', flatness),
  'archetype.vocal-tube:durationSeconds': full(lengthOf),
};

describe('archetype yön iddiaları (registry → ölçüm)', () => {
  const claims = ARCHETYPES.flatMap((a) =>
    a.causal.map((c) => [`${a.id}:${c.param}`, a, c.param, c.direction] as const),
  );

  it('her iddianın ölçümü var (yeni iddia ölçümsüz kalamaz)', () => {
    expect(Object.keys(CLAIMS).sort()).toEqual(claims.map(([key]) => key).sort());
  });

  it.each(claims)('%s', (key, entry, param, direction) => {
    const spec = entry.params[param];
    const values =
      param === 'durationSeconds' ? [2, 2.5, 3] : spec.type === 'number' ? [0.2, 0.5, 0.8] : [];
    const measured = values.map((value) =>
      CLAIMS[key](expandArchetype(request(entry.id, 0, { [param]: value }))),
    );
    expect(
      isStrictlyMonotone(measured, direction),
      `${key}: ${measured.map((v) => v.toFixed(3)).join(' → ')}`,
    ).toBe(true);
  });
});

describe('archetype isteği doğrulaması (render öncesi)', () => {
  const rejects = (value: unknown, path: string, issue: AudioParamIssue) => {
    try {
      expandArchetype(value);
    } catch (error) {
      expect(error).toBeInstanceOf(AudioParamError);
      const { path: p, issue: i } = error as AudioParamError;
      expect({ path: p, issue: i }).toEqual({ path, issue });
      return;
    }
    throw new Error('reddedilmedi');
  };
  const fluid = 'archetype.fluid-creature';

  it.each<[string, unknown, string, AudioParamIssue]>([
    ['şema', { ...request(fluid, 0), schema: 'ArchetypeV2' }, 'schema', 'type'],
    ['bilinmeyen aile', request('archetype.dragon', 0), 'archetype', 'unknown-id'],
    ['yanlış tür', request('source.bubbles', 0), 'archetype', 'type'],
    ['sürüm', { ...request(fluid, 0), version: 2 }, 'archetype@version', 'version'],
    ['negatif varyasyon', request(fluid, -1), 'variation', 'range'],
    ['kesirli varyasyon', request(fluid, 1.5), 'variation', 'type'],
    ['aralık dışı makro', request(fluid, 0, { size: 1.4 }), 'params.size', 'range'],
    ['bilinmeyen makro', request(fluid, 0, { tentacles: 1 }), 'params.tentacles', 'unknown-key'],
    ['bilinmeyen alan', { ...request(fluid, 0), mood: 'angry' }, 'mood', 'unknown-key'],
    [
      'yapısal kısıt',
      request(fluid, 0, { durationSeconds: 0.4, activity: 0 }),
      'params',
      'combination',
    ],
  ])('%s', (_label, value, path, issue) => rejects(value, path, issue));
});
