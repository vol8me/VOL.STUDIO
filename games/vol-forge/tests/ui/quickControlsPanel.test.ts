import { describe, expect, it, vi } from 'vitest';
import { createVisualPreset, type SpriteDoc } from '@volstudio/core/visual';
import { DocumentStore } from '../../src/state/DocumentStore';
import { QuickControlsPanel } from '../../src/ui/QuickControlsPanel';

describe('temel çıktı kontrolleri', () => {
  it('bitiş ve renk seçimleri açık belgeyi gerçekten değiştirir', () => {
    const store = new DocumentStore(createVisualPreset('cutMineral', { size: 64 }));
    const panel = new QuickControlsPanel(store, vi.fn());
    panel.render();

    const smooth = Array.from(
      panel.element.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((button) => button.textContent === 'Pürüzsüz')!;
    smooth.click();
    expect(store.get().antialias).toBe(true);
    expect(store.get().post?.dither).toBeNull();

    const color = panel.element.querySelector<HTMLInputElement>('.vol-color-picker__hex')!;
    color.value = '#123456';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    expect(store.get().palette.generate?.[0]?.base).toBe('#123456');
    panel.destroy();
  });

  it('hazır boyut menüsü 2048 çıktıyı seçebilir', () => {
    const store = new DocumentStore(createVisualPreset('softGlow', { size: 64 }));
    const panel = new QuickControlsPanel(store, vi.fn());
    panel.render();
    panel.element.querySelector<HTMLButtonElement>('.vf-quick__size-preset')!.click();
    const option = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((button) => button.textContent === '2048 × 2048')!;
    option.click();
    expect(store.get().size).toEqual([2048, 2048]);
    panel.destroy();
  });

  it('sabit veri paletinde çalışmayan renk kontrolü göstermez', () => {
    const doc = {
      ...createVisualPreset('softGlow', { size: 32 }),
      palette: { colors: ['#111111', '#eeeeee'], ramps: [{ id: 0, indices: [0, 1] }] },
    } as SpriteDoc;
    const panel = new QuickControlsPanel(new DocumentStore(doc), vi.fn());
    panel.render();
    expect(panel.element.querySelector('.vol-color-picker')).toBeNull();
    panel.destroy();
  });
});
