import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { VehicleTrail } from '@/view/effects/VehicleTrail';
import { fakeScene } from '../../support/fakeScene';

describe('VehicleTrail', () => {
  it('boş yayıcıyı çizmez, hızlanma sonrası yaşayan parçacıkları kesmez', () => {
    const scene = fakeScene();
    const trail = new VehicleTrail(scene as unknown as Phaser.Scene);
    const [exhaust, dust] = scene.created;
    trail.follow(0, 0, 0, 0, false, false);
    expect(exhaust.visible).toBe(false);
    expect(dust.visible).toBe(false);
    trail.follow(0, 0, 0, 100, true, false);
    expect(exhaust.visible).toBe(true);
    expect(dust.visible).toBe(true);
    exhaust.aliveCount = 1;
    dust.aliveCount = 2;
    trail.follow(0, 0, 0, 0, false, false);
    expect(exhaust.visible).toBe(true);
    expect(dust.visible).toBe(true);
    exhaust.aliveCount = dust.aliveCount = 0;
    trail.follow(0, 0, 0, 0, false, false);
    expect(exhaust.visible).toBe(false);
    expect(dust.visible).toBe(false);
  });
});
