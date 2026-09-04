/**
 * Müzik zamanlamasının TEK KAYNAĞI.
 *
 * Bu sayılar iki yerde birden yaşıyordu: `config/music.ts` (çalma zamanı,
 * `loopEnd` hesabı için) ve `scripts/audio/music/*.ts` (üretim, bestenin
 * uzunluğu için). İkisini elle eşlemek gerekiyordu ve bunu doğrulayan hiçbir
 * şey yoktu.
 *
 * Ayrışmanın sonucu SESSİZDİR ve teşhis edilmesi zordur:
 * - `loopEnd` dosyadan UZUNSA Web Audio loop aralığını yok sayıp tüm buffer'ı
 *   döndürür — parça beklenenden geç sarar.
 * - `loopEnd` KISAYSA parça bitmeden başa döner — besteden bir bölüm hiç
 *   duyulmaz.
 *
 * Artık üretim script'i de çalma config'i de buradan okur; ayrışamazlar.
 * `tests/config/musicTiming.test.ts` script'lerin BPM/BEATS'i yeniden
 * tanımlamadığını da doğrular.
 */

/** Bir parçanın tempo ve uzunluk tanımı. */
export interface MusicTiming {
  /** Tempo (dörtlük nota / dakika). */
  bpm: number;
  /** Parçanın toplam vuruş sayısı. */
  beats: number;
}

/**
 * Parça kimliği → zamanlama.
 *
 * Anahtarlar `musicTrackIds` ile aynı; üretim script'leri de aynı anahtarla
 * okur, böylece "hangi sayı hangi parçaya ait" sorusu tek yerde cevaplanır.
 */
export const MUSIC_TIMING = {
  // HOLLOW SIGNAL — ana menü 1: Dm.
  'hollow-signal': { bpm: 84, beats: 128 },
  // EVENT HORIZON — ana menü 2: Am.
  'event-horizon': { bpm: 100, beats: 128 },
  // SURGE PROTOCOL — savaş müziği: Em.
  'surge-protocol': { bpm: 132, beats: 128 },
  // SOVEREIGN — boss müziği: Cm.
  sovereign: { bpm: 140, beats: 128 },
  // TERMINAL ECHO — ölüm ekranı: Dm. Loop yok.
  'terminal-echo': { bpm: 56, beats: 24 },
  // FIRST LIGHT — zafer ekranı: D. Loop yok.
  'first-light': { bpm: 92, beats: 32 },
  /*
   * Ambiyans ritimsizdir; BPM yalnızca `MusicEngine`in crossfade'i bar
   * sınırına hizalayabilmesi için verilir. 60 BPM = 1 vuruş/saniye seçildi,
   * böylece `beats` doğrudan SANİYE anlamına gelir ve loop sınırı kesin kalır.
   */
  'null-drift': { bpm: 60, beats: 64 },
  'deep-current': { bpm: 60, beats: 64 },
} as const satisfies Record<string, MusicTiming>;

/** Bir vuruşun süresi (saniye). */
export function beatSeconds(timing: MusicTiming): number {
  return 60 / timing.bpm;
}

/**
 * Parçanın toplam süresi (saniye) — `loopEnd` bundan türer.
 *
 * Elle yazılmış bir `loopEnd` sayısı, besteyi değiştirdiğinde güncellenmesi
 * unutulan ilk şeydir; türetilmiş değer o riski ortadan kaldırır.
 */
export function trackSeconds(timing: MusicTiming): number {
  return timing.beats * beatSeconds(timing);
}
