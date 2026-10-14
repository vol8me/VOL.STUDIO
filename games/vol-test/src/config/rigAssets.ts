import {
  articulateRigDefinition,
  buildRigDefinition,
  validateRigMetadata,
  type RigDefinition,
  type RigMetadata,
} from '@volstudio/core/rig/metadata';
import arachnidRaw from '@/assets/rig/arachnid.metadata.json';
import plasmaCannonRaw from '@/assets/rig/plasma_cannon.metadata.json';
import { ARACHNID_ARTICULATION } from './walkerRig';

/**
 * Rig asset'lerinin çalışma anı adresi. Metadata bu paketin kaynağında, parça PNG'leri
 * `public/assets/rig/` altında yaşar; ikisini de `rig:sync` yazar. Oyun asset'ini üreten araca
 * bakmaz: üretilmiş veriyi kendi ağacından okur ve build'i devtools olmadan geçer.
 *
 * Doğrulama bir tip dönüştürmesinin yerini alır: `validateRigMetadata` dosyanın gerçekten bu
 * şekilde olduğunu çalışma anında okur, şema değişince build yeşil kalıp oyun kırılmaz.
 */
export const arachnidMetadata: RigMetadata = validateRigMetadata(
  arachnidRaw,
  'arachnid.metadata.json',
);
export const plasmaCannonMetadata: RigMetadata = validateRigMetadata(
  plasmaCannonRaw,
  'plasma_cannon.metadata.json',
);

/** `partId` → doku adresi; parçalar statik sunulur, yolun kendisi adrestir. */
export function partUrls(metadata: RigMetadata): Record<string, string> {
  return Object.fromEntries(
    metadata.parts.map((part) => [part.file, `${import.meta.env.BASE_URL}${part.file}`]),
  );
}

/** Eklem şeması uygulanmış, montaja hazır arachnid tanımı. */
export const ARACHNID_RIG: RigDefinition = articulateRigDefinition(
  buildRigDefinition(arachnidMetadata, partUrls(arachnidMetadata)),
  ARACHNID_ARTICULATION,
);

/** Plazma topu: metadata eklemleri kendi taşır (gövde → namlu çubuğu → ağız), şema gerekmez. */
export const PLASMA_CANNON_RIG: RigDefinition = buildRigDefinition(
  plasmaCannonMetadata,
  partUrls(plasmaCannonMetadata),
);
