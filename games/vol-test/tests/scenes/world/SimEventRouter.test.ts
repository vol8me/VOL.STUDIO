import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { FEEL } from '@/config/feel';
import { ARACHNID, STRIKER } from '@/config/vehicles';
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
    spec: (id: number) => (id === OTHER ? ARACHNID : STRIKER),
    effects: {
      muzzle: vi.fn(),
      explode: vi.fn(),
      hit: vi.fn(),
      chip: vi.fn(),
      wallHit: vi.fn(),
      damage: vi.fn(),
    },
    position: (id: number) => (id === OTHER ? { x: 70, y: 80 } : { x: 30, y: 40 }),
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
    routeSimEvents(
      [{ kind: 'fired', mount: 0, source: PLAYER, x: 1, y: 2, angle: 0.5, vx: 0, vy: 0 }],
      t,
    );
    expect(t.fire[PLAYER]).toHaveBeenCalled();
    expect(t.effects.muzzle).toHaveBeenCalledWith(1, 2, 0.5);
    expect(t.camera.kick).toHaveBeenCalledWith(0.5, FEEL.fire.cameraKick);
    expect(t.camera.addTrauma).not.toHaveBeenCalled();
    expect(haptics.patterns).toEqual(['tap']);
    expect(haptics.intensities).toEqual([FEEL.fire.haptic]);
  });

  it('kalkan vuruşu emerse gövde kıvılcımı ve kıymığı çizilmez; kalkan kapalıysa çizilir', () => {
    const t = targets();
    const absorb = vi.fn(() => true);
    const shielded = { ...t, tank: () => ({ fire: vi.fn(), absorb }) };
    routeSimEvents([{ kind: 'hit', owner: PLAYER, target: OTHER, x: 7, y: 8, angle: 1 }], shielded);
    expect(absorb).toHaveBeenCalledWith(7, 8);
    expect(t.effects.hit).not.toHaveBeenCalled();
    expect(t.effects.chip).not.toHaveBeenCalled();

    const open = { ...t, tank: () => ({ fire: vi.fn(), absorb: vi.fn(() => false) }) };
    routeSimEvents([{ kind: 'hit', owner: PLAYER, target: OTHER, x: 7, y: 8, angle: 1 }], open);
    expect(t.effects.hit).toHaveBeenCalledWith(7, 8, 1);
    expect(t.effects.chip).toHaveBeenCalled();
  });

  it('kalkanlı hedefin isabeti nişangâhı tetikler; korunan oyuncu hafif sarsılır, kalkansız tam sarsılır', () => {
    const t = targets();
    const reticle = { fired: vi.fn(), hit: vi.fn() };
    const shielded = { ...t, reticle, tank: () => ({ fire: vi.fn(), absorb: () => true }) };
    routeSimEvents([{ kind: 'hit', owner: PLAYER, target: OTHER, x: 0, y: 0, angle: 0 }], shielded);
    expect(reticle.hit).toHaveBeenCalled();
    haptics.patterns.length = 0;
    routeSimEvents([{ kind: 'hit', owner: OTHER, target: PLAYER, x: 0, y: 0, angle: 0 }], shielded);
    expect(t.camera.addTrauma).toHaveBeenLastCalledWith(FEEL.hit.absorbedTrauma);
    expect(FEEL.hit.absorbedTrauma).toBeLessThan(FEEL.hit.trauma);
    expect(haptics.patterns).toEqual(['tap']);
    const bare = { ...t, tank: () => ({ fire: vi.fn(), absorb: () => false }) };
    routeSimEvents([{ kind: 'hit', owner: OTHER, target: PLAYER, x: 0, y: 0, angle: 0 }], bare);
    expect(t.camera.addTrauma).toHaveBeenLastCalledWith(FEEL.hit.trauma);
    expect(haptics.patterns).toContain('warning');
  });

  it('nişangâh yalnız oyuncunun atışında büyür ve oyuncunun isabetinde ton değiştirir', () => {
    const reticle = { fired: vi.fn(), hit: vi.fn() };
    const t = { ...targets(), reticle };
    routeSimEvents(
      [
        { kind: 'fired', mount: 0, source: OTHER, x: 0, y: 0, angle: 0, vx: 0, vy: 0 },
        { kind: 'hit', owner: OTHER, target: PLAYER, x: 0, y: 0, angle: 0 },
      ],
      t,
    );
    expect(reticle.fired).not.toHaveBeenCalled();
    expect(reticle.hit).not.toHaveBeenCalled();
    routeSimEvents(
      [
        { kind: 'fired', mount: 0, source: PLAYER, x: 0, y: 0, angle: 0, vx: 0, vy: 0 },
        { kind: 'hit', owner: PLAYER, target: OTHER, x: 0, y: 0, angle: 0 },
      ],
      t,
    );
    expect(reticle.fired).toHaveBeenCalledTimes(1);
    expect(reticle.hit).toHaveBeenCalledTimes(1);
  });

  it('başka aracın atışı görünür ama kamerayı ve titreşimi tetiklemez', () => {
    const t = targets();
    routeSimEvents(
      [{ kind: 'fired', mount: 0, source: OTHER, x: 1, y: 2, angle: 0, vx: 0, vy: 0 }],
      t,
    );
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
    // Kıymık, isabet alan aracın tanımıyla ve kimliğiyle istenir (şansı efekt belirler).
    expect(t.effects.chip.mock.calls).toEqual([
      [STRIKER, PLAYER, 4, 5, 0],
      [ARACHNID, OTHER, 4, 5, 0],
    ]);
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

  it('hasar sayısı yönünü oyuncuya göre alır: verilen, alınan, başkaları; boğulma yazılmaz', () => {
    const t = targets();
    routeSimEvents(
      [
        {
          kind: 'damaged',
          target: OTHER,
          source: PLAYER,
          cause: 'projectile',
          amount: 12,
          health: 8,
        },
        {
          kind: 'damaged',
          target: PLAYER,
          source: OTHER,
          cause: 'projectile',
          amount: 9,
          health: 1,
        },
        { kind: 'damaged', target: OTHER, source: 7, cause: 'projectile', amount: 3, health: 5 },
        { kind: 'damaged', target: PLAYER, cause: 'drown', amount: 1, health: 4 },
        { kind: 'damaged', target: PLAYER, cause: 'wall', amount: 2, health: 3 },
      ],
      t,
    );
    expect(t.effects.damage.mock.calls).toEqual([
      [70, 80, 12, 'dealt'],
      [30, 40, 9, 'taken'],
      [70, 80, 3, 'other'],
      [30, 40, 2, 'taken'],
    ]);
  });

  it('hasar sayısı aynı paketteki isabetin noktasına konur; aracı olmayan hasar atlanır', () => {
    const t = targets();
    routeSimEvents(
      [
        {
          kind: 'damaged',
          target: OTHER,
          source: PLAYER,
          cause: 'projectile',
          amount: 5,
          health: 5,
        },
        { kind: 'hit', owner: PLAYER, target: OTHER, x: 111, y: 222, angle: 0 },
      ],
      t,
    );
    expect(t.effects.damage).toHaveBeenCalledWith(111, 222, 5, 'dealt');
    t.effects.damage.mockClear();
    routeSimEvents(
      [{ kind: 'damaged', target: 9, source: PLAYER, cause: 'projectile', amount: 5, health: 5 }],
      { ...t, position: () => undefined },
    );
    expect(t.effects.damage).not.toHaveBeenCalled();
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

  it('çarpma şiddeti etkilenen araçların görünümüne iletilir (yoksa atlanır)', () => {
    const impact = { [PLAYER]: vi.fn(), [OTHER]: vi.fn() };
    const t = {
      ...targets(),
      tank: (id: number) =>
        impact[id as 1 | 2] ? { fire: vi.fn(), impact: impact[id as 1 | 2] } : undefined,
    };
    const speed = FEEL.wall.fullSpeed * 0.5;
    routeSimEvents(
      [{ kind: 'wallHit', source: OTHER, x: 0, y: 0, normalX: 1, normalY: 0, speed }],
      t,
    );
    expect(impact[OTHER]).toHaveBeenCalledWith(0.5);
    expect(impact[PLAYER]).not.toHaveBeenCalled();
    routeSimEvents(
      [{ kind: 'collision', a: PLAYER, b: OTHER, x: 0, y: 0, normalX: 1, normalY: 0, speed }],
      t,
    );
    expect(impact[PLAYER]).toHaveBeenCalledWith(0.5);
    expect(impact[OTHER]).toHaveBeenCalledTimes(2);
    // Görünümü olmayan araç ve `impact` taşımayan görünüm (paletli araç) sessizce atlanır.
    expect(() =>
      routeSimEvents(
        [{ kind: 'collision', a: 7, b: 8, x: 0, y: 0, normalX: 1, normalY: 0, speed }],
        { ...t, tank: () => ({ fire: vi.fn() }) },
      ),
    ).not.toThrow();
  });
});
