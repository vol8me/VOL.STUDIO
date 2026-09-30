import { describe, expect, it } from 'vitest';
import { RigidBody } from '@/sim/physics/RigidBody';

describe('RigidBody', () => {
  it('geçersiz kütle ve eylemsizliği reddeder', () => {
    expect(() => new RigidBody(0, 1)).toThrow(RangeError);
    expect(() => new RigidBody(1, -1)).toThrow(RangeError);
  });

  it('levha eylemsizliği m(a²+b²)/12', () => {
    expect(RigidBody.boxInertia(12, 3, 4)).toBe(25);
  });

  it('kuvvet ve tork yarı örtük Euler ile ilerletir', () => {
    const body = new RigidBody(2, 4);
    body.integrate(4, 0, 8, 0.5);
    expect(body.vx).toBe(1);
    expect(body.x).toBe(0.5);
    expect(body.angularVelocity).toBe(1);
    expect(body.angle).toBe(0.5);
  });

  it('gövde eksenli hızları doğru ayrıştırır', () => {
    const body = new RigidBody(1, 1);
    body.angle = Math.PI / 2;
    body.vx = 3;
    body.vy = 4;
    expect(body.forwardSpeed).toBeCloseTo(4);
    expect(body.lateralSpeed).toBeCloseTo(-3);
    expect(body.speed).toBe(5);
  });

  it('merkez dışı itki dönme üretir; momentum korunumu itkiyle tutarlı', () => {
    const body = new RigidBody(10, 20);
    body.applyImpulse(0, 10, body.x + 2, body.y);
    expect(body.vy).toBe(1);
    expect(body.angularVelocity).toBe(1);
    body.reset(5, 6, Math.PI * 3);
    expect(body.vx).toBe(0);
    expect(body.angularVelocity).toBe(0);
    expect(body.angle).toBeCloseTo(Math.PI);
  });
});
