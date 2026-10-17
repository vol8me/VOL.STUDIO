import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FOCUS_MODALITY_ATTR,
  FocusModalityTracker,
  startFocusModality,
  stopFocusModality,
} from '../../../src/ui/focus/focusModality';

const attr = (): string | null => document.documentElement.getAttribute(FOCUS_MODALITY_ATTR);

describe('FocusModalityTracker', () => {
  beforeEach(() => {
    stopFocusModality();
    document.documentElement.removeAttribute(FOCUS_MODALITY_ATTR);
  });
  afterEach(() => stopFocusModality());

  it('hiçbir girdi yokken sessizdir: fareyle açılan menüde programatik odak halka çizmez', () => {
    startFocusModality();
    expect(attr()).toBe('quiet');
  });

  it('başlangıç kipi verilince (Deck, kol) halka ilk kareden açıktır', () => {
    startFocusModality({ initial: 'ring' });
    expect(attr()).toBe('ring');
  });

  it('gezinti tuşu halkayı açar, fare ve dokunma kapatır; sıradan tuş (WASD) dokunmaz', () => {
    startFocusModality();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(attr()).toBe('quiet');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(attr()).toBe('ring');
    document.dispatchEvent(new Event('pointerdown'));
    expect(attr()).toBe('quiet');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(attr()).toBe('ring');
    const move = new Event('pointermove');
    Object.defineProperty(move, 'pointerType', { value: 'touch' });
    document.dispatchEvent(move);
    expect(attr()).toBe('quiet');
  });

  it('kısayol tuşu (Ctrl+Tab) halka açmaz', () => {
    startFocusModality();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }));
    expect(attr()).toBe('quiet');
  });

  it('basılı kol düğmesi ya da kol çubuğu halkayı açar', async () => {
    let pressed = false;
    const tracker = new FocusModalityTracker({
      getGamepads: () => [{ buttons: [{ pressed }], axes: [0, 0] }],
    });
    expect(tracker.modality).toBe('quiet');
    pressed = true;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(tracker.modality).toBe('ring');
    tracker.destroy();
    expect(attr()).toBeNull();
  });

  it('ikinci başlatma mevcut izleyiciyi döner ve başlangıç kipini değiştirmez', () => {
    const first = startFocusModality({ initial: 'ring' });
    const second = startFocusModality({ initial: 'quiet' });
    expect(second).toBe(first);
    expect(attr()).toBe('ring');
  });

  it('durdurma özniteliği söker ve sonraki başlatma yeni izleyici kurar', () => {
    const first = startFocusModality({ initial: 'ring' });
    stopFocusModality();
    expect(attr()).toBeNull();
    const next = startFocusModality({ initial: 'quiet' });
    expect(next).not.toBe(first);
    expect(attr()).toBe('quiet');
  });
});
