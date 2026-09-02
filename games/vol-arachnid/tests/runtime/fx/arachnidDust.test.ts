import { describe, expect, it } from 'vitest';
import { fxConfig } from '@/config/fx';
import { ArachnidDust } from '@/runtime/fx/ArachnidDust';
import { createFakeScene } from '../../support/phaserFakes';

describe('ArachnidDust', () => {
  it('eşik altındaki temasta toz kaldırmaz, hız arttıkça çoğaltır', () => {
    const scene = createFakeScene();
    const dust = new ArachnidDust(scene as never);
    const emitter = scene.emitters[0];

    dust.puff(10, 20, fxConfig.dust.minSpeedPxPerSec - 1);
    expect(emitter.bursts).toHaveLength(0);

    dust.puff(10, 20, fxConfig.dust.minSpeedPxPerSec);
    dust.puff(30, 40, fxConfig.dust.fullSpeedPxPerSec);

    expect(emitter.bursts[0]).toEqual({ x: 10, y: 20, count: fxConfig.dust.countMin });
    expect(emitter.bursts[1]).toEqual({ x: 30, y: 40, count: fxConfig.dust.countMax });
  });

  it('geçersiz konumu yok sayar ve destroy sonrası sessizleşir', () => {
    const scene = createFakeScene();
    const dust = new ArachnidDust(scene as never);
    const emitter = scene.emitters[0];

    dust.puff(Number.NaN, 0, 999);
    expect(emitter.bursts).toHaveLength(0);

    dust.destroy();
    dust.destroy();
    dust.puff(0, 0, 999);

    expect(emitter.destroyed).toBe(true);
    expect(emitter.bursts).toHaveLength(0);
  });

  it('clear havada asılı tozu tüketir, destroy sonrası sessizdir', () => {
    const scene = createFakeScene();
    const dust = new ArachnidDust(scene as never);
    const emitter = scene.emitters[0];

    dust.clear();
    expect(emitter.killed).toBe(1);

    dust.destroy();
    dust.clear();
    expect(emitter.killed).toBe(1);
  });

  it('toz dokusunu bir KEZ üretir', () => {
    const scene = createFakeScene();
    new ArachnidDust(scene as never);
    const generated = scene.graphics.filter((item) =>
      item.calls.some((call) => call.op === 'generateTexture'),
    );
    expect(generated).toHaveLength(1);
    expect(generated[0].destroyed).toBe(true);

    new ArachnidDust(scene as never);
    expect(
      scene.graphics.filter((item) => item.calls.some((call) => call.op === 'generateTexture')),
    ).toHaveLength(1);
  });
});
