import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Bar } from '../../src/ui/feedback/Bar';
import { Counter } from '../../src/ui/feedback/Counter';
import { TimerBar } from '../../src/ui/feedback/TimerBar';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Bar', () => {
  it('dikey yönelimde dolgu YÜKSEKLİKTEN büyür ve eksen erişilebilirlik ağacına yazılır', () => {
    const bar = new Bar({ max: 100, value: 40, orientation: 'vertical', animateMs: 0 });
    document.body.appendChild(bar.element);
    const fill = bar.element.querySelector<HTMLElement>('.vol-bar__fill');

    expect(bar.element.classList.contains('vol-bar--vertical')).toBe(true);
    expect(bar.element.getAttribute('aria-orientation')).toBe('vertical');
    expect(fill?.style.height).toBe('40%');
    expect(fill?.style.width).toBe('');

    bar.setValue(75);
    expect(fill?.style.height).toBe('75%');

    bar.destroy();
  });

  it('varsayılan yatay yönelim genişlikten büyür ve eksen bildirmez', () => {
    const bar = new Bar({ max: 100, value: 40 });
    document.body.appendChild(bar.element);
    const fill = bar.element.querySelector<HTMLElement>('.vol-bar__fill');

    expect(bar.element.classList.contains('vol-bar--vertical')).toBe(false);
    expect(bar.element.hasAttribute('aria-orientation')).toBe(false);
    expect(fill?.style.width).toBe('40%');
    expect(fill?.style.height).toBe('');

    bar.destroy();
  });

  it('oluşturma ve yok etme', () => {
    const bar = new Bar({ max: 100 });
    document.body.appendChild(bar.element);

    expect(bar.element.classList.contains('vol-bar')).toBe(true);
    expect(bar.element.classList.contains('vol-bar--health')).toBe(true);
    expect(bar.element.getAttribute('role')).toBe('progressbar');
    expect(bar.element.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.element.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('100');
    // Varyant adı çevrilmez; bar'ın varsayılan aria-label'i 'ilerleme çubuğu'dur.
    expect(bar.element.getAttribute('aria-label')).toBe('ilerleme çubuğu');

    const fill = bar.element.querySelector('.vol-bar__fill') as HTMLDivElement;
    expect(fill.style.width).toBe('100%');

    bar.destroy();
    expect(bar.element.isConnected).toBe(false);
  });

  it('setValue/getValue değerlerini sınırlandır ve aria/görsel çıktıyı günceller', () => {
    const bar = new Bar({ max: 100, value: 50, animateMs: 0 });
    const fill = bar.element.querySelector('.vol-bar__fill') as HTMLDivElement;

    expect(bar.getValue()).toBe(50);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('50');

    bar.setValue(150);
    expect(bar.getValue()).toBe(100);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('100');
    expect(fill.style.width).toBe('100%');

    bar.setValue(-10);
    expect(bar.getValue()).toBe(0);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('0');
    expect(fill.style.width).toBe('0%');

    bar.destroy();
  });

  it('constructor giriş değerini max ve min ile sınırlandırır', () => {
    const high = new Bar({ max: 100, value: 150, animateMs: 0 });
    expect(high.getValue()).toBe(100);
    expect(high.element.getAttribute('aria-valuenow')).toBe('100');

    const low = new Bar({ max: 100, value: -5, animateMs: 0 });
    expect(low.getValue()).toBe(0);
    expect(low.element.getAttribute('aria-valuenow')).toBe('0');

    high.destroy();
    low.destroy();
  });

  it('setMax yeni max değerine göre değeri kısar', () => {
    const bar = new Bar({ max: 100, value: 80, animateMs: 0 });

    bar.setMax(50);
    expect(bar.getValue()).toBe(50);
    expect(bar.element.getAttribute('aria-valuemax')).toBe('50');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('50');

    bar.setMax(200);
    expect(bar.getValue()).toBe(50);
    expect(bar.element.getAttribute('aria-valuemax')).toBe('200');

    bar.destroy();
  });

  it('variant sınıflarını ayarlar', () => {
    const health = new Bar({ max: 100, variant: 'health' });
    const stamina = new Bar({ max: 100, variant: 'stamina' });
    const cooldown = new Bar({ max: 100, variant: 'cooldown' });

    expect(health.element.classList.contains('vol-bar--health')).toBe(true);
    expect(stamina.element.classList.contains('vol-bar--stamina')).toBe(true);
    expect(cooldown.element.classList.contains('vol-bar--cooldown')).toBe(true);

    health.destroy();
    stamina.destroy();
    cooldown.destroy();
  });

  it('sabit ve fonksiyon label render eder', () => {
    const staticBar = new Bar({ max: 100, value: 75, label: 'HP' });
    const staticLabel = staticBar.element.querySelector('.vol-bar__label') as HTMLSpanElement;
    expect(staticLabel.textContent).toBe('HP');
    expect(staticBar.element.getAttribute('aria-labelledby')).toBe(staticLabel.id);
    staticBar.destroy();

    const formatter = (value: number, max: number) => `${value}/${max}`;
    const dynamicBar = new Bar({ max: 100, value: 75, label: formatter, animateMs: 0 });
    const dynamicLabel = dynamicBar.element.querySelector('.vol-bar__label') as HTMLSpanElement;
    expect(dynamicLabel.textContent).toBe('75/100');

    dynamicBar.setValue(30);
    expect(dynamicLabel.textContent).toBe('30/100');
    dynamicBar.destroy();
  });

  it('düşük eşik (lowThreshold) sınıfını geçer', () => {
    const bar = new Bar({ max: 100, value: 24, animateMs: 0 });
    expect(bar.element.classList.contains('vol-bar--low')).toBe(true);

    bar.setValue(26);
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);

    bar.setValue(25);
    expect(bar.element.classList.contains('vol-bar--low')).toBe(true);

    bar.destroy();

    const custom = new Bar({ max: 100, value: 50, lowThreshold: 0.6, animateMs: 0 });
    expect(custom.element.classList.contains('vol-bar--low')).toBe(true);
    custom.setValue(70);
    expect(custom.element.classList.contains('vol-bar--low')).toBe(false);
    custom.destroy();
  });

  it('lowThreshold null verilince uyarı durumu hiç oluşmaz — dolan barlar için', () => {
    const bar = new Bar({ max: 100, value: 0, lowThreshold: null, animateMs: 0 });
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);

    bar.setValue(1);
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);

    bar.setValue(100);
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);
    bar.destroy();
  });

  it('animasyon tamamlandığında fill genişliği hedefe ulaşır', () => {
    const bar = new Bar({ max: 100, value: 0, animateMs: 50 });
    const fill = bar.element.querySelector('.vol-bar__fill') as HTMLDivElement;
    expect(fill.style.width).toBe('0%');

    bar.setValue(80);
    // Aria hemen hedef değeri gösterir; fill animasyonla güncellenir.
    expect(bar.element.getAttribute('aria-valuenow')).toBe('80');
    expect(fill.style.width).toBe('0%');

    vi.advanceTimersByTime(100);
    expect(fill.style.width).toBe('80%');
    expect(bar.getValue()).toBe(80);

    bar.destroy();
  });

  it('yeni setValue çağrısı önceki animasyonu iptal eder', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const bar = new Bar({ max: 100, value: 0, animateMs: 50 });

    bar.setValue(50);
    bar.setValue(100);
    expect(cancelSpy).toHaveBeenCalled();

    cancelSpy.mockRestore();
    bar.destroy();
  });

  it('destroy çalışan animasyonu iptal eder ve elementi kaldırır', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const bar = new Bar({ max: 100, value: 0, animateMs: 50 });
    document.body.appendChild(bar.element);

    bar.setValue(50);
    bar.destroy();

    expect(cancelSpy).toHaveBeenCalled();
    expect(bar.element.isConnected).toBe(false);

    cancelSpy.mockRestore();
  });
});

