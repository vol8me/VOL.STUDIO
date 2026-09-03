import { validateRigMetadata } from '@volstudio/core';
import arachnidMetadataRaw from '@/assets/rig/arachnid.metadata.json';

/**
 * Rig asset'lerinin ÇALIŞMA ZAMANI adresi.
 *
 * Metadata bu paketin kaynağında, parça PNG'leri `public/assets/rig/` altında
 * yaşar; ikisini de `pnpm --filter @volstudio/vol-arachnid rig:sync` yazar.
 * Oyun artık asset'ini ÜRETEN araca bakmaz — üretilmiş veriyi kendi ağacından
 * okur (bkz. AGENTS.md, "Bozulamaz Kurallar" 4).
 *
 * Doğrulama bir tip DÖNÜŞTÜRMESİNİN yerini alır. `as RigMetadata` derleme
 * zamanında `schemaVersion`in genel `number` çıkarımını susturuyordu ama
 * dosyanın gerçekten o şekilde olduğuna dair hiçbir şey söylemiyordu; şema
 * değişse derleme yine geçerdi. `validateRigMetadata` hem tipi daraltır hem
 * dosyayı gerçekten okur.
 */
export const arachnidMetadata = validateRigMetadata(arachnidMetadataRaw, 'arachnid.metadata.json');

/**
 * `partId` → texture URL eşlemesi.
 *
 * `buildRigDefinition` düz bir `Record<yol, url>` bekler ve eşlemeyi dosya
 * adının kökünden yapar. Parçalar statik olarak sunulduğu için yolun kendisi
 * ZATEN URL'dir; bundler glob'u gerekmez. Bu, `import.meta.glob`un derleme
 * zamanı garantisini bırakır — karşılığı `tests/config/rigAssets.test.ts`
 * içindeki disk paritesi kapısıdır.
 */
export const arachnidPartUrls: Record<string, string> = Object.fromEntries(
  arachnidMetadata.parts.map((part) => [part.file, part.file]),
);
