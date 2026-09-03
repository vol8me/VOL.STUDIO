import { describe, expect, it } from 'vitest';
import { computePartLayout } from '../../src/rig/assembleRig';
import type { RigPartAsset } from '../../src/rig/types';

const RIG = { exportScale: 2, rootSizePx: { width: 200, height: 200 } };

function part(overrides: Partial<RigPartAsset> = {}): RigPartAsset {
  return {
    partId: 'top_cap',
    parentPartId: null,
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

describe('eklemlenme (articulation)', () => {
  const rig = { exportScale: 2, rootSizePx: { width: 200, height: 100 } };

  function asset(over: Partial<RigPartAsset> & { partId: string }): RigPartAsset {
    return {
      parentPartId: null,
      textureKey: `t__${over.partId}`,
      textureUrl: `/${over.partId}.png`,
      logicalSizePx: { width: 20, height: 10 },
      positionPx: { x: 0, y: 0 },
      rotationDeg: 0,
      ...over,
    };
  }

  it('ebeveynsiz parça rig MERKEZİNE göre konumlanır (eski davranış korunur)', () => {
    const part = asset({ partId: 'govde', positionPx: { x: 120, y: 70 } });
    const layout = computePartLayout(part, rig);

    expect(layout.pivotX).toBe(120 - 100);
    expect(layout.pivotY).toBe(70 - 50);
  });

  it('dönmemiş ebeveynin altındaki parça FARK kadar ötelenir', () => {
    const parent = asset({ partId: 'kol', positionPx: { x: 120, y: 70 } });
    const child = asset({ partId: 'onkol', parentPartId: 'kol', positionPx: { x: 150, y: 90 } });

    const layout = computePartLayout(child, rig, parent);

    // Ebeveyn container'ı zaten (120,70)'te; çocuk yalnızca farkı taşır.
    expect(layout.pivotX).toBeCloseTo(30, 10);
    expect(layout.pivotY).toBeCloseTo(20, 10);
  });

  it('DÖNÜK ebeveynin altındaki parça, dönüşü telafi eden yerel uzaya çevrilir', () => {
    // Kritik durum: metadata rig KÖKÜ uzayında yazılır, ama parça dönük bir
    // container'a girer. Telafi yapılmazsa parça yazarın çizdiği yerden kayar.
    const parent = asset({ partId: 'kol', positionPx: { x: 100, y: 50 }, rotationDeg: 90 });
    const child = asset({
      partId: 'onkol',
      parentPartId: 'kol',
      positionPx: { x: 140, y: 50 },
      rotationDeg: 90,
    });

    const layout = computePartLayout(child, rig, parent);

    // Rig uzayındaki fark (+40, 0). Ebeveyn +90° dönük olduğu için yerel uzayda
    // bu vektör -90° döndürülür: (+40,0) → (0,-40). Ebeveyn container'ı yeniden
    // +90° döndürünce parça tekrar (+40,0)'a oturur.
    expect(layout.pivotX).toBeCloseTo(0, 10);
    expect(layout.pivotY).toBeCloseTo(-40, 10);
  });

  it('yerel dönüş, ebeveynle arasındaki FARK kadardır (dönüş iki kez uygulanmaz)', () => {
    const parent = asset({ partId: 'kol', rotationDeg: 30 });
    const child = asset({ partId: 'onkol', parentPartId: 'kol', rotationDeg: 50 });

    const layout = computePartLayout(child, rig, parent);

    // 50° mutlak = 30° miras + 20° yerel.
    expect(layout.rotationRad).toBeCloseTo((20 * Math.PI) / 180, 10);
  });

  it('sprite ofseti ve ölçeği eklemden etkilenmez', () => {
    const parent = asset({ partId: 'kol', rotationDeg: 45 });
    const child = asset({ partId: 'onkol', parentPartId: 'kol' });

    const layout = computePartLayout(child, rig, parent);

    expect(layout.spriteOffsetX).toBe(10);
    expect(layout.spriteOffsetY).toBe(5);
    expect(layout.spriteScale).toBe(0.5);
  });
});
