import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAKE_SPECS } from '@/config/lakes';
import { OUTCROP_SPECS } from '@/config/rocks';
import { WORLD } from '@/config/world';
import { bakeLakeMap } from '@/hud/lakeMap';
import { LakeField } from '@/sim/world/LakeField';
import { RockField } from '@/sim/world/RockField';

const field = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);
const rocks = new RockField(WORLD.width, WORLD.height, OUTCROP_SPECS);

function countingContext() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_target, key: string) => (): void => {
        calls.push(key);
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('bakeLakeMap', () => {
  it('her göl için kıyı şeridi, su ve derin su çokgenini bir kez doldurur', () => {
    const { ctx, calls } = countingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const canvas = bakeLakeMap(field, WORLD.width, WORLD.height);
    expect(canvas).toBeDefined();
    expect(calls.filter((call) => call === 'fill')).toHaveLength(field.lakes.length * 3);
    expect(calls.filter((call) => call === 'closePath')).toHaveLength(field.lakes.length * 3);
  });

  it('kaya loblarını da çizer; yalnız kayalı dünyada gölsüz de olsa doku üretir', () => {
    const { ctx, calls } = countingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    expect(bakeLakeMap(field, WORLD.width, WORLD.height, rocks)).toBeDefined();
    expect(calls.filter((call) => call === 'ellipse')).toHaveLength(rocks.rocks.length);
    calls.length = 0;
    const empty = new LakeField(WORLD.width, WORLD.height);
    expect(bakeLakeMap(empty, WORLD.width, WORLD.height, rocks)).toBeDefined();
    expect(calls.filter((call) => call === 'ellipse')).toHaveLength(rocks.rocks.length);
    expect(
      bakeLakeMap(empty, WORLD.width, WORLD.height, new RockField(WORLD.width, WORLD.height)),
    ).toBeUndefined();
  });

  it('doku dünyanın en-boy oranını korur ve uzun kenarı sınırlar', () => {
    const { ctx } = countingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const wide = bakeLakeMap(field, 4000, 2000)!;
    expect(wide.width).toBe(384);
    expect(wide.height).toBe(192);
    const tall = bakeLakeMap(field, 1000, 4000)!;
    expect(tall.height).toBe(384);
    expect(tall.width).toBe(96);
  });

  it('göl yoksa ya da tuval alınamazsa gölsüz çizilir (undefined)', () => {
    expect(bakeLakeMap(new LakeField(WORLD.width, WORLD.height), 100, 100)).toBeUndefined();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(bakeLakeMap(field, WORLD.width, WORLD.height)).toBeUndefined();
  });
});
