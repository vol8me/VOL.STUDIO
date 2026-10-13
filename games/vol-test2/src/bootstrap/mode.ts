/**
 * Açılış kipi, URL'den: `?lab=run` laboratuvar yük sunucusudur (oyuncu arayüzü yok), `?lab=observe`
 * canlı oyun oturumunun üstüne yalnız gözlem API'si koyar, parametresiz sayfa oyundur. Bilinmeyen
 * değer sessizce oyuna düşmez: yazım hatası olan bir ajan ölçüm yaptığını sanıp oyun sayfasına bakardı.
 */
export type BootMode =
  | { readonly kind: 'play' }
  | { readonly kind: 'lab'; readonly lab: 'run' | 'observe' }
  | { readonly kind: 'invalid'; readonly value: string };

export const LAB_MODES = ['run', 'observe'] as const;

export function parseBootMode(search: string): BootMode {
  const params = new URLSearchParams(search);
  if (!params.has('lab')) return { kind: 'play' };
  const value = params.get('lab') ?? '';
  if (value === 'run' || value === 'observe') return { kind: 'lab', lab: value };
  return { kind: 'invalid', value };
}
