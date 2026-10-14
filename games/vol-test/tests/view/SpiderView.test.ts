import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART, SPIDER_LOOKS } from '@/config/spiders';
import { ARACHNID, WIDOW, type WalkerSpec } from '@/config/vehicles';
import { muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { SpiderView } from '@/view/SpiderView';
import type { TankFrame } from '@/view/VehicleView';
import { fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

const frame = (overrides: Partial<TankFrame> = {}): TankFrame => ({
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
  ...overrides,
});

function build(spec: WalkerSpec) {
  const scene = fakeScene();
  const lighting = scene.add.container(0, 0);
  const view = new SpiderView(
    scene as unknown as Phaser.Scene,
    spec,
    SPIDER_LOOKS[spec.id],
    lighting as never,
  );
  const containers = scene.created.filter((object) => object.kind === 'container');
  const root = containers.at(-1) as FakeObject;
  const art = (root.list as FakeObject[])[0];
  const shadowRoot = containers.find((container) =>
    (container.list as FakeObject[]).some((child) => child.kind === 'container' && child !== art),
  ) as FakeObject;
  return { scene, lighting, view, root, art, shadowRoot };
}

describe.each([ARACHNID, WIDOW].map((spec) => [spec.id, spec] as const))(
  'SpiderView (%s)',
  (_id, spec) => {
    const look = SPIDER_LOOKS[spec.id];

    it('bacaklar gövdenin ALTINDA kalır: çizim sırası bacaklar, karın, göğüs, toplar', () => {
      const { art, root } = build(spec);
      const [legLayer, abdomen, thorax] = art.list as FakeObject[];
      expect(legLayer.kind).toBe('container');
      expect(abdomen.args[3]).toBe(`${spec.id}/abdomen`);
      expect(thorax.args[3]).toBe(`${spec.id}/thorax`);
      const children = root.list as FakeObject[];
      expect(children[0]).toBe(art);
      // Toplar gövdenin ÜSTÜNDEDİR: sıra art'tan sonradır.
      expect(children).toHaveLength(1 + spec.armament.mounts.length);
      // Bacak katmanı yalnız bacak parçalarını taşır; gövde parçası içinde yoktur.
      const legParts = (lastCall(legLayer, 'add') ?? []).flat() as FakeObject[];
      expect(legParts.length).toBeGreaterThan(0);
      for (const part of legParts) {
        const frameName = String(part.args[3]);
        expect(frameName).toMatch(new RegExp(`^${spec.id}/(femur|tibia|tarsus|joint)$`));
      }
    });

    it('zemin gölgeleri gövdenin altında çizilir: gölge katmanı gövde katmanından düşüktür', () => {
      const { root, shadowRoot } = build(spec);
      expect(shadowRoot.depth).toBeLessThan(root.depth as number);
      expect(root.depth).toBe(SPIDER_ART.depth);
    });

    it('her top kendi yuvasında: yuva açısı ve ağız parlaması ortak namlu geometrisiyle çakışır', () => {
      const { view, lighting, root } = build(spec);
      view.fire(0);
      view.update(frame({ hull: 0.9, turret: 0.3, pitch: 1.5, roll: -1 }), 0);
      const flashList = lighting.calls
        .filter(([name]) => name === 'add')
        .map(([, args]) => args[0] as FakeObject);
      expect(flashList).toHaveLength(spec.armament.mounts.length);
      const tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
      muzzlePose(
        frame({ hull: 0.9, turret: 0.3, pitch: 1.5, roll: -1 }),
        spec.armament,
        0,
        tip,
        spec.armament.mounts[0].reach,
      );
      expect(flashList[0].x).toBeCloseTo(tip.x);
      expect(flashList[0].y).toBeCloseTo(tip.y);
      expect(flashList[0].rotation).toBeCloseTo(tip.angle);
      // Sönmeyen ikinci yuva ateşlenmedi: parlaması görünmez kalır.
      expect(flashList[1].visible).toBe(false);
      expect(root.x).toBe(100);
    });

    it('yürürken ve dönerken değerler sonlu kalır; kapanış her şeyi yok eder', () => {
      const { view, root, shadowRoot } = build(spec);
      for (let i = 0; i < 240; i++) {
        view.update(
          frame({
            x: 100 + i * 2,
            hull: i * 0.02,
            vx: 120,
            vy: 10,
            speed: 120,
            angularVelocity: 1.2,
            boosting: i > 100 && i < 140,
          }),
          1000 / 60,
        );
      }
      expect(Number.isFinite(root.rotation as number)).toBe(true);
      view.impact?.(1);
      view.destroy();
      expect(lastCall(root, 'destroy')).toBeDefined();
      expect(lastCall(shadowRoot, 'destroy')).toBeDefined();
    });

    it('ışınlanma (yeniden doğuş) ayakları adımsız yeni yere koyar', () => {
      const { view, root } = build(spec);
      view.update(frame({ x: 0, y: 0, vx: 100, speed: 100 }), 1000 / 60);
      view.update(frame({ x: 2000, y: 2000 }), 1000 / 60);
      expect(root.x).toBe(2000);
      expect(look.hips.length).toBe(4);
    });
  },
);
