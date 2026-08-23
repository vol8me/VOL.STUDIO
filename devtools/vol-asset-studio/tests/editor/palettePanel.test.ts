import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PalettePanel } from '../../src/editor/panels/PalettePanel';
import { translate } from '../client/helpers';

function bufferWithColors(): { width: number; height: number; rgba: Uint8ClampedArray } {
  const width = 4;
  const height = 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const colors = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 0],
  ];
  for (let i = 0; i < colors.length; i += 1) {
    rgba.set(colors[i], i * 4);
  }
  return { width, height, rgba };
}

describe('PalettePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('belgeden paleti çıkarır ve renk seçtirir', () => {
    const callbacks = {
      onPick: vi.fn(),
      onReplace: vi.fn(),
      onQuantize: vi.fn(),
    };
    const panel = new PalettePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);

    panel.update(bufferWithColors());
    const swatches = panel.element.querySelectorAll<HTMLButtonElement>('.palette-swatch');
    expect(swatches.length).toBeGreaterThan(0);
    expect(panel.element.querySelector('.palette-panel__count')?.textContent).toContain(
      String(swatches.length),
    );

    swatches[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callbacks.onPick).toHaveBeenCalledWith(swatches[0].dataset.color);
    expect(swatches[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('sağ tık seçili rengi hedef renkle değiştirir', () => {
    const callbacks = {
      onPick: vi.fn(),
      onReplace: vi.fn(),
      onQuantize: vi.fn(),
    };
    const panel = new PalettePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.update(bufferWithColors());

    const swatches = panel.element.querySelectorAll<HTMLButtonElement>('.palette-swatch');
    swatches[0].click();
    swatches[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    expect(callbacks.onReplace).toHaveBeenCalledWith(
      swatches[0].dataset.color,
      swatches[1].dataset.color,
    );
  });

  it('quantize düğmesi paleti ve dither tercihini iletir', () => {
    const callbacks = {
      onPick: vi.fn(),
      onReplace: vi.fn(),
      onQuantize: vi.fn(),
    };
    const panel = new PalettePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.update(bufferWithColors());

    const quantize = panel.element.querySelector<HTMLButtonElement>('.palette-panel__quantize')!;
    quantize.click();
    expect(callbacks.onQuantize).toHaveBeenCalledOnce();
    const [palette, dither] = callbacks.onQuantize.mock.calls[0] as [string[], boolean];
    expect(Array.isArray(palette)).toBe(true);
    expect(typeof dither).toBe('boolean');
  });

  it('dil değişiminde başlık ve düğme etiketleri güncellenir', () => {
    const panel = new PalettePanel({
      t: translate,
      onPick: vi.fn(),
      onReplace: vi.fn(),
      onQuantize: vi.fn(),
    });
    document.body.appendChild(panel.element);
    panel.update(bufferWithColors());

    panel.setTranslator((key) => `tr:${key}`);
    expect(panel.element.querySelector('.palette-panel__title')?.textContent).toContain(
      'tr:editor.palette',
    );
  });

  it('destroy panelleri kaldırır', () => {
    const panel = new PalettePanel({
      t: translate,
      onPick: vi.fn(),
      onReplace: vi.fn(),
      onQuantize: vi.fn(),
    });
    document.body.appendChild(panel.element);
    panel.update(bufferWithColors());

    panel.destroy();
    expect(panel.element.isConnected).toBe(false);
  });
});
