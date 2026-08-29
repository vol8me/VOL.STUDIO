import { describe, expect, it } from 'vitest';
import { releasePointerLatch, type LatchablePointer } from '@/runtime/input/pointerLatch';

/**
 * `Phaser.Input.Pointer.reset()` davranışının sadesi: konumu ve dünya
 * koordinatını da sıfırlar. Testin bütün anlamı bu yan etkinin masaüstünde
 * korunup korunmadığıdır.
 */
function fakePointer(over: Partial<LatchablePointer> = {}) {
  const pointer = {
    x: 640,
    y: 360,
    worldX: 800,
    worldY: 450,
    isDown: true,
    resetCount: 0,
    reset() {
      pointer.resetCount++;
      pointer.x = 0;
      pointer.y = 0;
      pointer.worldX = 0;
      pointer.worldY = 0;
      pointer.isDown = false;
    },
    ...over,
  };
  return pointer;
}

describe('releasePointerLatch', () => {
  it('masaüstünde basılı durumu bırakır ama nişan konumunu KORUR', () => {
    const pointer = fakePointer();

    releasePointerLatch(pointer, { preserveAim: true });

    expect(pointer.isDown).toBe(false);
    expect(pointer.resetCount).toBe(1);
    // Regresyon: nişan `worldX/worldY - oyuncu` olduğu için sıfırlanan konum
    // oyuncuyu dünyanın (0,0) köşesine nişanlatıyordu.
    expect(pointer.worldX).toBe(800);
    expect(pointer.worldY).toBe(450);
    expect(pointer.x).toBe(640);
    expect(pointer.y).toBe(360);
  });

  it('dokunmatikte tam sıfırlama uygular — kalkan parmak basılı kalmasın', () => {
    const pointer = fakePointer();

    releasePointerLatch(pointer, { preserveAim: false });

    expect(pointer.isDown).toBe(false);
    expect(pointer.worldX).toBe(0);
    expect(pointer.worldY).toBe(0);
    expect(pointer.x).toBe(0);
    expect(pointer.y).toBe(0);
  });

  it('sonlu olmayan konumu geri yazmaz — nişan NaN olmaz', () => {
    const pointer = fakePointer({ worldX: Number.NaN, worldY: 10 });

    releasePointerLatch(pointer, { preserveAim: true });

    expect(Number.isNaN(pointer.worldX)).toBe(false);
    expect(pointer.worldX).toBe(0);
    expect(pointer.worldY).toBe(0);
  });

  it('art arda çağrıda konumu bozmaz', () => {
    const pointer = fakePointer();

    releasePointerLatch(pointer, { preserveAim: true });
    releasePointerLatch(pointer, { preserveAim: true });

    expect(pointer.worldX).toBe(800);
    expect(pointer.resetCount).toBe(2);
  });
});
