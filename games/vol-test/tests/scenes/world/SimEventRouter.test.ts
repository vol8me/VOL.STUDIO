import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { FEEL } from '@/config/feel';
import { falloff, routeSimEvents } from '@/scenes/world/SimEventRouter';

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
    effects: { muzzle: vi.fn(), explode: vi.fn(), hit: vi.fn(), wallHit: vi.fn() },
    arena: { strike: vi.fn() },
    camera: { kick: vi.fn(), addTrauma: vi.fn() },
    listener: { x: 0, y: 0 },
  };
}

afterEach(() => {
  haptics.patterns = [];
  haptics.intensities = [];
});

describe('routeSimEvents', () => {
  it('oyuncunun atışı: namlu, küçük kamera itmesi ve titreşim; sarsıntı YOK', () => {
    const t = targets();
    routeSimEvents([{ kind: 'fired', source: PLAYER, x: 1, y: 2, angle: 0.5 }], t);
    expect(t.fire[PLAYER]).toHaveBeenCalled();
    expect(t.effects.muzzle).toHaveBeenCalledWith(1, 2, 0.5);
    expect(t.camera.kick).toHaveBeenCalledWith(0.5, FEEL.fire.cameraKick);
    expect(t.camera.addTrauma).not.toHaveBeenCalled();
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

  it('patlama yüzeyiyle efekte gider; sarsıntı uzaklıkla söner ve tavanlıdır', () => {
    const t = targets();
    const blast = (x: number) =>
      routeSimEvents([{ kind: 'impact', owner: PLAYER, surface: 'ground', x, y: 0, angle: 0 }], t);
    blast(0);
    blast(FEEL.blast.radius / 2);
    blast(FEEL.blast.radius * 2);
    expect(t.effects.explode).toHaveBeenCalledWith(0, 0, 0, 'ground');
    expect(t.effects.explode).toHaveBeenCalledTimes(3);
    const shakes = t.camera.addTrauma.mock.calls.map(([value]) => value as number);
    expect(shakes).toEqual([FEEL.blast.trauma, FEEL.blast.trauma * 0.25]);
    // Titreşim yalnız yakın patlamada.
    expect(haptics.intensities).toEqual([FEEL.blast.haptic]);
  });

  it('isabet efekti her araçta; oyuncuya isabet tavanlı sarsar ve güçlü titrer', () => {
    const t = targets();
    routeSimEvents(
      [
        { kind: 'hit', owner: OTHER, target: PLAYER, x: 4, y: 5, angle: 0 },
        { kind: 'hit', owner: PLAYER, target: OTHER, x: 4, y: 5, angle: 0 },
      ],
      t,
    );
    expect(t.effects.hit).toHaveBeenCalledTimes(2);
    expect(t.camera.addTrauma.mock.calls).toEqual([[FEEL.hit.trauma]]);
    expect(haptics.patterns).toEqual(['warning']);
  });

  it('uzaklık sönümü merkezde 1, yarıçapta ve ötesinde 0, kareli', () => {
    expect(falloff(0, 0, 100)).toBe(1);
    expect(falloff(30, 40, 100)).toBeCloseTo(0.25);
    expect(falloff(100, 0, 100)).toBe(0);
    expect(falloff(0, 500, 100)).toBe(0);
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
