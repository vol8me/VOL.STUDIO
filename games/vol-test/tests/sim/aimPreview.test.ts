import { describe, expect, it } from 'vitest';

import type { SimEvent } from '@/sim/events';
import { muzzlePose } from '@/sim/muzzle';
import type { ChassisPose } from '@/sim/chassis/ChassisState';
import { command, simulation, STEP_MS } from '../support/sim';
import { ARACHNID, STRIKER } from '@/config/vehicles';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

describe('Simulation.previewAim', () => {
  it('poz verilmezse güncel adımın atışını önizler: önizleme yolu gerçek mermiyle çakışır', () => {
    const sim = simulation();
    sim.player.chassis.place(2048, 2048, 0);
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
    sim.player.chassis.place(2048, 2048, 0.3);
    const shown: ChassisPose = { x: 2053, y: 2044, hull: 0.35, turret: 0.8, pitch: 2, roll: -2.5 };
    const preview = sim.previewAim(sim.player, STEP_MS, shown);
    const tip = muzzlePose(shown, STRIKER.armament, 0, { x: 0, y: 0, angle: 0 });
    expect(preview.path[0]).toBeCloseTo(tip.x, 2);
    expect(preview.path[1]).toBeCloseTo(tip.y, 2);
    const dx = preview.path[2] - preview.path[0];
    const dy = preview.path[3] - preview.path[1];
    expect(Math.atan2(dy, dx)).toBeCloseTo(shown.turret, 3);
  });

  it('iki silahlı araçta çizgi sıradaki yuvanın namlusundan çıkar ve atıştan sonra öbür yuvaya geçer', () => {
    const sim = new Simulation({ world: new World(4096, 4096, 128), vehicle: ARACHNID });
    sim.player.chassis.place(2048, 2048, 0);
    for (let step = 0; step < 30; step++) sim.step(command({ aimX: 1, aimY: 0 }), STEP_MS);
    const origin = { x: 0, y: 0, angle: 0 };
    const start = (): { x: number; y: number } => {
      const preview = sim.previewAim(sim.player, STEP_MS);
      return { x: preview.path[0], y: preview.path[1] };
    };
    const pose = sim.player.chassis.readPose({ x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 });
    const first = muzzlePose(pose, ARACHNID.armament, 0, { ...origin });
    const second = muzzlePose(pose, ARACHNID.armament, 1, { ...origin });
    expect(start().y).toBeCloseTo(first.y, 1);
    sim.step(command({ aimX: 1, aimY: 0, fire: true }), STEP_MS);
    expect(start().y).toBeCloseTo(second.y, 1);
    expect(second.y).not.toBeCloseTo(first.y, 1);
  });
});
