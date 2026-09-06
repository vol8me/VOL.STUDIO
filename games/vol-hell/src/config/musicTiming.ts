/**
 * Müzik zamanlamasının TEK KAYNAĞI — üretim script'i ve çalma config'i
 * buradan okur, ayrışamazlar.
 *
 * Ayrışmanın sonucu sessizdir: `loopEnd` dosyadan uzunsa Web Audio loop
 * aralığını yok sayar (parça geç sarar), kısaysa besteden bir bölüm hiç
 * duyulmaz.
 */

export interface MusicTiming {
  /** Dörtlük nota / dakika. */
  bpm: number;
  beats: number;
}

/** Parça kimliği → zamanlama. Anahtarlar `musicTrackIds` ile aynıdır. */
export const MUSIC_TIMING = {
  'hollow-signal': { bpm: 84, beats: 128 },
  'event-horizon': { bpm: 100, beats: 128 },
  'surge-protocol': { bpm: 132, beats: 128 },
  sovereign: { bpm: 140, beats: 128 },
  'terminal-echo': { bpm: 56, beats: 24 },
  'first-light': { bpm: 92, beats: 32 },
  /* Ambiyans ritimsiz; 60 BPM seçildi ki `beats` doğrudan SANİYE olsun. */
  'null-drift': { bpm: 60, beats: 64 },
  'deep-current': { bpm: 60, beats: 64 },
} as const satisfies Record<string, MusicTiming>;

export function beatSeconds(timing: MusicTiming): number {
  return 60 / timing.bpm;
}

/** `loopEnd` bundan TÜRER; elle yazılan bir süre beste değişince unutulur. */
export function trackSeconds(timing: MusicTiming): number {
  return timing.beats * beatSeconds(timing);
}
