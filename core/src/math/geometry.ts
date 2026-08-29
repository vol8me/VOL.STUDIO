import type { Vector2 } from './Vector2';

/**
 * Çarpışma ve görünürlük testleri — daire, dikdörtgen, ışın.
 *
 * vol-hell'in `CollisionResolver`ü bu testleri kendi içinde, entity tiplerine
 * gömülü yazıyordu; buradaki hâlleri saf sayılarla çalışır ve hiçbir oyun
 * nesnesi tanımaz.
 *
 * **Karesel mesafe tercihi:** karşılaştırma yapılan her yerde `Math.sqrt`
 * çağrılmaz. Kare kök, sonucu bir eşikle karşılaştırırken hiçbir bilgi
 * eklemez ama kare başına binlerce çağrıda ölçülebilir maliyet üretir.
 */

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Sol-üst köşe + boyut ile eksen hizalı dikdörtgen. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** İki nokta arası KARESEL mesafe — eşik karşılaştırmaları için. */
export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** İki nokta arası mesafe. Yalnızca gerçek uzunluk gerekiyorsa kullan. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSquared(ax, ay, bx, by));
}

/**
 * Sonlu bir doğru parçası ile dairenin kesişimini test eder.
 *
 * Hareketli mermiler için yalnızca son noktayı kontrol etmek küçük hedeflerin
 * içinden tünellemeye yol açar. En yakın nokta izdüşümüyle çalışan bu yardımcı
 * allocation yapmaz ve sıfır uzunluktaki parçayı da (nokta testi olarak)
 * doğru ele alır. Teğet temas kesişme sayılır.
 */
export function segmentCircleOverlap(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  circleX: number,
  circleY: number,
  radius: number,
): boolean {
  if (
    !Number.isFinite(startX) ||
    !Number.isFinite(startY) ||
    !Number.isFinite(endX) ||
    !Number.isFinite(endY) ||
    !Number.isFinite(circleX) ||
    !Number.isFinite(circleY) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) {
    return false;
  }

  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  let closestX = startX;
  let closestY = startY;

  if (lengthSquared > 0) {
    const projection = ((circleX - startX) * dx + (circleY - startY) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, projection));
    closestX += dx * t;
    closestY += dy * t;
  }

  return distanceSquared(closestX, closestY, circleX, circleY) <= radius * radius;
}

/**
 * Doğru parçasının daireye İLK temas ettiği parametre (`0..1`), yoksa `null`.
 *
 * `segmentCircleOverlap` "kesişti mi" sorusunu yanıtlar; süpürülen parça aynı
 * adımda birden fazla daireyi kesiyorsa hangisinin ÖNCE geldiğini söylemez.
 * Çağıran dizideki ilk eşleşmeyi seçerse sonuç aday listesinin SIRASINA bağlı
 * kalır: aynı geometri, farklı sonuç. Bu fonksiyon süpürülmüş parça-daire
 * kesişiminin küçük kökünü döndürür; çağıran en küçük `t`'yi seçerek
 * sıralamadan bağımsız, deterministik bir "ilk temas" kurar.
 *
 * Parça daire İÇİNDE başlıyorsa `0` döner (temas zaten olmuştur). Sıfır
 * uzunluktaki parça nokta testine indirgenir. Allocation yapmaz.
 */
export function segmentCircleEntryT(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  circleX: number,
  circleY: number,
  radius: number,
): number | null {
  if (
    !Number.isFinite(startX) ||
    !Number.isFinite(startY) ||
    !Number.isFinite(endX) ||
    !Number.isFinite(endY) ||
    !Number.isFinite(circleX) ||
    !Number.isFinite(circleY) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) {
    return null;
  }

  const originX = startX - circleX;
  const originY = startY - circleY;
  const radiusSquared = radius * radius;
  // Başlangıç zaten dairenin içindeyse temas bu adımdan önce olmuştur.
  if (originX * originX + originY * originY <= radiusSquared) return 0;

  const dx = endX - startX;
  const dy = endY - startY;
  const a = dx * dx + dy * dy;
  // Sıfır uzunluklu parça: yukarıdaki içeride-başlama testi tek karardır.
  if (a <= 0) return null;

  const b = originX * dx + originY * dy;
  const c = originX * originX + originY * originY - radiusSquared;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;

  // Küçük kök giriş anıdır; `b <= 0` olmadan parça daireden UZAKLAŞIYOR
  // demektir ve giriş kökü negatife düşer.
  const t = (-b - Math.sqrt(discriminant)) / a;
  if (t < 0 || t > 1) return null;
  return t;
}

