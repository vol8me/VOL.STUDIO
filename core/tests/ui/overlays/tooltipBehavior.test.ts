import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichTooltip } from '../../../src/ui/overlays/RichTooltip';
import { Tooltip } from '../../../src/ui/overlays/Tooltip';

/**
 * WCAG 1.4.13 (hover/odak içeriği): kapatılabilir (Esc), üzerine gelinebilir, kalıcı; ekran okuyucu
 * için aria-describedby; kenara taşmaz. Tooltip ve RichTooltip aynı çekirdeği kullanır.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function button(rect: Partial<DOMRect> = {}): HTMLButtonElement {
  const element = document.createElement('button');
  element.getBoundingClientRect = () =>
    ({ left: 100, top: 100, width: 40, height: 20, right: 140, bottom: 120, ...rect }) as DOMRect;
  document.body.append(element);
  return element;
}

const visible = (bubble: Element, cls = 'vol-tooltip--visible'): boolean =>
  bubble.classList.contains(cls);

describe('kapatılabilir (Escape)', () => {
  it('görünen balon Escape ile kapanır ve tuşu yutar (üstteki katman aynı basışla kapanmaz)', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    const later = vi.fn();
    document.addEventListener('keydown', later);
    target.dispatchEvent(new FocusEvent('focus'));
    vi.advanceTimersByTime(1);
    const bubble = document.querySelector('.vol-tooltip')!;
    expect(visible(bubble)).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(visible(bubble)).toBe(false);
    expect(later).not.toHaveBeenCalled();
    document.removeEventListener('keydown', later);
    tooltip.destroy();
  });

  it('görünmezken Escape yutulmaz', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    const later = vi.fn();
    document.addEventListener('keydown', later);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(later).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', later);
    tooltip.destroy();
  });
});

describe('üzerine gelinebilir', () => {
  it('fare hedeften balona geçerken balon kalır; balondan çıkınca kapanır', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(1);
    const bubble = document.querySelector('.vol-tooltip')!;
    target.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(50);
    bubble.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(500);
    expect(visible(bubble)).toBe(true);
    bubble.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    expect(visible(bubble)).toBe(false);
    tooltip.destroy();
  });
});

describe('erişilebilir ad ve yaşam döngüsü', () => {
  it('RichTooltip hedefe aria-describedby bağlar; mevcut açıklama korunur; söküm geri alır', () => {
    const target = button();
    target.setAttribute('aria-describedby', 'mevcut');
    const rich = new RichTooltip(target, { title: 'Kılıç' });
    const tokens = target.getAttribute('aria-describedby')!.split(' ');
    expect(tokens[0]).toBe('mevcut');
    expect(tokens).toHaveLength(2);
    // Balon görünmez ama DOM'dadır: describedby boşa başvurmaz.
    expect(document.getElementById(tokens[1])).not.toBeNull();
    rich.destroy();
    expect(target.getAttribute('aria-describedby')).toBe('mevcut');
  });

  it('söküm görünen balonu kapatır ve belge dinleyicisini bırakmaz', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(new FocusEvent('focus'));
    vi.advanceTimersByTime(1);
    tooltip.destroy();
    expect(remove.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
    expect(document.querySelector('.vol-tooltip')).toBeNull();
  });
});

describe('konum', () => {
  it('RichTooltip iki yönde sınırlanır ve dikeyde yer yoksa karşı tarafa çevrilir', () => {
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true });
    const target = button({ left: 280, top: 10, width: 20, height: 20, right: 300, bottom: 30 });
    const rich = new RichTooltip(target, { title: 'Uzun başlık' }, { delayMs: 0 });
    const bubble = (): HTMLElement => document.querySelector('.vol-rich-tooltip')!;
    target.dispatchEvent(new FocusEvent('focus'));
    // Balon ölçüsü jsdom'da 0; ölçüyü taklit et.
    vi.advanceTimersByTime(1);
    const el = bubble();
    el.getBoundingClientRect = () => ({ width: 120, height: 60 }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    expect(left + 120).toBeLessThanOrEqual(300);
    expect(top).toBeGreaterThanOrEqual(30); // üstte yer yok → hedefin altına çevrildi
    rich.destroy();
  });
});
