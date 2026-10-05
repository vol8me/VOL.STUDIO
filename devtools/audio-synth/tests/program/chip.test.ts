import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeAudio, countClicks } from '../../src/analysis/report';
import { renderProgram, renderProgramLayers } from '../../src/program/render';
import { checkFamily } from '../../src/protocol/family';
import { autocorrelationPitch, isStrictlyMonotone } from '../support/measure';
import { PIPELINE_TIMEOUT, RENDER_BLOCK } from '../support/timeouts';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const RATE = 48000;

function program(layer: Record<string, unknown>, seconds = 0.6, extra: object = {}) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: RATE,
    channels: 1,
    durationSeconds: seconds,
    seed: 5,
    layers: [{ name: 'voice', ...layer }],
    master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.01 },
    ...extra,
  };
}

const envelope = (attack: number, decay: number, release = 0.02) => ({
  primitive: 'articulation.envelope',
  version: 1,
  params: { attack, decay, sustainLevel: 0, release },
});

const retro = (params: Record<string, unknown>) => ({
  primitive: 'source.retro',
  version: 2,
  params,
});
const drum = (params: Record<string, unknown>) => ({
  primitive: 'source.drum',
  version: 2,
  params,
});

describe('akustik programda retro ve davul kaynakları', RENDER_BLOCK, () => {
  it('retro perde gesture ile sürülür; render deterministik ve tıksız', () => {
    const doc = program(
      {
        source: retro({ waveform: 'pulse', duty: 0.125, frequency: { gesture: 'pitch' } }),
      },
      1,
      {
        gestures: {
          pitch: {
            curve: 'curve.exponential',
            version: 1,
            points: [
              [0, 220],
              [1, 880],
            ],
          },
        },
      },
    );
    const voice = renderProgramLayers(doc).get('voice') as Float32Array;
    const again = renderProgramLayers(doc).get('voice') as Float32Array;
    expect(voice.every((v, i) => v === again[i])).toBe(true);
    const pitches = [0.15, 0.45, 0.8].map((s) =>
      autocorrelationPitch(voice, RATE, Math.round(s * RATE), 4096, 150, 1200),
    );
    expect(isStrictlyMonotone(pitches, 1)).toBe(true);
    expect(countClicks([voice], RATE).count).toBe(0);
  });

  it('aynı araç setinden UI sesi (arpej), arcade gürültüsü ve bass üretilir', () => {
    const coin = renderProgram(
      program(
        {
          source: retro({
            waveform: 'pulse',
            duty: 0.25,
            frequency: 988,
            arpeggio: 'coin',
            arpRate: 14,
          }),
          articulation: envelope(0.001, 0.25),
        },
        0.35,
      ),
    );
    const zap = renderProgram(
      program(
        {
          source: retro({ waveform: 'noise-long', frequency: 1200, bits: 6 }),
          articulation: envelope(0.001, 0.2),
        },
        0.3,
      ),
    );
    const bass = renderProgram(
      program(
        {
          source: retro({ waveform: 'triangle-4bit', frequency: 55 }),
          articulation: envelope(0.005, 0.5),
        },
        0.6,
      ),
    );
    const measure = (r: typeof coin) => analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
    expect(measure(bass).spectral.centroidHz as number).toBeLessThan(
      measure(coin).spectral.centroidHz as number,
    );
    expect(measure(zap).spectral.flatness as number).toBeGreaterThan(
      measure(coin).spectral.flatness as number,
    );
    for (const r of [coin, zap, bass]) expect(measure(r).level.samplePeakDbfs).toBeCloseTo(-3, 1);
  });

  it('davul düğümü velocity ile parlaklaşır; hat kick’ten parlaktır', () => {
    const centroid = (params: Record<string, unknown>) => {
      const r = renderProgram(program({ source: drum(params) }, 0.8));
      return analyzeAudio(r.channels, r.sampleRate, 'source-pcm').spectral.centroidHz as number;
    };
    const snare = [0.2, 0.6, 1].map((velocity) => centroid({ model: 'snare', velocity }));
    expect(isStrictlyMonotone(snare, 1)).toBe(true);
    expect(centroid({ model: 'hat' })).toBeGreaterThan(20 * centroid({ model: 'kick' }));
  });
});