/** İki daire kesişiyor mu? (Teğet durumu kesişme SAYILIR.) */
export function circlesOverlap(a: Circle, b: Circle): boolean {
  const reach = a.radius + b.radius;
  return distanceSquared(a.x, a.y, b.x, b.y) <= reach * reach;
}

/** Nokta dairenin içinde mi? (Sınır dahil.) */
export function pointInCircle(x: number, y: number, circle: Circle): boolean {
  return distanceSquared(x, y, circle.x, circle.y) <= circle.radius * circle.radius;
}

/** Nokta dikdörtgenin içinde mi? (Sınır dahil.) */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** İki eksen hizalı dikdörtgen kesişiyor mu? (Teğet kesişme SAYILIR.) */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

/**
 * Daire ile eksen hizalı dikdörtgen kesişiyor mu?
 *
 * Dairenin merkezini dikdörtgene kelepçeleyip en yakın noktayı bulur; bu
 * nokta yarıçap içindeyse kesişme vardır. Köşelerde de doğru sonuç verir —
 * kaba bir "merkez içinde mi" testi köşe temaslarını kaçırırdı.
 */
export function circleRectOverlap(circle: Circle, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  return distanceSquared(circle.x, circle.y, nearestX, nearestY) <= circle.radius * circle.radius;
}

export interface RayHit<T> {
  target: T;
  /** Işın başlangıcından temas noktasına uzaklık. */
  distance: number;
}

/**
 * Işının çarptığı EN YAKIN daireyi bulur — nişan alma, görüş hattı, imleç
 * altındaki nesneyi seçme.
 *
 * `direction` normalize edilmemişse burada normalize edilir; sıfır uzunlukta
 * bir yön `null` döndürür (yönsüz ışın hiçbir şeye çarpamaz).
 *
 * `maxDistance` verilmezse ışın sonsuzdur. Işının ARKASINDAKİ hedefler
 * elenir: negatif izdüşüm, "arkamdaki hedefi vurdum" hatasının kaynağıdır.
 */
export function raycastCircles<T extends Circle>(
  origin: Vector2,
  direction: Vector2,
  targets: Iterable<T>,
  maxDistance = Infinity,
): RayHit<T> | null {
  const dirLength = direction.length();
  if (dirLength <= 0) return null;

  const dx = direction.x / dirLength;
  const dy = direction.y / dirLength;

  let closest: RayHit<T> | null = null;

  for (const target of targets) {
    const toTargetX = target.x - origin.x;
    const toTargetY = target.y - origin.y;

    // Hedef merkezinin ışın üzerindeki izdüşümü.
    const projection = toTargetX * dx + toTargetY * dy;

    // Işın çizgisine dik mesafe (karesel).
    const perpX = toTargetX - projection * dx;
    const perpY = toTargetY - projection * dy;
    const perpSq = perpX * perpX + perpY * perpY;
    if (perpSq > target.radius * target.radius) continue;

    // İzdüşümden geriye, daireye giriş noktasına kadar olan pay.
    const half = Math.sqrt(target.radius * target.radius - perpSq);
    let hitDistance = projection - half;

    // Işın dairenin İÇİNDE başlıyorsa temas mesafesi sıfırdır.
    if (hitDistance < 0) {
      if (projection + half < 0) continue; // daire tamamen arkada
      hitDistance = 0;
    }

    if (hitDistance > maxDistance) continue;
    if (!closest || hitDistance < closest.distance) {
      closest = { target, distance: hitDistance };
    }
  }

  return closest;
}
