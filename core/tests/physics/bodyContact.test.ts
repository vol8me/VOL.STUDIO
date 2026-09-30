import { describe, expect, it } from 'vitest';
import { resolveBodyContact } from '../../src/physics/bodyContact';
import { RigidBody } from '../../src/physics/RigidBody';
import { createContact, type ContactShape } from '../../src/physics/wallContact';

const shape: ContactShape = { halfLength: 10, halfWidth: 5, restitution: 0.4, friction: 0.3 };

function body(x: number, y: number, angle = 0, mass = 100): RigidBody {
  const result = new RigidBody(mass, RigidBody.boxInertia(mass, 20, 10));
  result.x = x;
  result.y = y;
  result.angle = angle;
  return result;
}

const momentum = (bodies: RigidBody[]) => [
  bodies.reduce((sum, b) => sum + b.mass * b.vx, 0),
  bodies.reduce((sum, b) => sum + b.mass * b.vy, 0),
];
const energy = (bodies: RigidBody[]) =>
  bodies.reduce(
    (sum, b) =>
      sum + 0.5 * b.mass * (b.vx ** 2 + b.vy ** 2) + 0.5 * b.inertia * b.angularVelocity ** 2,
    0,
  );

describe('resolveBodyContact', () => {
  it('ayrık cisimlere dokunmaz', () => {
    const a = body(0, 0);
    const b = body(30, 0);
    b.vx = -10;
    expect(resolveBodyContact(a, shape, b, shape, createContact()).speed).toBe(0);
    expect(b.vx).toBe(-10);
  });

  it('kafa kafaya çarpma: momentum korunur, enerji artmaz, cisimler ayrılır', () => {
    const a = body(0, 0);
    const b = body(19, 0);
    a.vx = 50;
    b.vx = -30;
    const before = { momentum: momentum([a, b]), energy: energy([a, b]) };
    const contact = resolveBodyContact(a, shape, b, shape, createContact());
    expect(contact.speed).toBeCloseTo(80);
    expect(contact.normalX).toBeCloseTo(1);
    const after = momentum([a, b]);
    expect(after[0]).toBeCloseTo(before.momentum[0], 6);
    expect(after[1]).toBeCloseTo(before.momentum[1], 6);
    expect(energy([a, b])).toBeLessThanOrEqual(before.energy);
    expect(b.vx - a.vx).toBeGreaterThan(0);
    expect(b.x - a.x).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(Math.abs(a.angularVelocity)).toBeLessThan(1e-9);
  });

  it('ağır cisim hafif cisimden daha az sapar', () => {
    const heavy = body(0, 0, 0, 1000);
    const light = body(19, 0, 0, 100);
    heavy.vx = 40;
    resolveBodyContact(heavy, shape, light, shape, createContact());
    expect(Math.abs(40 - heavy.vx)).toBeLessThan(Math.abs(light.vx));
  });

  it('köşeden çarpma döndürür; momentum yine korunur', () => {
    const a = body(0, 0);
    const b = body(17, 8, Math.PI / 4);
    a.vx = 60;
    const before = momentum([a, b]);
    const contact = resolveBodyContact(a, shape, b, shape, createContact());
    expect(contact.speed).toBeGreaterThan(0);
    expect(Math.abs(a.angularVelocity) + Math.abs(b.angularVelocity)).toBeGreaterThan(0);
    const after = momentum([a, b]);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });
});
