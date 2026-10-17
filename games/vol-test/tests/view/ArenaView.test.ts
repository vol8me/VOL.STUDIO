import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { World } from '@/sim/world/World';
import { ArenaView } from '@/view/ArenaView';
import { fakeScene, lastCall } from '../support/fakeScene';

function build() {
  const scene = fakeScene();
  const view = new ArenaView(scene as unknown as Phaser.Scene, new World(1024, 512, 64));
  const [ground, grid, border, flash] = scene.created.filter((o) => o.kind === 'graphics');
  return { view, ground: ground, grid: grid, border: border, flash: flash };
}

describe('ArenaView', () => {
  it('zemini oyun paletinin kumuyla doldurur, UI rengine dokunmaz', () => {
    const { ground } = build();
    expect(lastCall(ground, 'fillStyle')).toEqual([PALETTE.sand, 1]);
    expect(lastCall(ground, 'fillRect')).toEqual([0, 0, 1024, 512]);
  });

  it('ızgarayı ince ve ana çizgiyle bir kez çizer; sınır ayrı katmandadır', () => {
    const { view, grid, border } = build();
    const styles = grid.calls.filter(([name]) => name === 'lineStyle').map(([, args]) => args);
    expect(styles).toEqual([
      [1, PALETTE.gridMinor.color, PALETTE.gridMinor.alpha],
      [1.5, PALETTE.gridMajor.color, PALETTE.gridMajor.alpha],
    ]);
    expect(grid.calls.filter(([name]) => name === 'moveTo')).toHaveLength(15 + 7);
    view.setGridVisible(false);
    expect(view.gridVisible).toBe(false);
    expect(border.visible).toBe(true);
    expect(lastCall(border, 'strokeRect')).toEqual([0, 0, 1024, 512]);
  });

  it('çayır örtüsünün altındaki ızgara kesimleri çizilmez; kamera aynıyken yeniden kurulmaz', () => {
    const { view, grid } = build();
    const world = { x: 0, y: 0, width: 1024, height: 512 };
    // Sol yarı örtülü: örtülü dikey çizgiler hiç çizilmez, yataylar yalnız sağ yarıda kalır.
    view.fitGrid(world, (x) => x < 512, 0);
    const clears = grid.calls.filter(([name]) => name === 'clear').length;
    const names = grid.calls.map(([name]) => name);
    const afterClear = grid.calls
      .slice(names.lastIndexOf('clear'))
      .filter(([name]) => name === 'moveTo')
      .map(([, args]) => args as number[]);
    expect(clears).toBe(1);
    expect(afterClear.length).toBeGreaterThan(0);
    // Örtülü sol yarıda hiçbir çizgi başlamaz: ne dikey çizgi ne yatay çizginin başı.
    expect(afterClear.every(([x]) => x >= 512)).toBe(true);
    view.fitGrid(world, (x) => x < 512, 100);
    expect(grid.calls.filter(([name]) => name === 'clear')).toHaveLength(clears);
    // Süre dolunca ya da görünüm kayınca yenilenir; her şey örtülüyse çizgi kalmaz.
    view.fitGrid(world, () => true, 5000);
    expect(grid.calls.filter(([name]) => name === 'clear')).toHaveLength(clears + 1);
    const before = grid.calls.filter(([name]) => name === 'moveTo').length;
    view.fitGrid({ ...world, x: 600 }, () => true, 5100);
    expect(grid.calls.filter(([name]) => name === 'moveTo')).toHaveLength(before);
    // Izgara kapalıyken hiçbir şey kurulmaz.
    view.setGridVisible(false);
    view.fitGrid({ ...world, x: 0 }, () => false, 99_000);
    expect(grid.calls.filter(([name]) => name === 'moveTo')).toHaveLength(before);
  });

  it('duvar çarpması sınırın doğru kenarını parlatır ve söner', () => {
    const { view, flash } = build();
    view.strike(1024, 200, -1, 500);
    view.update(16);
    expect(lastCall(flash, 'lineBetween')?.slice(0, 1)).toEqual([1024]);
    view.strike(300, 0, 0, 50);
    view.update(16);
    const [, y1, , y2] = lastCall(flash, 'lineBetween') as number[];
    expect([y1, y2]).toEqual([0, 0]);
    view.update(FX.wallFlash.durationMs);
    expect(lastCall(flash, 'clear')).toBeDefined();
    view.update(16);
    view.destroy();
    expect(lastCall(flash, 'destroy')).toBeDefined();
  });
});
