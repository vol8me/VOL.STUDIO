/** Oyun içi UI parametreleri. */
export const uiConfig = {
  /** HUD kenar boşluğu (piksel). */
  hudPadding: 16,
  /** Oyun içi toast görünürlük süresi (ms). */
  toastDurationMs: 3000,
  /** Düşük can eşiği (0-1 oranı). Bar bu değerin altında kırmızıya döner. */
  lowHealthThreshold: 0.25,
} as const;

export type UiConfig = typeof uiConfig;