describe('Counter', () => {
  it('oluşturma ve yok etme', () => {
    const counter = new Counter({ value: 42 });
    document.body.appendChild(counter.element);

    expect(counter.element.classList.contains('vol-counter')).toBe(true);
    expect(counter.getValue()).toBe(42);

    const display = counter.element.querySelector('.vol-counter__display') as HTMLSpanElement;
    const announce = counter.element.querySelector('.vol-sr-only') as HTMLSpanElement;

    expect(display.textContent).toBe('42');
    expect(display.getAttribute('aria-hidden')).toBe('true');
    expect(announce.textContent).toBe('42');
    expect(announce.getAttribute('aria-live')).toBe('polite');
    expect(announce.getAttribute('role')).toBe('status');

    counter.destroy();
    expect(counter.element.isConnected).toBe(false);
  });

  it('setValue/getValue varsayılan ve özel formatla çalışır', () => {
    const counter = new Counter({ value: 5, format: (v) => `x${Math.round(v)}`, animateMs: 0 });

    expect(counter.getValue()).toBe(5);
    expect(counter.element.querySelector('.vol-counter__display')?.textContent).toBe('x5');

    counter.setValue(12.7);
    expect(counter.getValue()).toBe(12.7);
    expect(counter.element.querySelector('.vol-counter__display')?.textContent).toBe('x13');
    expect(counter.element.querySelector('.vol-sr-only')?.textContent).toBe('x13');

    counter.destroy();
  });

  it('negatif ve ondalık değerleri formatlar', () => {
    const counter = new Counter({ value: 0, animateMs: 0 });

    counter.setValue(-3.2);
    expect(counter.getValue()).toBe(-3.2);
    expect(counter.element.querySelector('.vol-counter__display')?.textContent).toBe('-3');

    counter.setValue(9999.6);
    expect(counter.element.querySelector('.vol-counter__display')?.textContent).toBe('10000');

    counter.destroy();
  });

  it('sayı değişiminde animasyon yapar', () => {
    const counter = new Counter({ value: 0, animateMs: 50 });
    const display = counter.element.querySelector('.vol-counter__display') as HTMLSpanElement;
    const announce = counter.element.querySelector('.vol-sr-only') as HTMLSpanElement;

    counter.setValue(100);
    // Görsel değer hemen değişmez; duyuru (screen reader) final değeri alır.
    expect(display.textContent).toBe('0');
    expect(announce.textContent).toBe('100');

    vi.advanceTimersByTime(80);
    expect(display.textContent).toBe('100');

    counter.destroy();
  });

  it('pulse seçeneği ve pulse() metodu sınıf ekler ve zaman aşımında kaldırır', () => {
    const counter = new Counter({ value: 0 });

    counter.setValue(5, { pulse: true });
    expect(counter.element.classList.contains('vol-counter--pulse')).toBe(true);

    vi.advanceTimersByTime(400);
    expect(counter.element.classList.contains('vol-counter--pulse')).toBe(false);

    counter.pulse();
    expect(counter.element.classList.contains('vol-counter--pulse')).toBe(true);

    counter.destroy();
  });

  it('değer yönünü artış/azalış sınıfıyla bildirir ve aynı değerde nötr kalır', () => {
    const counter = new Counter({ value: 10, animateMs: 0 });

    counter.setValue(15);
    expect(counter.element.classList.contains('vol-counter--increase')).toBe(true);
    expect(counter.element.classList.contains('vol-counter--decrease')).toBe(false);

    vi.advanceTimersByTime(400);
    counter.setValue(4);
    expect(counter.element.classList.contains('vol-counter--decrease')).toBe(true);

    vi.advanceTimersByTime(400);
    counter.setValue(4, { pulse: true });
    expect(counter.element.classList.contains('vol-counter--pulse')).toBe(true);
    expect(counter.element.classList.contains('vol-counter--increase')).toBe(false);

    counter.destroy();
  });

  it('destroy çalışan animasyonu ve pulse zamanlayıcılarını temizler', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const counter = new Counter({ value: 0, animateMs: 50 });
    document.body.appendChild(counter.element);

    counter.setValue(100);
    counter.pulse();
    counter.destroy();

    expect(cancelSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(counter.element.isConnected).toBe(false);

    cancelSpy.mockRestore();
    clearSpy.mockRestore();
  });
});

