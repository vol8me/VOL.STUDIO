/**
 * Program ÜRETEÇLERİNİN düğümlere yazdığı sürümün tek kaynağı.
 * `catalog.ts` registry'yi kurunca her girdinin güncel sürümünü buraya
 * kaydeder. Primitive dosyaları (archetype `expand` gövdeleri gibi)
 * catalog'u import edemez — modül döngüsü kapısı; bu modül import'suzdur
 * ve yalnız expand çağrı anında okunur, o noktada catalog kurulmuştur.
 * Kaydedilmemiş kimlikte `undefined` döner: üreteç `?? 1` ile yazar,
 * gerçek hata `resolveProgram`'ın `unknown-id` ya da `version` hatası
 * olarak kalır — sessizce yanlış render edilmez.
 */
const versions = new Map<string, number>();

/** catalog.ts'nin registry kurulumunda girdi başına bir kez çağırdığı kayıt. */
export function recordNodeVersion(id: string, version: number): void {
  const found = versions.get(id);
  versions.set(id, found === undefined ? version : Math.max(found, version));
}

/** Yapı taşının güncel registry sürümü; bilinmiyorsa `undefined`. */
export function latestNodeVersion(id: string): number | undefined {
  return versions.get(id);
}
