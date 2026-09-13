import type { Rect } from '@volstudio/core/math/geometry';

export function resolveParticleBounds(bounds: Readonly<Rect>, collisionInsetUnits: number): Rect {
  if (!(collisionInsetUnits >= 0) || !Number.isFinite(collisionInsetUnits)) {
    throw new RangeError('Parçacık çarpışma inseti negatif olmayan sonlu bir sayı olmalı.');
  }
  const width = bounds.width - collisionInsetUnits * 2;
  const height = bounds.height - collisionInsetUnits * 2;
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError('Dünya duvarı parçacık alanının tamamını tüketemez.');
  }
  return {
    x: bounds.x + collisionInsetUnits,
    y: bounds.y + collisionInsetUnits,
    width,
    height,
  };
}

export function validateWorldGeometry(
  bounds: Readonly<Rect>,
  collisionInsetUnits: number,
  spatialCellSizeUnits: number,
): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !(bounds.width > 0) ||
    !Number.isFinite(bounds.width) ||
    !(bounds.height > 0) ||
    !Number.isFinite(bounds.height)
  ) {
    throw new RangeError('Dünya sınırları sonlu ve pozitif olmalı.');
  }
  resolveParticleBounds(bounds, collisionInsetUnits);
  if (
    !(spatialCellSizeUnits > 0) ||
    !Number.isInteger(bounds.width / spatialCellSizeUnits) ||
    !Number.isInteger(bounds.height / spatialCellSizeUnits) ||
    bounds.width / spatialCellSizeUnits < 3 ||
    bounds.height / spatialCellSizeUnits < 3
  ) {
    throw new RangeError('Dünya boyutları spatial-hash hücresine tam bölünmeli.');
  }
}
