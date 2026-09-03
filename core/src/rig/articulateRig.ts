import type { RigDefinition, RigPartAsset } from './types';

/** partId -> üst parçanın partId'si. Listede olmayan parça köke bağlı kalır. */
export type RigArticulation = Readonly<Record<string, string>>;

/**
 * Bir `RigDefinition`e eklem şeması uygular.
 *
 * Eklem bilgisinin ASIL yeri export manifestidir (`organize-pen-export.mjs`in
 * `parent` alanı); orada verildiğinde metadata'ya yazılır ve bu fonksiyona
 * gerek kalmaz. Ne var ki yayımlanmış düz bir export'u yeniden üretmek her
 * zaman mümkün değildir (kaynak staging çıktısı tüketilip silinmiştir) ve
 * eklemsiz bir zincirde yalnız uçlar sürülebilir: ara kemikler kardeş kalır,
 * sürülen parça dönerken onlar export pozunda donar ve uzuv kopuk görünür.
 *
 * Burada şema TÜKETİCİ tarafında bildirilir; metadata dosyasına dokunulmaz,
 * yani bir sonraki export bu kararı ezmez.
 *
 * Dönen tanımda parçalar TOPOLOJİK sıradadır (ebeveyn her zaman çocuktan
 * önce): `assembleRig` ağacı tek geçişte kurar. Aynı ebeveynin çocukları
 * arasında kaynak çizim sırası korunur.
 */
export function articulateRigDefinition(
  rig: RigDefinition,
  articulation: RigArticulation,
): RigDefinition {
  const byId = new Map(rig.parts.map((part) => [part.partId, part]));

  for (const [partId, parentPartId] of Object.entries(articulation)) {
    if (!byId.has(partId)) {
      throw new Error(`${rig.entityId}: eklem şemasındaki "${partId}" parçası rig'de yok`);
    }
    if (!byId.has(parentPartId)) {
      throw new Error(
        `${rig.entityId}: "${partId}" parçasının ebeveyni "${parentPartId}" rig'de yok`,
      );
    }
    if (partId === parentPartId) {
      throw new Error(`${rig.entityId}: "${partId}" parçası kendi ebeveyni olamaz`);
    }
  }

  /*
   * Şema, kaynakta ZATEN VAR OLAN eklemleri ezmez; yalnız eksik olanları
   * tamamlar. Aksi halde manifest `parent` alanıyla üretilmiş bir rig'e tek
   * bir ek bağ eklemek, yazılmış tüm eklemleri sessizce köke düşürürdü.
   */
  const parentOf = (partId: string): string | null =>
    articulation[partId] ?? byId.get(partId)?.parentPartId ?? null;
  assertAcyclic(rig.entityId, rig.parts, parentOf);

  const emitted = new Set<string>();
  const parts: RigPartAsset[] = [];

  // Kaynak sırasında ilerlenir ve her parçadan önce ATALARI yayımlanır: aynı
  // ebeveynin çocukları kaynak sırasını korur, ağaç tek geçişte kurulabilir.
  const emit = (part: RigPartAsset): void => {
    if (emitted.has(part.partId)) return;
    const parentPartId = parentOf(part.partId);
    if (parentPartId !== null) {
      const parent = byId.get(parentPartId);
      if (parent) emit(parent);
    }
    emitted.add(part.partId);
    parts.push({ ...part, parentPartId });
  };

  for (const part of rig.parts) emit(part);

  return { ...rig, parts };
}

/**
 * Döngü tespiti. Döngü bırakılırsa `emit` sonsuz özyinelemeye girer ve hata
 * "maximum call stack" olarak, şemanın hangi halkasında olduğunu söylemeden
 * görünürdü.
 */
function assertAcyclic(
  entityId: string,
  parts: readonly RigPartAsset[],
  parentOf: (partId: string) => string | null,
): void {
  const safe = new Set<string>();

  for (const part of parts) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = part.partId;

    while (current !== null && !safe.has(current)) {
      if (seen.has(current)) {
        throw new Error(
          `${entityId}: eklem şemasında döngü var (${[...chain, current].join(' -> ')})`,
        );
      }
      seen.add(current);
      chain.push(current);
      current = parentOf(current);
    }

    for (const id of chain) safe.add(id);
  }
}
