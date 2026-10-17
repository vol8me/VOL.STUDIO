/**
 * Rig varlık modelinin PHASER TAŞIMAYAN katmanı: tipler, doğrulama, tanım
 * kurma ve eklemlendirme.
 *
 * Ayrı bir alt-yol olmasının sebebi, aynı sözleşmeyi iki farklı dünyanın
 * tüketmesidir: sahnede rig kuran bir oyun (Phaser'lı) ve export'unu doğrulayan
 * bir Node aracı (Phaser'sız). Tek barrel'dan verilseydi, bir CLI yalnızca
 * metadata doğrulamak için tüm render yığınını yüklemek zorunda kalırdı.
 *
 * `assembleRig`/`preloadRigTextures` burada BİLİNÇLİ olarak yok; onlar bir
 * sahne ister ve `./index`ten gelir.
 */
export type {
  Point,
  Size,
  RigPartMetadata,
  RigPreviewMetadata,
  RigMetadata,
  RigPartAsset,
  RigDefinition,
} from './types';
export { validateRigMetadata } from './validateMetadata';
export { buildRigDefinition } from './buildRig';
export { articulateRigDefinition, type RigArticulation } from './articulateRig';
