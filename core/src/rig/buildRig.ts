import { validateRigMetadata } from './validateMetadata';
import type { RigDefinition, RigMetadata, RigPartAsset } from './types';

/**
 * Metadata JSON'unu, çözümlenmiş parça texture URL'leriyle eşleştirip
 * montaja hazır bir `RigDefinition` üretir.
 *
 * `partUrls` genelde bir bundler'ın glob sonucudur (anahtar = dosya yolu,
 * değer = URL); eşleşme dosya adının kök kısmına göre yapılır.
 *
 * Eksik/tutarsız her durumda sessizce atlamak yerine hata fırlatır - bir
 * parçası eksik rig, render edilecek bir boşluk değil, hemen görülmesi
 * gereken bir hatadır.
 */
export function buildRigDefinition(
  metadata: RigMetadata,
  partUrls: Record<string, string>,
): RigDefinition {
  // Metadata dosyadan/dış araçtan gelir; TypeScript arayüzü çalışma zamanında
  // hiçbir şey garanti etmez. Şekil önce doğrulanır ki eksik bir alan
  // anlaşılmaz bir `TypeError` yerine nerede olduğunu söyleyen bir mesaj versin.
  validateRigMetadata(metadata, metadata?.entityId ?? 'metadata');

  const { entityId } = metadata;
  const { rootSizePx, exportScale } = metadata.source;

  if (!rootSizePx) {
    throw new Error(`${entityId}: metadata'da rootSizePx yok, rig montajlanamaz`);
  }
  if (!Number.isFinite(exportScale) || exportScale <= 0) {
    throw new Error(`${entityId}: exportScale pozitif bir sayı olmalı (gelen: ${exportScale})`);
  }

  const urlsByPartId = indexUrlsByPartId(entityId, partUrls);
  const seen = new Set<string>();

  const parts: RigPartAsset[] = metadata.parts.map((part) => {
    if (seen.has(part.partId)) {
      throw new Error(`${entityId}: "${part.partId}" parçası metadata'da birden fazla kez var`);
    }
    seen.add(part.partId);

    const textureUrl = urlsByPartId.get(part.partId);
    if (!textureUrl) {
      throw new Error(`${entityId}: "${part.partId}" parçası için export edilmiş PNG bulunamadı`);
    }
    if (!part.positionPx) {
      throw new Error(
        `${entityId}: "${part.partId}" parçasının positionPx'i yok (izole export, rig yerleşimi değil)`,
      );
    }

    const parentPartId = part.parentPartId ?? null;
    if (parentPartId !== null) {
      if (parentPartId === part.partId) {
        throw new Error(`${entityId}: "${part.partId}" parçası kendi ebeveyni olamaz`);
      }
      // Çizim sırası aynı zamanda ağacın kuruluş sırası: ebeveyn ÖNCE gelmeli.
      // Gelmezse `assembleRig` henüz var olmayan bir container'a bağlanmaya
      // çalışır — döngüsel bir referans da bu kontrole takılır.
      if (!seen.has(parentPartId)) {
        throw new Error(
          `${entityId}: "${part.partId}" parçasının ebeveyni "${parentPartId}" ` +
            `listede ondan SONRA geliyor ya da hiç yok. Ebeveyn önce gelmelidir.`,
        );
      }
    }

    return {
      partId: part.partId,
      parentPartId,
      textureKey: `${entityId}__${part.partId}`,
      textureUrl,
      logicalSizePx: part.logicalSizePx,
      positionPx: part.positionPx,
      rotationDeg: part.rotationDeg,
    };
  });

  return { entityId, rootSizePx, exportScale, parts };
}

/**
 * Dosya yollarını parça kimliğine indeksler. Aynı kimliğe iki farklı dosya
 * düşerse hangisinin kullanılacağı belirsiz olurdu; bu yüzden hata verilir.
 */
function indexUrlsByPartId(
  entityId: string,
  partUrls: Record<string, string>,
): Map<string, string> {
  const index = new Map<string, string>();

  for (const [path, url] of Object.entries(partUrls)) {
    const fileName = path.split('/').pop();
    if (!fileName || !fileName.endsWith('.png')) continue;

    const partId = fileName.slice(0, -'.png'.length);
    if (index.has(partId)) {
      throw new Error(`${entityId}: "${partId}" parçası için birden fazla dosya eşleşti`);
    }
    index.set(partId, url);
  }

  return index;
}
