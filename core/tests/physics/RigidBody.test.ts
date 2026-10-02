import { describe, expect, it } from 'vitest';
import { RigidBody } from '../../src/physics/RigidBody';

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

describe('RigidBody sonlu giriş bariyeri', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1])('geçersiz yapılandırmayı reddeder: %s', (value) => {
    expect(() => new RigidBody(value, 1)).toThrow(RangeError);
    expect(() => new RigidBody(1, value)).toThrow(RangeError);
    expect(() => RigidBody.boxInertia(value, 3, 4)).toThrow(RangeError);
    expect(() => RigidBody.boxInertia(12, value, 4)).toThrow(RangeError);
    expect(() => RigidBody.boxInertia(12, 3, value)).toThrow(RangeError);
  });
  it('bozuk poz, kuvvet ve itki hiçbir alanı değiştirmez', () => {
    const body = new RigidBody(2, 4);
    body.reset(2, 3, 0.4);
    body.vx = 1;
    const before = { ...body };
    for (const v of [NaN, Infinity, -Infinity]) {
      for (const call of [
        () => body.reset(v, 3, 0),
        () => body.reset(2, v, 0),
        () => body.reset(2, 3, v),
        () => body.applyImpulse(v, 1),
        () => body.applyImpulse(1, v),
        () => body.applyImpulse(1, 1, v, 0),
        () => body.applyImpulse(1, 1, 0, v),
        () => body.integrate(v, 1, 1, 0.1),
        () => body.integrate(1, v, 1, 0.1),
        () => body.integrate(1, 1, v, 0.1),
        () => body.integrate(1, 1, 1, v),
      ]) {
        expect(call).toThrow(RangeError);
        expect({ ...body }).toEqual(before);
      }
    }
    expect(() => body.integrate(1, 1, 1, -1)).toThrow(RangeError);
    expect({ ...body }).toEqual(before);
    body.integrate(1, 1, 1, 0);
    expect({ ...body }).toEqual(before);
  });
});

describe('RigidBody aritmetik taşma bariyeri', () => {
  it('sonlu girdiler taşınca eski durumu korur', () => {
    const body = new RigidBody(1e-300, 1e-300);
    const before = { ...body };
    expect(() => body.applyImpulse(1e300, 1)).toThrow(RangeError);
    expect({ ...body }).toEqual(before);
    expect(() => body.integrate(1e300, 1, 1, 1)).toThrow(RangeError);
    expect({ ...body }).toEqual(before);
    expect(() => RigidBody.boxInertia(1e300, 1e300, 1)).toThrow(RangeError);
  });
});
