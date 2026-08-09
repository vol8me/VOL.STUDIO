import { describe, it, expect, vi, afterEach } from 'vitest';
import { Carousel, type CarouselSlide } from '../../src/ui/controls/Carousel';
import { ChargeButton } from '../../src/ui/controls/ChargeButton';
import { DPad } from '../../src/ui/controls/DPad';
import { DirectionButton } from '../../src/ui/controls/DirectionButton';
import { DualAxisScrollPanel } from '../../src/ui/controls/DualAxisScrollPanel';
import { PauseResumeButton } from '../../src/ui/controls/PauseResumeButton';
import { PullToRefresh } from '../../src/ui/controls/PullToRefresh';
import { RadialMenu } from '../../src/ui/controls/RadialMenu';
import { SwipeableCardStack } from '../../src/ui/controls/SwipeableCardStack';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function pointerEvent(
  type: string,
  init: Partial<PointerEventInit> & { pointerId: number; clientX: number; clientY: number },
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

describe('DirectionButton', () => {
  it('press/release döngüsünde doğru sırayla tetiklenir', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const button = track(
      new DirectionButton({ label: 'Sağa Git', arrow: 'right', onPress, onRelease }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(true);
    expect(button.element.classList.contains('vol-direction-button--pressed')).toBe(true);

    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.isPressed()).toBe(false);
  });

  it('setDisabled(true) basılıyken çağrılırsa bırakılmış sayılır', () => {
    const onRelease = vi.fn();
    const button = track(new DirectionButton({ label: 'Zıpla', onRelease }));

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(button.isPressed()).toBe(true);

    button.setDisabled(true);
    expect(button.isPressed()).toBe(false);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(button.element.disabled).toBe(true);
  });

  it('arrow verilmezse ok ikonu, icon verilirse icon render edilir', () => {
    const withArrow = track(new DirectionButton({ label: 'Yukarı', arrow: 'up' }));
    expect(withArrow.element.querySelector('svg')).not.toBeNull();

    const icon = document.createElement('span');
    icon.textContent = 'X';
    const withIcon = track(new DirectionButton({ label: 'Özel', icon }));
    expect(withIcon.element.querySelector('.vol-direction-button__icon')?.textContent).toBe('X');
  });

  it('destroy pointer listenerlarını temizler', () => {
    const button = track(new DirectionButton({ label: 'Sol' }));
    const removeListener = vi.spyOn(button.element, 'removeEventListener');
    button.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('DPad', () => {
  it('her yön bağımsız çalışır, çoklu dokunma (aynı anda iki yön) desteklenir', () => {
    const onDirectionDown = vi.fn();
    const onDirectionUp = vi.fn();
    const dpad = track(new DPad({ onDirectionDown, onDirectionUp }));

    const upButton = dpad.element.querySelector<HTMLButtonElement>('.vol-dpad__slot--up')!;
    const rightButton = dpad.element.querySelector<HTMLButtonElement>('.vol-dpad__slot--right')!;

    upButton.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    rightButton.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 2, clientX: 10, clientY: 0 }),
    );

    expect(onDirectionDown).toHaveBeenCalledWith('up');
    expect(onDirectionDown).toHaveBeenCalledWith('right');
    expect(dpad.getActiveDirections().sort()).toEqual(['right', 'up']);

    upButton.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }));
    expect(onDirectionUp).toHaveBeenCalledWith('up');
    expect(dpad.isPressed('up')).toBe(false);
    expect(dpad.isPressed('right')).toBe(true);
  });

  it("destroy tüm alt DirectionButton'ları yok eder", () => {
    const dpad = new DPad();
    const buttons = Array.from(dpad.element.querySelectorAll('button'));
    expect(buttons.length).toBe(4);

    dpad.destroy();
    for (const button of buttons) {
      expect(button.isConnected).toBe(false);
    }
  });
});

