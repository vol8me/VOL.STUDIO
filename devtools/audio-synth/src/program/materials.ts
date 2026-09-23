/**
 * MaterialProfile — yeniden kullanılabilir fiziksel/algısal materyal VERİSİ.
 * Bir materyal EQ preset'i değildir: sönüm (kayıp faktörü η), mod yerleşimi,
 * sertlik (Young modülü E) ve yoğunluk (ρ) üzerinden modların frekansını,
 * her modun ayrı çınlama süresini, temas süresini (Hertz) ve yüzey pürüzünü
 * belirler. Değerler literatürdeki tipik aralıkların ortasıdır (yapı
 * malzemeleri tabloları; η için Cremer–Heckl "Structure-Borne Sound" tablo
 * mertebeleri); tek bir numunenin ölçümü DEĞİLDİR.
 *
 * Türetilen nicelikler:
 * - Boyuna ses hızı c = √(E/ρ).
 * - Bükülme temel modu f₁ = K·c·h/L² (h = kalınlık oranı × L); K yerleşime
 *   göre (serbest çubuk 1.028, basit mesnetli kare levha 0.950, kabuk 0.6,
 *   zar 0.4 — zar için gerilim yerine aynı ölçek kullanılır: yaklaşım).
 * - Mod k'nın T60'ı: 2.2 / (η · f₁ · oran_k^üs) — η sabit kayıpta üs 1'dir;
 *   üs > 1 tizlerin ek (ısıl/yüzey) kaybını temsil eder.
 * - Parlaklık: log10(E / 1 MPa) / 5.4, [0, 1] (sert malzeme üst modlara
 *   enerji verir); mod genliği oran_k^(−2·(1−parlaklık)).
 */
export type MaterialLayout = 'bar' | 'plate' | 'shell' | 'membrane';

export interface MaterialProfileV1 {
  readonly id: string;
  readonly description: string;
  readonly densityKgM3: number;
  readonly youngModulusGPa: number;
  readonly lossFactor: number;
  readonly dampingExponent: number;
  readonly layout: MaterialLayout;
  /** Mod oranlarını gerer: oran_k · √(1 + B·k²) / √(1 + B). */
  readonly stretch: number;
  /** Yüzey pürüzü / temas gürültüsü payı [0, 1]. */
  readonly contactNoise: number;
}

const mat = (
  id: string,
  description: string,
  youngModulusGPa: number,
  densityKgM3: number,
  lossFactor: number,
  dampingExponent: number,
  layout: MaterialLayout,
  stretch: number,
  contactNoise: number,
): MaterialProfileV1 => ({
  id,
  description,
  densityKgM3,
  youngModulusGPa,
  lossFactor,
  dampingExponent,
  layout,
  stretch,
  contactNoise,
});

