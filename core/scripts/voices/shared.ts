import type { EnvelopeParams } from '../../src/audio/synth/types';

/** Zarf kısayolu. */
export function env(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  sustainLevel: number,
  curve: 'linear' | 'exponential' | 'cosine' = 'cosine',
): EnvelopeParams {
  return { attack, hold: 0, decay, sustain, release, sustainLevel, curve };
}

/** Uzun süreli yatak katmanları için zarf — girişi/çıkışı yavaş. */
export function bedEnvelope(duration: number, attack = 1.5, release = 2.0): EnvelopeParams {
  const sustain = Math.max(0.1, duration - attack - release);
  return env(attack, 0, sustain, release, 1.0, 'cosine');
}
