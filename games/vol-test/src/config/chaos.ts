/**
 * Kaos kadranı: ana tempo çarpanı. Tek değer, araçların hareket hızını (sürüş, dönüş, atılım) ve atış
 * sıklığını aynı oranda yükseltir ya da düşürür; atış süresi çarpanla bölünür. Mermi hızı, hasar ve can
 * değişmez, bu yüzden araçlar arası denge korunur. Yalnız çevrimdışı alıştırma dünyasındadır (sunucu
 * dünyası 1'de kalır).
 */
export const CHAOS = {
  min: 0.5,
  max: 3,
  step: 0.25,
  default: 1,
} as const;

export function validChaos(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= CHAOS.min && value <= CHAOS.max
  );
}