describe('TimerBar', () => {
  it('oluşturma ve yok etme', () => {
    const timer = new TimerBar({ durationSeconds: 5 });
    document.body.appendChild(timer.element);

    expect(timer.element.classList.contains('vol-timer-bar')).toBe(true);
    expect(timer.element.getAttribute('role')).toBe('progressbar');
    expect(timer.element.getAttribute('aria-valuemin')).toBe('0');
    expect(timer.element.getAttribute('aria-valuemax')).toBe('5');
    expect(timer.element.getAttribute('aria-valuenow')).toBe('0');
    expect(timer.isRunning()).toBe(false);

    const fill = timer.element.querySelector('.vol-timer-bar__fill') as HTMLDivElement;
    expect(fill.style.width).toBe('0%');

    timer.destroy();
    expect(timer.element.isConnected).toBe(false);
  });

  it('start, pause ve isRunning durumlarını yönetir', () => {
    const timer = new TimerBar({ durationSeconds: 1 });
    expect(timer.isRunning()).toBe(false);

    timer.start();
    expect(timer.isRunning()).toBe(true);

    timer.start(); // Çift çağrı no-op
    expect(timer.isRunning()).toBe(true);

    timer.pause();
    expect(timer.isRunning()).toBe(false);

    timer.start(); // Kaldığı yerden devam
    expect(timer.isRunning()).toBe(true);

    timer.destroy();
  });

  it('autoStart ile başlar ve duraklatılabilir', () => {
    const timer = new TimerBar({ durationSeconds: 1, autoStart: true });
    expect(timer.isRunning()).toBe(true);

    timer.pause();
    expect(timer.isRunning()).toBe(false);

    timer.destroy();
  });

  it('onComplete süre dolduğunda çağrılır', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.1, onComplete });

    timer.start();
    expect(timer.isRunning()).toBe(true);

    vi.advanceTimersByTime(200);
    expect(timer.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
  });

  it('fill modunda dolar', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.64, onComplete });
    const fill = timer.element.querySelector('.vol-timer-bar__fill') as HTMLDivElement;

    timer.start();

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('25%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('50%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('75%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('100%');
    expect(timer.isRunning()).toBe(false);
    expect(timer.element.getAttribute('aria-valuenow')).toBe('1');
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
  });

  it('drain modunda boşalır', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.64, mode: 'drain', onComplete });
    const fill = timer.element.querySelector('.vol-timer-bar__fill') as HTMLDivElement;

    timer.start();

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('75%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('50%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('25%');

    vi.advanceTimersByTime(160);
    expect(fill.style.width).toBe('0%');
    expect(timer.isRunning()).toBe(false);
    expect(timer.element.getAttribute('aria-valuenow')).toBe('0');
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
  });

  it('sabit ve fonksiyon label render eder', () => {
    const staticTimer = new TimerBar({ durationSeconds: 5, label: 'Yükleniyor' });
    const staticLabel = staticTimer.element.querySelector(
      '.vol-timer-bar__label',
    ) as HTMLSpanElement;
    expect(staticLabel.textContent).toBe('Yükleniyor');
    staticTimer.destroy();

    const formatter = (remaining: number, total: number) => `${remaining}s / ${total}s`;
    const dynamicTimer = new TimerBar({ durationSeconds: 1, mode: 'drain', label: formatter });
    const dynamicLabel = dynamicTimer.element.querySelector(
      '.vol-timer-bar__label',
    ) as HTMLSpanElement;

    dynamicTimer.start();
    expect(dynamicLabel.textContent).toBe('1s / 1s');

    vi.advanceTimersByTime(250);
    expect(dynamicLabel.textContent).toBe('1s / 1s');

    vi.advanceTimersByTime(850);
    expect(dynamicLabel.textContent).toBe('0s / 1s');

    dynamicTimer.destroy();
  });

  it('loop tamamlanma sonrası yeniden başlar', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.1, loop: true, onComplete });

    timer.start();

    vi.advanceTimersByTime(120);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(timer.isRunning()).toBe(false);

    vi.advanceTimersByTime(150);
    expect(timer.isRunning()).toBe(true);

    vi.advanceTimersByTime(150);
    expect(onComplete).toHaveBeenCalledTimes(2);

    timer.destroy();
  });

  it('reset geri sarar', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.5, onComplete });
    const fill = timer.element.querySelector('.vol-timer-bar__fill') as HTMLDivElement;

    timer.start();
    vi.advanceTimersByTime(200);
    expect(timer.isRunning()).toBe(true);

    timer.reset();
    expect(timer.isRunning()).toBe(false);

    vi.advanceTimersByTime(350);
    expect(fill.style.width).toBe('0%');
    expect(timer.isRunning()).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();

    timer.destroy();
  });

  it('reset(autoRestart=true) bitince yeni tur başlatır', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.5, onComplete });

    timer.start();
    vi.advanceTimersByTime(200);
    expect(timer.isRunning()).toBe(true);

    timer.reset(true);
    expect(timer.isRunning()).toBe(false);

    vi.advanceTimersByTime(350);
    expect(timer.isRunning()).toBe(true);

    vi.advanceTimersByTime(600);
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
  });

  it('pause çalışan animasyonu durdurur ve start kaldığı yerden devam ettirir', () => {
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 1, onComplete });

    timer.start();
    vi.advanceTimersByTime(300);
    expect(timer.isRunning()).toBe(true);

    timer.pause();
    expect(timer.isRunning()).toBe(false);

    timer.start();
    vi.advanceTimersByTime(800);
    expect(timer.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
  });

  it('destroy çalışan animasyonu ve loop zamanlayıcılarını temizler', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const onComplete = vi.fn();
    const timer = new TimerBar({ durationSeconds: 0.1, loop: true, onComplete });
    document.body.appendChild(timer.element);

    timer.start();
    vi.advanceTimersByTime(120); // tamamlanır, loop setTimeout planlanır
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.destroy();
    expect(timer.element.isConnected).toBe(false);
    expect(cancelSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    // Sonraki zamanlayıcılar onComplete'i tekrar çağırmamalı
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);

    cancelSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
