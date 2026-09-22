import type { AcousticProgramV1, ProgramLayerV1 } from '../../src/program/schema';

export const BODY_LAYER: ProgramLayerV1 = {
  name: 'body',
  source: { primitive: 'source.noise', version: 1, params: { color: 'pink' } },
  resonators: [
    {
      primitive: 'resonator.biquad',
      version: 1,
      params: { mode: 'bandpass', frequency: 900, q: 8 },
    },
  ],
  articulation: {
    primitive: 'articulation.envelope',
    version: 1,
    params: { attack: 0.002, decay: 0.1, sustainLevel: 0, release: 0.05 },
  },
};

/** Geçerli, küçük bir program — testler bunu kopyalayıp tek alanı bozar. */
export function baseProgram(): AcousticProgramV1 {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 16000,
    channels: 1,
    durationSeconds: 0.25,
    seed: 11,
    layers: [BODY_LAYER],
  };
}