export const MATERIALS: readonly MaterialProfileV1[] = [
  mat(
    'metal',
    'Çelik/demir sac: çok düşük kayıp, uzun parlak çınlama.',
    200,
    7850,
    0.0006,
    0.6,
    'plate',
    0.0004,
    0.08,
  ),
  mat(
    'wood',
    'Ahşap çubuk/tahta: orta kayıp, sıcak kısa çınlama.',
    11,
    600,
    0.012,
    1.1,
    'bar',
    0.002,
    0.35,
  ),
  mat(
    'glass',
    'Cam kap/levha: düşük kayıp, tiz kabuk modları.',
    70,
    2500,
    0.0015,
    0.8,
    'shell',
    0.0002,
    0.03,
  ),
  mat(
    'stone',
    'Taş levha: yoğun, orta kayıp, pürüzlü temas.',
    50,
    2700,
    0.006,
    1,
    'plate',
    0.004,
    0.6,
  ),
  mat(
    'ceramic',
    'Seramik/porselen: sert, kısa parlak kabuk çınlaması.',
    70,
    2400,
    0.003,
    0.9,
    'shell',
    0.001,
    0.15,
  ),
  mat(
    'hard-plastic',
    'Sert plastik (ABS mertebesi): yüksek kayıp, kutu sesi.',
    2.5,
    1050,
    0.03,
    1.2,
    'plate',
    0.003,
    0.2,
  ),
  mat(
    'soft-plastic',
    'Yumuşak plastik (PE mertebesi): çok kısa, donuk.',
    0.3,
    920,
    0.1,
    1.3,
    'plate',
    0.004,
    0.3,
  ),
  mat(
    'rubber',
    'Kauçuk: aşırı sönümlü, çınlamaz, tok temas.',
    0.01,
    1100,
    0.35,
    1.5,
    'membrane',
    0.01,
    0.45,
  ),
  mat('cloth', 'Kumaş: çınlamaz, hışırtılı temas.', 0.005, 300, 0.6, 1.6, 'membrane', 0.02, 0.9),
  mat(
    'flesh',
    'Yumuşak doku: çok sönümlü, ıslak tok darbe.',
    0.0005,
    1050,
    0.45,
    1.5,
    'membrane',
    0.01,
    0.55,
  ),
  mat(
    'fluid',
    'Sıvı yüzeyi (yaklaşım): katı gibi çınlamaz, gürültülü temas.',
    0.002,
    1000,
    0.5,
    1.5,
    'membrane',
    0.01,
    0.85,
  ),
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

export function materialById(id: string): MaterialProfileV1 | undefined {
  return MATERIALS.find((m) => m.id === id);
}

export function soundSpeed(material: MaterialProfileV1): number {
  return Math.sqrt((material.youngModulusGPa * 1e9) / material.densityKgM3);
}

export function materialBrightness(material: MaterialProfileV1): number {
  return Math.min(1, Math.max(0, Math.log10((material.youngModulusGPa * 1e9) / 1e6) / 5.4));
}

const LAYOUT_K: Readonly<Record<MaterialLayout, number>> = {
  bar: 1.028,
  plate: 0.95,
  shell: 0.6,
  membrane: 0.4,
};

/** Bükülme temel modu (Hz): f₁ = K·c·t/L (t kalınlık oranı), [20, 20000] içine alınır. */
export function fundamentalHz(
  material: MaterialProfileV1,
  sizeM: number,
  thickness: number,
): number {
  const f = (LAYOUT_K[material.layout] * soundSpeed(material) * thickness) / sizeM;
  return Math.min(20000, Math.max(20, f));
}

const BAR = [4.73, 7.8532, 10.9956, 14.1372, 17.2788];
const MEMBRANE = [
  2.4048, 3.8317, 5.1356, 5.5201, 6.3802, 7.0156, 7.5883, 8.4172, 8.6537, 8.7715, 9.761, 9.9361,
  10.1735, 11.0647, 11.0864, 11.6198, 11.7915, 12.2251, 12.3386, 13.0152, 13.3237, 13.3543, 13.5893,
  14.3725, 14.4755, 14.796, 14.8213, 14.9309, 15.5898, 15.7002, 16.0378, 16.2235,
];
/** Çan/kase kısmi serisi (en pes moda oran; Rossing "The acoustics of bells" tipik değerleri). */
const SHELL = [1, 2, 2.4, 3, 4, 5.33, 6.67, 8, 9.5, 11.2, 13.1, 15.2, 17.4, 19.8, 22.4, 25.2];

/** Basit mesnetli kare levha: (m² + n²)/2, m ≤ n (kare olduğundan (m,n) ≡ (n,m)). */
const PLATE = (() => {
  const values: number[] = [];
  for (let m = 1; m <= 8; m++) for (let n = m; n <= 8; n++) values.push((m * m + n * n) / 2);
  return values.sort((a, b) => a - b);
})();

/** k. (0'dan) modun temel moda oranı, materyal gerilmesiyle. */
export function materialModeRatio(material: MaterialProfileV1, k: number): number {
  let base: number;
  switch (material.layout) {
    case 'bar': {
      const n = k + 1;
      const beta = n <= BAR.length ? BAR[n - 1] : ((2 * n + 1) * Math.PI) / 2;
      base = (beta / BAR[0]) ** 2;
      break;
    }
    case 'plate':
      base =
        PLATE[Math.min(k, PLATE.length - 1)] *
        (k >= PLATE.length ? 1 + 0.1 * (k - PLATE.length + 1) : 1);
      break;
    case 'shell':
      base =
        SHELL[Math.min(k, SHELL.length - 1)] *
        (k >= SHELL.length ? 1 + 0.12 * (k - SHELL.length + 1) : 1);
      break;
    default:
      base = MEMBRANE[Math.min(k, MEMBRANE.length - 1)] / MEMBRANE[0];
  }
  const B = material.stretch;
  return (base * Math.sqrt(1 + B * (k + 1) * (k + 1))) / Math.sqrt(1 + B);
}

/** Temel modun T60'ı (s): 2.2/(η·f₁), [0.005, 30] içinde. */
export function fundamentalT60(
  material: MaterialProfileV1,
  f1: number,
  dampingScale: number,
): number {
  return Math.min(30, Math.max(0.005, 2.2 / (material.lossFactor * dampingScale * f1)));
}

/** Context için materyal tablosu (türetilen nicelikler dahil, 0.3 m / 0.05 örneğinde). */
export function describeMaterials() {
  return MATERIALS.map((m) => {
    const f1 = fundamentalHz(m, 0.3, 0.05);
    return {
      ...m,
      soundSpeedMs: Math.round(soundSpeed(m)),
      brightness: Number(materialBrightness(m).toFixed(3)),
      example: {
        sizeM: 0.3,
        thickness: 0.05,
        fundamentalHz: Number(f1.toFixed(1)),
        t60Seconds: Number(fundamentalT60(m, f1, 1).toFixed(3)),
      },
    };
  });
}
