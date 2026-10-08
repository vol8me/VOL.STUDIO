import { afterEach, describe, expect, it, vi } from 'vitest';
import { Carousel } from '../../../src/ui/layout/Carousel';

const mounted: Carousel[] = [];

function make(
  count: number,
  options: ConstructorParameters<typeof Carousel>[0] extends infer O ? Partial<O> : never = {},
) {
  const slides = Array.from({ length: count }, (_, index) => {
    const element = document.createElement('div');
    const button = document.createElement('button');
    button.textContent = `slide ${index}`;
    element.appendChild(button);
    return { id: String(index), element };
  });
  const carousel = new Carousel({ slides, ...options });
  document.body.appendChild(carousel.element);
  mounted.push(carousel);
  return carousel;
}

const tabs = (c: Carousel) => [
  ...c.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__dot'),
];
const slidesOf = (c: Carousel) => [
  ...c.element.querySelectorAll<HTMLElement>('.vol-carousel__slide'),
];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Carousel klavye ve okuyucu anlamı', () => {
  it('pasif slaytlar inert ve gizlidir; yalnız aktif slaytın denetimi odaklanabilir', () => {
    const carousel = make(3);
    const slides = slidesOf(carousel);
    expect(slides.map((s) => s.hasAttribute('inert'))).toEqual([false, true, true]);
    expect(slides.map((s) => s.getAttribute('aria-hidden'))).toEqual(['false', 'true', 'true']);
    carousel.goTo(2);
    expect(slides.map((s) => s.hasAttribute('inert'))).toEqual([true, true, false]);
  });

  it('noktalar gezici odaklı sekmedir; sekme ↔ slayt bağı çift yönlüdür', () => {
    const carousel = make(3);
    const dots = tabs(carousel);
    expect(dots.map((d) => d.tabIndex)).toEqual([0, -1, -1]);
    const slides = slidesOf(carousel);
    expect(slides[1].getAttribute('role')).toBe('tabpanel');
    expect(slides[1].getAttribute('aria-labelledby')).toBe(dots[1].id);
    expect(dots[1].getAttribute('aria-controls')).toBe(slides[1].id);
  });

  it('ok tuşları, Home ve End sayfa değiştirir ve odağı taşır; uçlarda kenetlenir', () => {
    const onSlideChange = vi.fn();
    const carousel = make(3, { onSlideChange });
    const dots = tabs(carousel);
    dots[0].focus();
    const press = (key: string) =>
      dots[0].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('ArrowRight');
    expect(carousel.getCurrentIndex()).toBe(1);
    expect(document.activeElement).toBe(dots[1]);
    press('End');
    expect(carousel.getCurrentIndex()).toBe(2);
    press('ArrowRight');
    expect(carousel.getCurrentIndex()).toBe(2);
    press('Home');
    expect(carousel.getCurrentIndex()).toBe(0);
    press('a');
    // aynı sayfaya geçiş değişiklik sayılmaz: yalnız 3 gerçek geçiş
    expect(onSlideChange).toHaveBeenCalledTimes(3);
    expect(dots.map((d) => d.tabIndex)).toEqual([0, -1, -1]);
  });

  it('noktasız taşıyıcıda slaytlar etiketli gruptur', () => {
    const carousel = make(2, { showDots: false });
    const slide = slidesOf(carousel)[1];
    expect(slide.getAttribute('role')).toBe('group');
    expect(slide.getAttribute('aria-label')).toBeTruthy();
  });

  it('uç sayfada ok düğmesi aria-disabled olur', () => {
    const carousel = make(2);
    const prev = carousel.element.querySelector('.vol-carousel__arrow--left')!;
    const next = carousel.element.querySelector('.vol-carousel__arrow--right')!;
    expect([prev.getAttribute('aria-disabled'), next.getAttribute('aria-disabled')]).toEqual([
      'true',
      'false',
    ]);
    carousel.goTo(1);
    expect([prev.getAttribute('aria-disabled'), next.getAttribute('aria-disabled')]).toEqual([
      'false',
      'true',
    ]);
  });

  it('slayt içindeki düğmeye basmak sürükleme başlatmaz (tıklama çalınmaz)', () => {
    const carousel = make(2);
    const viewport = carousel.element.querySelector<HTMLDivElement>('.vol-carousel__viewport')!;
    viewport.setPointerCapture = vi.fn();
    const button = slidesOf(carousel)[0].querySelector('button')!;
    button.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 5 }),
    );
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
  });

  it('odak içerideyken otomatik geçiş durur, dışarı çıkınca sürer', () => {
    vi.useFakeTimers();
    const carousel = make(3, { autoPlayIntervalMs: 100 });
    tabs(carousel)[0].focus();
    vi.advanceTimersByTime(350);
    expect(carousel.getCurrentIndex()).toBe(0);
    tabs(carousel)[0].blur();
    vi.advanceTimersByTime(100);
    expect(carousel.getCurrentIndex()).toBe(1);
  });

  it('azaltılmış harekette otomatik geçiş hiç başlamaz', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const carousel = make(2, { autoPlayIntervalMs: 50 });
    vi.advanceTimersByTime(500);
    expect(carousel.getCurrentIndex()).toBe(0);
    vi.unstubAllGlobals();
  });
});
