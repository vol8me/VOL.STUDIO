import { describe, expect, it } from 'vitest';
import {
  MAX_STABLE_ID,
  NO_SLOT,
  ParticleStore,
  validateParticleSnapshot,
} from '@/runtime/sim/ParticleStore';

function filled(capacity = 4): ParticleStore {
  const store = new ParticleStore(capacity);
  for (let index = 0; index < capacity; index++)
    store.activateSlot(index, index * 2, 0.1, -0.1, index % 6);
  return store;
}

function rawBytes(array: Float32Array | Uint8Array | Uint32Array): Uint8Array {
  return new Uint8Array(array.buffer.slice(0));
}

describe('ParticleStore kapasite/aktif/stable-ID sözleşmesi', () => {
  it('boş depoyla başlar; spawn slotu doldurur, artan stable ID verir ve aktif sayısını artırır', () => {
    const store = new ParticleStore(3);
    expect(store.activeCount).toBe(0);
    expect(store.nextStableId).toBe(1);

    expect(store.activateSlot(1, 2, 0, 0, 4)).toBe(0);
    expect(store.activateSlot(3, 4, 0, 0, 5)).toBe(1);
    expect(store.activeCount).toBe(2);
    expect([...store.stableId.subarray(0, 2)]).toEqual([1, 2]);
    expect([...store.active]).toEqual([1, 1, 0]);
    expect(store.previousX[1]).toBe(3);
    expect(store.edgeDistance[1]).toBe(Number.POSITIVE_INFINITY);
  });

  it('kapasite doluyken spawn NO_SLOT döner ve sayaçları değiştirmez', () => {
    const store = filled(2);
    const nextId = store.nextStableId;
    expect(store.activateSlot(0, 0, 0, 0, 0)).toBe(NO_SLOT);
    expect(store.activeCount).toBe(2);
    expect(store.nextStableId).toBe(nextId);
  });

  it('deactivate diziyi kaydırmaz; slot yeniden kullanılırsa YENİ stable ID alır', () => {
    const store = filled(3);
    const survivorId = store.stableId[2];
    store.deactivateSlot(1);
    store.deactivateSlot(1);

    expect(store.activeCount).toBe(2);
    expect([...store.active]).toEqual([1, 0, 1]);
    expect(store.stableId[2]).toBe(survivorId);
    const reused = store.activateSlot(9, 9, 0, 0, 1);
    expect(reused).toBe(1);
    expect(store.stableId[1]).toBe(4);
    expect(store.nextStableId).toBe(5);
  });

  it('geçersiz slot, tür ve sonlu olmayan doğumu reddeder', () => {
    const store = new ParticleStore(2);
    expect(() => store.deactivateSlot(-1)).toThrow(RangeError);
    expect(() => store.deactivateSlot(2)).toThrow(RangeError);
    expect(() => store.deactivateSlot(0.5)).toThrow(RangeError);
    expect(() => store.activateSlot(0, 0, 0, 0, 256)).toThrow(RangeError);
    expect(() => store.activateSlot(Number.NaN, 0, 0, 0, 0)).toThrow(RangeError);
    expect(() => new ParticleStore(0)).toThrow(RangeError);
  });

  it('snapshot aktif maskeyi, ID’leri ve sayacı taşır; restore hepsini ve önceki konumu geri alır', () => {
    const store = filled(3);
    store.deactivateSlot(0);
    const snapshot = store.snapshot();
    const restored = new ParticleStore(3);
    restored.forceX.fill(9);
    restored.restore(snapshot);

    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.activeCount).toBe(2);
    expect(restored.nextStableId).toBe(4);
    expect([...restored.previousX]).toEqual([...snapshot.x]);
    expect([...restored.forceX]).toEqual([0, 0, 0]);
    expect(restored.edgeDistance.every((value) => value === Number.POSITIVE_INFINITY)).toBe(true);
    expect(snapshot.x).not.toBe(store.x);
  });

  it('pasifleşen slot kanonik boşa iner', () => {
    const store = filled(2);
    store.deactivateSlot(1);

    expect(store.x[1]).toBe(0);
    expect(store.y[1]).toBe(0);
    expect(store.previousX[1]).toBe(0);
    expect(store.previousY[1]).toBe(0);
    expect(store.vx[1]).toBe(0);
    expect(store.vy[1]).toBe(0);
    expect(store.forceX[1]).toBe(0);
    expect(store.forceY[1]).toBe(0);
    expect(store.type[1]).toBe(0);
    expect(store.stableId[1]).toBe(0);
    expect(store.edgeDistance[1]).toBe(Number.POSITIVE_INFINITY);
  });

  it('kanonik olmayan pasif slot ve sonlu olmayan aktif slot reddedilir', () => {
    const store = filled(2);
    store.deactivateSlot(1);
    const snapshot = store.snapshot();

    const dirtyPosition = { ...snapshot, x: snapshot.x.slice() };
    dirtyPosition.x[1] = 12;
    expect(() => validateParticleSnapshot(dirtyPosition, 2)).toThrow(/kanonik/);
    const dirtyId = { ...snapshot, stableId: snapshot.stableId.slice() };
    dirtyId.stableId[1] = 2;
    expect(() => validateParticleSnapshot(dirtyId, 2)).toThrow(/kanonik/);
    const dirtyType = { ...snapshot, type: snapshot.type.slice() };
    dirtyType.type[1] = 3;
    expect(() => validateParticleSnapshot(dirtyType, 2)).toThrow(/kanonik/);

    const activeNaN = { ...snapshot, vx: snapshot.vx.slice() };
    activeNaN.vx[0] = Number.POSITIVE_INFINITY;
    expect(() => validateParticleSnapshot(activeNaN, 2)).toThrow(RangeError);
  });

  /*
   * Kanonikliğin asıl bedeli budur: aynı mantıksal dünya, farklı bir geçmişten
   * geçmiş olsa bile AYNI baytları üretir. Aksi hâlde kayıt karşılaştırması ve
   * determinizm kanıtı slot geçmişine bağlı kalırdı.
   */
  it('farklı geçmişlerden aynı mantıksal duruma gelen iki depo aynı baytları üretir', () => {
    const left = new ParticleStore(3);
    left.activateSlot(10, 20, 0.5, -0.5, 1);
    left.activateSlot(30, 40, 0.1, 0.2, 2);
    left.activateSlot(50, 60, -0.3, 0.4, 3);
    left.deactivateSlot(1);

    const right = new ParticleStore(3);
    right.activateSlot(10, 20, 0.5, -0.5, 1);
    right.activateSlot(-99, 77, 1.5, 2.5, 5);
    right.activateSlot(50, 60, -0.3, 0.4, 3);
    right.deactivateSlot(1);

    const leftSnapshot = left.snapshot();
    const rightSnapshot = right.snapshot();
    for (const field of ['x', 'y', 'vx', 'vy', 'type', 'active', 'stableId'] as const) {
      expect(rawBytes(rightSnapshot[field]), field).toEqual(rawBytes(leftSnapshot[field]));
    }
    expect(rightSnapshot.nextStableId).toBe(leftSnapshot.nextStableId);
  });

  it('32 bitlik stable ID alanı tükenince sessizce sarmaz, hata verir', () => {
    const store = new ParticleStore(1);
    store.restore({ ...store.snapshot(), nextStableId: MAX_STABLE_ID });

    expect(store.activateSlot(1, 1, 0, 0, 0)).toBe(0);
    expect(store.stableId[0]).toBe(MAX_STABLE_ID);
    expect(store.nextStableId).toBe(MAX_STABLE_ID + 1);

    store.deactivateSlot(0);
    expect(() => store.activateSlot(2, 2, 0, 0, 0)).toThrow(/tükendi/);
  });

  it('uzunluk, bayrak, ID tekilliği ve sayaç ihlallerini restore etmeden reddeder', () => {
    const store = filled(3);
    const before = store.snapshot();
    const cases = [
      { ...before, x: before.x.slice(1) },
      { ...before, active: Uint8Array.from([1, 2, 1]) },
      { ...before, stableId: Uint32Array.from([1, 1, 3]) },
      { ...before, stableId: Uint32Array.from([0, 2, 3]) },
      { ...before, stableId: Uint32Array.from([1, 2, 99]) },
      { ...before, nextStableId: 0 },
      { ...before, nextStableId: 2.5 },
      { ...before, nextStableId: MAX_STABLE_ID + 2 },
    ];
    for (const invalid of cases) {
      expect(() => store.restore(invalid)).toThrow(RangeError);
      expect(store.snapshot()).toEqual(before);
    }
  });
});
