import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  LoadingScreen,
  type LoadingScreenOptions,
  type LoadingIndicatorType,
  type LoadingContentPosition,
} from '../../../src/ui/overlays/LoadingScreen';

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

  it('destroy image arkaplanını temizler', () => {
    const loading = createLoading({ background: { type: 'image', src: 'test.jpg' } });
    const media = (loading as unknown as { backgroundMedia?: HTMLImageElement }).backgroundMedia;
    expect(media).toBeInstanceOf(HTMLImageElement);
    loading.destroy();
    expect(media?.src).toBe('');
    expect(media?.onload).toBeNull();
    expect(media?.onerror).toBeNull();
  });

  it('destroy video arkaplanını durdurur ve kaldırır', () => {
    const playSpy = vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
    const loading = createLoading({ background: { type: 'video', src: 'test.mp4' } });
    const media = (loading as unknown as { backgroundMedia?: HTMLVideoElement }).backgroundMedia;
    expect(media).toBeInstanceOf(HTMLVideoElement);
    const pauseSpy = vi.spyOn(media!, 'pause');
    loading.destroy();
    expect(pauseSpy).toHaveBeenCalled();
    expect(media?.src).toBe('');
    expect(media?.parentElement).toBeNull();
    playSpy.mockRestore();
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

  it('video play() senkron hata fırlatırsa CSS fallback uygulanır', () => {
    const playSpy = vi.fn().mockImplementation(() => {
      throw new Error('NotAllowedError');
    });
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreate(tagName);
      if (tagName.toLowerCase() === 'video') {
        (el as HTMLVideoElement).play = playSpy;
      }
      return el;
    });

    const loading = createLoading({ background: { type: 'video', src: 'test.mp4' } });
    const bg = loading.element.querySelector('.vol-loading__background');
    expect(bg?.classList.contains('vol-loading__background--video')).toBe(false);
    expect(bg?.classList.contains('vol-loading__background--css')).toBe(true);
    expect(loading.element.querySelector('video')).toBeNull();
  });
});

