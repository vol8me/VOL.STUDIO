import { describe, expect, it } from 'vitest';
import { BLEND_MODES, blendBuffer, blendPixel } from '../../src/editor/blend';
import { LayerStack } from '../../src/editor/LayerStack';
import type { Rgba } from '../../src/editor/RasterSurface';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };
const GREY: Rgba = { r: 128, g: 128, b: 128, a: 255 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function filled(width: number, height: number, color: Rgba): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color.r;
    rgba[i + 1] = color.g;
    rgba[i + 2] = color.b;
    rgba[i + 3] = color.a;
  }
  return rgba;
}

describe('blend', () => {
  it('normal kip kaynağı doğrudan yazar', () => {
    expect(blendPixel(RED, BLUE, 'normal', 1)).toEqual(BLUE);
  });

  it('saydam kaynak tabanı değiştirmez', () => {
    expect(blendPixel(RED, CLEAR, 'normal', 1)).toEqual(RED);
    expect(blendPixel(RED, BLUE, 'normal', 0)).toEqual(RED);
  });

  it('multiply koyultur, screen açar', () => {
    const multiplied = blendPixel(GREY, GREY, 'multiply', 1);
    const screened = blendPixel(GREY, GREY, 'screen', 1);

    expect(multiplied.r).toBeLessThan(GREY.r);
    expect(screened.r).toBeGreaterThan(GREY.r);
  });

  it('add kanalları doyurur ama taşırmaz', () => {
    const result = blendPixel({ r: 200, g: 200, b: 200, a: 255 }, GREY, 'add', 1);

    expect(result.r).toBe(255);
    expect(result.a).toBe(255);
  });

  it('boş zeminde multiply her şeyi siyaha çevirmez', () => {
    // Taban saydamsa blend fonksiyonu atlanır; aksi halde `multiply` boş
    // belgeye çizen kullanıcıya siyah bir katman gösterirdi.
    const result = blendPixel(CLEAR, RED, 'multiply', 1);

    expect(result).toEqual(RED);
  });

  it('yarı saydam kaynak alfayı birleştirir', () => {
    const result = blendPixel(RED, { ...BLUE, a: 128 }, 'normal', 1);

    expect(result.a).toBe(255);
    expect(result.b).toBeGreaterThan(0);
    expect(result.r).toBeGreaterThan(0);
  });

  it('bütün kipler geçerli RGBA üretir', () => {
    for (const mode of BLEND_MODES) {
      const result = blendPixel(GREY, RED, mode, 0.5);
      for (const channel of [result.r, result.g, result.b, result.a]) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('tampon karıştırma piksel karıştırmayla aynı sonucu verir', () => {
    const target = filled(2, 1, GREY);
    const source = filled(2, 1, RED);

    blendBuffer(target, source, 'multiply', 0.5);
    const expected = blendPixel(GREY, RED, 'multiply', 0.5);

    expect(Array.from(target.subarray(0, 4))).toEqual([
      expected.r,
      expected.g,
      expected.b,
      expected.a,
    ]);
  });

  it('uyumsuz tampon boyutunu reddeder', () => {
    expect(() =>
      blendBuffer(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 'normal', 1),
    ).toThrow(RangeError);
  });
});

describe('LayerStack', () => {
  it('katmanları ALTTAN ÜSTE karıştırır', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' }, filled(1, 1, RED));
    stack.add({ id: 'ust', name: 'üst' }, filled(1, 1, BLUE));

    const composite = stack.composite();

    expect(Array.from(composite)).toEqual([0, 0, 255, 255]);
  });

  it('görünmez katman bileşiğe girmez', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' }, filled(1, 1, RED));
    const top = stack.add({ id: 'ust', name: 'üst' }, filled(1, 1, BLUE));

    top.visible = false;
    stack.invalidate();

    expect(Array.from(stack.composite())).toEqual([255, 0, 0, 255]);
  });

  it('opaklık karışıma yansır', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' }, filled(1, 1, RED));
    stack.add({ id: 'ust', name: 'üst', opacity: 0.5 }, filled(1, 1, BLUE));

    const [r, , b] = Array.from(stack.composite());

    expect(r).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });

  it('bileşik önbelleklenir, invalidate ile tazelenir', () => {
    const stack = new LayerStack(1, 1);
    const layer = stack.add({ id: 'a', name: 'a' }, filled(1, 1, RED));

    stack.composite();
    layer.surface.setPixel(0, 0, BLUE);
    // Önbellek geçersiz kılınmadan eski sonuç döner; bu bilinçli bir
    // performans sözleşmesidir, çağıran değişimi bildirir.
    expect(Array.from(stack.composite())).toEqual([255, 0, 0, 255]);

    stack.invalidate();
    expect(Array.from(stack.composite())).toEqual([0, 0, 255, 255]);
  });

  it('sıralama değiştirilebilir', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' }, filled(1, 1, RED));
    stack.add({ id: 'ust', name: 'üst' }, filled(1, 1, BLUE));

    expect(stack.move('alt', 1)).toBe(true);

    expect(Array.from(stack.composite())).toEqual([255, 0, 0, 255]);
  });

  it('son katman silinemez', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'tek', name: 'tek' });

    expect(stack.remove('tek')).toBeNull();
    expect(stack.length).toBe(1);
  });

  it('yinelenen kimliği reddeder', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'a', name: 'a' });

    expect(() => stack.add({ id: 'a', name: 'tekrar' })).toThrow('Yinelenen');
  });

  it('mergeDown alt katmanın kimliğini korur', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' }, filled(1, 1, RED));
    stack.add({ id: 'ust', name: 'üst' }, filled(1, 1, BLUE));
    stack.setActive('ust');

    expect(stack.mergeDown('ust')).toBe(true);

    expect(stack.length).toBe(1);
    expect(stack.layers[0].id).toBe('alt');
    expect(stack.activeLayer?.id).toBe('alt');
    expect(Array.from(stack.composite())).toEqual([0, 0, 255, 255]);
  });

  it('en alttaki katman aşağı birleştirilemez', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'alt', name: 'alt' });
    stack.add({ id: 'ust', name: 'üst' });

    expect(stack.mergeDown('alt')).toBe(false);
  });

  it('aktif katman silinince komşuya geçer', () => {
    const stack = new LayerStack(1, 1);
    stack.add({ id: 'a', name: 'a' });
    stack.add({ id: 'b', name: 'b' });
    stack.setActive('b');

    stack.remove('b');

    expect(stack.activeLayer?.id).toBe('a');
  });
});
