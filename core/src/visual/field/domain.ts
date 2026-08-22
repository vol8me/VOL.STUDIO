/**
 * Alan-uzayı işlemleri — §4.2. **Genelliğin kaynağı buradadır.**
 *
 * Hepsi TERS EŞLEME uygular (D4, §5.7): çıktı pikselinden girdiye gidilir.
 * İleri eşleme (girdiden çıktıya) çıktıda boşluk bırakır — döndürülen bir
 * daire delikli çıkar. Ters eşlemede her çıktı pikseli tam olarak bir kez
 * ve tam olarak bir girdi noktasından okunur.
 *
 * Zincirleme kapanışla yapılır: `rotate(translate(source))` çağrıldığında
 * önce `rotate`ın tersi, sonra `translate`in tersi uygulanır — yani zincir
 * ters sırada çalışır, §5.7'nin istediği tam olarak budur. Ayrı bir sıra
 * yönetimi yoktur; iç içe geçme sırayı zaten verir.
 *
 * Ara raster YOKTUR: dönüşümler tamdır, yeniden örnekleme bulanıklığı
 * oluşmaz. Piksel sanatında bu belirleyicidir.
 */

import type { FieldFn } from './fn';

/** Öteleme; tersi karşı yöne kaydırmadır. */
export function translateInverse(x0: number, y0: number, input: FieldFn): FieldFn {
  return (x, y) => input(x - x0, y - y0);
}

/**
 * Döndürme; tersi `-angle` ile döndürmedir.
 *
 * +y aşağı olduğu için (bkz. `space.ts`) pozitif açı görsel olarak saat
 * yönündedir. Kosinüs/sinüs derleme anında bir kez hesaplanır.
 */
export function rotateInverse(angleRad: number, cx: number, cy: number, input: FieldFn): FieldFn {
  const c = Math.cos(-angleRad);
  const s = Math.sin(-angleRad);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return input(cx + dx * c - dy * s, cy + dx * s + dy * c);
  };
}

/**
 * Ölçekleme; tersi bölmedir. Bileşenler ayrı olduğu için anizotropiktir.
 *
 * Sıfır ölçek doğrulamada reddedilir (`nonZero`); buraya sıfır gelmez.
 *
 * **Ölçeklenmiş bir SDF artık gerçek mesafe alanı değildir.** Koordinat
 * bölündüğü için geometri büyür ama dönen DEĞER kaynağın mesafesi kalır;
 * sonuç bir üst sınırdır (Lipschitz sabiti bozulur). Kapsama eşiği bundan
 * etkilenmez — işaret doğrudur — ama mesafeyi UZUNLUK olarak okuyan
 * işlemler (dış çizgi kalınlığı, mesafe dönüşümü; Tur 2–3) ölçekli bir
 * alanda beklenenden ince/kalın sonuç verir. O turlarda değer `min(sx, sy)`
 * ile yeniden ölçeklenmeli ya da eşik öncesi normalize edilmelidir.
 */
export function scaleInverse(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  input: FieldFn,
): FieldFn {
  const ix = 1 / sx;
  const iy = 1 / sy;
  return (x, y) => input(cx + (x - cx) * ix, cy + (y - cy) * iy);
}

/**
 * Kesme (shear). İleri dönüşüm `[[1, kx], [ky, 1]]`; tersi bu matrisin
 * tersidir. Determinant sıfırsa dönüşüm tekildir (tüm düzlem bir doğruya
 * çöker) ve doğrulamada reddedilir.
 */
export function skewInverse(kx: number, ky: number, input: FieldFn): FieldFn {
  const det = 1 - kx * ky;
  const invDet = 1 / det;
  return (x, y) => input((x - kx * y) * invDet, (y - ky * x) * invDet);
}

export type MirrorAxis = 'x' | 'y' | 'quad' | 'radial';

/**
 * Simetri katlaması.
 *
 * Katlama kendi tersidir: çıktı noktası katlanıp girdiden okunur, ayrı bir
 * ters dönüşüm gerekmez. Merkez KÖKENDİR — D2 birim uzayın kökenini merkeze
 * koyduğu için aynalama parametresiz çalışır; `[0,1]²` bir uzayda her çağrıya
 * bir merkez parametresi taşımak gerekirdi.
 */
export function mirrorInverse(axis: MirrorAxis, count: number, input: FieldFn): FieldFn {
  if (axis === 'x') return (x, y) => input(Math.abs(x), y);
  if (axis === 'y') return (x, y) => input(x, Math.abs(y));
  if (axis === 'quad') return (x, y) => input(Math.abs(x), Math.abs(y));

  const segment = (Math.PI * 2) / count;
  return (x, y) => {
    const radius = Math.hypot(x, y);
    let angle = Math.atan2(y, x) % segment;
    if (angle < 0) angle += segment;
    // Dilim içinde de aynala: n kollu bir simetri n aynadan oluşur.
    const folded = Math.min(angle, segment - angle);
    return input(radius * Math.cos(folded), radius * Math.sin(folded));
  };
}

export type RepeatMode = 'tile' | 'mirror';

/**
 * Döşeme. `count` KISA KENAR boyunca hücre sayısıdır (`freq` ile aynı
 * sözleşme). `mirror` modu komşu hücreleri yansıtır ve hücre sınırındaki
 * dikişi gizler — düz döşemede kaynak alanın iki kenarı uyuşmuyorsa çizgi
 * görünür.
 */
export function repeatInverse(
  count: number,
  mode: RepeatMode,
  cx: number,
  cy: number,
  input: FieldFn,
): FieldFn {
  const cell = 2 / count;
  const mirrored = mode === 'mirror';

  const fold = (value: number, center: number): number => {
    const t = (value - center) / cell + 0.5;
    const index = Math.floor(t);
    let local = t - index;
    if (mirrored && (index & 1) !== 0) local = 1 - local;
    return (local - 0.5) * cell + center;
  };

  return (x, y) => input(fold(x, cx), fold(y, cy));
}

/**
 * Kutupsal dönüşüm — halka, spiral, dişli, girişim deseni.
 *
 * İleri yönde çıktının x'i AÇIYA (`[-1, 1]` bir tam tur), y'si YARIÇAPA
 * karşılık gelir: yatay çizgiler halkaya, dikey çizgiler ışınlara döner.
 * `inverse` bunun tam tersidir; ikisi arka arkaya uygulanınca kimlik verir.
 */
export function polarInverse(cx: number, cy: number, inverse: boolean, input: FieldFn): FieldFn {
  if (inverse) {
    return (x, y) => {
      const angle = (x - cx) * Math.PI;
      const radius = y - cy;
      return input(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    };
  }
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return input(cx + Math.atan2(dy, dx) / Math.PI, cy + Math.hypot(dx, dy));
  };
}
