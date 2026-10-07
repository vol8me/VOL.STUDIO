import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JUICE_KINDS, playJuice } from '../../../src/ui/motion/juice';

describe('playJuice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const make = (): HTMLElement => {
    const element = document.createElement('div');
    document.body.append(element);
    return element;
  };

  it('her tür kendi sınıfını ekler ve emniyet payı sonunda kaldırır', () => {
    for (const kind of JUICE_KINDS) {
      const element = make();
      playJuice(element, kind);
      expect(element.classList.contains(`vol-juice--${kind}`), kind).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(element.classList.contains(`vol-juice--${kind}`), kind).toBe(false);
    }
  });

  it('animasyon bitince sınıf hemen kalkar; alt elemanın bitişi etkiyi bitirmez', () => {
    const element = make();
    const child = document.createElement('span');
    element.append(child);
    playJuice(element, 'pop');
    child.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(element.classList.contains('vol-juice--pop')).toBe(true);
    element.dispatchEvent(new Event('animationend'));
    expect(element.classList.contains('vol-juice--pop')).toBe(false);
  });

  it('yeni etki öncekini değiştirir; aynı etki yeniden başlar ve eski zamanlayıcı yenisini kesmez', () => {
    const element = make();
    playJuice(element, 'pop');
    playJuice(element, 'flash');
    expect(element.classList.contains('vol-juice--pop')).toBe(false);
    expect(element.classList.contains('vol-juice--flash')).toBe(true);
    vi.advanceTimersByTime(100);
    playJuice(element, 'flash');
    vi.advanceTimersByTime(150);
    // İlk çağrının zamanlayıcısı (140+100 ms) dolsa da ikinci etki hâlâ sürer.
    expect(element.classList.contains('vol-juice--flash')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(element.classList.contains('vol-juice--flash')).toBe(false);
  });
});
