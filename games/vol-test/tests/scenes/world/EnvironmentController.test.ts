import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EFFECT_LEVELS } from '@/config/quality';
import { EnvironmentController } from '@/scenes/world/EnvironmentController';
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
});
