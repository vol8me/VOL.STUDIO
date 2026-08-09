import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  LoadingScreen,
  type LoadingScreenOptions,
  type LoadingIndicatorType,
  type LoadingContentPosition,
} from '../../src/ui/overlays/LoadingScreen';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

const rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
});
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  rafQueue.length = 0;
  document.body.innerHTML = '';
});

function flushRaf(): void {
  while (rafQueue.length > 0) {
    const cb = rafQueue.shift()!;
    cb(performance.now());
  }
}

function createLoading(options?: LoadingScreenOptions): LoadingScreen {
  const loading = new LoadingScreen(options);
  document.body.appendChild(loading.element);
  return track(loading);
}

describe('LoadingScreen — constructor & DOM yapısı', () => {
  it('varsayılan class ve transition tipini uygular', () => {
    const loading = createLoading();
    expect(loading.element.className).toContain('vol-loading');
    expect(loading.element.className).toContain('vol-loading--fade');
  });

  it('her indicator tipi için doğru class ekler', () => {
    const types: LoadingIndicatorType[] = [
      'orbital-rings',
      'energy-core',
      'particle-orbit',
      'hexagon-pulse',
      'bar',
    ];
    for (const type of types) {
      const loading = createLoading({ indicator: { type } });
      const indicator = loading.element.querySelector('.vol-loading__indicator');
      const classMap: Record<LoadingIndicatorType, string> = {
        'orbital-rings': 'vol-loading__indicator--orbital',
        'energy-core': 'vol-loading__indicator--energy',
        'particle-orbit': 'vol-loading__indicator--particle',
        'hexagon-pulse': 'vol-loading__indicator--hexagon',
        bar: 'vol-loading__indicator--bar',
      };
      expect(indicator?.classList.contains(classMap[type])).toBe(true);
    }
  });

  it('transition tipi slide/zoom için doğru class ekler', () => {
    const slide = createLoading({ transitionType: 'slide' });
    expect(slide.element.className).toContain('vol-loading--slide');

    const zoom = createLoading({ transitionType: 'zoom' });
    expect(zoom.element.className).toContain('vol-loading--zoom');
  });

  it('title verildiğinde .vol-loading__title elementi oluşur', () => {
    const loading = createLoading({ title: 'Yükleniyor' });
    const titleEl = loading.element.querySelector('.vol-loading__title');
    expect(titleEl?.textContent).toBe('Yükleniyor');
  });

  it('title verilmediğinde .vol-loading__title elementi oluşmaz', () => {
    const loading = createLoading();
    expect(loading.element.querySelector('.vol-loading__title')).toBeNull();
  });

  it('subtitle verildiğinde .vol-loading__subtitle elementi oluşur', () => {
    const loading = createLoading({ subtitle: 'Varlıklar hazırlanıyor' });
    expect(loading.element.querySelector('.vol-loading__subtitle')?.textContent).toBe(
      'Varlıklar hazırlanıyor',
    );
  });

  it('showPercent true ise yüzde elementi oluşur ve 0% başlar', () => {
    const loading = createLoading({ showPercent: true });
    const percentEl = loading.element.querySelector('.vol-loading__percent');
    expect(percentEl?.textContent).toBe('0%');
  });

  it('showPercent false ise yüzde elementi oluşmaz', () => {
    const loading = createLoading({ showPercent: false });
    expect(loading.element.querySelector('.vol-loading__percent')).toBeNull();
  });

  it('customElement verildiğinde type göz ardı edilir, element gösterge alanına eklenir', () => {
    const custom = document.createElement('div');
    custom.className = 'my-custom-indicator';
    const loading = createLoading({
      indicator: { type: 'orbital-rings', customElement: custom },
    });
    const indicator = loading.element.querySelector('.vol-loading__indicator');
    expect(indicator?.querySelector('.my-custom-indicator')).not.toBeNull();
    // orbital-rings class eklenmemeli
    expect(indicator?.classList.contains('vol-loading__indicator--orbital')).toBe(false);
  });
});

