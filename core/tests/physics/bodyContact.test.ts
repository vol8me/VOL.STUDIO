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

describe('resolveBodyContact içerme sözleşmesi', () => {
  it.each([0, 0.4])('farklı ölçü ve kütlede iç cismi tek çözümde ayırır: %s', (angle) => {
    const outer = body(0, 0, angle, 1000);
    const inner = body(0, 0, angle, 100);
    resolveBodyContact(
      outer,
      { ...shape, halfWidth: 10 },
      inner,
      { ...shape, halfLength: 1, halfWidth: 1 },
      createContact(),
    );
    expect(Math.hypot(inner.x - outer.x, inner.y - outer.y)).toBeCloseTo(11, 8);
    expect(Math.hypot(outer.x, outer.y)).toBeCloseTo(1, 8);
    expect(Math.hypot(inner.x, inner.y)).toBeCloseTo(10, 8);
  });
  it('geçersiz ikinci şekil hiçbir cismi veya çıktı tamponunu değiştirmez', () => {
    for (const patch of [
      { halfLength: 0 },
      { halfWidth: Infinity },
      { restitution: -0.1 },
      { restitution: 1.1 },
      { friction: -1 },
      { friction: NaN },
    ]) {
      const a = body(0, 0),
        b = body(19, 0);
      a.vx = 50;
      const before = [{ ...a }, { ...b }];
      const out = { ...createContact(), speed: 7 };
      expect(() => resolveBodyContact(a, shape, b, { ...shape, ...patch }, out)).toThrow(
        RangeError,
      );
      expect([{ ...a }, { ...b }]).toEqual(before);
      expect(out.speed).toBe(7);
    }
  });
});

describe('resolveBodyContact farklı dönüş', () => {
  it('45 derece dönen iç kareyi dış karenin yüzüne kadar ayırır', () => {
    const outer = body(0, 0),
      inner = body(0, 0, Math.PI / 4);
    resolveBodyContact(
      outer,
      { ...shape, halfWidth: 10 },
      inner,
      { ...shape, halfLength: 1, halfWidth: 1 },
      createContact(),
    );
    expect(Math.hypot(inner.x - outer.x, inner.y - outer.y)).toBeCloseTo(11.414213562373095, 8);
  });
  it('cisim sırası değişince simetrik çarpmanın sonucu aynı kalır', () => {
    const run = (reverse: boolean) => {
      const a = body(-9.5, 0),
        b = body(9.5, 0);
      a.vx = 30;
      b.vx = -30;
      if (reverse) resolveBodyContact(b, shape, a, shape, createContact());
      else resolveBodyContact(a, shape, b, shape, createContact());
      return [a.x, a.vx, a.angularVelocity, b.x, b.vx, b.angularVelocity];
    };
    expect(run(true)).toEqual(run(false));
  });
});

describe('resolveBodyContact atomik hata sınırı', () => {
  it('sonlu hızlar temas hesabında taşınca cisimler ve çıktı korunur', () => {
    const a = body(0, 0),
      b = body(19, 0);
    a.vx = 1e308;
    b.vx = -1e308;
    const before = [{ ...a }, { ...b }];
    const out = { speed: 7, x: 3, y: 4, normalX: 1, normalY: 0 };
    const beforeOut = { ...out };
    expect(() => resolveBodyContact(a, shape, b, shape, out)).toThrow(RangeError);
    expect([{ ...a }, { ...b }]).toEqual(before);
    expect(out).toEqual(beforeOut);
  });

  it.each(['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity'] as const)(
    'doğrudan bozulan public %s alanını değişiklikten önce reddeder',
    (field) => {
      const a = body(0, 0),
        b = body(19, 0);
      b[field] = NaN;
      const before = [{ ...a }, { ...b }];
      const out = { ...createContact(), speed: 7 };
      expect(() => resolveBodyContact(a, shape, b, shape, out)).toThrow(RangeError);
      expect([{ ...a }, { ...b }]).toEqual(before);
      expect(out.speed).toBe(7);
    },
  );
});

it('sonlu şeklin köşe hesabı taşınca teması sessizce kaçırmaz', () => {
  const a = body(0, 0, Math.PI / 4),
    b = body(1, 0, Math.PI / 4);
  const oversized = { ...shape, halfLength: 1.7e308, halfWidth: 1.7e308 };
  const before = [{ ...a }, { ...b }],
    out = { ...createContact(), speed: 7 };
  expect(() => resolveBodyContact(a, oversized, b, oversized, out)).toThrow(RangeError);
  expect([{ ...a }, { ...b }]).toEqual(before);
  expect(out.speed).toBe(7);
});
