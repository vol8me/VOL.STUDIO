import type { RigPartAsset, Size } from './types';

const DEG_TO_RAD = Math.PI / 180;

export interface PartLayout {
  pivotX: number;
  pivotY: number;
  rotationRad: number;
  spriteOffsetX: number;
  spriteOffsetY: number;
  spriteScale: number;
}

export function computePartLayout(
  part: RigPartAsset,
  rig: { exportScale: number; rootSizePx: Size },
  parent?: RigPartAsset,
): PartLayout {
  const sprite = {
    spriteOffsetX: part.logicalSizePx.width / 2,
    spriteOffsetY: part.logicalSizePx.height / 2,
    spriteScale: 1 / rig.exportScale,
  };

  if (!parent) {
    return {
      pivotX: part.positionPx.x - rig.rootSizePx.width / 2,
      pivotY: part.positionPx.y - rig.rootSizePx.height / 2,
      rotationRad: part.rotationDeg * DEG_TO_RAD,
      ...sprite,
    };
  }

  const dx = part.positionPx.x - parent.positionPx.x;
  const dy = part.positionPx.y - parent.positionPx.y;
  const inverse = -parent.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(inverse);
  const sin = Math.sin(inverse);

  return {
    pivotX: dx * cos - dy * sin,
    pivotY: dx * sin + dy * cos,
    rotationRad: (part.rotationDeg - parent.rotationDeg) * DEG_TO_RAD,
    ...sprite,
  };
}
