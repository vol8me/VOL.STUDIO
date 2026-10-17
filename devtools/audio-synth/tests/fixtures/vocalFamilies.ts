import type { AcousticProgramV1, ParamValueV1 } from '../../src/program/schema';

/**
 * Üç vokal program ailesi — aynı `source.glottal` + ayrı `resonator.formant`;
 * aralarındaki fark YALNIZ program değerleridir. Adlar ailenin çağrışımıdır,
 * gerçekçilik iddiası değildir (dinleme doğrulaması yapılmadı). Testler ve
 * `archetype-audition` betiği aynı belgeleri kullanır.
 */
const node = (primitive: string, params: Record<string, ParamValueV1> = {}) => ({
  primitive,
  version: 1,
  params,
});
const curve = (name: string, points: [number, number][]) => ({
  curve: `curve.${name}`,
  version: 1,
  points,
});
const head = { schema: 'AcousticProgramV1' as const, sampleRate: 48000, channels: 1 as const };

const cat: AcousticProgramV1 = {
  ...head,
  durationSeconds: 1,
  seed: 101,
  gestures: {
    pitch: curve('spline', [
      [0, 420],
      [0.35, 720],
      [0.9, 460],
    ]),
    f1: curve('cosine', [
      [0, 900],
      [0.9, 520],
    ]),
    f2: curve('cosine', [
      [0, 1900],
      [0.9, 1100],
    ]),
    env: curve('cosine', [
      [0, -40],
      [0.08, 0],
      [0.75, -3],
      [1, -40],
    ]),
  },
  layers: [
    {
      name: 'voice',
      source: node('source.glottal', {
        frequency: { gesture: 'pitch' },
        tension: 0.6,
        jitter: 0.008,
        shimmer: 0.4,
        breath: 0.15,
      }),
      resonators: [
        node('resonator.formant', {
          f1: { gesture: 'f1' },
          f2: { gesture: 'f2' },
          f3: 2900,
          f4: 3800,
          tract: 0.7,
        }),
      ],
      articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
    },
  ],
  master: { peakDbfs: -3, fadeOutSeconds: 0.02 },
};

const bark: AcousticProgramV1 = {
  ...head,
  durationSeconds: 0.32,
  seed: 202,
  gestures: {
    pitch: curve('exponential', [
      [0, 320],
      [0.3, 180],
    ]),
    env: curve('linear', [
      [0, -40],
      [0.008, 0],
      [0.18, -6],
      [0.32, -40],
    ]),
  },
  layers: [
    {
      name: 'voice',
      source: node('source.glottal', {
        frequency: { gesture: 'pitch' },
        tension: 0.8,
        jitter: 0.03,
        shimmer: 2,
        subharmonic: 0.6,
        breath: 0.6,
      }),
      resonators: [
        node('resonator.formant', { f1: 650, f2: 1400, f3: 2500, f4: 3400, tract: 1.2 }),
      ],
      articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
    },
  ],
  master: { peakDbfs: -3, fadeOutSeconds: 0.01 },
};

const alien: AcousticProgramV1 = {
  ...head,
  durationSeconds: 1.6,
  seed: 303,
  gestures: {
    pitch: curve('spline', [
      [0, 80],
      [0.8, 95],
      [1.6, 70],
    ]),
    sac: curve('cosine', [
      [0, 0.25],
      [1.4, 2],
    ]),
    env: curve('cosine', [
      [0, -40],
      [0.2, 0],
      [1.3, -2],
      [1.6, -40],
    ]),
  },
  modulators: { wobble: { modulator: 'modulator.walk', version: 1, params: { reversion: 3 } } },
  layers: [
    {
      name: 'voice',
      source: node('source.glottal', {
        frequency: { gesture: 'pitch', modulate: [{ by: 'wobble', depth: 0.04 }] },
        tension: 0.3,
        subharmonic: 0.4,
        breath: 0.2,
      }),
      resonators: [
        node('resonator.cavity', { volume: { gesture: 'sac' }, neckArea: 8, neckLength: 3, q: 5 }),
        node('resonator.formant', { f1: 320, f2: 760, f3: 1900, f4: 2800, tract: 1.6 }),
      ],
      articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
    },
    {
      name: 'sac',
      source: node('exciter.turbulence', { pressure: 0.4, brightness: 0.4 }),
      resonators: [
        node('resonator.cavity', { volume: { gesture: 'sac' }, neckArea: 8, neckLength: 3, q: 12 }),
      ],
      gainDb: -12,
    },
  ],
  master: { peakDbfs: -3, fadeOutSeconds: 0.02 },
};

export const VOCAL_FAMILIES = { cat, bark, alien } as const;
