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

describe('dokunma: uzun basış balonu açar (hover/odak dokunmada yoktur)', () => {
  const touch = (type: string, init: Partial<PointerEventInit> = {}): PointerEvent =>
    new PointerEvent(type, {
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      bubbles: true,
      clientX: 100,
      clientY: 100,
      ...init,
    });

  it('450 ms basılı tutmak balonu açar; kısa dokunuş açmaz', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    const bubble = document.querySelector('.vol-tooltip')!;
    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(300);
    target.dispatchEvent(touch('pointerup'));
    vi.advanceTimersByTime(600);
    expect(visible(bubble)).toBe(false);

    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(449);
    expect(visible(bubble)).toBe(false);
    vi.advanceTimersByTime(2);
    expect(visible(bubble)).toBe(true);
    tooltip.destroy();
  });

  it('uzun basışın tıklaması yutulur; sonraki normal tıklama geçer', () => {
    const target = button();
    const onClick = vi.fn();
    target.addEventListener('click', onClick);
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(460);
    target.dispatchEvent(touch('pointerup'));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).not.toHaveBeenCalled();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    tooltip.destroy();
  });

  it('tıklama hiç gelmezse yutma bayrağı süre dolunca kalkar', () => {
    const target = button();
    const onClick = vi.fn();
    target.addEventListener('click', onClick);
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(460);
    target.dispatchEvent(touch('pointercancel'));
    vi.advanceTimersByTime(600);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    tooltip.destroy();
  });

  it('parmak kayarsa (kaydırma/sürükleme) basış iptal olur', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    const bubble = document.querySelector('.vol-tooltip')!;
    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(200);
    target.dispatchEvent(touch('pointermove', { clientX: 130 }));
    vi.advanceTimersByTime(600);
    expect(visible(bubble)).toBe(false);
    tooltip.destroy();
  });

  it('fare basışı balonu açmaz; ikinci parmak basışı başlatmaz', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    const bubble = document.querySelector('.vol-tooltip')!;
    target.dispatchEvent(touch('pointerdown', { pointerType: 'mouse' }));
    target.dispatchEvent(touch('pointerdown', { isPrimary: false, pointerId: 2 }));
    vi.advanceTimersByTime(800);
    expect(visible(bubble)).toBe(false);
    tooltip.destroy();
  });

  it('açık balon dışına dokunmak kapatır; hedefe ya da balona dokunmak kapatmaz', () => {
    const target = button();
    const rich = new RichTooltip(target, { title: 'Kilitli', description: 'Önkoşul: Hız' });
    const bubble = document.querySelector('.vol-rich-tooltip')!;
    const outside = document.createElement('div');
    document.body.append(outside);
    rich.show();
    expect(visible(bubble, 'vol-rich-tooltip--visible')).toBe(true);
    bubble.dispatchEvent(touch('pointerdown'));
    target.dispatchEvent(touch('pointerdown'));
    expect(visible(bubble, 'vol-rich-tooltip--visible')).toBe(true);
    outside.dispatchEvent(touch('pointerdown'));
    expect(visible(bubble, 'vol-rich-tooltip--visible')).toBe(false);
    rich.destroy();
  });

  it('show()/hide() gecikmesiz açık yardım eylemidir; Escape kapatır', () => {
    const target = button();
    const tooltip = new Tooltip(target, 'Bilgi');
    const bubble = document.querySelector('.vol-tooltip')!;
    tooltip.show();
    expect(visible(bubble)).toBe(true);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(visible(bubble)).toBe(false);
    tooltip.show();
    tooltip.hide();
    expect(visible(bubble)).toBe(false);
    tooltip.destroy();
  });

  it('söküm bekleyen basışı iptal eder ve açık yutma dinleyicisini bırakır', () => {
    const target = button();
    const onClick = vi.fn();
    target.addEventListener('click', onClick);
    const pending = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(touch('pointerdown'));
    pending.destroy();
    vi.advanceTimersByTime(800);
    expect(document.querySelector('.vol-tooltip')).toBeNull();

    // Uzun basış tamamlandıktan sonra söküm: yutma dinleyicisi kalmaz, tıklama normal akar.
    const held = new Tooltip(target, 'Bilgi', { delayMs: 0 });
    target.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(460);
    held.destroy();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
