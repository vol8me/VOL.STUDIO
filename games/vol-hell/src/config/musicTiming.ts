/**
 * Müzik zamanlamasının TEK KAYNAĞI — üretim script'i ve çalma config'i
 * buradan okur, ayrışamazlar.
 *
 * Ayrışmanın sonucu sessizdir: `loopEnd` dosyadan uzunsa Web Audio loop
 * aralığını yok sayar (parça geç sarar), kısaysa besteden bir bölüm hiç
 * duyulmaz. Değerler `scripts/audio-v2/scores/` altındaki programların
 * `bars` ve `tempo.bpm` alanlarıyla aynıdır; `audioIntegration` testi bunu
 * yayımlanmış bütünlerle karşılaştırır.
 */

export interface MusicTiming {
  /** Dörtlük nota / dakika. */
  bpm: number;
  beats: number;
}

/** Parça kimliği → zamanlama. Anahtarlar `musicTrackIds` ile aynıdır. */
export const MUSIC_TIMING = {
  'hollow-signal': { bpm: 132, beats: 192 },
  'event-horizon': { bpm: 138, beats: 192 },
  'surge-protocol': { bpm: 144, beats: 256 },
  sovereign: { bpm: 120, beats: 256 },
  'terminal-echo': { bpm: 60, beats: 32 },
  'first-light': { bpm: 96, beats: 64 },
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
