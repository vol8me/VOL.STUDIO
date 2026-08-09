import type { SequenceParams } from '../types';

export type SequencePresetFn = (rootFreq?: number) => SequenceParams;

/** Yukarı arpej: root - büyük üçlü - beşli - oktav. */
export function arpeggioUp(rootFreq = 440): SequenceParams {
  return {
    notes: [
      { semitone: 0, duration: 0.1 },
      { semitone: 4, duration: 0.1, delay: 0.02 },
      { semitone: 7, duration: 0.1, delay: 0.02 },
      { semitone: 12, duration: 0.15, delay: 0.02 },
    ],
    rootFreq,
  };
}

/** Level-up / zafer jingle'ı. */
export function levelUpJingle(rootFreq = 523.25): SequenceParams {
  return {
    notes: [
      { semitone: 0, duration: 0.08 },
      { semitone: 4, duration: 0.08, delay: 0.05 },
      { semitone: 7, duration: 0.08, delay: 0.05 },
      { semitone: 12, duration: 0.2, delay: 0.05 },
    ],
    rootFreq,
  };
}

/** Menü geçiş / onay jingle'ı. */
export function menuJingle(rootFreq = 659.25): SequenceParams {
  return {
    notes: [
      { semitone: 0, duration: 0.05 },
      { semitone: 3, duration: 0.05, delay: 0.03 },
      { semitone: 7, duration: 0.12, delay: 0.03 },
    ],
    rootFreq,
  };
}