describe('ChargeButton', () => {
  it('tam dolum tamamlanınca onCharged bir kez tetiklenir, sonra bırakınca onRelease(1) çağrılır', () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const onCharged = vi.fn();
    const onRelease = vi.fn();
    const onChargeProgress = vi.fn();
    const button = track(
      new ChargeButton({ chargeDurationMs: 1000, onCharged, onRelease, onChargeProgress }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );

    now = 1000;
    vi.advanceTimersByTime(1000);
    expect(onCharged).toHaveBeenCalledTimes(1);
    expect(button.element.classList.contains('vol-charge-button--full')).toBe(true);

    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(onRelease).toHaveBeenCalledWith(1);
    // Tam dolumda onCharged tetiklendiği için onRelease TEKRAR onCharged'i tetiklemez.
    expect(onCharged).toHaveBeenCalledTimes(1);
  });

  it('allowPartialRelease:true iken erken bırakış o anki oranla onRelease çağırır, onCharged çağrılmaz', () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const onCharged = vi.fn();
    const onRelease = vi.fn();
    const button = track(
      new ChargeButton({ chargeDurationMs: 1000, onCharged, onRelease, allowPartialRelease: true }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    now = 500;
    vi.advanceTimersByTime(500);

    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    expect(onCharged).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledWith(0.5);
  });

  it("allowPartialRelease:false iken erken bırakış onRelease'i TETİKLEMEZ (tümü ya da hiç)", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const onRelease = vi.fn();
    const button = track(
      new ChargeButton({ chargeDurationMs: 1000, onRelease, allowPartialRelease: false }),
    );

    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    now = 300;
    vi.advanceTimersByTime(300);
    button.element.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }),
    );

    expect(onRelease).not.toHaveBeenCalled();
  });

  it("destroy bekleyen rAF'ı iptal eder", () => {
    const button = track(new ChargeButton({}));
    button.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    button.destroy();
    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe('PauseResumeButton', () => {
  it('varsayılan olarak çalışır durumda başlar, tıklayınca duraklatılmış duruma geçer', () => {
    const onToggle = vi.fn();
    const button = track(new PauseResumeButton({ onToggle }));

    expect(button.getIsRunning()).toBe(true);
    expect(button.element.getAttribute('aria-label')).toBe('Duraklat');

    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(button.getIsRunning()).toBe(false);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(button.element.getAttribute('aria-label')).toBe('Devam Et');
  });

  it('startPaused:true ile duraklatılmış başlar', () => {
    const button = track(new PauseResumeButton({ startPaused: true }));
    expect(button.getIsRunning()).toBe(false);
  });

  it('counter:{direction:"up"} her saniye artar, duraklatılınca durur', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const button = track(new PauseResumeButton({ counter: { direction: 'up', onTick } }));

    vi.advanceTimersByTime(3000);
    expect(button.getSeconds()).toBe(3);
    expect(onTick).toHaveBeenCalledTimes(3);

    button.setRunning(false);
    vi.advanceTimersByTime(3000);
    expect(button.getSeconds()).toBe(3); // duraklatılınca sayaç ilerlemedi
  });

  it('counter:{direction:"down"} 0\'a ulaşınca otomatik duraklatır ve onComplete çağrılır', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const button = track(
      new PauseResumeButton({ counter: { direction: 'down', startSeconds: 2, onComplete } }),
    );

    vi.advanceTimersByTime(2000);
    expect(button.getSeconds()).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button.getIsRunning()).toBe(false);
  });

  it('setRunning aynı durumu tekrar set ederse onToggle tetiklenmez', () => {
    const onToggle = vi.fn();
    const button = track(new PauseResumeButton({ onToggle }));
    button.setRunning(true); // zaten true
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("destroy bekleyen interval'i temizler", () => {
    vi.useFakeTimers();
    const button = new PauseResumeButton({ counter: { direction: 'up' } });
    const clearSpy = vi.spyOn(window, 'clearInterval');
    button.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('Carousel', () => {
  function makeSlides(count: number): CarouselSlide[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `s${i}`,
      element: document.createElement('div'),
    }));
  }

  it("goTo aralık dışına taşan index'i en yakın uca kenetler", () => {
    const onSlideChange = vi.fn();
    const carousel = track(new Carousel({ slides: makeSlides(3), onSlideChange }));

    carousel.goTo(10);
    expect(carousel.getCurrentIndex()).toBe(2);
    expect(onSlideChange).toHaveBeenCalledWith(2);

    carousel.goTo(-5);
    expect(carousel.getCurrentIndex()).toBe(0);
  });

  it('ok düğmeleri sayfa değiştirir, dot göstergesi aktif sayfayı işaretler', () => {
    const carousel = track(new Carousel({ slides: makeSlides(3) }));
    const nextArrow = carousel.element.querySelector<HTMLButtonElement>(
      '.vol-carousel__arrow--right',
    )!;

    nextArrow.click();
    expect(carousel.getCurrentIndex()).toBe(1);

    const dots = carousel.element.querySelectorAll('.vol-carousel__dot');
    expect(dots[1].classList.contains('vol-carousel__dot--active')).toBe(true);
    expect(dots[0].classList.contains('vol-carousel__dot--active')).toBe(false);
  });

  it('showArrows:false ve showDots:false ile hiçbir kontrol render edilmez', () => {
    const carousel = track(
      new Carousel({ slides: makeSlides(2), showArrows: false, showDots: false }),
    );
    expect(carousel.element.querySelector('.vol-carousel__arrow')).toBeNull();
    expect(carousel.element.querySelector('.vol-carousel__dots')).toBeNull();
  });

  it('autoPlayIntervalMs verilirse otomatik ilerler ve son slayttan ilk slayta döner', () => {
    vi.useFakeTimers();
    const onSlideChange = vi.fn();
    const carousel = track(
      new Carousel({ slides: makeSlides(2), autoPlayIntervalMs: 1000, onSlideChange }),
    );

    vi.advanceTimersByTime(1000);
    expect(carousel.getCurrentIndex()).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(carousel.getCurrentIndex()).toBe(0); // döngüsel
  });

  it("destroy autoplay timer'ını temizler", () => {
    vi.useFakeTimers();
    const carousel = new Carousel({ slides: makeSlides(2), autoPlayIntervalMs: 500 });
    const clearSpy = vi.spyOn(window, 'clearInterval');
    carousel.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('DualAxisScrollPanel', () => {
  it("sürükleme scrollLeft/scrollTop'ı ters yönde günceller (pan davranışı)", () => {
    const panel = track(new DualAxisScrollPanel({ width: 200, height: 200 }));
    panel.element.scrollLeft = 100;
    panel.element.scrollTop = 100;

    panel.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 }),
    );
    panel.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 30, clientY: 20 }),
    );

    // dx=-20, dy=-30 -> scrollLeft = 100-(-20) = 120, scrollTop = 100-(-30) = 130
    expect(panel.element.scrollLeft).toBe(120);
    expect(panel.element.scrollTop).toBe(130);
  });

  it('add() içerik ekler, clear() temizler', () => {
    const panel = track(new DualAxisScrollPanel());
    const child = document.createElement('div');
    panel.add({ element: child });

    const content = panel.element.querySelector('.vol-dual-scroll__content')!;
    expect(content.contains(child)).toBe(true);

    panel.clear();
    expect(content.children.length).toBe(0);
  });

  it('setContentSize içerik boyutunu ayarlar', () => {
    const panel = track(new DualAxisScrollPanel());
    panel.setContentSize(800, 600);
    const content = panel.element.querySelector<HTMLDivElement>('.vol-dual-scroll__content')!;
    expect(content.style.width).toBe('800px');
    expect(content.style.height).toBe('600px');
  });

  it("farklı pointerId ile hareket pan'ı etkilemez", () => {
    const panel = track(new DualAxisScrollPanel());
    panel.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }),
    );
    panel.element.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 2, clientX: 100, clientY: 100 }),
    );
    expect(panel.element.scrollLeft).toBe(0);
    expect(panel.element.scrollTop).toBe(0);
  });
});

