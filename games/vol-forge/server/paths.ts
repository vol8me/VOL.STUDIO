/**
 * Çıktı yolu çözümleme ve GÜVENLİK sınırı — §8.11.
 *
 * Tarayıcıdan gelen bir istekle diske yazmak, yol denetimini pazarlık dışı
 * yapar. Üç kural birlikte uygulanır ve üçü de burada, saf bir fonksiyonda
 * yaşar ki test edilebilsin:
 *
 * 1. `category` çağıranın verdiği sabit listede olmalı (serbest metin yok).
 *    Liste PARAMETRE olarak gelir çünkü bu modül `@volstudio/core`a bağlı
 *    olamaz: Vite YAPILANDIRMASI onu düz Node ESM ile yükler ve orada dizin
 *    barrel'ları çözülmez. Tek doğruluk kaynağı yine `PRESET_CATEGORIES`tir;
 *    yalnızca buraya dışarıdan verilir.
 * 2. `name` `[a-z0-9-]` ve 1..64 uzunlukta olmalı; nokta, eğik çizgi ve
 *    büyük harf yok — `..` ile üst klasöre çıkmanın yolu böyle kapanır.
 * 3. Çözülen yol `output/` altında kalmalı. İlk iki kural bunu zaten
 *    sağlıyor ama son kontrol yine yapılır: kural değişirse sınır durur.
 */
export const NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

export interface ResolvedTarget {
  /** `output/` köküne göre klasör. */
  readonly directory: string;
  /** Uzantısız dosya adı. */
  readonly name: string;
  /** `output/` köküne göre göreli yollar. */
  readonly docPath: string;
  readonly pngPath: string;
}

export type ResolveResult =
  | { readonly ok: true; readonly target: ResolvedTarget }
  | { readonly ok: false; readonly reason: string };

export function resolveTarget(
  category: unknown,
  name: unknown,
  allowed: readonly string[],
): ResolveResult {
  if (typeof category !== 'string' || !allowed.includes(category)) {
    return { ok: false, reason: `bilinmeyen kategori: ${String(category)}` };
  }
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return { ok: false, reason: `ad "a-z0-9-" olmalı, 1..64 karakter (gelen: ${String(name)})` };
  }
  return {
    ok: true,
    target: {
      directory: category,
      name,
      docPath: `${category}/${name}.json`,
      pngPath: `${category}/${name}.png`,
    },
  };
}

/**
 * `output/` köküne göre verilen göreli bir yolun sınır içinde kalıp
 * kalmadığını söyler. Ayrı bir fonksiyon olması bilinçli: `resolveTarget`
 * yeni bir alan kazanırsa bu kontrol yine tek başına çalışır.
 */
export function isInsideOutput(relative: string): boolean {
  if (relative.length === 0) return false;
  if (relative.startsWith('/') || relative.includes('\\')) return false;
  const segments = relative.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
