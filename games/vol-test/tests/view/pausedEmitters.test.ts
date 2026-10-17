import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS } from '@/config/spiders';
import { ARACHNID, JUGGERNAUT, MANTA, RHINO } from '@/config/vehicles';
import { HoverView } from '@/view/HoverView';
import { LeaperView } from '@/view/LeaperView';
import { MechView } from '@/view/MechView';
import { SpiderView } from '@/view/SpiderView';
import type { TankFrame } from '@/view/VehicleView';
import { fakeScene } from '../support/fakeScene';

const frame: TankFrame = {
  x: 100,
  y: 200,
  hull: 0.5,
  turret: 1.2,
  pitch: 0,
  roll: 0,
  treadLeft: 0,
  treadRight: 0,
  speed: 0,
  vx: 0,
  vy: 0,
  angularVelocity: 0,
  boosting: false,
};

interface Case {
  readonly name: string;
  readonly make: (
    scene: Phaser.Scene,
    lighting: never,
  ) => { update(f: TankFrame, ms: number): void };
}

const CASES: readonly Case[] = [
  {
    name: 'örümcek',
    make: (scene, lighting) => new SpiderView(scene, ARACHNID, SPIDER_LOOKS[ARACHNID.id], lighting),
  },
  { name: 'süzülen', make: (scene, lighting) => new HoverView(scene, MANTA, lighting) },
  {
    name: 'sıçrayıcı',
    make: (scene, lighting) => new LeaperView(scene, RHINO, lighting, () => undefined),
  },
  {
    name: 'mech',
    make: (scene, lighting) => new MechView(scene, JUGGERNAUT, lighting, () => undefined),
  },
];

describe('araç görünümlerinin parçacıkları', () => {
  it.each(CASES)(
    '$name: duraklatmada (süre 0) emisyon ve ömür durur, süre gelince yeniden akar',
    ({ make }) => {
      const scene = fakeScene();
      const lighting = scene.add.container(0, 0);
      const view = make(scene as unknown as Phaser.Scene, lighting as never);
      const emitters = scene.created.filter((object) => object.kind === 'particles');
      expect(emitters.length).toBeGreaterThan(0);
      view.update(frame, 16.7);
      expect(emitters.every((emitter) => emitter.timeScale === 1)).toBe(true);
      view.update(frame, 0);
      expect(emitters.every((emitter) => emitter.timeScale === 0)).toBe(true);
      view.update(frame, 16.7);
      expect(emitters.every((emitter) => emitter.timeScale === 1)).toBe(true);
    },
  );
});