describe('PullToRefresh', () => {
  function buildPanel(onRefresh: () => void | Promise<void>, threshold = 60): PullToRefresh {
    const content = document.createElement('div');
    return new PullToRefresh({ content, onRefresh, threshold });
  }

  it('içerik en üstteyken aşağı çekip eşiği aşınca onRefresh tetiklenir', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const panel = track(buildPanel(onRefresh, 60));
    const scrollArea = panel.element.querySelector<HTMLDivElement>(
      '.vol-pull-refresh__scroll-area',
    )!;

    scrollArea.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    // resisted = sqrt(delta)*6 >= 60 -> delta >= 100
    scrollArea.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 150 }),
    );
    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(true);

    scrollArea.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 150 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("eşik aşılmadan bırakılırsa onRefresh tetiklenmez, idle'a döner", () => {
    const onRefresh = vi.fn();
    const panel = track(buildPanel(onRefresh, 60));
    const scrollArea = panel.element.querySelector<HTMLDivElement>(
      '.vol-pull-refresh__scroll-area',
    )!;

    scrollArea.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    scrollArea.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 10 }),
    );
    scrollArea.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 0, clientY: 10 }));

    expect(onRefresh).not.toHaveBeenCalled();
    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(false);
  });

  it('içerik en üstte değilken (scrollTop > 0) çekme hareketi başlamaz', () => {
    const onRefresh = vi.fn();
    const panel = track(buildPanel(onRefresh, 60));
    const scrollArea = panel.element.querySelector<HTMLDivElement>(
      '.vol-pull-refresh__scroll-area',
    )!;
    Object.defineProperty(scrollArea, 'scrollTop', { value: 50, configurable: true });

    scrollArea.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    scrollArea.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 200 }),
    );

    expect(panel.element.classList.contains('vol-pull-refresh--ready')).toBe(false);
  });

  it('refresh() programatik olarak tetiklenebilir', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const panel = track(buildPanel(onRefresh, 60));

    await panel.refresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(panel.element.classList.contains('vol-pull-refresh--refreshing')).toBe(false);
  });

  it('destroy pointer listenerlarını temizler', () => {
    const panel = new PullToRefresh({ content: document.createElement('div'), onRefresh: vi.fn() });
    const scrollArea = panel.element.querySelector<HTMLDivElement>(
      '.vol-pull-refresh__scroll-area',
    )!;
    const removeListener = vi.spyOn(scrollArea, 'removeEventListener');
    panel.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });
});

