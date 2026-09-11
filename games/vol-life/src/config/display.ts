import type { DisplayMode } from '@volstudio/tauri-v2';

export interface DisplayConfig {
  /** Masaüstünde kayıtlı tercih yokken açılış kipi. */
  readonly defaultDisplayMode: DisplayMode;
  /**
   * Android bir yön isteğini uygulamazsa seçimin gerçek yöne dönmeden önce
   * beklediği süre. Döndürme animasyonunu kapsayacak kadar uzun, geri dönüşü
   * kopuk hissettirmeyecek kadar kısa tutulur.
   */
  readonly orientationSettleMs: number;
}

export const displayConfig: DisplayConfig = {
  defaultDisplayMode: 'windowed',
  orientationSettleMs: 1200,
};
