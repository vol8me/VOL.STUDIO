import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerPanel } from '../../src/editor/panels/LayerPanel';
import { translate } from '../client/helpers';
import type { BlendMode, SpriteLayerMeta } from '../../shared/index';

const LAYERS: SpriteLayerMeta[] = [
  {
    id: 'layer-1',
    name: 'Arka',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    alphaLocked: false,
  },
  {
    id: 'layer-2',
    name: 'Orta',
    visible: false,
    opacity: 0.75,
    blendMode: 'multiply',
    alphaLocked: false,
  },
  {
    id: 'layer-3',
    name: 'Ön',
    visible: true,
    opacity: 0.5,
    blendMode: 'screen',
    alphaLocked: false,
  },
];

function makeCallbacks() {
  return {
    onSelect: vi.fn(),
    onToggleVisible: vi.fn(),
    onOpacity: vi.fn(),
    onBlendMode: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onMergeDown: vi.fn(),
  };
}

function thumb(layerId: string) {
  return layerId === 'none'
    ? null
    : { width: 4, height: 4, rgba: new Uint8ClampedArray(4 * 4 * 4) };
}

describe('LayerPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('katmanları ters sırayla listeler ve küçük önizleme çizer', () => {
    const panel = new LayerPanel({ t: translate, ...makeCallbacks() });
    document.body.appendChild(panel.element);

    panel.setLayers(LAYERS, 'layer-2', thumb);

    const rows = panel.element.querySelectorAll('.layer-row');
    expect(rows.length).toBe(3);
    // Ters çevrilmiş: Ön (index 2) ilk sırada
    expect(rows[0].getAttribute('data-layer')).toBe('layer-3');
    expect(rows[1].getAttribute('data-layer')).toBe('layer-2');
    expect(rows[2].getAttribute('data-layer')).toBe('layer-1');
    expect(rows[1].classList.contains('layer-row--active')).toBe(true);
  });

  it('görünürlük, opaklık ve karışım kipini işler', () => {
    const callbacks = makeCallbacks();
    const panel = new LayerPanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setLayers(LAYERS, 'layer-2', thumb);

    const row = panel.element.querySelector('[data-layer="layer-3"]')!;
    const visible = row.querySelector<HTMLButtonElement>('.layer-row__visible')!;
    visible.click();
    expect(callbacks.onToggleVisible).toHaveBeenCalledWith('layer-3', false);

    const opacity = row.querySelector<HTMLInputElement>('.layer-row__opacity')!;
    opacity.value = '60';
    opacity.dispatchEvent(new Event('change', { bubbles: true }));
    expect(callbacks.onOpacity).toHaveBeenCalledWith('layer-3', 0.6);

    const blendOptions = document.body.querySelectorAll('.vol-select__option');
    blendOptions[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    if (blendOptions[1]) {
      expect(callbacks.onBlendMode).toHaveBeenCalled();
      const [, value] = callbacks.onBlendMode.mock.calls[0] as [string, BlendMode];
      expect(typeof value).toBe('string');
    }
  });

  it('hareket, birleştirme, silme ve ekleme eylemlerini bildirir', () => {
    const callbacks = makeCallbacks();
    const panel = new LayerPanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setLayers(LAYERS, 'layer-2', thumb);

    const row = panel.element.querySelector('[data-layer="layer-3"]')!;
    const topActions = row.querySelectorAll<HTMLButtonElement>('.layer-row__actions button');
    // Sıra: yukarı (devre dışı), aşağı, birleştir, sil
    topActions[2].click();
    expect(callbacks.onMergeDown).toHaveBeenCalledWith('layer-3');

    topActions[1].click();
    expect(callbacks.onMove).toHaveBeenCalledWith('layer-3', -1);

    const bottomRow = panel.element.querySelector('[data-layer="layer-1"]')!;
    const bottomActions = bottomRow.querySelectorAll<HTMLButtonElement>(
      '.layer-row__actions button',
    );
    // Sıra: yukarı, aşağı (devre dışı), birleştir (devre dışı), sil
    bottomActions[0].click();
    expect(callbacks.onMove).toHaveBeenCalledWith('layer-1', 1);

    panel.element.querySelector<HTMLButtonElement>('.layer-panel__add')!.click();
    expect(callbacks.onAdd).toHaveBeenCalledOnce();

    bottomActions[3].click();
    expect(callbacks.onRemove).toHaveBeenCalledWith('layer-1');
  });

  it('satır seçimi boş alanda tetiklenir', () => {
    const callbacks = makeCallbacks();
    const panel = new LayerPanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setLayers(LAYERS, 'layer-2', thumb);

    const row = panel.element.querySelector('[data-layer="layer-3"]')!;
    row.querySelector<HTMLElement>('.layer-row__name')!.click();
    expect(callbacks.onSelect).toHaveBeenCalledWith('layer-3');
  });

  it('dil değişiminde başlık ve etiketleri günceller', () => {
    const panel = new LayerPanel({ t: translate, ...makeCallbacks() });
    document.body.appendChild(panel.element);
    panel.setLayers(LAYERS, 'layer-2', thumb);

    panel.setTranslator((key) => `tr:${key}`);
    expect(panel.element.querySelector('.layer-panel__title')?.textContent).toContain(
      'tr:editor.layers',
    );
  });

  it('destroy bileşenleri kaldırır', () => {
    const panel = new LayerPanel({ t: translate, ...makeCallbacks() });
    document.body.appendChild(panel.element);
    panel.setLayers(LAYERS, 'layer-2', thumb);

    panel.destroy();
    expect(panel.element.isConnected).toBe(false);
  });
});
