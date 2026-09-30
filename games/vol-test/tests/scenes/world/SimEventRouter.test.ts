import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { FEEL } from '@/config/feel';
import { routeSimEvents } from '@/scenes/world/SimEventRouter';

const haptics = vi.hoisted(() => ({ patterns: [] as string[] }));

vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  vibrate: (pattern: string) => haptics.patterns.push(pattern),
}));

function targets() {
  return {
    tank: { fire: vi.fn() },
    effects: { muzzle: vi.fn(), impact: vi.fn(), wallHit: vi.fn() },
    arena: { strike: vi.fn() },
    camera: { kick: vi.fn(), addTrauma: vi.fn() },
  };
}

afterEach(() => {
  haptics.patterns = [];
});

describe('routeSimEvents', () => {
  it('atış: namlu, duman, kamera tepmesi ve hafif titreşim', () => {
    const t = targets();
    routeSimEvents([{ kind: 'fired', x: 1, y: 2, angle: 0.5 }], t);
    expect(t.tank.fire).toHaveBeenCalled();
    expect(t.effects.muzzle).toHaveBeenCalledWith(1, 2, 0.5);
    expect(t.camera.kick).toHaveBeenCalledWith(0.5, FEEL.fire.cameraKick);
    expect(haptics.patterns).toEqual(['tap']);
  });

  it('mermi isabeti yalnız kıvılcım üretir', () => {
    const t = targets();
    routeSimEvents([{ kind: 'impact', x: 1, y: 2, angle: 3 }], t);
    expect(t.effects.impact).toHaveBeenCalledWith(1, 2, 3);
    expect(t.camera.kick).not.toHaveBeenCalled();
    expect(haptics.patterns).toEqual([]);
  });

  it('duvar çarpmasının şiddeti yankıya, sarsıntıya ve titreşim desenine yansır', () => {
    const t = targets();
    const hit = (speed: number) =>
      routeSimEvents([{ kind: 'wallHit', x: 0, y: 0, normalX: -1, normalY: 0, speed }], t);
    hit(FEEL.wall.fullSpeed * 0.2);
    hit(FEEL.wall.fullSpeed * 3);
    expect(haptics.patterns).toEqual(['tap', 'warning']);
    const [light, heavy] = t.camera.addTrauma.mock.calls.map(([value]) => value as number);
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeCloseTo(FEEL.wall.traumaBase + FEEL.wall.traumaScale);
    expect(t.effects.wallHit.mock.calls[1][4]).toBe(1);
  });
});