describe('LoadingScreen — ARIA & erişilebilirlik', () => {
  it('role="status" ve aria-live="polite" atanır', () => {
    const loading = createLoading();
    expect(loading.element.getAttribute('role')).toBe('status');
    expect(loading.element.getAttribute('aria-live')).toBe('polite');
  });

  it('aria-busy başlangıçta true', () => {
    const loading = createLoading();
    expect(loading.element.getAttribute('aria-busy')).toBe('true');
  });

  it('title verildiğinde aria-label olarak atanır', () => {
    const loading = createLoading({ title: 'Dünya Yükleniyor' });
    expect(loading.element.getAttribute('aria-label')).toBe('Dünya Yükleniyor');
  });

  it('title verilmediğinde aria-label atanmaz', () => {
    const loading = createLoading();
    expect(loading.element.getAttribute('aria-label')).toBeNull();
  });

  it('hide sonrası aria-busy false olur', () => {
    const loading = createLoading({ minDisplayMs: 0 });
    loading.show();
    loading.hide();
    expect(loading.element.getAttribute('aria-busy')).toBe('false');
  });
});

describe('LoadingScreen — show/hide lifecycle', () => {
  it('show() vol-loading--enter class ekler', () => {
    const loading = createLoading();
    loading.show();

    expect(loading.element.classList.contains('vol-loading--enter')).toBe(true);
  });

  it('hide() minDisplayMs dolmadan performHide erteler', () => {
    const loading = createLoading({ minDisplayMs: 2000 });
    loading.show();
    loading.hide();

    // Henüz exit class olmamalı
    expect(loading.element.classList.contains('vol-loading--exit')).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(loading.element.classList.contains('vol-loading--exit')).toBe(true);
  });

  it('hide() minDisplayMs dolduysa hemen performHide uygular', () => {
    const loading = createLoading({ minDisplayMs: 0 });
    loading.show();
    loading.hide();

    expect(loading.element.classList.contains('vol-loading--exit')).toBe(true);
  });

  it('onComplete, transitionMs sonunda çağrılır', () => {
    const onComplete = vi.fn();
    const loading = createLoading({ minDisplayMs: 0, transitionMs: 400, onComplete });
    loading.show();
    loading.hide();

    vi.advanceTimersByTime(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('çift hide() onComplete i yalnızca bir kez çağırır', () => {
    const onComplete = vi.fn();
    const loading = createLoading({ minDisplayMs: 100, transitionMs: 200, onComplete });
    loading.show();
    loading.hide();
    loading.hide(); // ikinci çağrı — early return

    vi.advanceTimersByTime(100); // minDisplayMs
    vi.advanceTimersByTime(200); // transitionMs
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('show() exit animasyonu sırasında çağrılırsa exit class temizlenir', () => {
    const loading = createLoading({ minDisplayMs: 0, transitionMs: 500 });
    loading.show();
    loading.hide();

    // exit başladı ama transitionMs dolmadı
    expect(loading.element.classList.contains('vol-loading--exit')).toBe(true);

    // show tekrar çağrılırsa
    loading.show();

    expect(loading.element.classList.contains('vol-loading--exit')).toBe(false);
    expect(loading.element.classList.contains('vol-loading--enter')).toBe(true);
  });

  it('show() önceki hideTimer ve transitionTimer temizler', () => {
    const loading = createLoading({ minDisplayMs: 1000, transitionMs: 300 });
    loading.show();
    loading.hide();

    // hideTimer pending — show çağrılırsa temizlenmeli
    loading.show();
    loading.hide();

    // İlk hide'ın timer'ı temizlendi, ikinci hide'ın timer'ı çalışır
    vi.advanceTimersByTime(1000);
    expect(loading.element.classList.contains('vol-loading--exit')).toBe(true);

    // onComplete bir kez
    vi.advanceTimersByTime(300);
  });
});

describe('LoadingScreen — update() & progress animasyonu', () => {
  it('update() percent elementini günceller', () => {
    const loading = createLoading({ showPercent: true, progressMs: 0 });
    loading.update(42);
    flushRaf();

    expect(loading.element.querySelector('.vol-loading__percent')?.textContent).toBe('42%');
  });

  it('update() 0-100 dışı değeri kelepçeler', () => {
    const loading = createLoading({ showPercent: true, progressMs: 0 });
    loading.update(-20);
    flushRaf();
    expect(loading.element.style.getPropertyValue('--vol-loading-progress')).toContain('0');

    loading.update(150);
    flushRaf();
    expect(loading.element.style.getPropertyValue('--vol-loading-progress')).toContain('100');
  });

  it('update() --vol-loading-progress CSS değişkenini set eder', () => {
    const loading = createLoading({ progressMs: 0 });
    loading.update(75);
    flushRaf();
    expect(loading.element.style.getPropertyValue('--vol-loading-progress')).toBe('75%');
  });

  it('ardışık update() çağrıları önceki animasyonu iptal eder', () => {
    const loading = createLoading({ showPercent: true, progressMs: 300 });
    loading.update(50);
    loading.update(80); // ilk animasyon iptal, 80'e geç

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('LoadingScreen — konfigürasyon optionları', () => {
  it('zIndex option elemente uygulanır', () => {
    const loading = createLoading({ zIndex: 999 });
    expect(loading.element.style.zIndex).toBe('999');
  });

  it('varsayılan zIndex 100', () => {
    const loading = createLoading();
    expect(loading.element.style.zIndex).toBe('100');
  });

  it('className option elemente eklenir', () => {
    const loading = createLoading({ className: 'my-custom-loading' });
    expect(loading.element.classList.contains('my-custom-loading')).toBe(true);
  });

  it('backgroundColor --vol-loading-bg olarak set edilir', () => {
    const loading = createLoading({ backgroundColor: '#ff0000' });
    expect(loading.element.style.getPropertyValue('--vol-loading-bg')).toBe('#ff0000');
  });

  it('scrimColor --vol-loading-scrim olarak set edilir', () => {
    const loading = createLoading({ scrimColor: 'rgba(0,0,0,0.8)' });
    expect(loading.element.style.getPropertyValue('--vol-loading-scrim')).toBe('rgba(0,0,0,0.8)');
  });

  it('fontSize.title --vol-loading-title-size olarak set edilir', () => {
    const loading = createLoading({ fontSize: { title: 32 } });
    expect(loading.element.style.getPropertyValue('--vol-loading-title-size')).toBe('32px');
  });

  it('fontSize.subtitle --vol-loading-subtitle-size olarak set edilir', () => {
    const loading = createLoading({ fontSize: { subtitle: 12 } });
    expect(loading.element.style.getPropertyValue('--vol-loading-subtitle-size')).toBe('12px');
  });

  it('fontSize.percent --vol-loading-percent-size olarak set edilir', () => {
    const loading = createLoading({ fontSize: { percent: 20 } });
    expect(loading.element.style.getPropertyValue('--vol-loading-percent-size')).toBe('20px');
  });

  it('indicator.color --vol-loading-color olarak set edilir', () => {
    const loading = createLoading({ indicator: { color: 'var(--vol-ui-support-solid)' } });
    expect(loading.element.style.getPropertyValue('--vol-loading-color')).toBe(
      'var(--vol-ui-support-solid)',
    );
  });

  it('indicator.size --vol-loading-size olarak set edilir', () => {
    const loading = createLoading({ indicator: { size: 200 } });
    expect(loading.element.style.getPropertyValue('--vol-loading-size')).toBe('200px');
  });

  it('transitionMs --vol-loading-transition CSS değişkeni olarak set edilir', () => {
    const loading = createLoading({ transitionMs: 600 });
    expect(loading.element.style.getPropertyValue('--vol-loading-transition')).toBe('600ms');
  });
});

describe('LoadingScreen — contentPosition', () => {
  const positions: LoadingContentPosition[] = [
    'center',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];

  for (const pos of positions) {
    it(`contentPosition '${pos}' alignItems ve justifyContent set eder`, () => {
      const loading = createLoading({ contentPosition: pos });
      const align = loading.element.style.alignItems;
      const justify = loading.element.style.justifyContent;
      expect(align).not.toBe('');
      expect(justify).not.toBe('');
    });
  }

  it('center dışında padding eklenir', () => {
    const loading = createLoading({ contentPosition: 'bottom-right' });
    expect(loading.element.style.padding).not.toBe('');
  });

  it('center padding eklemez', () => {
    const loading = createLoading({ contentPosition: 'center' });
    expect(loading.element.style.padding).toBe('');
  });
});

describe('LoadingScreen — arkaplan tipleri', () => {
  it('css arkaplanı (varsayılan) .vol-loading__background--css classı ekler', () => {
    const loading = createLoading();
    const bg = loading.element.querySelector('.vol-loading__background');
    expect(bg?.classList.contains('vol-loading__background--css')).toBe(true);
  });

  it('image arkaplanı .vol-loading__background--image classı ekler', () => {
    const loading = createLoading({ background: { type: 'image', src: 'test.jpg' } });
    const bg = loading.element.querySelector('.vol-loading__background');
    expect(bg?.classList.contains('vol-loading__background--image')).toBe(true);
  });

  it('video arkaplanı video element ekler', () => {
    const loading = createLoading({ background: { type: 'video', src: 'test.mp4' } });
    const video = loading.element.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.src).toContain('test.mp4');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
  });
});

describe('LoadingScreen — destroy', () => {
  it('destroy elementi DOMdan kaldırır', () => {
    const loading = createLoading();
    expect(loading.element.isConnected).toBe(true);
    loading.destroy();
    expect(loading.element.isConnected).toBe(false);
  });

  it('destroy pending hideTimer temizler', () => {
    const loading = createLoading({ minDisplayMs: 5000 });
    loading.show();
    loading.hide();
    // hideTimer pending
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    loading.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('destroy pending transitionTimer temizler', () => {
    const loading = createLoading({ minDisplayMs: 0, transitionMs: 5000 });
    loading.show();
    loading.hide();
    // transitionTimer pending
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    loading.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('destroy progress rAF iptal eder', () => {
    const loading = createLoading({ progressMs: 500 });
    loading.update(50);
    // rAF pending
    loading.destroy();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('LoadingScreen — prefers-reduced-motion', () => {
  it('reduced-motion aktifken update() animasyonu atlar, değeri anında uygular', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const loading = createLoading({ showPercent: true, progressMs: 500 });
    loading.update(60);

    // rAF kuyruğunda hiçbir şey olmamalı
    expect(rafQueue.length).toBe(0);
    expect(loading.element.querySelector('.vol-loading__percent')?.textContent).toBe('60%');
    expect(loading.element.style.getPropertyValue('--vol-loading-progress')).toBe('60%');
  });
});

describe('LoadingScreen — video autoplay', () => {
  it('video arkaplanında play() çağrılır', () => {
    const playSpy = vi.fn().mockResolvedValue(undefined);
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreate(tagName);
      if (tagName.toLowerCase() === 'video') {
        (el as HTMLVideoElement).play = playSpy;
      }
      return el;
    });

    createLoading({ background: { type: 'video', src: 'test.mp4' } });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('video play() reddederse CSS fallback uygulanır', async () => {
    const playSpy = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreate(tagName);
      if (tagName.toLowerCase() === 'video') {
        (el as HTMLVideoElement).play = playSpy;
      }
      return el;
    });

    const loading = createLoading({ background: { type: 'video', src: 'test.mp4' } });
    // microtask tick — promise rejection handler çalışsın
    await vi.waitFor(() => {
      const bg = loading.element.querySelector('.vol-loading__background');
      expect(bg?.classList.contains('vol-loading__background--css')).toBe(true);
    });
  });
});
