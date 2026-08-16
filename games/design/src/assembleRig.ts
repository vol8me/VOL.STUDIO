import Phaser from 'phaser';
import type { RigDefinition, RigPartAsset, Size } from './types';

export interface PartLayout {
  /**
   * Pivot pozisyonu, rig MERKEZİNE göreli (kökün sol-üstüne göre değil).
   * Merkez referansı sayesinde kök container'ı döndürmek tüm gövdeyi
   * karakterin kendi merkezi etrafında çevirir.
   */
  pivotX: number;
  pivotY: number;
  /** Pivot etrafında, radyan cinsinden CCW. */
  rotationRad: number;
  /**
   * Pivot'tan sprite merkezine ofset. Export, kanvası şeklin bbox merkezine
   * göre simetrik pad'lediği için sprite'ı logical kutunun ortasına almak
   * parça başına padding ölçümü gerektirmez.
   */
  spriteOffsetX: number;
  spriteOffsetY: number;
  /**
   * `1 / exportScale`. Texture'ın tamamını `setDisplaySize(logicalSizePx)`
   * ile sığdırmak görünmez padding'i de kutuya sıkıştırır ve içeriği olması
   * gerekenden küçük gösterir; ölçekleme bunu önler.
   */
  spriteScale: number;
}

export function computePartLayout(
  part: RigPartAsset,
  rig: { exportScale: number; rootSizePx: Size },
): PartLayout {
  return {
    pivotX: part.positionPx.x - rig.rootSizePx.width / 2,
    pivotY: part.positionPx.y - rig.rootSizePx.height / 2,
    rotationRad: Phaser.Math.DegToRad(part.rotationDeg),
    spriteOffsetX: part.logicalSizePx.width / 2,
    spriteOffsetY: part.logicalSizePx.height / 2,
    spriteScale: 1 / rig.exportScale,
  };
}

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

  for (const part of rig.parts) {
    const layout = computePartLayout(part, rig);

    const pivot = scene.add.container(layout.pivotX, layout.pivotY);
    pivot.rotation = layout.rotationRad;

    const sprite = scene.add.image(layout.spriteOffsetX, layout.spriteOffsetY, part.textureKey);
    sprite.setScale(layout.spriteScale);

    pivot.add(sprite);
    container.add(pivot);
    parts.set(part.partId, pivot);
  }

  return { container, parts };
}
