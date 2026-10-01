import { describe, expect, it } from 'vitest';
import { Turret } from '@/sim/tank/Turret';
import { command } from '../../support/sim';

const config = { turretTurnRate: 2 };

describe('Turret', () => {
  it('nişana sınırlı hızla döner', () => {
    const turret = new Turret(config);
    turret.update(command({ aimY: 1 }), 0.25);
    expect(turret.angle).toBeCloseTo(0.5);
  });

  it('nişan bırakılınca ve gövde dönerken dünya yönünü korur', () => {
    const turret = new Turret(config);
    turret.reset(1);
    for (let i = 0; i < 300; i++) turret.update(command(), 1 / 60);
    expect(turret.angle).toBe(1);
    turret.update(command({ aimY: 1 }), 1);
    turret.update(command(), 10);
    expect(turret.angle).toBeCloseTo(Math.PI / 2);
    turret.reset(-0.4);
    expect(turret.angle).toBe(-0.4);
  });
});
