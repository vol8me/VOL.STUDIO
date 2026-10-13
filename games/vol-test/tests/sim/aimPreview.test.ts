import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/config/tank';
import type { SimEvent } from '@/sim/events';
import { muzzlePose } from '@/sim/muzzle';
import type { TankPose } from '@/sim/tank/Tank';
import { command, simulation, STEP_MS } from '../support/sim';

describe('Simulation.previewAim', () => {
  it('poz verilmezse güncel adımın atışını önizler: önizleme yolu gerçek mermiyle çakışır', () => {
    const sim = simulation();
    sim.player.tank.place(2048, 2048, 0);
    for (let step = 0; step < 30; step++) sim.step(command({ aimX: 1, aimY: 0.4 }), STEP_MS);
    const preview = sim.previewAim(sim.player, STEP_MS);
    const path = Array.from(preview.path.slice(0, preview.pathLength * 2));
    const events: SimEvent[] = [];
    sim.step(command({ aimX: 1, aimY: 0.4, fire: true }), STEP_MS);
    sim.drainEvents(events);
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toBeDefined();
    const shell = sim.projectiles.items[0];
    expect(path[0]).toBeCloseTo((fired as { x: number }).x, 2);
    expect(path[1]).toBeCloseTo((fired as { y: number }).y, 2);
    // Yolun ikinci noktası, mermiyi doğuran adımdan sonra mermi nerede olacaksa orasıdır.
    expect(path[2]).toBeCloseTo(shell.x, 2);
    expect(path[3]).toBeCloseTo(shell.y, 2);
  });

  it('verilen ara değerli pozdan türetilir: yol ekrandaki namlu ucundan, taret doğrultusunda başlar', () => {
    const sim = simulation();
    sim.player.tank.place(2048, 2048, 0.3);
    const shown: TankPose = { x: 2053, y: 2044, hull: 0.35, turret: 0.8, pitch: 2, roll: -2.5 };
    const preview = sim.previewAim(sim.player, STEP_MS, shown);
    const tip = muzzlePose(shown, WEAPON.muzzleOffset, { x: 0, y: 0, angle: 0 });
    expect(preview.path[0]).toBeCloseTo(tip.x, 2);
    expect(preview.path[1]).toBeCloseTo(tip.y, 2);
    const dx = preview.path[2] - preview.path[0];
    const dy = preview.path[3] - preview.path[1];
    expect(Math.atan2(dy, dx)).toBeCloseTo(shown.turret, 3);
  });
});
