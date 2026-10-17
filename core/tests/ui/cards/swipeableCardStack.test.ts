/**
 * SwipeableCardStack alternatifleri ve sağlamlığı (UI-04.3): sürükleme tek yol değildir (düğmeler, düğmesiz
 * modda odaktaki yığın + oklar), karar niyetleri, yakalama kaybı/ikinci işaretçi, azaltılmış hareket ve
 * odaktan bağımsız duyuru. Eşik/geri dönüş temel testleri `touchControls.test.ts`te.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { SwipeableCardStack } from '../../../src/ui/cards/SwipeableCardStack';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { UI_TIMING } from '../../../src/constants';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

function makeCards(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    label: `Görev ${i}`,
    element: document.createElement('div'),
  }));
}

function pointer(
  type: string,
  init: Partial<PointerEventInit> & { pointerId?: number; clientX?: number },
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
    ...init,
  });
}

function topCard(stack: SwipeableCardStack): HTMLDivElement {
  return stack.element.querySelector<HTMLDivElement>('.vol-card-stack__card:last-child')!;
}

function key(target: HTMLElement, value: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('klavye alternatifi', () => {
  it('düğmesiz modda yığın odaklanabilir ve sol/sağ ok fiziksel yönde karar verir', () => {
    const onSwipe = vi.fn();
    const stack = track(new SwipeableCardStack({ cards: makeCards(3), onSwipe }));
    document.body.append(stack.element);
    const area = stack.element.querySelector<HTMLElement>('.vol-card-stack__stack')!;
    expect(area.tabIndex).toBe(0);
    expect(area.getAttribute('role')).toBe('group');
    expect(area.getAttribute('aria-label')).toBe(i18next.t('core:swipe.stack'));
    expect(area.getAttribute('aria-keyshortcuts')).toBe('ArrowLeft ArrowRight');

    expect(key(area, 'ArrowRight').defaultPrevented).toBe(true);
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    key(area, 'ArrowLeft');
    expect(onSwipe.mock.calls).toEqual([
      ['c0', 'right'],
      ['c1', 'left'],
    ]);
  });

  it('değiştirici tuşlu oklar, başka tuşlar ve başka hedeften gelen olaylar karar vermez', () => {
    const onSwipe = vi.fn();
    const stack = track(new SwipeableCardStack({ cards: makeCards(2), onSwipe }));
    document.body.append(stack.element);
    const area = stack.element.querySelector<HTMLElement>('.vol-card-stack__stack')!;
    key(area, 'ArrowRight', { ctrlKey: true });
    key(area, 'ArrowRight', { altKey: true });
    key(area, 'Enter');
    key(topCard(stack), 'ArrowRight');
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('deste boşalınca yığın sekme sırasından çıkar', () => {
    const stack = track(new SwipeableCardStack({ cards: makeCards(1) }));
    document.body.append(stack.element);
    const area = stack.element.querySelector<HTMLElement>('.vol-card-stack__stack')!;
    key(area, 'ArrowLeft');
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    expect(stack.remaining).toBe(0);
    expect(area.tabIndex).toBe(-1);
  });

  it('düğmeli modda yığın ek bir sekme durağı olmaz ve oklar karar vermez', () => {
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), onSwipe, showActionButtons: true }),
    );
    document.body.append(stack.element);
    const area = stack.element.querySelector<HTMLElement>('.vol-card-stack__stack')!;
    expect(area.hasAttribute('tabindex')).toBe(false);
    key(area, 'ArrowRight');
    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe('okuyucu duyurusu (opt-in) odaktan bağımsızdır', () => {
  const region = (stack: SwipeableCardStack): HTMLElement | null =>
    stack.element.querySelector<HTMLElement>('[role="status"]');

  it('varsayılan kapalı: DOM’a canlı bölge eklenmez', () => {
    const stack = track(new SwipeableCardStack({ cards: makeCards(1) }));
    expect(region(stack)).toBeNull();
  });

  it('karar ve kalan sayı bölgeye yazılır; odak düğmede kalır', () => {
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), showActionButtons: true, announce: true }),
    );
    document.body.append(stack.element);
    const live = region(stack)!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('aria-atomic')).toBe('true');
    const accept = stack.element.querySelector<HTMLButtonElement>(
      '.vol-card-stack__action--accept',
    )!;
    accept.focus();
    accept.click();
    expect(live.textContent).toBe(
      `${i18next.t('core:swipe.accepted', { label: 'Görev 0' })}. ${i18next.t('core:swipe.remaining', { count: 1 })}`,
    );
    expect(document.activeElement).toBe(accept);
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    accept.click();
    expect(live.textContent).toBe(
      `${i18next.t('core:swipe.accepted', { label: 'Görev 1' })}. ${i18next.t('core:swipe.done')}`,
    );
  });

  it('ret de duyurulur', () => {
    const stack = track(new SwipeableCardStack({ cards: makeCards(2), announce: true }));
    stack.swipeTop('left');
    expect(region(stack)!.textContent).toContain(
      i18next.t('core:swipe.rejected', { label: 'Görev 0' }),
    );
  });
});

describe('karar niyetleri', () => {
  function withBus(cards = makeCards(3), options = {}) {
    const root = document.createElement('div');
    document.body.append(root);
    const { bus, release } = uiIntentBusFor(root);
    const seen: UiIntent[] = [];
    bus.subscribe({ onIntent: (intent) => seen.push(intent) });
    const stack = track(new SwipeableCardStack({ cards, ...options }));
    root.append(stack.element);
    const names = (): string[] => seen.map((intent) => `${intent.origin}:${intent.kind}`);
    return { stack, names, release };
  }

  it('kabul sürüklemesi tek "pick" (sürükleme başlayınca) ve tek "confirm" üretir', () => {
    const { stack, names, release } = withBus(makeCards(2), { swipeThreshold: 100 });
    const card = topCard(stack);
    card.dispatchEvent(pointer('pointerdown', {}));
    card.dispatchEvent(pointer('pointermove', { clientX: 10 }));
    expect(names(), 'ipucu eşiği altında niyet yok').toEqual([]);
    card.dispatchEvent(pointer('pointermove', { clientX: 60 }));
    card.dispatchEvent(pointer('pointermove', { clientX: 140 }));
    card.dispatchEvent(pointer('pointerup', { clientX: 140 }));
    expect(names()).toEqual(['SwipeableCardStack:pick', 'SwipeableCardStack:confirm']);
    release();
  });

  it('ret düğmesi tek "cancel" üretir; programatik swipeTop sessizdir', () => {
    const { stack, names, release } = withBus(makeCards(3), { showActionButtons: true });
    stack.element.querySelector<HTMLButtonElement>('.vol-card-stack__action--reject')!.click();
    expect(names()).toEqual(['SwipeableCardStack:cancel']);
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    stack.swipeTop('right');
    expect(names()).toEqual(['SwipeableCardStack:cancel']);
    release();
  });

  it('eşik altı sürükleme "pick" üretir ama karar vermez; geri dönüş niyeti yoktur', () => {
    const { stack, names, release } = withBus(makeCards(2), { swipeThreshold: 100 });
    const card = topCard(stack);
    card.dispatchEvent(pointer('pointerdown', {}));
    card.dispatchEvent(pointer('pointermove', { clientX: 40 }));
    card.dispatchEvent(pointer('pointerup', { clientX: 40 }));
    expect(names()).toEqual(['SwipeableCardStack:pick']);
    expect(stack.remaining).toBe(2);
    release();
  });
});

describe('işaretçi sağlamlığı', () => {
  it('yakalama kaybı kararı vermez, kartı geri getirir ve sürüklemeyi takılı bırakmaz', () => {
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), onSwipe, swipeThreshold: 100 }),
    );
    const card = topCard(stack);
    card.dispatchEvent(pointer('pointerdown', {}));
    card.dispatchEvent(pointer('pointermove', { clientX: 150 }));
    expect(card.style.transform).not.toBe('');
    card.dispatchEvent(pointer('lostpointercapture', { clientX: 150 }));
    expect(onSwipe).not.toHaveBeenCalled();
    expect(card.style.transform).toBe('');
    expect(card.classList.contains('vol-card-stack__card--dragging')).toBe(false);

    card.dispatchEvent(pointer('pointerdown', {}));
    card.dispatchEvent(pointer('pointermove', { clientX: 150 }));
    card.dispatchEvent(pointer('pointerup', { clientX: 150 }));
    expect(onSwipe).toHaveBeenCalledWith('c0', 'right');
  });

  it('ikinci parmak sürüklemeyi çalmaz; fare ek düğmesi sürüklemez', () => {
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), onSwipe, swipeThreshold: 100 }),
    );
    const card = topCard(stack);
    card.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
    card.dispatchEvent(pointer('pointerdown', { pointerId: 2, clientX: 500 }));
    card.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 900 }));
    card.dispatchEvent(pointer('pointerup', { pointerId: 2, clientX: 900 }));
    expect(onSwipe).not.toHaveBeenCalled();
    card.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 150 }));
    card.dispatchEvent(pointer('pointerup', { pointerId: 1, clientX: 150 }));
    expect(onSwipe).toHaveBeenCalledWith('c0', 'right');

    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    const next = topCard(stack);
    next.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', button: 2 }));
    expect(next.classList.contains('vol-card-stack__card--dragging')).toBe(false);
  });
});

describe('azaltılmış hareket', () => {
  function reduceMotion(matches: boolean): void {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: matches && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('uçuş yok, deste hemen yeniden çizilir; karar ve kalan sayı aynıdır', () => {
    const results: Array<[string, string, number]> = [];
    for (const reduce of [false, true]) {
      reduceMotion(reduce);
      const onSwipe = vi.fn();
      const stack = new SwipeableCardStack({ cards: makeCards(3), onSwipe });
      const card = topCard(stack);
      stack.swipeTop('right');
      expect(card.classList.contains('vol-card-stack__card--flying'), `uçuş (${reduce})`).toBe(
        !reduce,
      );
      vi.advanceTimersByTime(reduce ? 0 : UI_TIMING.CARD_FLY_ANIMATION_MS);
      results.push([onSwipe.mock.calls[0].join(), String(stack.remaining), stack.remaining]);
      stack.destroy();
    }
    expect(results[1]).toEqual(results[0]);
  });
});

describe('odak sürekliliği', () => {
  it('uçuş sırasında düğmeler disabled değil aria-disabled olur: odak kararlar arasında kaybolmaz', () => {
    const stack = track(new SwipeableCardStack({ cards: makeCards(3), showActionButtons: true }));
    document.body.append(stack.element);
    const accept = stack.element.querySelector<HTMLButtonElement>(
      '.vol-card-stack__action--accept',
    )!;
    accept.focus();
    accept.click();
    expect(accept.disabled, 'tarayıcı odaktaki disabled düğmeyi bulandırır').toBe(false);
    expect(accept.getAttribute('aria-disabled')).toBe('true');
    accept.click();
    expect(stack.remaining, 'uçuş sırasında ikinci tıklama karar vermez').toBe(2);
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    expect(accept.hasAttribute('aria-disabled')).toBe(false);
    expect(document.activeElement).toBe(accept);
  });

  it('deste bitince düğmeler kalıcı disabled olur ve odak yığına alınır', () => {
    const stack = track(new SwipeableCardStack({ cards: makeCards(1), showActionButtons: true }));
    document.body.append(stack.element);
    const accept = stack.element.querySelector<HTMLButtonElement>(
      '.vol-card-stack__action--accept',
    )!;
    accept.focus();
    accept.click();
    vi.advanceTimersByTime(UI_TIMING.CARD_FLY_ANIMATION_MS);
    expect(accept.disabled).toBe(true);
    expect(accept.hasAttribute('aria-disabled')).toBe(false);
    expect(document.activeElement).toBe(stack.element.querySelector('.vol-card-stack__stack'));
  });
});
