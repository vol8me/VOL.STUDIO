/**
 * Uzamsal odak gezinmesi — saf puanlama mantığı.
 *
 * DOM'dan bağımsızdır: girdiler eksen-hizalı dikdörtgenlerdir, böylece
 * birim testler `getBoundingClientRect` kurmadan koşar. Skor modeli
 * WICG spatial-navigation yaklaşımıdır: ana eksende ileride duran
 * adaylar arasından, ana eksen uzaklığı ile çapraz eksen sapmasının
 * ağırlıklı toplamı en küçük olan kazanır.
 */
export type NavDirection = 'up' | 'down' | 'left' | 'right';

/** `DOMRect`/`getBoundingClientRect` ile yapısal uyumlu dikdörtgen. */
export interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DirectionalCandidate<T> {
  readonly element: T;
  readonly rect: RectLike;
}

function center(rect: RectLike): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * `dir` yönünde `from`'dan sonra gelen adayların en iyisini döner.
 *
 * Bir aday ancak MERKEZİ yönün ilerisindeyse yarışır (aşağı için merkez
 * kesinlikle daha aşağıda olmalı). Kenar kesişimi tek başına yetmez —
 * yan yana duran iki butonda "aşağı" basınca yandaki sütuna kaymak
 * beklenmez. Eşitlikte DOM sırası (aday listesi sırası) kazanır.
 */
export function pickDirectionalTarget<T>(
  from: RectLike,
  candidates: readonly DirectionalCandidate<T>[],
  direction: NavDirection,
): T | null {
  const origin = center(from);
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;

  let best: { element: T; score: number } | null = null;
  for (const candidate of candidates) {
    const target = center(candidate.rect);
    const primary = horizontal ? (target.x - origin.x) * sign : (target.y - origin.y) * sign;
    if (primary <= 0) continue;
    const cross = horizontal ? Math.abs(target.y - origin.y) : Math.abs(target.x - origin.x);
    // Çapraz sapma ana eksen uzaklığından ağır cezalandırılır: aynı sırada
    // hafifçe sağda duran aday, çaprazca uzak adaya kaybeder.
    const score = primary + cross * 2;
    if (!best || score < best.score) {
      best = { element: candidate.element, score };
    }
  }
  return best?.element ?? null;
}