describe('LoadingScreen — ilerleme anlamı, hata ve yeniden deneme', () => {
  it('ilerleme progressbar olarak yalnız hedef değerle bildirilir; yüzde metni okuyucudan gizlidir', () => {
    const loading = createLoading({ showPercent: true });
    const bar = loading.element.querySelector('[role="progressbar"]')!;
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    loading.update(40);
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(
      loading.element.querySelector('.vol-loading__percent')!.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('varsayılan asgari gösterim süresi kapalıdır (hide hemen uygulanır)', () => {
    const onComplete = vi.fn();
    const loading = createLoading({ transitionMs: 100, onComplete });
    loading.show();
    loading.hide();
    vi.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fail(): alert, meşgul değil, odak Tekrar dene düğmesinde; bekleyen gizleme iptal olur', () => {
    const onComplete = vi.fn();
    const loading = createLoading({ minDisplayMs: 1000, transitionMs: 100, onComplete });
    loading.show();
    loading.hide();
    loading.fail({ message: 'Ağ yok', onRetry: vi.fn(), onCancel: vi.fn() });
    vi.advanceTimersByTime(5000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(loading.element.getAttribute('aria-busy')).toBe('false');
    const alert = loading.element.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Ağ yok');
    const buttons = alert.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Tekrar dene hatayı temizler, ilerlemeyi sıfırlar ve onRetry çağırır; Vazgeç yalnız onCancel çağırır', () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    const loading = createLoading({ showPercent: true });
    loading.update(80);
    loading.fail({ onRetry, onCancel });
    const [retry, cancel] = [
      ...loading.element.querySelectorAll<HTMLButtonElement>('.vol-loading__failure button'),
    ];
    cancel.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(loading.element.querySelector('.vol-loading__failure')).not.toBeNull();
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(loading.element.querySelector('.vol-loading__failure')).toBeNull();
    expect(loading.element.getAttribute('aria-busy')).toBe('true');
    expect(
      loading.element.querySelector('[role="progressbar"]')!.hasAttribute('aria-valuenow'),
    ).toBe(false);
    expect(loading.element.querySelector('.vol-loading__percent')!.textContent).toBe('0%');
  });

  it('eylemsiz hata yalnız mesaj gösterir; destroy düğmeleri temizler', () => {
    const loading = createLoading();
    loading.fail();
    expect(loading.element.querySelector('.vol-loading__failure-actions')).toBeNull();
    expect(loading.element.querySelector('[role="alert"]')!.textContent).toBeTruthy();
    loading.destroy();
    expect(loading.element.isConnected).toBe(false);
  });
});

describe('LoadingScreen — plaka, aşama, ipucu, takılma, gecikme, arka plan', () => {
  it('plaka başlık şeridi, belirsiz çubuk ve çerçeve sınıfını taşır; ilk update çubuğu kesinleştirir', () => {
    const loading = createLoading({ title: 'Dünya' });
    expect(loading.element.querySelector('.vol-loading__content')!.classList).toContain(
      'vol-frame',
    );
    expect(
      loading.element.querySelector('.vol-loading__header .vol-loading__title')!.textContent,
    ).toBe('Dünya');
    const fill = loading.element.querySelector('.vol-loading__fill')!;
    expect(fill.classList).toContain('vol-loading__fill--indeterminate');
    loading.update(30);
    expect(fill.classList).not.toContain('vol-loading__fill--indeterminate');
  });

  it('başlık verilmezse yerelleştirilmiş varsayılan başlık çizilir (title öğesi yok)', () => {
    const loading = createLoading();
    expect(loading.element.querySelector('.vol-loading__title')).toBeNull();
    expect(loading.element.querySelector('.vol-loading__heading')!.textContent).toBeTruthy();
  });

  it('setStage aşama satırını yazar; boşken gizlidir', () => {
    const loading = createLoading({ stage: 'Hizmetler 1 / 3' });
    const stage = loading.element.querySelector('.vol-loading__stage')!;
    expect(stage.textContent).toBe('Hizmetler 1 / 3');
    loading.setStage('Varlıklar 2 / 3');
    expect(stage.textContent).toBe('Varlıklar 2 / 3');
  });

  it('ipuçları aralıkla döner, hide ile durur ve okuyucudan gizlidir', () => {
    const loading = createLoading({ tips: ['bir', 'iki', 'üç'], tipIntervalMs: 1000 });
    loading.show();
    const tip = loading.element.querySelector('.vol-loading__tip')!;
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    const first = tip.textContent;
    vi.advanceTimersByTime(1000 + 200);
    expect(tip.textContent).not.toBe(first);
    loading.hide();
    const frozen = tip.textContent;
    vi.advanceTimersByTime(5000);
    expect(tip.textContent).toBe(frozen);
  });

  it('ilerleme stallMs boyunca değişmezse bir kez bildirilir; ilerleyince temizlenir ve yeniden silahlanır', () => {
    const onStall = vi.fn();
    const loading = createLoading({ stallMs: 1000, onStall });
    loading.show();
    loading.update(10);
    const stall = loading.element.querySelector<HTMLElement>('.vol-loading__stall')!;
    expect(stall.hidden).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(stall.hidden).toBe(false);
    expect(stall.textContent).toBeTruthy();
    expect(onStall).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onStall).toHaveBeenCalledTimes(1);
    loading.update(20);
    expect(stall.hidden).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(onStall).toHaveBeenCalledTimes(2);
  });

  it('aynı hedef tekrar gelirse takılma sayacı sıfırlanmaz; stallMs:0 kapatır', () => {
    const onStall = vi.fn();
    const loading = createLoading({ stallMs: 1000, onStall });
    loading.show();
    loading.update(10);
    vi.advanceTimersByTime(600);
    loading.update(10);
    vi.advanceTimersByTime(500);
    expect(onStall).toHaveBeenCalledTimes(1);
    const off = createLoading({ stallMs: 0, onStall });
    off.show();
    vi.advanceTimersByTime(60_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('showDelayMs dolmadan biten yükleme hiç görünmez ve onComplete hemen çağrılır', () => {
    const onComplete = vi.fn();
    const loading = createLoading({ showDelayMs: 200, minDisplayMs: 1000, onComplete });
    loading.show();
    expect(loading.element.classList).toContain('vol-loading--pending');
    vi.advanceTimersByTime(100);
    loading.hide();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(loading.element.classList).toContain('vol-loading--hidden');
    vi.advanceTimersByTime(5000);
    expect(loading.element.classList).not.toContain('vol-loading--visible');
  });

  it('showDelayMs dolunca görünür olur; asgari süre görünür olduktan sonra ölçülür', () => {
    const onComplete = vi.fn();
    const loading = createLoading({
      showDelayMs: 200,
      minDisplayMs: 500,
      transitionMs: 100,
      onComplete,
    });
    loading.show();
    vi.advanceTimersByTime(200);
    flushRaf();
    expect(loading.element.classList).not.toContain('vol-loading--pending');
    expect(loading.element.classList).toContain('vol-loading--visible');
    vi.advanceTimersByTime(300);
    loading.hide();
    vi.advanceTimersByTime(199);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(101 + 100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('görünürken arka sayfa inert olur, odak ekrana geçer; kapanınca ikisi de geri gelir', () => {
    const page = document.createElement('main');
    const button = document.createElement('button');
    page.appendChild(button);
    document.body.appendChild(page);
    button.focus();
    const loading = createLoading({ transitionMs: 100 });
    loading.show();
    expect(page.inert).toBe(true);
    expect(Boolean(loading.element.inert)).toBe(false);
    expect(document.activeElement).toBe(loading.element);
    loading.hide();
    expect(Boolean(page.inert)).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('blockBackground:false arka sayfaya dokunmaz', () => {
    const page = document.createElement('main');
    document.body.appendChild(page);
    const loading = createLoading({ blockBackground: false });
    loading.show();
    expect(Boolean(page.inert)).toBe(false);
  });

  it('destroy arka sayfayı açar ve zamanlayıcıları temizler', () => {
    const page = document.createElement('main');
    document.body.appendChild(page);
    const onStall = vi.fn();
    const loading = createLoading({ stallMs: 500, onStall, tips: ['a', 'b'] });
    loading.show();
    expect(page.inert).toBe(true);
    loading.destroy();
    expect(Boolean(page.inert)).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe('LoadingScreen — iş bitince sayfa hemen açılır', () => {
  it('hide() asgari gösterim dolmadan da arka sayfayı etkileşime açar; ekran yalnız görsel olarak kalır', () => {
    const page = document.createElement('main');
    document.body.appendChild(page);
    const loading = createLoading({ minDisplayMs: 1000, transitionMs: 100 });
    loading.show();
    expect(page.inert).toBe(true);
    loading.hide();
    expect(Boolean(page.inert)).toBe(false);
    expect(loading.element.classList).not.toContain('vol-loading--exit');
    vi.advanceTimersByTime(1200);
    expect(loading.element.classList).toContain('vol-loading--hidden');
  });
});
