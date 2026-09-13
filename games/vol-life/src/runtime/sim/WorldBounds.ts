import type { Rect } from '@volstudio/core/math/geometry';

export function resolveParticleBounds(
  bounds: Readonly<Rect>,
  boundaryThicknessUnits: number,
): Rect {
  if (!(boundaryThicknessUnits >= 0) || !Number.isFinite(boundaryThicknessUnits)) {
    throw new RangeError('Dünya duvar kalınlığı negatif olmayan sonlu bir sayı olmalı.');
  }
  const width = bounds.width - boundaryThicknessUnits * 2;
  const height = bounds.height - boundaryThicknessUnits * 2;
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError('Dünya duvarı parçacık alanının tamamını tüketemez.');
  }
  return {
    x: bounds.x + boundaryThicknessUnits,
    y: bounds.y + boundaryThicknessUnits,
    width,
    height,
  };
}
