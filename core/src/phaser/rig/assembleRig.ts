import type Phaser from 'phaser';
import { computePartLayout } from '../../rig/partLayout';
import type { RigDefinition } from '../../rig/types';

/**
 * `assembleRig()`'den önce `Scene.preload()` içinden çağrılır. Texture
 * key'leri entity id ile namespace'lendiği için aynı sahnede birden çok rig
 * çakışmadan yüklenebilir.
 */
export function preloadRigTextures(scene: Phaser.Scene, rig: RigDefinition): void {
  for (const part of rig.parts) {
    if (!scene.textures.exists(part.textureKey)) {
      scene.load.image(part.textureKey, part.textureUrl);
    }
  }
}

export interface AssembledRig {
  /** Kök container; origin'i (0,0) karakterin görsel merkezidir. */
  container: Phaser.GameObjects.Container;
  /** partId -> parçanın pivot container'ı. */
  parts: Map<string, Phaser.GameObjects.Container>;
}

/**
 * Rig'i bir `Phaser.Container` ağacı olarak kurar. Texture'lar önceden
 * yüklenmiş olmalıdır (bkz. `preloadRigTextures`). Çizim sırası
 * `rig.parts` sırasını izler.
 *
 * `parentPartId` taşıyan parçalar kökün değil ÜST PARÇANIN container'ına
 * girer: üst parçayı döndürmek alt zinciri de döndürür (kol → önkol → el).
 * Eklem taşımayan bir rig'de her parça kökün altında kalır — düz bir rig'in
 * çıktısı eklem desteğinden ETKİLENMEZ.
 */
export function assembleRig(scene: Phaser.Scene, rig: RigDefinition): AssembledRig {
  // Phaser bilinmeyen bir texture key'inde sessizce `__MISSING` dokusunu
  // döndürür; preload atlanmışsa rig hatasız ama boş kutular hâlinde
  // çizilirdi. Eksik dokuyu adıyla bildirmek bu sessiz hatayı görünür kılar.
  const missing = rig.parts.filter((part) => !scene.textures.exists(part.textureKey));
  if (missing.length > 0) {
    throw new Error(
      `${rig.entityId}: texture yüklenmemiş (${missing
        .map((part) => part.partId)
        .join(', ')}) - assembleRig öncesi preloadRigTextures çağrılmalı`,
    );
  }

  const container = scene.add.container(0, 0);
  const parts = new Map<string, Phaser.GameObjects.Container>();
  const assetById = new Map(rig.parts.map((part) => [part.partId, part]));

  for (const part of rig.parts) {
    const parentAsset = part.parentPartId ? assetById.get(part.parentPartId) : undefined;
    const layout = computePartLayout(part, rig, parentAsset);

    const pivot = scene.add.container(layout.pivotX, layout.pivotY);
    pivot.rotation = layout.rotationRad;

    const sprite = scene.add.image(layout.spriteOffsetX, layout.spriteOffsetY, part.textureKey);
    sprite.setScale(layout.spriteScale);

    pivot.add(sprite);

    // `buildRigDefinition` ebeveynin listede ÖNCE geldiğini doğruladığı için
    // hedef container bu noktada kesinlikle kurulmuştur.
    const target = part.parentPartId ? parts.get(part.parentPartId) : container;
    if (!target) {
      throw new Error(
        `${rig.entityId}: "${part.partId}" parçasının ebeveyni "${part.parentPartId}" kurulmamış`,
      );
    }
    target.add(pivot);
    parts.set(part.partId, pivot);
  }

  return { container, parts };
}
