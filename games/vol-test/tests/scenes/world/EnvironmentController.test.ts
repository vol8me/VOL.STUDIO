import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EFFECT_LEVELS } from '@/config/quality';
import { LAKE_SPECS } from '@/config/lakes';
import { WORLD } from '@/config/world';
import { EnvironmentController } from '@/scenes/world/EnvironmentController';
import { LakeField } from '@/sim/world/LakeField';
import { World } from '@/sim/world/World';
import { OUTCROP_SPECS } from '@/config/rocks';
import { fakeScene, lastCall } from '../../support/fakeScene';
import { simulation } from '../../support/sim';

describe('EnvironmentController', () => {
  it('tek model saatini sunar; render saati ilerletmez, kalite canlı değişir', () => {
    const scene = fakeScene();
    const controller = new EnvironmentController(
      scene as unknown as Phaser.Scene,
      4096,
      4096,
      7,
      EFFECT_LEVELS.high,
      'rain',
    );
    controller.model.step(1000);
    const frame = controller.model.frame;
    const rect = { x: 1700, y: 1700, width: 700, height: 700 };
    const sim = simulation();
    controller.render(sim.vehicles, 1, rect);
    expect(controller.model.frame).toBe(frame);
    expect(controller.counts.particles).toBeGreaterThan(0);
    const high = controller.counts.particles;
    controller.applyProfile(EFFECT_LEVELS.low);
    controller.render(sim.vehicles, 1, rect);
    expect(controller.counts.particles).toBeLessThan(high);
    expect(controller.climate).toMatchObject({ season: 'spring', kind: 'rain' });
    controller.destroy();
    expect(
      scene.created
        .filter((item) => item.kind === 'graphics')
        .every((item) => lastCall(item, 'destroy') !== undefined),
    ).toBe(true);
  });

  it('göl yokken batış kaynağı yoktur; göl varsa derinlik ve iz verir', () => {
    const make = (world?: World) =>
      new EnvironmentController(
        fakeScene() as unknown as Phaser.Scene,
        WORLD.width,
        WORLD.height,
        7,
        EFFECT_LEVELS.high,
        'clear',
        'summer',
        world,
      );
    expect(make().water).toBeNull();
    const lakes = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);
    const water = make(new World(WORLD.width, WORLD.height, WORLD.gridStep, LAKE_SPECS)).water;
    expect(water).not.toBeNull();
    const lake = lakes.lakes[0];
    expect(water?.depthAt(lake.x, lake.y)).toBeGreaterThan(0.9);
    expect(water?.depthAt(8, 8)).toBe(0);
    expect(() => water?.splash(lake.x, lake.y, 30)).not.toThrow();
  });

  it('kaya öbekleri ekrana değince çizilir; kayasız dünyada ve ekran dışında çizilmez', () => {
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep, [], OUTCROP_SPECS);
    const controller = new EnvironmentController(
      fakeScene() as unknown as Phaser.Scene,
      WORLD.width,
      WORLD.height,
      7,
      EFFECT_LEVELS.high,
      'clear',
      'summer',
      world,
    );
    const sim = simulation();
    const outcrop = world.rocks.outcrops[0];
    controller.render(sim.vehicles, 1, {
      x: outcrop.x - 300,
      y: outcrop.y - 300,
      width: 600,
      height: 600,
    });
    expect(controller.drawnRocks).toBeGreaterThan(0);
    controller.render(sim.vehicles, 1, { x: 0, y: 0, width: 10, height: 10 });
    expect(controller.drawnRocks).toBe(0);
    const bare = new EnvironmentController(
      fakeScene() as unknown as Phaser.Scene,
      4096,
      4096,
      7,
      EFFECT_LEVELS.high,
      'clear',
      'summer',
      new World(4096, 4096, 128),
    );
    bare.render(sim.vehicles, 1, { x: 0, y: 0, width: 4096, height: 4096 });
    expect(bare.drawnRocks).toBe(0);
    bare.destroy();
    controller.destroy();
  });
});
