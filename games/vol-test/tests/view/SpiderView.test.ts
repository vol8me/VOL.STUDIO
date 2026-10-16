import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_ART, SPIDER_LOOKS } from '@/config/spiders';
import { ARACHNID, GOLIATH, WIDOW, skillOf, type WalkerSpec } from '@/config/vehicles';
import { muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { SpiderView } from '@/view/SpiderView';
import { TEXTURE } from '@/view/textures';
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

    it('bacaklar gövdenin ALTINDA kalır: çizim sırası bacaklar, duyargalar, karın, göğüs, toplar', () => {
      const { art, root } = build(spec);
      // Duyargalar (iki gövde, iki uç) göğsün altından çıkar: bacak katmanı ile karın arasındadır.
      const [legLayer, , , , , abdomen, thorax] = art.list as FakeObject[];
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

    it('göğsün çekirdeği göğüsten sonra, ön duyargalar göğsün ALTINDA çizilir', () => {
      const { art, view } = build(spec);
      const children = art.list as FakeObject[];
      const core = children.find((child) => child.args[2] === TEXTURE.core)!;
      const stalks = children.filter((child) => child.args[2] === TEXTURE.antenna);
      const thorax = children.find((child) => child.args[3] === `${spec.id}/thorax`)!;
      expect(stalks).toHaveLength(2);
      expect(children.indexOf(core)).toBeGreaterThan(children.indexOf(thorax));
      expect(children.indexOf(stalks[0])).toBeLessThan(children.indexOf(thorax));
      view.update(frame({ boosting: true, speed: spec.walker.maxSpeed }), 16);
      // Çekirdek göğüs lensindedir; duyargalar önde (gövde +x) ve iki yanda durur.
      expect(core.x as number).toBeGreaterThan(look.body.thoraxX);
      expect(stalks[1].x as number).toBeGreaterThan(core.x as number);
      expect(stalks[0].y as number).toBeLessThan(0);
      expect(stalks[1].y as number).toBeGreaterThan(0);
    });

    it('kayaya tırmanırken kalça kalkar ve gövde geriye yaslanır; yumuşak girer, çıkınca düzelir', () => {
      const flat = build(spec);
      const climbing = build(spec);
      const thorax = (b: ReturnType<typeof build>) => (b.art.list as FakeObject[])[6];
      for (let step = 0; step < 30; step++) {
        flat.view.update(frame({ vx: 80, speed: 80 }), 16);
        climbing.view.update(frame({ vx: 80, speed: 80, climb: 1 }), 16);
      }
      expect(thorax(climbing).scale as number).toBeGreaterThan(thorax(flat).scale as number);
      expect(thorax(climbing).x as number).toBeLessThan(thorax(flat).x as number);

      // İlk karede sıçramaz: geçiş birkaç karede oturur.
      const first = build(spec);
      first.view.update(frame({ vx: 80, speed: 80 }), 16);
      const rest = thorax(first).scale as number;
      first.view.update(frame({ vx: 80, speed: 80, climb: 1 }), 16);
      const early = thorax(first).scale as number;
      for (let step = 0; step < 30; step++)
        first.view.update(frame({ vx: 80, speed: 80, climb: 1 }), 16);
      expect(early).toBeGreaterThanOrEqual(rest);
      expect(thorax(first).scale as number).toBeGreaterThan(early);
      for (let step = 0; step < 60; step++)
        first.view.update(frame({ vx: 80, speed: 80, climb: 0 }), 16);
      expect(thorax(first).scale as number).toBeCloseTo(rest, 2);
    });

    it('tırmanış yayı çıkışta hafifçe aşar ve oturur (kalça tepe yapıp geri gelir)', () => {
      const rig = build(spec);
      const thorax = (rig.art.list as FakeObject[])[6];
      let peak = 0;
      for (let step = 0; step < 120; step++) {
        rig.view.update(frame({ vx: 80, speed: 80, climb: 1 }), 16);
        peak = Math.max(peak, thorax.scale as number);
      }
      expect(peak).toBeGreaterThan(thorax.scale as number);
    });

    it('çekirdek atılımda büyür; duyargalar dönüşte geride sürüklenir', () => {
      const calm = build(spec);
      const boosted = build(spec);
      calm.view.update(frame(), 16);
      boosted.view.update(frame({ boosting: true, speed: spec.walker.maxSpeed }), 16);
      const core = (b: ReturnType<typeof build>) =>
        (b.art.list as FakeObject[]).find((child) => child.args[2] === TEXTURE.core)!;
      expect(core(boosted).scale as number).toBeGreaterThan(core(calm).scale as number);

      const turning = build(spec);
      const stalk = () =>
        (turning.art.list as FakeObject[]).filter((child) => child.args[2] === TEXTURE.antenna)[1];
      turning.view.update(frame(), 16);
      const rest = stalk().rotation as number;
      for (let step = 0; step < 20; step++) turning.view.update(frame({ angularVelocity: 3 }), 16);
      expect(stalk().rotation as number).not.toBeCloseTo(rest, 2);
    });

    it('sıçrama: uçuşta gövde yükselip büyür ve zemin gölgesi soluklaşır; inişte her şey yere döner', () => {
      const { view, art, shadowRoot } = build(spec);
      const thorax = (art.list as FakeObject[])[6];
      for (let i = 0; i < 40; i++) view.update(frame({ vx: 150, speed: 150 }), 16);
      const grounded = thorax.scale as number;
      expect(shadowRoot.alpha).toBe(1);
      let peak = grounded;
      let faintest = 1;
      const flight = Math.floor(((spec.walker.boostCapacity / spec.walker.boostDrain) * 1000) / 16);
      for (let i = 0; i < flight; i++) {
        view.update(frame({ x: 100 + i * 6, vx: 345, speed: 345, boosting: true }), 16);
        peak = Math.max(peak, thorax.scale as number);
        faintest = Math.min(faintest, shadowRoot.alpha as number);
      }
      expect(peak).toBeGreaterThan(grounded * 1.15);
      expect(faintest).toBeLessThan(1 - look.leap!.shadowFade * 0.5);
      for (let i = 0; i < 90; i++) view.update(frame({ x: 400 + i, vx: 150, speed: 150 }), 16);
      expect(shadowRoot.alpha).toBe(1);
      expect(thorax.scale as number).toBeCloseTo(grounded, 1);
    });

    it('kalkışta ve inişte ayakların altından toz çıkar; uçuşta yürüyüş tozu çıkmaz', () => {
      const { scene, view } = build(spec);
      const dust = scene.created.find((object) => object.kind === 'particles') as FakeObject;
      const emitted = (): number => dust.calls.filter(([name]) => name === 'emitParticleAt').length;
      for (let i = 0; i < 40; i++) view.update(frame({ vx: 150, speed: 150 }), 16);
      const walking = emitted();
      view.update(frame({ x: 110, vx: 345, speed: 345, boosting: true }), 16);
      const launched = emitted();
      expect(launched - walking).toBeGreaterThanOrEqual(look.hips.length * 2);
      for (let i = 0; i < 20; i++)
        view.update(frame({ x: 120 + i * 6, vx: 345, speed: 345, boosting: true }), 16);
      expect(emitted()).toBe(launched);
      view.update(frame({ x: 300, vx: 150, speed: 150 }), 16);
      expect(emitted() - launched).toBeGreaterThan(look.hips.length * 2);
    });

    it('dash artık yoktur: sıçramayan hızlı yürüyüş gövdeyi büyütmez, hayalet kopya doğmaz', () => {
      const { scene, view, art } = build(spec);
      const thorax = (art.list as FakeObject[])[6];
      for (let i = 0; i < 60; i++) view.update(frame({ x: 100 + i * 3, vx: 150, speed: 150 }), 16);
      const base = thorax.scale as number;
      for (let i = 0; i < 60; i++)
        view.update(frame({ x: 400 + i * 3, vx: 150, speed: 150, boosting: false }), 16);
      expect(thorax.scale as number).toBeCloseTo(base, 2);
      const tinted = scene.created.filter(
        (object) =>
          object.kind === 'image' &&
          object.calls.some(([name, args]) => name === 'setTint' && args[0] === 0xff7f93),
      );
      expect(tinted).toHaveLength(0);
    });

    it('imha edilince gövde, gölge katmanı ve ağız parlaması gizlenir; sıçrama pozu sıfırlanır', () => {
      const { view, root, shadowRoot, lighting } = build(spec);
      for (let i = 0; i < 20; i++)
        view.update(frame({ x: 100 + i * 5, vx: 345, speed: 345, boosting: true }), 16);
      view.fire(0);
      expect(shadowRoot.alpha as number).toBeLessThan(1);
      view.setPresent(false);
      expect(root.visible).toBe(false);
      expect(shadowRoot.visible).toBe(false);
      expect(shadowRoot.alpha).toBe(1);
      const flashes = lighting.calls
        .filter(([name]) => name === 'add')
        .map(([, a]) => a[0] as FakeObject);
      expect(flashes.every((flash) => flash.visible === false)).toBe(true);
      view.setPresent(true);
      expect(root.visible).toBe(true);
      expect(shadowRoot.visible).toBe(true);
    });

    it('kırık bacaklar bacak katmanına işlenir ve gövde kırık yana çöker; onarım geri alır', () => {
      const { view, art } = build(spec);
      const [legLayer, , thorax] = art.list as FakeObject[];
      const legParts = (lastCall(legLayer, 'add') ?? []).flat() as FakeObject[];
      // Sağ bacaklar (4-7) kırık: sağ yan +y'dir, gövde oraya çöker.
      view.setParts(0b1111_0000);
      for (let i = 0; i < 40; i++) view.update(frame(), 16);
      const sagged = thorax.y as number;
      expect(sagged).toBeGreaterThan(0.5);
      expect(legParts.some((part) => part.visible === false)).toBe(true);
      view.setParts(0);
      for (let i = 0; i < 80; i++) view.update(frame(), 16);
      expect(Math.abs(thorax.y as number)).toBeLessThan(sagged);
      expect(legParts.every((part) => part.visible !== false)).toBe(true);
    });

    it('eksik bacaklı yan yürürken adım döngüsüyle çöker: gövde tökezler, sağlam yürüyüş ve duruş sabit kalır', () => {
      const sway = (mask: number, speed: number): number => {
        const { view, art } = build(spec);
        const [, , thorax] = art.list as FakeObject[];
        view.setParts(mask);
        let low = Infinity;
        let high = -Infinity;
        let treadRight = 0;
        for (let i = 0; i < 240; i++) {
          treadRight += (speed * 16) / 1000;
          view.update(frame({ speed, treadLeft: treadRight, treadRight }), 16);
          if (i > 120) {
            low = Math.min(low, thorax.y as number);
            high = Math.max(high, thorax.y as number);
          }
        }
        return high - low;
      };
      const top = spec.walker.maxSpeed;
      expect(sway(0b0001_0000, top * 0.8)).toBeGreaterThan(3);
      expect(sway(0b0001_0000, top * 0.8)).toBeGreaterThan(sway(0, top * 0.8) * 3);
      // Duran yürüyücü tökezlemez: çöküş yürüyüş hızıyla ölçeklenir.
      expect(sway(0b0001_0000, 0)).toBeLessThan(0.5);
    });

    it('göğüs ve karın gölgesi ortak koyulukta; bacak çizgisi ondan açıktır, ikisi de tank gölgesine yakındır', () => {
      const { scene } = build(spec);
      const bodies = scene.created.filter((object) => object.alpha === SPIDER_ART.shadowAlpha);
      // Göğüs, karın ve her topun iki gölgesi (yuva, namlu) aynı koyuluktadır.
      expect(bodies).toHaveLength(2 + spec.armament.mounts.length * 2);
      expect(look.leg.shadowAlpha).toBeLessThan(SPIDER_ART.shadowAlpha);
      expect(SPIDER_ART.shadowAlpha).toBeGreaterThan(0.25);
      expect(SPIDER_ART.shadowAlpha).toBeLessThan(0.45);
    });

    it('toplar göğüsle birlikte çöker: kırık yan çökerken top da aynı kadar iner', () => {
      const { view, root } = build(spec);
      const cannon = (root.list as FakeObject[])[1];
      const settle = (): number => {
        for (let step = 0; step < 90; step++) view.update(frame({ hull: 0 }), 1000 / 60);
        return cannon.y as number;
      };
      const before = settle();
      view.setParts(0b1111_0000);
      expect(settle() - before).toBeGreaterThan(2.5);
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

describe('SpiderView: ayak izi', () => {
  function walk(spec: WalkerSpec, steps: number, intact = true) {
    const scene = fakeScene();
    const lighting = scene.add.container(0, 0);
    const prints: { x: number; y: number; angle: number; scale: number }[] = [];
    const view = new SpiderView(
      scene as unknown as Phaser.Scene,
      spec,
      SPIDER_LOOKS[spec.id],
      lighting as never,
      (x, y, angle, scale) => prints.push({ x, y, angle, scale }),
    );
    if (!intact) view.setParts(0xff);
    for (let step = 0; step < steps; step++) {
      view.update(frame({ x: 100 + step * 3, y: 200, hull: 0.3, vx: 180, speed: 180 }), 1000 / 60);
    }
    return prints;
  }

  it('yürürken yere basan pençeler gövde yönünde, boya ölçekli iz bırakır', () => {
    const prints = walk(ARACHNID, 180);
    expect(prints.length).toBeGreaterThan(4);
    for (const print of prints) {
      expect(print.angle).toBeCloseTo(0.3);
      expect(print.scale).toBeCloseTo(1, 0);
    }
  });

  it('daha geniş yürüyücünün izi daha büyüktür', () => {
    const wide = { ...ARACHNID, walker: { ...ARACHNID.walker, halfWidth: 38 } };
    const [print] = walk(wide, 180);
    expect(print.scale).toBeGreaterThan(walk(ARACHNID, 180)[0].scale * 1.5);
  });

  it('bütün bacakları kopmuş yürüyücü iz basmaz', () => {
    expect(walk(ARACHNID, 180, false)).toHaveLength(0);
  });
});

describe('SpiderView: yetenek görünümü', () => {
  const build2 = (spec: WalkerSpec) => {
    const scene = fakeScene();
    const lighting = scene.add.container(0, 0);
    const view = new SpiderView(
      scene as unknown as Phaser.Scene,
      spec,
      SPIDER_LOOKS[spec.id],
      lighting as never,
    );
    const dome = scene.created.find(
      (object) => object.kind === 'image' && object.args[2] === 'fx-shield-dome',
    );
    return { scene, view, dome };
  };

  it('yalnız Goliath kalkan kubbesi taşır; sıçrayan örümceklerde kubbe yoktur ve absorb false döner', () => {
    expect(build2(GOLIATH).dome).toBeDefined();
    for (const spec of [ARACHNID, WIDOW]) {
      const rig = build2(spec);
      expect(rig.dome).toBeUndefined();
      expect(rig.view.absorb(0, 0)).toBe(false);
    }
  });

  it('look tanımı yeteneğe uyar: leap yalnız sıçrayanda, shield yalnız kalkanlıda', () => {
    for (const spec of [ARACHNID, WIDOW, GOLIATH]) {
      const look = SPIDER_LOOKS[spec.id];
      expect(look.leap !== undefined, `${spec.id} leap`).toBe(skillOf(spec) === 'leap');
      expect(look.shield !== undefined, `${spec.id} shield`).toBe(skillOf(spec) === 'shield');
    }
  });

  it('Goliath kalkan açıkken kubbe görünür, vuruşu emer; kalkan kapanınca absorb false olur', () => {
    const { view } = build2(GOLIATH);
    for (let i = 0; i < 20; i++) view.update(frame({ vx: 40, speed: 40 }), 16);
    expect(view.absorb(120, 200)).toBe(false);
    for (let i = 0; i < 30; i++) view.update(frame({ boosting: true }), 16);
    expect(view.absorb(160, 200)).toBe(true);
    for (let i = 0; i < 300; i++) view.update(frame({ boosting: false }), 16);
    expect(view.absorb(160, 200)).toBe(false);
  });

  it('Goliath kalkanla gövdesini yükseltmez ve zemin gölgesini soluklaştırmaz (zıplamaz)', () => {
    const calm = build2(GOLIATH);
    const shielded = build2(GOLIATH);
    const thorax = (rig: ReturnType<typeof build2>) =>
      (rig.view.root.list as unknown as FakeObject[])[0];
    for (let i = 0; i < 60; i++) {
      calm.view.update(frame(), 16);
      shielded.view.update(frame({ boosting: true }), 16);
    }
    const body = (rig: ReturnType<typeof build2>) =>
      (
        (thorax(rig).list as FakeObject[]).find(
          (child) => child.args[3] === 'goliath/thorax',
        ) as FakeObject
      ).scale as number;
    expect(body(shielded)).toBeCloseTo(body(calm), 3);
  });

  it('imha edilince kubbe anında gizlenir; yeniden doğunca temiz başlar', () => {
    const { view, dome } = build2(GOLIATH);
    for (let i = 0; i < 40; i++) view.update(frame({ boosting: true }), 16);
    view.setWrecked(true);
    expect(view.absorb(160, 200)).toBe(false);
    view.setPresent(false);
    expect(dome).toBeDefined();
    view.setPresent(true);
    view.setWrecked(false);
    view.update(frame(), 16);
    expect(view.absorb(160, 200)).toBe(false);
  });

  it('yok edilince kubbe ve yer ışığı yok edilir', () => {
    const { scene, view } = build2(GOLIATH);
    view.destroy();
    const destroyed = scene.created.filter((object) => lastCall(object, 'destroy') !== undefined);
    expect(destroyed.length).toBeGreaterThan(2);
  });
});
