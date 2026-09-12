import { describe, expect, it, vi } from 'vitest';
import { FieldRenderer } from '@/runtime/render/FieldRenderer';
import { FieldSet } from '@/runtime/sim/FieldSet';

function harness() {
  const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as ImageData;
  const texture = {
    context: { createImageData: vi.fn(() => imageData) },
    putData: vi.fn(),
    refresh: vi.fn(),
    setFilter: vi.fn(),
  };
  const tile = {
    setTileScale: vi.fn(),
    setDepth: vi.fn(),
    setOrigin: vi.fn(),
    destroy: vi.fn(),
  };
  tile.setOrigin.mockReturnValue(tile);
  tile.setTileScale.mockReturnValue(tile);
  tile.setDepth.mockReturnValue(tile);
  const scene = {
    textures: { createCanvas: vi.fn(() => texture), remove: vi.fn() },
    add: { tileSprite: vi.fn(() => tile) },
  };
  const fields = new FieldSet(2);
  const renderer = new FieldRenderer(scene as never, fields, 1000);
  return { renderer, fields, scene, texture, tile, imageData };
}

describe('FieldRenderer', () => {
  it('alan dokusunu uzun ekranlarda da toroidal sınırı örten alanda kurar', () => {
    const { scene, texture, tile } = harness();

    expect(scene.textures.createCanvas).toHaveBeenCalledWith('vol-life:fields', 2, 2);
    expect(scene.add.tileSprite).toHaveBeenCalledWith(-4000, -4000, 9000, 9000, 'vol-life:fields');
    expect(tile.setOrigin).toHaveBeenCalledWith(0, 0);
    expect(tile.setTileScale).toHaveBeenCalledWith(500, 500);
    expect(tile.setDepth).toHaveBeenCalledWith(-1000);
    expect(texture.setFilter).toHaveBeenCalled();
  });

  it('aynı ImageData tamponunu güncelleyip GPU dokusunu bir kez tazeler', () => {
    const { renderer, fields, texture, imageData } = harness();
    fields.light[0] = 1;

    renderer.render(fields);

    expect(imageData.data.some((value) => value > 0)).toBe(true);
    expect(texture.putData).toHaveBeenCalledWith(imageData, 0, 0);
    expect(texture.refresh).toHaveBeenCalledOnce();
  });

  it('görüntü nesnesini ve texture manager kaydını idempotent bırakır', () => {
    const { renderer, scene, tile } = harness();

    renderer.destroy();
    renderer.destroy();

    expect(tile.destroy).toHaveBeenCalledOnce();
    expect(scene.textures.remove).toHaveBeenCalledOnce();
  });
});
