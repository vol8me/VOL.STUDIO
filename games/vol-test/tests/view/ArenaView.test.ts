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