describe('RadialMenu', () => {
  function mockCenterRect(menu: RadialMenu, centerX: number, centerY: number, size = 240): void {
    vi.spyOn(menu.element, 'getBoundingClientRect').mockReturnValue({
      left: centerX - size / 2,
      top: centerY - size / 2,
      right: centerX + size / 2,
      bottom: centerY + size / 2,
      width: size,
      height: size,
      x: centerX - size / 2,
      y: centerY - size / 2,
      toJSON: () => ({}),
    });
  }

  it('basılı-tut + sürükle + bırak akışında en yakın item seçilir', () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({
      items: [
        { id: 'sword', label: 'Kılıç' },
        { id: 'shield', label: 'Kalkan' },
        { id: 'potion', label: 'İksir' },
      ],
      onSelect,
    });
    document.body.appendChild(menu.element);
    mockCenterRect(menu, 100, 100);

    menu.open(100, 100, 1);
    // İlk item -90° (yukarı, saat 12) konumunda — merkezin tam üstüne sürükle.
    document.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 50 }),
    );
    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 50 }));

    expect(onSelect).toHaveBeenCalledWith('sword');
    menu.destroy();
  });

  it('deadzone içinde bırakılırsa (hiç sürüklenmeden) HİÇBİR ŞEY seçilmez', () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onSelect,
      deadzone: 24,
    });
    document.body.appendChild(menu.element);
    mockCenterRect(menu, 100, 100);

    menu.open(100, 100, 1);
    document.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 105, clientY: 100 }),
    ); // deadzone (24px) altı
    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 105, clientY: 100 }));

    expect(onSelect).not.toHaveBeenCalled();
    menu.destroy();
  });

  it('kısa bir tıklama (tap, deadzone dışına hiç çıkmadan) menüyü sessizce kapatır', () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({ items: [{ id: 'a', label: 'A' }], onSelect });
    document.body.appendChild(menu.element);
    mockCenterRect(menu, 100, 100);

    menu.open(100, 100, 1);
    expect(menu.element.classList.contains('vol-radial-menu--visible')).toBe(true);

    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu.element.classList.contains('vol-radial-menu--visible')).toBe(false);
    menu.destroy();
  });

  it('disabled item asla hover/seçili olamaz', () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({
      items: [
        { id: 'locked', label: 'Kilitli', disabled: true },
        { id: 'open', label: 'Açık' },
      ],
      onSelect,
    });
    document.body.appendChild(menu.element);
    mockCenterRect(menu, 100, 100);

    menu.open(100, 100, 1);
    // 'locked' -90°'de (yukarı) — o yöne sürüklesek bile disabled olduğu için atlanır.
    document.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 50 }),
    );
    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 50 }));

    expect(onSelect).toHaveBeenCalledWith('open'); // yalnızca açık olan seçilebildi
    menu.destroy();
  });

  it("menüyü açan parmaktan başka bir pointer'ın hareketi hover'ı etkilemez", () => {
    const onSelect = vi.fn();
    const menu = new RadialMenu({
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onSelect,
    });
    document.body.appendChild(menu.element);
    mockCenterRect(menu, 100, 100);

    menu.open(100, 100, 1); // pointerId 1 sahiplendi
    document.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 2, clientX: 100, clientY: 50 }),
    ); // farklı parmak
    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 })); // asıl parmak deadzone içinde bırakır

    expect(onSelect).not.toHaveBeenCalled();
    menu.destroy();
  });

  it('destroy document pointer listenerlarını temizler', () => {
    const menu = new RadialMenu({ items: [{ id: 'a', label: 'A' }], onSelect: vi.fn() });
    const removeListener = vi.spyOn(document, 'removeEventListener');
    menu.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('SwipeableCardStack', () => {
  function makeCards(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      element: document.createElement('div'),
    }));
  }

  it('eşiği aşan sürükleme onSwipe tetikler ve bir sonraki karta geçer', () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(3), onSwipe, swipeThreshold: 100 }),
    );

    const topCardEl = stack.element.querySelector<HTMLDivElement>(
      '.vol-card-stack__card:last-child',
    )!;
    topCardEl.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    topCardEl.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 0 }),
    );
    topCardEl.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 0 }));

    expect(onSwipe).toHaveBeenCalledWith('c0', 'right');
    expect(stack.remaining).toBe(2);

    vi.advanceTimersByTime(200);
  });

  it('eşik altındaki sürükleme kartı geri getirir, onSwipe tetiklenmez', () => {
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), onSwipe, swipeThreshold: 100 }),
    );

    const topCardEl = stack.element.querySelector<HTMLDivElement>(
      '.vol-card-stack__card:last-child',
    )!;
    topCardEl.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    topCardEl.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 30, clientY: 0 }));
    topCardEl.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 30, clientY: 0 }));

    expect(onSwipe).not.toHaveBeenCalled();
    expect(stack.remaining).toBe(2);
  });

  it('showActionButtons:true ile aksiyon düğmeleri de swipeTop ile aynı sonucu üretir', () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(2), onSwipe, showActionButtons: true }),
    );

    const acceptBtn = stack.element.querySelector<HTMLButtonElement>(
      '.vol-card-stack__action--accept',
    )!;
    acceptBtn.click();

    expect(onSwipe).toHaveBeenCalledWith('c0', 'right');
    vi.advanceTimersByTime(200);
  });

  it('son kart da atılınca onEmpty çağrılır', () => {
    vi.useFakeTimers();
    const onEmpty = vi.fn();
    const stack = track(
      new SwipeableCardStack({ cards: makeCards(1), onEmpty, swipeThreshold: 50 }),
    );

    stack.swipeTop('left');
    vi.advanceTimersByTime(200);

    expect(stack.remaining).toBe(0);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('destroy tüm cleanup fonksiyonlarını çalıştırır', () => {
    const stack = new SwipeableCardStack({ cards: makeCards(2) });
    const topCardEl = stack.element.querySelector<HTMLDivElement>(
      '.vol-card-stack__card:last-child',
    )!;
    const removeListener = vi.spyOn(topCardEl, 'removeEventListener');
    stack.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });
});
