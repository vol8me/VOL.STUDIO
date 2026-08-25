/**
 * İşaretli mesafe alanları — §4.1'in SDF ailesi.
 *
 * Hepsi NEGATİF İÇERİDE olacak şekilde işaretli mesafe döndürür. Katman
 * sınırında kapsamaya çevrilirler (§3); `abs` ile kontura, `min`/`max` ile
 * birleşim/kesişime dönüşürler — ayrı boolean ya da çerçeve primitifi
 * gerekmez (D9).
 *
 * Formüller yaklaşık değil TAM olmaya çalışır: dış çizgi (Tur 3) ve mesafe
 * dönüşümü mesafeyi UZUNLUK olarak okur, yaklaşık bir alanda kalınlık yönle
 * değişir.
 */

import { clamp } from '../../math/interpolation';
import type { FieldFn } from './fn';

const TAU = Math.PI * 2;

/** Pozitif kalan — negatif koordinatlarda `%` doğrudan kullanılamaz. */
function mod(value: number, m: number): number {
  const result = value % m;
  return result < 0 ? result + m : result;
}

export function circleSdfField(cx: number, cy: number, r: number): FieldFn {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

/**
 * Kutu.
 *
 * İki parçalı olması şart: yalnızca `max(qx, qy)` kullanmak dışarıda
 * köşelerde Chebyshev mesafesi verir ve dış çizgi köşelerde kalınlaşır.
 */
export function boxSdfField(cx: number, cy: number, hx: number, hy: number): FieldFn {
  return (x, y) => {
    const qx = Math.abs(x - cx) - hx;
    const qy = Math.abs(y - cy) - hy;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  };
}

/** Köşesi yuvarlatılmış kutu — kutu SDF'sinin `r` kadar içeri çekilip şişirilmişi. */
export function roundBoxSdfField(
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  r: number,
): FieldFn {
  const ix = Math.max(0, hx - r);
  const iy = Math.max(0, hy - r);
  return (x, y) => {
    const qx = Math.abs(x - cx) - ix;
    const qy = Math.abs(y - cy) - iy;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

/**
 * Düzgün n-gen; `r` çevrel yarıçaptır.
 *
 * Açı bir dilime katlanır, sonra o dilimdeki TEK kenara olan uzaklık
 * hesaplanır. Çokgen dışbükey ve düzgün olduğu için en yakın kenar her zaman
 * noktanın kendi dilimindedir; işaret ise katlanmış x'in iç yarıçapı (apotem)
 * aşıp aşmadığıyla belirlenir.
 *
 * **Dilim KENAR ORTASINA ortalanır, köşeye değil.** Köşeye ortalamak dilim
 * ekseni üzerindeki sınırı apotem sanmaya yol açar; oysa o eksende sınır
 * çevrel yarıçaptadır ve köşeler yanlışlıkla dışarıda kalır. (`sdf.star`
 * bilinçli olarak TERS sözleşmeyi kullanır: onun dilimi dış köşeye
 * ortalanır, çünkü sınırı o köşeden başlayan bir doğru parçasıdır.)
 */
export function polygonSdfField(
  cx: number,
  cy: number,
  n: number,
  r: number,
  rotationRad: number,
): FieldFn {
  const half = Math.PI / n;
  const apothem = r * Math.cos(half);
  const halfEdge = r * Math.sin(half);

  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const radius = Math.hypot(dx, dy);
    if (radius === 0) return -apothem;

    const angle = mod(Math.atan2(dy, dx) - rotationRad, 2 * half) - half;
    const px = radius * Math.cos(angle);
    const py = radius * Math.sin(angle);

    const edgeY = clamp(py, -halfEdge, halfEdge);
    const distance = Math.hypot(px - apothem, py - edgeY);
    return px <= apothem ? -distance : distance;
  };
}

/**
 * n uçlu yıldız.
 *
 * Açı bir dilime katlanır, sonra dilim ortasından AYNALANIR; kalan yarım
 * dilimde sınır tek bir doğru parçasıdır (dış köşeden iç köşeye). Uzaklık o
 * parçaya, işaret ise parçanın hangi tarafında kalındığına bakılarak bulunur.
 */
export function starSdfField(
  cx: number,
  cy: number,
  n: number,
  rOuter: number,
  rInner: number,
  rotationRad: number,
): FieldFn {
  const seg = TAU / n;
  const half = seg / 2;
  const ax = rOuter;
  const ay = 0;
  const bx = rInner * Math.cos(half);
  const by = rInner * Math.sin(half);
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const radius = Math.hypot(dx, dy);
    const angle = Math.abs(mod(Math.atan2(dy, dx) - rotationRad + half, seg) - half);
    const px = radius * Math.cos(angle);
    const py = radius * Math.sin(angle);

    const apx = px - ax;
    const apy = py - ay;
    const t = abLenSq > 0 ? clamp((apx * abx + apy * aby) / abLenSq, 0, 1) : 0;
    const distance = Math.hypot(apx - abx * t, apy - aby * t);

    // AB'nin solunda kalan iç bölgedir; merkez için çapraz çarpım pozitiftir.
    return abx * apy - aby * apx > 0 ? -distance : distance;
  };
}

/** Kalın doğru parçası, uçları DÜZ — kendi ekseninde bir kutudur. */
export function lineSdfField(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness: number,
): FieldFn {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  const halfLength = length / 2;
  const halfThickness = thickness / 2;

  return (x, y) => {
    const rx = x - mx;
    const ry = y - my;
    // Parçanın kendi eksenine döndür, sonra kutu SDF'si uygula.
    const lx = Math.abs(rx * ux + ry * uy) - halfLength;
    const ly = Math.abs(-rx * uy + ry * ux) - halfThickness;
    return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0);
  };
}

/** Uçları YUVARLAK kapsül — gövde ve dal için temel. */
export function capsuleSdfField(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): FieldFn {
  const bax = bx - ax;
  const bay = by - ay;
  const baLenSq = bax * bax + bay * bay;

  return (x, y) => {
    const pax = x - ax;
    const pay = y - ay;
    const h = baLenSq > 0 ? clamp((pax * bax + pay * bay) / baLenSq, 0, 1) : 0;
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
}

/**
 * Halka dilimi. Açı dilim içindeyse halkaya, dışındaysa en yakın uç kapağına
 * olan uzaklık verilir; ikisi de tam Öklid uzaklığıdır.
 */
export function arcSdfField(
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  fromRad: number,
  toRad: number,
): FieldFn {
  const halfThickness = thickness / 2;
  const sweep = mod(toRad - fromRad, TAU) || TAU;
  const startX = cx + r * Math.cos(fromRad);
  const startY = cy + r * Math.sin(fromRad);
  const endX = cx + r * Math.cos(fromRad + sweep);
  const endY = cy + r * Math.sin(fromRad + sweep);

  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const radius = Math.hypot(dx, dy);
    const delta = mod(Math.atan2(dy, dx) - fromRad, TAU);

    if (delta <= sweep) return Math.abs(radius - r) - halfThickness;

    const toStart = Math.hypot(x - startX, y - startY);
    const toEnd = Math.hypot(x - endX, y - endY);
    return Math.min(toStart, toEnd) - halfThickness;
  };
}
