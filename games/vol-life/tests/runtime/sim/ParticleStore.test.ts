import { describe, expect, it } from 'vitest';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

describe('ParticleStore', () => {
  it('kimliği indeks olan sabit SoA TypedArray yüzeyi kurar', () => {
    const particles = new ParticleStore(3);

    expect(particles.count).toBe(3);
    expect(particles.x).toBeInstanceOf(Float32Array);
    expect(particles.y).toBeInstanceOf(Float32Array);
    expect(particles.vx).toBeInstanceOf(Float32Array);
    expect(particles.vy).toBeInstanceOf(Float32Array);
    expect(particles.forceX).toBeInstanceOf(Float32Array);
    expect(particles.forceY).toBeInstanceOf(Float32Array);
    expect(particles.type).toBeInstanceOf(Uint8Array);
  });

  it('snapshot tüm kalıcı dizileri kopyalar ve restore kimlikleri değiştirmez', () => {
    const particles = new ParticleStore(2);
    particles.x.set([12, 34]);
    particles.y.set([56, 78]);
    particles.vx.set([1, 2]);
    particles.vy.set([3, 4]);
    particles.type.set([1, 5]);
    const snapshot = particles.snapshot();
    particles.x.fill(999);
    particles.type.fill(0);

    particles.restore(snapshot);

    expect([...particles.x]).toEqual([12, 34]);
    expect([...particles.y]).toEqual([56, 78]);
    expect([...particles.vx]).toEqual([1, 2]);
    expect([...particles.vy]).toEqual([3, 4]);
    expect([...particles.type]).toEqual([1, 5]);
  });

  it('yanlış uzunluktaki snapshotı reddeder', () => {
    const particles = new ParticleStore(2);
    const snapshot = { ...particles.snapshot(), x: new Float32Array(1) };

    expect(() => particles.restore(snapshot)).toThrow(RangeError);
  });
});
