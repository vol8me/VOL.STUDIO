import { describe, expect, it } from 'vitest';
import { NO_SLOT, ParticleStore, validateParticleSnapshot } from '@/runtime/sim/ParticleStore';

function filled(capacity = 4): ParticleStore {
  const store = new ParticleStore(capacity);
  for (let index = 0; index < capacity; index++)
    store.spawn(index, index * 2, 0.1, -0.1, index % 6);
  return store;
}

describe('ParticleStore kapasite/aktif/stable-ID sözleşmesi', () => {
  it('boş depoyla başlar; spawn slotu doldurur, artan stable ID verir ve aktif sayısını artırır', () => {
    const store = new ParticleStore(3);
    expect(store.activeCount).toBe(0);
    expect(store.nextStableId).toBe(1);

    expect(store.spawn(1, 2, 0, 0, 4)).toBe(0);
    expect(store.spawn(3, 4, 0, 0, 5)).toBe(1);
    expect(store.activeCount).toBe(2);
    expect([...store.stableId.subarray(0, 2)]).toEqual([1, 2]);
    expect([...store.active]).toEqual([1, 1, 0]);
    expect(store.previousX[1]).toBe(3);
    expect(store.edgeDistance[1]).toBe(Number.POSITIVE_INFINITY);
  });

  it('kapasite doluyken spawn NO_SLOT döner ve sayaçları değiştirmez', () => {
    const store = filled(2);
    const nextId = store.nextStableId;
    expect(store.spawn(0, 0, 0, 0, 0)).toBe(NO_SLOT);
    expect(store.activeCount).toBe(2);
    expect(store.nextStableId).toBe(nextId);
  });

  it('deactivate diziyi kaydırmaz; slot yeniden kullanılırsa YENİ stable ID alır', () => {
    const store = filled(3);
    const survivorId = store.stableId[2];
    store.deactivate(1);
    store.deactivate(1);

    expect(store.activeCount).toBe(2);
    expect([...store.active]).toEqual([1, 0, 1]);
    expect(store.stableId[2]).toBe(survivorId);
    const reused = store.spawn(9, 9, 0, 0, 1);
    expect(reused).toBe(1);
    expect(store.stableId[1]).toBe(4);
    expect(store.nextStableId).toBe(5);
  });

  it('geçersiz slot, tür ve sonlu olmayan doğumu reddeder', () => {
    const store = new ParticleStore(2);
    expect(() => store.deactivate(-1)).toThrow(RangeError);
    expect(() => store.deactivate(2)).toThrow(RangeError);
    expect(() => store.deactivate(0.5)).toThrow(RangeError);
    expect(() => store.spawn(0, 0, 0, 0, 256)).toThrow(RangeError);
    expect(() => store.spawn(Number.NaN, 0, 0, 0, 0)).toThrow(RangeError);
    expect(() => new ParticleStore(0)).toThrow(RangeError);
  });

  it('snapshot aktif maskeyi, ID’leri ve sayacı taşır; restore hepsini ve önceki konumu geri alır', () => {
    const store = filled(3);
    store.deactivate(0);
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

  it('pasif slotun sonlu olmayan içeriği kabul edilir; aktif slotun içeriği değil', () => {
    const snapshot = filled(2).snapshot();
    const inactiveNaN = { ...snapshot, x: snapshot.x.slice(), active: Uint8Array.from([1, 0]) };
    inactiveNaN.x[1] = Number.NaN;
    expect(() => validateParticleSnapshot(inactiveNaN, 2)).not.toThrow();
    const activeNaN = { ...snapshot, vx: snapshot.vx.slice() };
    activeNaN.vx[0] = Number.POSITIVE_INFINITY;
    expect(() => validateParticleSnapshot(activeNaN, 2)).toThrow(RangeError);
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
    ];
    for (const invalid of cases) {
      expect(() => store.restore(invalid)).toThrow(RangeError);
      expect(store.snapshot()).toEqual(before);
    }
  });
});
