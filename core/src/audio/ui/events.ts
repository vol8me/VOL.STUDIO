/**
 * UI ses olay sözlüğü. Ürün sesleri ve oyun SFX'i buraya girmez: bu yalnız
 * arayüzün kendi geri bildirimidir. Her olay her paletin en çok 3 varyantıyla
 * örneklenir ve kit varyantları SIRAYLA seçer.
 *
 * Sözlük oyun arayüzü içindir (bullet hell / RTS): işaretçi temasından (`hover`,
 * `press`, `release`), gezinmeden (`back`, `tabSwitch`, `panelOpen`), değer
 * oynatmadan (`sliderTick`, `valueCommit`), envanter/mağaza işlerinden (`equip`,
 * `purchase`, `dragPick`, `dragDrop`) ve oyun ödüllerinden (`reward`, `levelUp`)
 * oluşur. Uyarı/hata sesleri yalnız host bir ürün sonucu bildirince çalar.
 */
export const UI_SOUND_EVENTS = [
  'hover',
  'focus',
  'press',
  'release',
  'back',
  'confirm',
  'toggleOn',
  'toggleOff',
  'select',
  'tabSwitch',
  'sliderTick',
  'valueCommit',
  'panelOpen',
  'panelClose',
  'dragPick',
  'dragDrop',
  'equip',
  'purchase',
  'reward',
  'levelUp',
  'notify',
  'denied',
  'alert',
] as const;
export type UiSoundEvent = (typeof UI_SOUND_EVENTS)[number];

/**
 * Ses paleti: aynı olayların farklı malzemesi. `steel` çelik donanım (varsayılan
 * kaplama), `aurum` yaldızlı cam ve lake (aurum teması). Tema değişince host paleti
 * `UiSoundKit.setAssets(uiSoundAssets(baseUrl, palette))` ile değiştirir.
 */
export const UI_SOUND_PALETTES = ['steel', 'aurum'] as const;
export type UiSoundPalette = (typeof UI_SOUND_PALETTES)[number];
export const DEFAULT_UI_SOUND_PALETTE: UiSoundPalette = 'steel';

/** Tema kimliği → ses paleti: kaplama değişince ses de değişir. Bilinmeyen tema varsayılana düşer. */
export const UI_THEME_SOUND_PALETTE: Readonly<Record<string, UiSoundPalette>> = {
  default: 'steel',
  aurum: 'aurum',
};
export function uiSoundPaletteFor(themeId: string): UiSoundPalette {
  return UI_THEME_SOUND_PALETTE[themeId] ?? DEFAULT_UI_SOUND_PALETTE;
}

/** Bir olay için en çok 3 varyant dosyası. */
export type UiSoundAssets = Partial<Record<UiSoundEvent, readonly string[]>>;

/**
 * Mikro olaylar (üzerine gelme, odak, kaydırıcı ticki) sık gelir; kit bunları kendi
 * aralıklarıyla sınırlar (ms). Kritik olaylar sınırdan muaftır ve ses bütçesi dolduğunda
 * `normal` sesleri düşürerek çalar.
 */
export const UI_MICRO_GAP_MS = {
  hover: 70,
  focus: 70,
  sliderTick: 45,
} as const satisfies Partial<Record<UiSoundEvent, number>>;
export const UI_MICRO_EVENTS = Object.keys(UI_MICRO_GAP_MS) as readonly UiSoundEvent[];
export const UI_CRITICAL_EVENTS: readonly UiSoundEvent[] = ['alert', 'denied'];

/**
 * Anlamsal niyet türü → ses olayı. `toggle` kilitli durumu bilir: kit, hedefin işaretli
 * olup olmadığına göre `toggleOn`/`toggleOff` seçer (burada varsayılan `toggleOn`).
 * `valuePreview` kaydırıcı tickidir; kit perdeyi değerin konumuna bağlar.
 */
export const UI_INTENT_SOUND = {
  press: 'press',
  toggle: 'toggleOn',
  select: 'select',
  valuePreview: 'sliderTick',
  valueCommit: 'valueCommit',
  confirm: 'confirm',
  cancel: 'back',
  open: 'panelOpen',
  close: 'panelClose',
} as const satisfies Record<string, UiSoundEvent>;

/** Host'un bildirdiği ürün sonucu → ses olayı (Promise çözülmesi değil). */
export const UI_OUTCOME_SOUND = {
  success: 'confirm',
  warning: 'alert',
  error: 'denied',
} as const satisfies Record<string, UiSoundEvent>;

/**
 * Kritik olayın müzik/ambiyans otobüsünü kısma profili (saniye): −6 dB (kazanç 0.5),
 * 120 ms iniş, 80 ms bekleme, 450 ms çıkış. Yalnız kit bir `ducker` ile kurulduysa
 * uygulanır (isteğe bağlı); varsayılan olarak kısma yoktur.
 */
export const UI_CRITICAL_DUCK = { target: 0.5, attack: 0.12, hold: 0.08, release: 0.45 } as const;

/** Kritik olay → kısma profili; kritik olmayan olayda profil yoktur. */
export function uiDuckProfiles(): Partial<Record<UiSoundEvent, typeof UI_CRITICAL_DUCK>> {
  return Object.fromEntries(UI_CRITICAL_EVENTS.map((event) => [event, UI_CRITICAL_DUCK]));
}

export const UI_MAX_VARIANTS = 3;
/** UI sesleri toplamda en çok bu kadar eşzamanlı ses açar. */
export const UI_MAX_VOICES = 4;
/** Perde değişimi yarı genişliği: her tetikleme ±%4. */
export const UI_RATE_JITTER = 0.04;
/** Kaydırıcı perdesi: değerin konumu [0, 1] → oynatma hızı [alt, üst] (~ bir büyük onluya karşılık). */
export const UI_SLIDER_RATE_RANGE = [0.82, 1.38] as const;
/** UI RNG akışının sabit tohumu: simülasyon RNG'sinden BAĞIMSIZ ve tekrarlanabilir. */
export const UI_SOUND_SEED = 0x75_69_73_6e; // "uisn"
