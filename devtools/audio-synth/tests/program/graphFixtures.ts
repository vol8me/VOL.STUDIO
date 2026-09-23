/**
 * SoundGraph testlerinin ortak programları: aynı altyapı, farklı topoloji.
 * Tank ateşi = transient + basınç gövdesi + mekanizma + çevre kuyruğu (send);
 * yılan tıslaması = türbülans kaynağı + rezonatör + artikülasyon.
 */
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});

export function tankFire(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 24000,
    channels: 1,
    durationSeconds: 1.2,
    seed: 5,
    layers: [
      {
        name: 'shock',
        role: 'transient',
        mechanism: 'impact',
        source: node('source.contact', { velocity: 12, mass: 2, size: 1.2, debris: 0 }),
        gainDb: -3,
        sends: [{ bus: 'room', levelDb: -10 }],
      },
      {
        name: 'pressure',
        role: 'body',
        mechanism: 'pressure',
        source: node('source.pressure-wave', { positive: 0.03, body: 0.8, bodyHz: 45 }),
        sends: [{ bus: 'room', levelDb: -14 }],
      },
      {
        name: 'bolt',
        role: 'mechanism',
        mechanism: 'mechanical',
        startSeconds: 0.35,
        source: node('source.contact', { velocity: 2, mass: 0.2, size: 0.2, debris: 0.1 }),
        gainDb: -14,
        bus: 'mech',
      },
    ],
    buses: {
      mech: {
        effects: [node('effect.eq-bell', { frequency: 2500, gainDb: 4, q: 1.5 })],
        sends: [{ bus: 'room', levelDb: -8 }],
      },
      room: { effects: [node('effect.reverb', { decay: 1.1, amount: 1 })], gainDb: -4 },
    },
    master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0.02 },
    ...extra,
  };
}

export function snakeHiss(): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 24000,
    channels: 1,
    durationSeconds: 1,
    seed: 9,
    gestures: {
      swell: {
        curve: 'curve.cosine',
        version: 1,
        points: [
          [0, -30],
          [0.3, 0],
          [1, -24],
        ],
      },
    },
    layers: [
      {
        name: 'hiss',
        role: 'body',
        mechanism: 'turbulence',
        source: node('exciter.turbulence', { pressure: 0.8, brightness: 0.95 }),
        resonators: [node('resonator.biquad', { mode: 'bandpass', frequency: 6000, q: 3 })],
        articulation: node('articulation.amplitude', { level: { gesture: 'swell' } }),
      },
    ],
    master: { normalize: 'peak', peakDbfs: -3 },
  };
}