const target = (param: string) => ({
  kind: 'node-param',
  layer: 'hit',
  slot: 'source',
  primitive: 'source.drum',
  param,
});

/**
 * kick/snare/hat AİLELERİ: aynı davul düğümünden velocity ve tını
 * makrolarıyla adlı varyantlar. Aile kalite kapısı çeşitliliği ve ortak
 * kimliği ölçer; müzik ya da oyun başına özel davul sentezi yazılmaz. Ton
 * ve sönüm dar bir bantta serbesttir: parlaklık sırası velocity rolünden
 * gelmeli, tesadüfi ton çekilişinden değil.
 */
function drumFamily(model: 'kick' | 'snare' | 'hat', seconds: number) {
  const unit = (param: string, min: number, max: number) => ({
    name: param,
    target: target(param),
    range: { min, max, scale: 'linear', unit: 'normalized' },
  });
  return {
    schema: 'SoundFamilyProgramV1',
    familyId: `${model}-family`,
    version: 1,
    title: `${model} ailesi`,
    description: `Velocity ve tını makrolarıyla ${model} varyantları.`,
    base: {
      kind: 'program',
      program: {
        schema: 'AcousticProgramV1',
        sampleRate: RATE,
        channels: 1,
        durationSeconds: seconds,
        seed: 9,
        layers: [{ name: 'hit', source: drum({ model }) }],
        master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.01 },
      },
    },
    seed: 21,
    variation: { policy: 'role-subrange-v1' },
    dimensions: [
      unit('velocity', 0.3, 1),
      unit('tone', 0.45, 0.55),
      unit('decay', 0.35, 0.65),
      { ...unit('attack', 0.2, 0.9), scope: 'role' },
    ],
    roles: {
      intensity: {
        soft: { velocity: { min: 0.3, max: 0.5 } },
        medium: { velocity: { min: 0.55, max: 0.75 } },
        hard: { velocity: { min: 0.8, max: 1 } },
      },
      onset: {
        soft: { attack: { min: 0.2, max: 0.4 } },
        sharp: { attack: { min: 0.7, max: 0.9 } },
      },
    },
    variants: ['soft', 'medium', 'hard'].flatMap((intensity) =>
      ['soft', 'sharp'].map((onset) => ({
        key: `${intensity}-${onset}`,
        roles: { intensity, onset },
      })),
    ),
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: `reference/production/assets/sfx/families/${model}-family`,
      subtype: 'sfx',
      assetClass: 'sfx',
      durationSeconds: { min: seconds - 0.01, max: seconds + 0.01 },
    },
  };
}

describe('kick, snare ve hat aileleri', () => {
  it.each([
    ['kick', 0.8],
    ['snare', 0.6],
    ['hat', 0.3],
  ] as const)(
    '%s: altı varyant aile kalite kapısını geçer; sert vuruş yumuşaktan parlaktır',
    (model, seconds) => {
      const check = checkFamily(REPO, drumFamily(model, seconds), { workers: 1 });
      expect(check.quality.verdict.pass, check.quality.verdict.failures.join('; ')).toBe(true);
      expect(new Set(check.members.map((m) => m.pcmHash)).size).toBe(6);
      const bright = (key: string) =>
        check.members.find((m) => m.key === key)?.descriptors.centroidHz as number;
      expect(bright('hard-sharp')).toBeGreaterThan(bright('soft-sharp'));
      expect(bright('hard-soft')).toBeGreaterThan(bright('soft-soft'));
    },
    PIPELINE_TIMEOUT,
  );
});
