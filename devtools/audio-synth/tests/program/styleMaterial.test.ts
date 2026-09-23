import { describe, expect, it } from 'vitest';
import { analyzeAudio, type AudioAnalysisReportV1 } from '../../src/analysis/report';
import { AudioParamError } from '../../src/guard/errors';
import {
  describeMaterials,
  fundamentalHz,
  fundamentalT60,
  materialById,
  materialModeRatio,
  MATERIALS,
} from '../../src/program/materials';
import { renderProgram } from '../../src/program/render';
import { resolveProgram } from '../../src/program/schema';
import { soundGraph, topologyOf } from '../../src/program/soundGraph';
import { STYLE_PROFILES } from '../../src/program/styles';
import { hashCanonical, hashPcm } from '../../src/protocol/canonical';
import { peakFrequency } from '../support/measure';
import { tankFire } from './graphFixtures';

/**
 * Stil (Dalga 7 P2) ve materyal (Dalga 7 P2) kapanış kanıtları: aynı tank
 * programı üç profilde topolojiyi korur ve ölçülebilir farklı karakter verir;
 * aynı darbe farklı materyalde farklı mod aralığı ve sönüm verir.
 */
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
const report = (program: unknown): AudioAnalysisReportV1 => {
  const r = renderProgram(program);
  return analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
};
const styled = (profile: string) =>
  tankFire({
    style: { profile, version: 1 },
    master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.02 },
  });

describe('StyleProfile', () => {
  const profiles = ['realistic-heavy', 'arcade-industrial', 'minimal-synthetic'] as const;
  const reports = Object.fromEntries(profiles.map((p) => [p, report(styled(p))])) as Record<
    (typeof profiles)[number],
    AudioAnalysisReportV1
  >;

  it('üç profil tank topolojisini korur (düğüm, zincir, rol, kenar aynı)', () => {
    const base = hashCanonical(topologyOf(soundGraph(tankFire())));
    for (const profile of profiles) {
      const graph = soundGraph(styled(profile));
      expect(hashCanonical(topologyOf(graph))).toBe(base);
      expect(graph.style?.profile).toBe(profile);
    }
  });

  it('ölçülebilir farklı karakter: bant, dinamik ve doygunluk yönleri profil verisiyle aynı', () => {
    const [heavy, arcade, minimal] = profiles.map((p) => reports[p]);
    const relative = (r: AudioAnalysisReportV1, band: 'sub' | 'air') =>
      (r.spectral.bandsDb[band] as number) - (r.spectral.bandsDb.mid as number);
    expect(relative(minimal, 'air')).toBeLessThan(relative(heavy, 'air') - 6);
    expect(relative(minimal, 'sub')).toBeLessThan(relative(heavy, 'sub') - 6);
    expect(arcade.spectral.flatness as number).toBeGreaterThan(heavy.spectral.flatness as number);
    const steps = (profile: string) => {
      const x = renderProgram(styled(profile)).channels[0].subarray(0, 12000);
      const peak = Math.max(...x.map(Math.abs));
      let flat = 0;
      for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - x[i - 1]) < 1e-3 * peak) flat++;
      return flat / (x.length - 1);
    };
    expect(steps('arcade-industrial')).toBeGreaterThan(0.5);
    expect(steps('realistic-heavy')).toBeLessThan(0.2);
    const pcms = profiles.map((p) => {
      const r = renderProgram(styled(p));
      return hashPcm(r.channels, r.sampleRate);
    });
    expect(new Set(pcms).size).toBe(3);
  });

  it('nötr özel stil bit-eşit; özel stilin ad alanı yoktur (nitelik yazılır)', () => {
    const plain = renderProgram(tankFire());
    const neutral = renderProgram(tankFire({ style: { controls: {} } }));
    expect(hashPcm(neutral.channels, neutral.sampleRate)).toBe(
      hashPcm(plain.channels, plain.sampleRate),
    );
    expect(() =>
      resolveProgram(tankFire({ style: { controls: { name: 'some-artist' } } })),
    ).toThrow(AudioParamError);
  });

  it('mono programda profil genişliği uygulanmaz ve raporlanır; özel genişlik reddedilir', () => {
    const cinematic = resolveProgram(tankFire({ style: { profile: 'cinematic', version: 1 } }));
    expect(cinematic.style?.notApplied).toEqual(['width']);
    expect(cinematic.style?.controls.width).toBe(1);
    expect(() => resolveProgram(tankFire({ style: { controls: { width: 1.4 } } }))).toThrow(
      /genişlik/,
    );
    expect(() => resolveProgram(tankFire({ style: { profile: 'nope', version: 1 } }))).toThrow(
      AudioParamError,
    );
    expect(() => resolveProgram(tankFire({ style: { profile: 'lo-fi', version: 2 } }))).toThrow(
      /sürümü/,
    );
  });

  it('perde dili frekansa 2^oct, uzunluğa 2^−oct; rol dengesi katman kazancına eklenir', () => {
    const program = {
      schema: 'AcousticProgramV1',
      sampleRate: 24000,
      channels: 1,
      durationSeconds: 0.5,
      seed: 1,
      style: { controls: { pitchOctaves: 1, roleBalanceDb: { body: -6 } } },
      layers: [
        { name: 'tone', role: 'body', source: node('source.oscillator', { frequency: 440 }) },
        {
          name: 'pipe',
          source: node('exciter.impact'),
          resonators: [node('resonator.tube', { length: 0.4 })],
        },
      ],
    };
    const resolved = resolveProgram(program);
    expect(resolved.layers[0].source.params.frequency).toBeCloseTo(880, 9);
    expect(resolved.layers[1].resonators[0].params.length).toBeCloseTo(0.2, 9);
    expect(20 * Math.log10(resolved.layers[0].gain)).toBeCloseTo(-6, 9);
    expect(resolved.layers[1].gain).toBe(1);
  });

  it('her hazır profil geçerli kontrol aralığında ve adı niteliklerden bağımsız', () => {
    for (const profile of STYLE_PROFILES) {
      const mono = { ...profile.controls, width: 1 };
      expect(() => resolveProgram(tankFire({ style: { controls: mono } }))).not.toThrow();
      expect(() =>
        resolveProgram(tankFire({ channels: 2, style: { controls: profile.controls } })),
      ).not.toThrow();
    }
    expect(new Set(STYLE_PROFILES.map((p) => p.id)).size).toBe(STYLE_PROFILES.length);
  });
});

