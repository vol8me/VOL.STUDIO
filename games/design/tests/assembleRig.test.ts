import { describe, expect, it } from 'vitest';
import { computePartLayout } from '@/assembleRig';
import type { RigPartAsset } from '@/types';

const RIG = { exportScale: 2, rootSizePx: { width: 200, height: 200 } };

function part(overrides: Partial<RigPartAsset> = {}): RigPartAsset {
  return {
    partId: 'top_cap',
    textureKey: 'test_unit__top_cap',
    textureUrl: '/fake/top_cap.png',
    logicalSizePx: { width: 16, height: 6.4 },
    positionPx: { x: 104, y: 32 },
    rotationDeg: 0,
    ...overrides,
  };
}

describe('computePartLayout', () => {
  it('pivotu rig merkezine göreli hesaplar', () => {
    const layout = computePartLayout(part(), RIG);

    expect(layout.pivotX).toBe(4);
    expect(layout.pivotY).toBe(-68);
  });

  it('rig merkezindeki parça için pivot (0,0) olur', () => {
    const layout = computePartLayout(part({ positionPx: { x: 100, y: 100 } }), RIG);

    expect(layout.pivotX).toBe(0);
    expect(layout.pivotY).toBe(0);
  });

  it("sprite'ı logical kutunun merkezine hizalar", () => {
    const layout = computePartLayout(part(), RIG);

    expect(layout.spriteOffsetX).toBe(8);
    expect(layout.spriteOffsetY).toBe(3.2);
  });

  it('sprite ölçeği 1/exportScale olur - görünmez padding kutuya sıkışmaz', () => {
    expect(computePartLayout(part(), RIG).spriteScale).toBe(0.5);
    expect(computePartLayout(part(), { ...RIG, exportScale: 4 }).spriteScale).toBe(0.25);
  });

  it("rotationDeg'i radyana çevirir", () => {
    expect(computePartLayout(part({ rotationDeg: 0 }), RIG).rotationRad).toBe(0);
    expect(computePartLayout(part({ rotationDeg: 90 }), RIG).rotationRad).toBeCloseTo(
      Math.PI / 2,
      10,
    );
    expect(computePartLayout(part({ rotationDeg: -45 }), RIG).rotationRad).toBeCloseTo(
      -Math.PI / 4,
      10,
    );
  });
});
