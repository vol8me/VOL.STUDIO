import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FpsMeter } from '../../src/ui/hud/FpsMeter';
import { i18next } from '../../src/systems/I18n';

/** rAF'ı elle sürer: gerçek zamana bağlı bir test kararsız olur. */
function driveFrames(count: number, stepMs: number, startMs = 0): void {
  let now = startMs;
  for (let i = 0; i < count; i++) {
    const callback = rafQueue.shift();
    if (!callback) break;
    callback(now);
    now += stepMs;
  }
}

let rafQueue: FrameRequestCallback[] = [];
let nextHandle = 1;

beforeEach(() => {
  rafQueue = [];
  nextHandle = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return nextHandle++;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FpsMeter', () => {
  it('varsayılan köşe sağ üsttür ve konum data attribute ile gelir', () => {
    const meter = new FpsMeter();
    expect(meter.element.dataset.position).toBe('top-right');
    expect(meter.element.classList.contains('vol-fps-meter')).toBe(true);
    meter.destroy();
  });

  it('dört köşenin her biri seçilebilir', () => {
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const meter = new FpsMeter({ position });
      expect(meter.element.dataset.position).toBe(position);
      meter.destroy();
    }
  });

  it('setPosition köşeyi değiştirir', () => {
    const meter = new FpsMeter({ position: 'top-left' });
    meter.setPosition('bottom-right');
    expect(meter.element.dataset.position).toBe('bottom-right');
    meter.destroy();
  });

  /* Ölçüm başlamadan kırmızı "0 FPS" göstermek olmayan bir sorunu bildirmektir. */
  it('örnek yokken renk nötr, metin TİREDİR', () => {
    const meter = new FpsMeter();
    expect(meter.element.dataset.level).toBe('normal');
    expect(meter.element.textContent).toContain('—');
    meter.destroy();
  });

  /*
   * Görsel regresyon koşusu `performance.now()` ve rAF damgasını 0'a dondurur;
   * bütün kare aralıkları sıfır olur. Gösterge o ortamda kırmızı "0 FPS"
   * yazsaydı showcase temeli kalıcı olarak bozuk görünürdü.
   */
  it('saat DONMUŞ ortamda tehlike rengine geçmez', () => {
    const meter = new FpsMeter({ refreshMs: 0 });
    driveFrames(12, 0, 0);
    expect(meter.getFps()).toBe(0);
    expect(meter.element.dataset.level).toBe('normal');
    expect(meter.element.textContent).toContain('—');
    meter.destroy();
  });

  it('kare akışından FPS türetir ve metne yazar', () => {
    const meter = new FpsMeter({ refreshMs: 0 });
    driveFrames(12, 1000 / 60);
    expect(meter.getFps()).toBeCloseTo(60, 0);
    expect(meter.element.textContent).toContain('60');
    expect(meter.element.dataset.level).toBe('normal');
    meter.destroy();
  });

  it('eşiklerin altında uyarı ve tehlike seviyesine geçer', () => {
    const warn = new FpsMeter({ refreshMs: 0, warnFps: 45, dangerFps: 30 });
    driveFrames(12, 1000 / 40); // ~40 fps
    expect(warn.element.dataset.level).toBe('warn');
    warn.destroy();

    const danger = new FpsMeter({ refreshMs: 0, warnFps: 45, dangerFps: 30 });
    driveFrames(12, 1000 / 20); // ~20 fps
    expect(danger.element.dataset.level).toBe('danger');
    danger.destroy();
  });

  /*
   * Her karede yazmak sayıyı okunamaz kılar. Ölçüm her kare sürer, GÖSTERİM
   * seyrelir; bu testin ölçtüğü şey ikisinin ayrıldığıdır.
   */
  it('metin refreshMs aralığından daha sık yenilenmez', () => {
    const meter = new FpsMeter({ refreshMs: 1000 });
    driveFrames(20, 1000 / 60); // ~333 ms
    expect(meter.getFps()).toBeGreaterThan(0);
    expect(meter.element.textContent).toContain('—');
    meter.destroy();
  });

  /* Yalnız metni yenilemek ekran okuyucuyu ESKİ dilde bırakırdı. */
  it('dil değişince erişilebilirlik etiketini de yeniler', () => {
    const meter = new FpsMeter();
    const before = meter.element.getAttribute('aria-label');
    const spy = vi.spyOn(i18next, 't').mockReturnValue('ÇEVRİLDİ' as never);
    i18next.emit('languageChanged', 'en');
    expect(meter.element.getAttribute('aria-label')).not.toBe(before);
    spy.mockRestore();
    meter.destroy();
  });

  it('dil değişince metni yeniden yazar', () => {
    const meter = new FpsMeter({ refreshMs: 0 });
    driveFrames(12, 1000 / 60);
    const spy = vi.spyOn(i18next, 't');
    i18next.emit('languageChanged', 'en');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    meter.destroy();
  });

  /* Listener eklenen her yerde kaldırılır (AGENTS Kural 6). */
  it('destroy aboneliği, rAF döngüsünü ve elemanı toplar', () => {
    const off = vi.spyOn(i18next, 'off');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const meter = new FpsMeter();

    document.body.appendChild(meter.element);
    meter.destroy();

    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(meter.element.parentElement).toBeNull();
    off.mockRestore();
    removeListener.mockRestore();
  });

  /*
   * rAF damgaları `performance.now()` ile AYNI zaman kaynağını paylaşır;
   * bileşen tabanı ondan alır. Test de bu yüzden gerçek saatten başlar —
   * uydurma bir başlangıç, ürünün doğru davranışını yanlış gösterirdi.
   */
  it('sekme geri döndüğünde duraklama FPS`i düşürmez', () => {
    const meter = new FpsMeter({ refreshMs: 0 });
    const base = performance.now();
    driveFrames(10, 1000 / 60, base);
    const before = meter.getFps();
    expect(before).toBeGreaterThan(50);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    driveFrames(10, 1000 / 60, performance.now());

    expect(meter.getFps()).toBeGreaterThan(before * 0.5);
    meter.destroy();
  });
});
