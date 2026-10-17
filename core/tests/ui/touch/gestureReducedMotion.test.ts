import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargeButton } from '../../../src/ui/buttons/ChargeButton';
import { LongPressButton } from '../../../src/ui/buttons/LongPressButton';
import { PullToRefresh } from '../../../src/ui/touch/PullToRefresh';
import { SwipeGestureZone } from '../../../src/ui/touch/SwipeGestureZone';

/**
 * Jest süresi hareket azaltmada bozulmaz (UI-10.1). Dokunma jestleri (uzun bas, şarj, kaydırma, çekip yenile)
 * İŞLEVSEL zamanlayıcıdır: süre ve eşik zaman damgasından/zamanlayıcıdan gelir, CSS animasyon/geçiş olayından değil.
 * `prefers-reduced-motion: reduce` altında bu olaylar hiç ateşlenmeyebilir; bir jest onları beklerse takılırdı. İki
 * yönlü kanıt: (1) hareket azaltma AÇIKKEN her jest aynı süre ve eşikle tamamlanır, (2) kaynak animasyon olayı ya da
 * `matchMedia` okumaz (gelecekteki bir değişiklik jesti harekete bağlarsa test kırılır).
 */
const REDUCE = '(prefers-reduced-motion: reduce)';

const press = (element: Element, type: string, init: PointerEventInit = {}): void => {
  element.dispatchEvent(
    new PointerEvent(type, {
      isPrimary: true,
      pointerId: 1,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === REDUCE,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('hareket azaltma AÇIKKEN jestler aynı süre ve eşikle tamamlanır', () => {
  it('ortam gerçekten hareket azaltmada', () => {
    expect(matchMedia(REDUCE).matches).toBe(true);
  });

  it('LongPressButton: eşikten önce bırakış dokunuştur, eşikte uzun basıştır', () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const button = new LongPressButton({
      label: 'Yetenek',
      longPressDurationMs: 600,
      onTap,
      onLongPress,
    });
    document.body.append(button.element);

    press(button.element, 'pointerdown');
    vi.advanceTimersByTime(599);
    expect(onLongPress).not.toHaveBeenCalled();
    press(button.element, 'pointerup');
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();

    press(button.element, 'pointerdown', { pointerId: 2 });
    vi.advanceTimersByTime(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    press(button.element, 'pointerup', { pointerId: 2 });
    expect(onTap).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it('ChargeButton: doluluk geçen süreyle artar ve tam dolumda onCharged gelir', () => {
    const onCharged = vi.fn();
    const onChargeProgress = vi.fn();
    const button = new ChargeButton({
      label: 'Yay',
      chargeDurationMs: 1000,
      onCharged,
      onChargeProgress,
    });
    document.body.append(button.element);

    press(button.element, 'pointerdown');
    vi.advanceTimersByTime(500);
    const half = onChargeProgress.mock.calls.at(-1)?.[0] as number;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    expect(onCharged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(onCharged).toHaveBeenCalledTimes(1);
    press(button.element, 'pointerup');
    button.destroy();
  });

  it('SwipeGestureZone: mesafe eşiği aşılınca yön ve mesafe bildirilir', () => {
    const onSwipe = vi.fn();
    const zone = new SwipeGestureZone({ threshold: 40, onSwipe });
    document.body.append(zone.element);

    press(zone.element, 'pointerdown', { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(200);
    press(zone.element, 'pointermove', { clientX: 70, clientY: 12 });
    press(zone.element, 'pointerup', { clientX: 70, clientY: 12 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe.mock.calls[0][0]).toMatchObject({ direction: 'right', distance: 60 });

    // Eşiğin altındaki yavaş sürükleme swipe değildir (hareket azaltma eşiği gevşetmez).
    onSwipe.mockClear();
    press(zone.element, 'pointerdown', { pointerId: 2, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(400);
    press(zone.element, 'pointermove', { pointerId: 2, clientX: 30, clientY: 10 });
    vi.advanceTimersByTime(400);
    press(zone.element, 'pointerup', { pointerId: 2, clientX: 30, clientY: 10 });
    expect(onSwipe).not.toHaveBeenCalled();
    zone.destroy();
  });

  it('PullToRefresh: eşik aşılıp bırakılınca yenileme çağrılır', () => {
    const onRefresh = vi.fn();
    const content = document.createElement('div');
    const panel = new PullToRefresh({ content, threshold: 60, onRefresh });
    document.body.append(panel.element);
    const area = panel.element.querySelector<HTMLElement>('.vol-pull-refresh__scroll-area')!;

    press(area, 'pointerdown', { clientY: 0 });
    press(area, 'pointermove', { clientY: 150 });
    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(true);
    press(area, 'pointerup', { clientY: 150 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    panel.destroy();
  });
});

describe('kaynak jesti hareketten bağımsız tutar', () => {
  const sources = [
    ...readdirSync(resolve(__dirname, '../../../src/ui/touch'))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `src/ui/touch/${file}`),
    'src/ui/buttons/LongPressButton.ts',
    'src/ui/buttons/ChargeButton.ts',
    'src/ui/buttons/HoldButton.ts',
  ];

  it.each(sources)('%s animasyon/geçiş olayı beklemez ve matchMedia okumaz', (file) => {
    const source = readFileSync(resolve(__dirname, '../../..', file), 'utf8');
    expect(source).not.toMatch(/['"](?:animationend|transitionend)['"]/);
    expect(source).not.toMatch(/matchMedia|prefers-reduced-motion/);
  });
});
