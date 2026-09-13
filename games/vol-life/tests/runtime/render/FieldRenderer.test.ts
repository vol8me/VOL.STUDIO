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
  const images = Array.from({ length: 1 }, () => {
    const image = {
      x: 0,
      y: 0,
      setDepth: vi.fn(),
      setOrigin: vi.fn(),
      setDisplaySize: vi.fn(),
      setPosition: vi.fn((x: number, y: number) => {
        image.x = x;
        image.y = y;
        return image;
      }),
      setVisible: vi.fn(),
      destroy: vi.fn(),
    };
    image.setOrigin.mockReturnValue(image);
    image.setDisplaySize.mockReturnValue(image);
    image.setDepth.mockReturnValue(image);
    image.setVisible.mockReturnValue(image);
    return image;
  });
  let imageIndex = 0;
  const scene = {
    textures: { createCanvas: vi.fn(() => texture), remove: vi.fn() },
    add: { image: vi.fn(() => images[imageIndex++]) },
  };
  const fields = new FieldSet(2);
  const bounds = { x: 20, y: 30, width: 1000, height: 800 };
  const renderer = new FieldRenderer(scene as never, fields, bounds);
  return { renderer, fields, scene, texture, images, imageData };
}

describe('FieldRenderer', () => {
  it('sonlu alanı sınır sunumunu sahiplenmeden tek yüzeyde kurar', () => {
    const { scene, texture, images } = harness();

    expect(scene.textures.createCanvas).toHaveBeenCalledWith('vol-life:fields', 2, 2);
    expect(scene.add.image).toHaveBeenCalledOnce();
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, 'vol-life:fields');
    expect(images.every((image) => image.setOrigin.mock.calls[0]?.join() === '0,0')).toBe(true);
    expect(images.every((image) => image.setDisplaySize.mock.calls[0]?.join() === '1000,800')).toBe(
      true,
    );
    expect(images.every((image) => image.setDepth.mock.calls[0]?.[0] === -1000)).toBe(true);
    expect(texture.setFilter).toHaveBeenCalled();
    expect(images[0].setPosition).toHaveBeenCalledWith(20, 30);
  });

  it('aynı ImageData tamponunu güncelleyip GPU dokusunu bir kez tazeler', () => {
    const { renderer, fields, texture, imageData } = harness();
    fields.light[0] = 1;

    renderer.render(fields);

    expect(imageData.data.some((value) => value > 0)).toBe(true);
    expect(texture.putData).toHaveBeenCalledWith(imageData, 0, 0);
    expect(texture.refresh).toHaveBeenCalledOnce();
  });

  it('görüntüyü ve texture manager kaydını idempotent bırakır', () => {
    const { renderer, scene, images } = harness();

    renderer.destroy();
    renderer.destroy();

    expect(images.every((image) => image.destroy.mock.calls.length === 1)).toBe(true);
    expect(scene.textures.remove).toHaveBeenCalledOnce();
  });
});
