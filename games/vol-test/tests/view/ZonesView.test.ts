import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FRONT_VIEW } from '@/config/frontView';
import { ONLINE_VIEW } from '@/config/onlineView';
import { WORLD } from '@/config/world';
import { createFront } from '@/view/front';
import { ZonesView } from '@/view/ZonesView';
import { fakeScene, type FakeObject } from '../support/fakeScene';

const EVERYWHERE = { x: 0, y: 0, width: WORLD.width, height: WORLD.height };

function setup() {
  const fake = fakeScene();
  const view = new ZonesView(fake as unknown as Phaser.Scene);
  const graphics = fake.created.find((object) => object.kind === 'graphics')!;
  const calls = (name: string): unknown[][] =>
    graphics.calls.filter(([method]) => method === name).map(([, args]) => args);
  return { view, graphics, calls, front: createFront(WORLD) };
}

const lastClear = (graphics: FakeObject): number =>
  graphics.calls.map(([name]) => name).lastIndexOf('clear');

describe('ZonesView', () => {
  it('tek katman kurar ve her karede önce temizler', () => {
    const { view, graphics, front } = setup();
    expect(graphics.depth).toBe(FRONT_VIEW.depth);
    view.update(front, EVERYWHERE, 0);
    view.update(front, EVERYWHERE, 16);
    expect(graphics.calls.filter(([name]) => name === 'clear')).toHaveLength(2);
    expect(lastClear(graphics)).toBeGreaterThan(0);
  });

  it('görünen alandaki her bölge ve üs için halka çizer', () => {
    const { view, front, calls } = setup();
    view.update(front, EVERYWHERE, 0);
    // Bölge başına bir halka + üs başına bir halka.
    expect(calls('strokeCircle')).toHaveLength(front.zones.length + front.bases.length);
    expect(calls('fillCircle')).toHaveLength(front.zones.length + front.bases.length);
  });

  it('kameranın dışındaki öğeyi çizmez', () => {
    const { view, front, calls } = setup();
    const zone = front.zones[0];
    view.update(front, { x: zone.x - 50, y: zone.y - 50, width: 100, height: 100 }, 0);
    const circles = calls('strokeCircle');
    expect(circles.some(([x, y]) => x === zone.x && y === zone.y)).toBe(true);
    expect(circles.length).toBeLessThan(front.zones.length + front.bases.length);
    view.update(front, { x: -5000, y: -5000, width: 100, height: 100 }, 0);
    expect(calls('strokeCircle')).toHaveLength(circles.length);
  });

  it('sahibin rengiyle boyar; sahipsiz bölge nötr renktedir', () => {
    const { view, front, graphics } = setup();
    front.zones[0].owner = 1;
    view.update(front, EVERYWHERE, 0);
    const styles = graphics.calls
      .filter(([name]) => name === 'lineStyle')
      .map(([, args]) => args[1] as number);
    expect(styles).toContain(ONLINE_VIEW.colors.teams[1]);
    expect(styles).toContain(FRONT_VIEW.colors.neutral);
  });

  it('ilerleme yayı yalnız ilerleme varken çizilir ve yönü önde olan cepheyi gösterir', () => {
    const { view, front, calls, graphics } = setup();
    view.update(front, EVERYWHERE, 0);
    expect(calls('arc')).toHaveLength(0);
    front.zones[2].progress = -0.5;
    view.update(front, EVERYWHERE, 0);
    const arcs = calls('arc');
    expect(arcs).toHaveLength(1);
    const [x, y, , from, to] = arcs[0] as number[];
    expect([x, y]).toEqual([front.zones[2].x, front.zones[2].y]);
    expect(to - from).toBeCloseTo(Math.PI, 6);
    const widths = graphics.calls
      .filter(([name]) => name === 'lineStyle')
      .map(([, args]) => args as number[]);
    const arcStyle = widths.find(([width]) => width === FRONT_VIEW.zone.progressWidth)!;
    expect(arcStyle[1]).toBe(ONLINE_VIEW.colors.teams[1]);
  });

  it('tartışmalı bölgenin halkası nabız atar', () => {
    const { view, front, graphics } = setup();
    front.zones[0].contested = true;
    const alphas = (time: number): number[] => {
      graphics.calls.length = 0;
      view.update(front, EVERYWHERE, time);
      return graphics.calls
        .filter(([name, args]) => name === 'lineStyle' && args[0] === FRONT_VIEW.zone.ringWidth)
        .map(([, args]) => args[2] as number);
    };
    const quiet = alphas(0);
    const peak = alphas(1000 / FRONT_VIEW.zone.contestedPulseHz / 4);
    expect(peak[0]).toBeGreaterThan(quiet[0]);
    // Tartışmasız bölgeler sabit kalır.
    expect(peak[1]).toBe(quiet[1]);
  });

  it('destroy katmanı söker', () => {
    const { view, graphics } = setup();
    view.destroy();
    expect(graphics.calls.some(([name]) => name === 'destroy')).toBe(true);
  });
});
