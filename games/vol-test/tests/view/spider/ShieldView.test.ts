import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS } from '@/config/spiders';
import { GOLIATH } from '@/config/vehicles';
import { SHIELD_TEXTURE } from '@/view/spider/shieldTextures';
import { ShieldView } from '@/view/spider/ShieldView';
import { TEXTURE } from '@/view/textures';
import { fakeScene, lastCall, type FakeObject } from '../../support/fakeScene';

const STEP = 1000 / 60;
const shield = SPIDER_LOOKS.goliath.shield!;
const durationMs = (GOLIATH.walker.boostCapacity / GOLIATH.walker.boostDrain) * 1000;

function build() {
  const scene = fakeScene();
  const view = new ShieldView(scene as unknown as Phaser.Scene, shield, durationMs);
  const image = (key: string): FakeObject =>
    scene.created.find((object) => object.kind === 'image' && object.args[2] === key)!;
  return {
    scene,
    view,
    dome: image(SHIELD_TEXTURE.dome),
    mesh: image(SHIELD_TEXTURE.mesh),
    rim: image(SHIELD_TEXTURE.rim),
    pulse: image(TEXTURE.ring),
    root: view.root as unknown as FakeObject,
    run(active: boolean, ms: number, x = 100, y = 200): void {
      for (let t = 0; t < ms; t += STEP) view.update(active, STEP, x, y);
    },
  };
}

describe('ShieldView', () => {
  it('kapalıyken görünmez; süresi pozitif olmalı', () => {
    const { view, root } = build();
    expect(view.visible).toBe(false);
    expect(root.visible).toBe(false);
    expect(view.isOpen).toBe(false);
    expect(() => new ShieldView(fakeScene() as unknown as Phaser.Scene, shield, 0)).toThrow(
      RangeError,
    );
  });

  it('açılışta kubbe büyür, aşar ve oturur; görünür ve gövdeyi izler', () => {
    const rig = build();
    let peak = 0;
    for (let t = 0; t < 1500; t += STEP) {
      rig.view.update(true, STEP, 300 + t / 100, 400);
      peak = Math.max(peak, rig.view.power);
    }
    expect(rig.view.visible).toBe(true);
    expect(rig.view.isOpen).toBe(true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.4);
    expect(rig.view.power).toBeCloseTo(1, 1);
    expect(rig.root.x as number).toBeGreaterThan(300);
    expect(rig.root.y).toBe(400);
    // Kubbe çapı tasarım yarıçapıdır: doku kenarına oranlı ölçek.
    expect(rig.dome.scale as number).toBeGreaterThan(0.3);
  });

  it('açılış halkası kısa süre görünür ve söner', () => {
    const rig = build();
    rig.view.update(true, STEP, 0, 0);
    expect(rig.pulse.visible).toBe(true);
    const early = rig.pulse.alpha as number;
    rig.run(true, 700);
    expect(rig.pulse.visible).toBe(false);
    expect(early).toBeGreaterThan(0.5);
  });

  it('bitişe `warnMs` kala titrer; öncesinde parlaklık oynamaz', () => {
    const rig = build();
    const samples = (from: number, to: number): number[] => {
      const out: number[] = [];
      for (let t = from; t < to; t += STEP) {
        rig.view.update(true, STEP, 0, 0);
        out.push(rig.rim.alpha as number);
      }
      return out;
    };
    samples(0, 800);
    const calm = samples(800, durationMs - shield.warnMs - 100);
    const warning = samples(durationMs - shield.warnMs, durationMs - 20);
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    expect(spread(calm)).toBeLessThan(0.05);
    expect(spread(warning)).toBeGreaterThan(0.15);
  });

  it('kapanınca sönme animasyonu sürer, ardından tamamen gizlenir', () => {
    const rig = build();
    rig.run(true, 1000);
    rig.view.update(false, STEP, 0, 0);
    expect(rig.view.isOpen).toBe(false);
    expect(rig.view.visible).toBe(true);
    rig.run(false, 1500);
    expect(rig.view.visible).toBe(false);
    expect(rig.view.power).toBe(0);
  });

  it('vuruşu yalnız açıkken emer; dalga süresi dolunca söner ve dalga sayısı sınırlıdır', () => {
    const rig = build();
    expect(rig.view.absorb(150, 200)).toBe(false);
    rig.run(true, 600);
    expect(rig.view.absorb(220, 200)).toBe(true);
    expect(rig.view.rippleCount).toBe(1);
    for (let i = 0; i < 8; i++) rig.view.absorb(100 + i, 300);
    expect(rig.view.rippleCount).toBe(4);
    rig.run(true, shield.rippleMs + 100);
    expect(rig.view.rippleCount).toBe(0);
  });

  it('vuruş açısı kubbe merkezine göre hesaplanır: sağdaki vuruşun parlaması sağ kenardadır', () => {
    const rig = build();
    rig.run(true, 600, 100, 200);
    rig.view.absorb(300, 200);
    rig.view.update(true, STEP, 100, 200);
    const flares = rig.scene.created.filter(
      (object) => object.kind === 'image' && object.args[2] === TEXTURE.spark && object.visible,
    );
    expect(flares.length).toBeGreaterThan(0);
    const lit = flares.find((flare) => (flare.x as number) > 50)!;
    expect(lit.x as number).toBeGreaterThan(shield.radius * 0.7);
    expect(Math.abs(lit.y as number)).toBeLessThan(5);
  });

  it('duraklatmada (süre 0) kubbe donar: dönüş, parlaklık ve dalga ilerlemez', () => {
    const rig = build();
    rig.run(true, 800);
    rig.view.absorb(250, 200);
    rig.view.update(true, STEP, 100, 200);
    const rotation = rig.mesh.rotation as number;
    const alpha = rig.rim.alpha as number;
    const ripples = rig.view.rippleCount;
    for (let i = 0; i < 30; i++) rig.view.update(true, 0, 100, 200);
    expect(rig.mesh.rotation).toBe(rotation);
    expect(rig.rim.alpha).toBe(alpha);
    expect(rig.view.rippleCount).toBe(ripples);
  });

  it('hide kubbeyi, dalgaları ve yeri anında kapatır; yeniden açılış baştan başlar', () => {
    const rig = build();
    rig.run(true, 800);
    rig.view.absorb(250, 200);
    rig.view.hide();
    expect(rig.view.visible).toBe(false);
    expect(rig.view.isOpen).toBe(false);
    expect(rig.view.power).toBe(0);
    expect(rig.view.rippleCount).toBe(0);
    rig.view.update(true, STEP, 0, 0);
    expect(rig.view.visible).toBe(true);
    expect(rig.pulse.visible).toBe(true);
  });

  it('negatif ya da sonsuz olmayan süreler zamanı geri sarmaz', () => {
    const rig = build();
    rig.run(true, 400);
    const rotation = rig.mesh.rotation as number;
    rig.view.update(true, -500, 0, 0);
    expect(rig.mesh.rotation).toBe(rotation);
  });

  it('destroy kubbeyi ve yer ışığını yok eder', () => {
    const rig = build();
    rig.view.destroy();
    expect(lastCall(rig.root, 'destroy')).toBeDefined();
    const ground = rig.scene.created.filter(
      (object) => object.kind === 'image' && object.args[2] === TEXTURE.spark,
    );
    expect(ground.some((object) => lastCall(object, 'destroy') !== undefined)).toBe(true);
  });
});
