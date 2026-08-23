import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FramePanel } from '../../src/editor/panels/FramePanel';
import { translate } from '../client/helpers';

describe('FramePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('kareleri listeler, seçer ve kare başlıklarını günceller', () => {
    const callbacks = {
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onDuration: vi.fn(),
      onOnionSkin: vi.fn(),
      onPlayToggle: vi.fn(),
    };
    const panel = new FramePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);

    panel.setFrames(3, 1, 120, (index) =>
      index === 0 ? { width: 4, height: 4, rgba: new Uint8ClampedArray(4 * 4 * 4) } : null,
    );

    const cells = panel.element.querySelectorAll('.frame-cell');
    expect(cells.length).toBe(3);
    expect(cells[1].classList.contains('frame-cell--active')).toBe(true);
    expect(cells[1].getAttribute('aria-current')).toBe('true');

    cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callbacks.onSelect).toHaveBeenCalledWith(0);

    panel.setTranslator((key) => `tr:${key}`);
    expect(panel.element.querySelector('.frame-panel__title')?.textContent).toContain(
      'tr:editor.frames',
    );
  });

  it('kare ekleme, kopyalama ve silme eylemlerini bildirir', () => {
    const callbacks = {
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onDuration: vi.fn(),
      onOnionSkin: vi.fn(),
      onPlayToggle: vi.fn(),
    };
    const panel = new FramePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setFrames(2, 0, 120, () => null);

    const header = panel.element.querySelector('.panel-section__actions')!;
    const [play, add, copy, remove] = Array.from(
      header.querySelectorAll<HTMLButtonElement>('button'),
    );

    add.click();
    expect(callbacks.onAdd).toHaveBeenCalledWith(false);

    copy.click();
    expect(callbacks.onAdd).toHaveBeenCalledWith(true);

    remove.click();
    expect(callbacks.onRemove).toHaveBeenCalledWith(0);

    play.click();
    expect(callbacks.onPlayToggle).toHaveBeenCalledWith(true);
    expect(panel.isPlaying).toBe(true);

    panel.stopPlayback();
    expect(panel.isPlaying).toBe(false);
    expect(callbacks.onPlayToggle).toHaveBeenLastCalledWith(false);
  });

  it('tek kare kaldığında silme butonu devre dışı kalır', () => {
    const callbacks = {
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onDuration: vi.fn(),
      onOnionSkin: vi.fn(),
      onPlayToggle: vi.fn(),
    };
    const panel = new FramePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setFrames(1, 0, 120, () => null);

    const buttons = panel.element.querySelectorAll('.panel-section__actions button');
    expect((buttons[3] as HTMLButtonElement).disabled).toBe(true);
  });

  it('süre ve onion skin değişimlerini commit eder', () => {
    const callbacks = {
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onDuration: vi.fn(),
      onOnionSkin: vi.fn(),
      onPlayToggle: vi.fn(),
    };
    const panel = new FramePanel({ t: translate, ...callbacks });
    document.body.appendChild(panel.element);
    panel.setFrames(2, 1, 120, () => null);

    const durationInput = panel.element.querySelector<HTMLInputElement>('.vol-stepper__input')!;
    durationInput.value = '200';
    durationInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(callbacks.onDuration).toHaveBeenCalledWith(1, 200);

    const onionInput = panel.element.querySelector<HTMLInputElement>('.vol-slider__input')!;
    onionInput.value = '2';
    onionInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(callbacks.onOnionSkin).toHaveBeenCalled();
  });

  it('destroy panelleri kaldırır', () => {
    const panel = new FramePanel({
      t: translate,
      onSelect: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onDuration: vi.fn(),
      onOnionSkin: vi.fn(),
      onPlayToggle: vi.fn(),
    });
    document.body.appendChild(panel.element);
    panel.setFrames(2, 0, 120, () => null);

    panel.destroy();
    expect(panel.element.isConnected).toBe(false);
  });
});