describe('MaterialProfile', () => {
  const struck = (material: string, extra: Record<string, unknown> = {}) => ({
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 2,
    seed: 3,
    layers: [
      {
        name: 'hit',
        source: node('exciter.impact', { contactTime: 0.0003, roughness: 0 }),
        resonators: [node('resonator.material', { material, size: 0.15, ...extra })],
      },
    ],
    master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0 },
  });

  it('aynı uyarım: ölçülen −40 dB sönüm sırası materyal verisinin (η, E, ρ) öngördüğü sıra', () => {
    const ids = ['metal', 'glass', 'ceramic', 'stone', 'wood', 'hard-plastic'];
    const predicted = ids
      .map((id) => {
        const m = materialById(id)!;
        return { id, t60: fundamentalT60(m, fundamentalHz(m, 0.15, 0.05), 1) };
      })
      .sort((a, b) => b.t60 - a.t60)
      .map((p) => p.id);
    const measured = ids
      .map((id) => ({ id, decay: report(struck(id)).temporal.decay40Seconds as number }))
      .sort((a, b) => b.decay - a.decay)
      .map((p) => p.id);
    expect(measured).toEqual(predicted);
    expect(predicted[0]).toBe('metal');
  });

  it('mod ARALIĞI materyale göre değişir (levha, çubuk, kabuk oranları); EQ değil', () => {
    const second = (material: string) => {
      const x = renderProgram(struck(material)).channels[0];
      const f1 = fundamentalHz(materialById(material)!, 0.15, 0.05);
      const measured = peakFrequency(x, 48000, 0, 32768, [f1 * 0.9, f1 * 1.1]);
      const ratio = materialModeRatio(materialById(material)!, 1);
      const upper = peakFrequency(x, 48000, 0, 32768, [f1 * ratio * 0.95, f1 * ratio * 1.05]);
      return { f1, measured, ratio: upper / measured };
    };
    const metal = second('metal');
    const wood = second('wood');
    const glass = second('glass');
    expect(Math.abs(metal.measured / metal.f1 - 1)).toBeLessThan(0.02);
    expect(metal.ratio).toBeCloseTo(materialModeRatio(materialById('metal')!, 1), 1);
    expect(wood.ratio).toBeCloseTo(materialModeRatio(materialById('wood')!, 1), 1);
    expect(glass.ratio).toBeCloseTo(materialModeRatio(materialById('glass')!, 1), 1);
    expect(
      new Set([metal.ratio.toFixed(1), wood.ratio.toFixed(1), glass.ratio.toFixed(1)]).size,
    ).toBe(3);
  });

  it('kayıp çarpanı çınlamayı kısaltır; boyut pesleştirir (f₁ ∝ 1/L)', () => {
    const base = report(struck('metal')).temporal.decay40Seconds as number;
    const damped = report(struck('metal', { damping: 4 })).temporal.decay40Seconds as number;
    expect(damped).toBeLessThan(base * 0.5);
    expect(fundamentalHz(materialById('metal')!, 0.6, 0.05)).toBeCloseTo(
      fundamentalHz(materialById('metal')!, 0.3, 0.05) / 2,
      6,
    );
  });

  it('materyal tablosu fiziksel türetmeleri taşır ve kimlikler tekildir', () => {
    const table = describeMaterials();
    expect(table).toHaveLength(MATERIALS.length);
    const metal = table.find((m) => m.id === 'metal')!;
    expect(metal.soundSpeedMs).toBe(Math.round(Math.sqrt(200e9 / 7850)));
    expect(metal.example.t60Seconds).toBeCloseTo(
      fundamentalT60(materialById('metal')!, metal.example.fundamentalHz, 1),
      2,
    );
    expect(table.find((m) => m.id === 'rubber')!.example.fundamentalHz).toBe(20);
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length);
  });
});
