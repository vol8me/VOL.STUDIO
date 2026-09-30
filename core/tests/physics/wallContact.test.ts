import { describe, expect, it } from 'vitest';
import { RigidBody } from '../../src/physics/RigidBody';
import {
  createContact,
  resolveWallContacts,
  type ContactShape,
} from '../../src/physics/wallContact';

const shape = (restitution = 0.5, friction = 0.4): ContactShape => ({
  halfLength: 10,
  halfWidth: 5,
  restitution,
  friction,
});

function body(x: number, y: number, angle = 0): RigidBody {
  const result = new RigidBody(100, RigidBody.boxInertia(100, 20, 10));
  result.x = x;
  result.y = y;
  result.angle = angle;
  return result;
}

describe('resolveWallContacts', () => {
  // 200 × 100 kutunun dört duvarı (iç normaller).
  const world = {
    walls: [
      { nx: 1, ny: 0, offset: 0 },
      { nx: -1, ny: 0, offset: -200 },
      { nx: 0, ny: 1, offset: 0 },
      { nx: 0, ny: -1, offset: -100 },
    ],
  };

  it('temas yoksa cisme dokunmaz', () => {
    const subject = body(100, 50);
    subject.vx = 30;
    const contact = resolveWallContacts(subject, world.walls, shape(), createContact());
    expect(contact.speed).toBe(0);
    expect(subject.vx).toBe(30);
  });

  it('içeri giren köşeyi dışarı iter ve dik çarpmada katsayı kadar seker', () => {
    const subject = body(195, 50);
    subject.vx = 40;
    const contact = resolveWallContacts(subject, world.walls, shape(0.5, 0), createContact());
    expect(subject.x + 10).toBeCloseTo(200);
    expect(subject.vx).toBeCloseTo(-20);
    expect(subject.angularVelocity).toBeCloseTo(0);
    expect(contact).toMatchObject({ speed: 40, normalX: -1, normalY: 0 });
  });

  it('kinetik enerji artmaz; açılı çarpma dönme üretir', () => {
    for (const restitution of [0, 0.35, 1]) {
      const subject = body(193, 50, 0.4);
      subject.vx = 60;
      subject.vy = 10;
      const energy = (b: RigidBody) =>
        0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.inertia * b.angularVelocity ** 2;
      const before = energy(subject);
      resolveWallContacts(subject, world.walls, shape(restitution, 0.4), createContact());
      expect(energy(subject)).toBeLessThanOrEqual(before * (1 + 1e-9));
      expect(Math.abs(subject.angularVelocity)).toBeGreaterThan(0);
    }
  });

  it('ayrılan köşeye itki uygulamaz, yalnız konumu düzeltir', () => {
    const subject = body(195, 50);
    subject.vx = -5;
    const contact = resolveWallContacts(subject, world.walls, shape(), createContact());
    expect(contact.speed).toBe(0);
    expect(subject.vx).toBe(-5);
    expect(subject.x + 10).toBeCloseTo(200);
  });

  it('köşede iki duvarı birlikte çözer, en serti bildirir', () => {
    const subject = body(8, 3);
    subject.vx = -10;
    subject.vy = -30;
    const contact = resolveWallContacts(subject, world.walls, shape(), createContact());
    expect(subject.x - 10).toBeGreaterThanOrEqual(-1e-9);
    expect(subject.y - 5).toBeGreaterThanOrEqual(-1e-9);
    expect(contact.normalY).toBe(1);
  });
});
