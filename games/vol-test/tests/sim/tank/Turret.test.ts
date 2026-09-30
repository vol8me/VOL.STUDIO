import { describe, expect, it } from 'vitest';
import { Turret } from '@/sim/tank/Turret';
import { command } from '../../support/sim';

const config = { turretTurnRate: 2, turretRestDelay: 1 };

describe('Turret', () => {
  it('nişana sınırlı hızla döner', () => {
    const turret = new Turret(config);
    turret.update(command({ aimY: 1 }), 0, 0.25);
    expect(turret.angle).toBeCloseTo(0.5);
  });

  it('nişan yokken bekler, sonra gövdeye döner; sıfırlama beklemeyi temizler', () => {
    const turret = new Turret(config);
    turret.reset(1);
    turret.update(command(), 0, 0.5);
    expect(turret.angle).toBeCloseTo(0);
    turret.update(command({ aimY: 1 }), 0, 1);
    turret.update(command(), 0, 0.5);
    expect(turret.angle).toBeCloseTo(Math.PI / 2);
    turret.update(command(), 0, 0.6);
    expect(turret.angle).toBeLessThan(Math.PI / 2);
  });
});
