/**
 * Sonlu sayı sözleşmesi — primitiflerin ortak giriş bariyeri.
 *
 * `NaN` ve `Infinity` bir kez duruma girdiğinde her aritmetik işlemi kirletir
 * ve kaynağı çok sonra, tamamen ilgisiz bir yerde fark edilir: bir kare
 * `deltaMs` `NaN` gelirse cooldown sonsuza dek "hazır değil" kalır, konum
 * `NaN` olan bir varlık indekste görünür ama hiçbir sorgu onu bulamaz.
 *
 * Bu yüzden her primitif dış dünyadan gelen sayıyı SINIRDA doğrular. İki
 * politika vardır ve seçim bilinçlidir:
 *
 * - **Reddet** (`requireFinite`): bozuk değer bir ÇAĞIRAN HATASIDIR ve
 *   sessizce düzeltilmesi hatayı gizler (ör. `new Cooldown(NaN)`).
 * - **Yoksay** (`finiteOr`): bozuk değer akış içinde gelebilir ve akışı
 *   durdurmak orantısızdır (ör. tek bir bozuk `deltaMs` karesi).
 */

/** `NaN` ve `±Infinity` hariç, gerçek bir sayı mı? */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Sonlu değilse `TypeError` fırlatır. Yapılandırma değerleri için —
 * bozuk bir eşiği sessizce düzeltmek, hatayı kullanıma kadar erteler.
 *
 * @param label Hata mesajında görünecek alan adı.
 */
export function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} sonlu bir sayı olmalı (gelen: ${String(value)})`);
  }
  return value;
}

/**
 * Sonlu değilse `fallback` döner. Kare başına akan değerler için — tek bir
 * bozuk `deltaMs` yüzünden oyunu durdurmak orantısız olurdu, ama o değerin
 * duruma sızmasına da izin verilmez.
 */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Sonlu ve NEGATİF OLMAYAN değeri döner; değilse `fallback`.
 * Süre, mesafe, miktar gibi doğası gereği negatif olamayan alanlar için.
 */
export function finitePositiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
