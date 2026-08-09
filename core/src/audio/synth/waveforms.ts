import type { Waveform } from './types';

/** Verilen faz (0-1 döngü) ve dalga şekli için bir örnek döner. */
export function getWaveSampleWithPhase(
  wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>,
  phase: number,
  pulseWidth = 0.5,
): number {
  phase %= 1;
  if (phase < 0) phase += 1;

  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle': {
      if (phase < 0.25) return 4 * phase;
      if (phase < 0.75) return 2 - 4 * phase;
      return -4 + 4 * phase;
    }
    case 'sawtooth':
      return 2 * phase - 1;
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'pulse':
      return phase < pulseWidth ? 1 : -1;
    default:
      return 0;
  }
}

/** Verilen dalga şekli ve frekans için bir örnek döner. */
export function getWaveSample(
  wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>,
  freq: number,
  t: number,
  pulseWidth = 0.5,
): number {
  const phase = (freq * t) % 1;
  return getWaveSampleWithPhase(wave, phase, pulseWidth);
}
