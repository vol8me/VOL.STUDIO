import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { FEEL } from '@/config/feel';
import { routeSimEvents } from '@/scenes/world/SimEventRouter';

const haptics = vi.hoisted(() => ({ patterns: [] as string[], intensities: [] as number[] }));

vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  vibrate: (pattern: string, intensity: number) => {
    haptics.patterns.push(pattern);
    haptics.intensities.push(intensity);
  },
}));

const PLAYER = 1;
const OTHER = 2;

function targets() {
  const fire = { [PLAYER]: vi.fn(), [OTHER]: vi.fn() } as Record<number, () => void>;
  return {
    fire,
    player: PLAYER,
    tank: (id: number) => (fire[id] ? { fire: fire[id] } : undefined),
    effects: { muzzle: vi.fn(), impact: vi.fn(), wallHit: vi.fn() },
    arena: { strike: vi.fn() },
    camera: { kick: vi.fn(), addTrauma: vi.fn() },
  };
}

afterEach(() => {
  haptics.patterns = [];
  haptics.intensities = [];
});

describe('routeSimEvents', () => {
  it('oyuncunun atışı: namlu, duman, kamera tepmesi ve titreşim', () => {
    const t = targets();
    routeSimEvents([{ kind: 'fired', source: PLAYER, x: 1, y: 2, angle: 0.5 }], t);
    expect(t.fire[PLAYER]).toHaveBeenCalled();
    expect(t.effects.muzzle).toHaveBeenCalledWith(1, 2, 0.5);
    expect(t.camera.kick).toHaveBeenCalledWith(0.5, FEEL.fire.cameraKick);
    expect(haptics.patterns).toEqual(['tap']);
    expect(haptics.intensities).toEqual([FEEL.fire.haptic]);
  });

  it('başka aracın atışı görünür ama kamerayı ve titreşimi tetiklemez', () => {
    const t = targets();
    routeSimEvents([{ kind: 'fired', source: OTHER, x: 1, y: 2, angle: 0 }], t);
    expect(t.fire[OTHER]).toHaveBeenCalled();
    expect(t.effects.muzzle).toHaveBeenCalled();
    expect(t.camera.kick).not.toHaveBeenCalled();
    expect(haptics.patterns).toEqual([]);
  });

  it('duvar ve yer patlaması kıvılcım üretir; oyuncuya isabet sarsar', () => {
    const t = targets();
    routeSimEvents(
      [
        { kind: 'impact', owner: PLAYER, surface: 'wall', x: 1, y: 2, angle: 3 },
        { kind: 'hit', owner: OTHER, target: PLAYER, x: 4, y: 5, angle: 0 },
        { kind: 'hit', owner: PLAYER, target: OTHER, x: 4, y: 5, angle: 0 },
      ],
      t,
    );
    expect(t.effects.impact).toHaveBeenCalledTimes(3);
    expect(t.camera.addTrauma).toHaveBeenCalledTimes(1);
    expect(haptics.patterns).toEqual(['warning']);
  });

  it('duvar çarpmasının şiddeti yankıya, sarsıntıya ve desene yansır', () => {
    const t = targets();
    const hit = (speed: number, source = PLAYER) =>
      routeSimEvents([{ kind: 'wallHit', source, x: 0, y: 0, normalX: -1, normalY: 0, speed }], t);
    hit(FEEL.wall.fullSpeed * 0.2);
    hit(FEEL.wall.fullSpeed * 3);
    hit(FEEL.wall.fullSpeed, OTHER);
    expect(t.arena.strike).toHaveBeenCalledTimes(3);
    expect(haptics.patterns).toEqual(['tap', 'warning']);
    expect(haptics.intensities).toEqual([0.2, 1]);
    const [light, heavy] = t.camera.addTrauma.mock.calls.map(([value]) => value as number);
    expect(heavy).toBeGreaterThan(light);
  });

  it('araç çarpışması yalnız oyuncu tarafsa hissedilir', () => {
    const t = targets();
    const bump = (a: number, b: number) =>
      routeSimEvents(
        [
          {
            kind: 'collision',
            a,
            b,
            x: 0,
            y: 0,
            normalX: 1,
            normalY: 0,
            speed: FEEL.wall.fullSpeed,
          },
        ],
        t,
      );
    bump(OTHER, 3);
    expect(haptics.patterns).toEqual([]);
    bump(OTHER, PLAYER);
    expect(haptics.patterns).toEqual(['warning']);
    expect(t.effects.wallHit).toHaveBeenCalledTimes(2);
  });
});
