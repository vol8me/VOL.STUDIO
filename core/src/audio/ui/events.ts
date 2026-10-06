/**
 * UI ses olay sözlüğü. Ürün sesleri ve oyun SFX'i buraya girmez: bu yalnız
 * arayüzün kendi geri bildirimidir. Her olay en çok 3 varyantla örneklenir ve
 * kit varyantları SIRAYLA seçer.
 */
export const UI_SOUND_EVENTS = [
  'press',
  'toggle',
  'select',
  'tick',
  'commit',
  'confirm',
  'cancel',
  'open',
  'close',
  'success',
  'warning',
  'error',
] as const;
export type UiSoundEvent = (typeof UI_SOUND_EVENTS)[number];

/** Bir olay için en çok 3 varyant dosyası. */
export type UiSoundAssets = Partial<Record<UiSoundEvent, readonly string[]>>;

/**
 * Mikro olaylar (kaydırıcı sürükleme ticki gibi) sık gelir; kit bunları 120 ms
 * aralıkla sınırlar. Kritik olaylar (hata/uyarı) sınırdan muaftır ve ses bütçesi
 * dolduğunda `normal` sesleri düşürerek çalar.
 */
export const UI_MICRO_EVENTS: readonly UiSoundEvent[] = ['tick'];
export const UI_CRITICAL_EVENTS: readonly UiSoundEvent[] = ['error', 'warning'];

/** Anlamsal niyet türü → ses olayı. `valuePreview` mikro `tick`tir. */
export const UI_INTENT_SOUND = {
  press: 'press',
  toggle: 'toggle',
  select: 'select',
  valuePreview: 'tick',
  valueCommit: 'commit',
  confirm: 'confirm',
  cancel: 'cancel',
  open: 'open',
  close: 'close',
} as const satisfies Record<string, UiSoundEvent>;

/** Host'un bildirdiği ürün sonucu → ses olayı (Promise çözülmesi değil). */
export const UI_OUTCOME_SOUND = {
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const satisfies Record<string, UiSoundEvent>;

export const UI_MAX_VARIANTS = 3;
/** UI sesleri toplamda en çok bu kadar eşzamanlı ses açar. */
export const UI_MAX_VOICES = 4;
/** Mikro olayların en kısa aralığı (ms). */
export const UI_MICRO_GAP_MS = 120;
/** Perde değişimi yarı genişliği: her tetikleme ±%5. */
export const UI_RATE_JITTER = 0.05;
/** UI RNG akışının sabit tohumu: simülasyon RNG'sinden BAĞIMSIZ ve tekrarlanabilir. */
export const UI_SOUND_SEED = 0x75_69_73_6e; // "uisn"
