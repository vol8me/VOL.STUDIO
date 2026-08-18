import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRandom } from '../../src/audio/synth/random';
import { FloatingTextManager } from '../../src/ui/feedback/FloatingText';
import { ResourceBar } from '../../src/ui/feedback/ResourceBar';
import { ResourceCounter } from '../../src/ui/feedback/ResourceCounter';
import { WaveCounter } from '../../src/ui/feedback/WaveCounter';
import { XPBar } from '../../src/ui/feedback/XPBar';

// Projedeki diğer feedback testleriyle (bkz. feedback.test.ts) aynı desen:
// her testte fake timers açık başlar — Counter/XPBar'ın global clearTimeout
// çağrıları, bu dosyanın kendi test sırasına göre useFakeTimers hiç
// çağrılmadan çalıştığında (bazı ortam/sıralama koşullarında) tanımsız
// kalabiliyordu; beforeEach ile baştan fake timer kurulumu bunu ortadan kaldırır.
beforeEach(() => {
  vi.useFakeTimers();
});

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('FloatingTextManager', () => {
  it('spawn bir metin elementi oluşturur, durationMs + fade süresi sonunda kaldırır', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    const manager = track(new FloatingTextManager(parent));

    manager.spawn(10, 20, '+42', { durationMs: 500, jitter: 0 });
    const el = parent.querySelector<HTMLDivElement>('.vol-floating-text')!;
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('+42');
    expect(el.style.left).toBe('10px');

    vi.advanceTimersByTime(500); // durationMs -> fading başlar
    expect(el.classList.contains('vol-floating-text--fading')).toBe(true);

    vi.advanceTimersByTime(200); // FADE_OUT_MS -> kaldırılır
    expect(parent.querySelector('.vol-floating-text')).toBeNull();
  });

  it('critical varyant varsayılan olarak jitter almaz (offsetX=0)', () => {
    const parent = document.createElement('div');
    const manager = track(new FloatingTextManager(parent));

    manager.spawn(100, 100, 'KRİTİK', { variant: 'emphasis' });
    const el = parent.querySelector<HTMLDivElement>('.vol-floating-text')!;
    expect(el.style.left).toBe('100px'); // jitter olmadan tam x konumu
  });

  it("anchor:absolute varyant class'ı doğru uygulanır", () => {
    const parent = document.createElement('div');
    const _manager = track(new FloatingTextManager(parent, { anchor: 'absolute' }));
    const container = parent.querySelector('.vol-floating-text-container')!;
    expect(container.classList.contains('vol-floating-text-container--absolute')).toBe(true);
  });

  it('opsiyonel random ile jitter deterministik hale gelir', () => {
    const parent = document.createElement('div');
    const random = createRandom(123);
    const manager = track(new FloatingTextManager(parent, { random }));

    manager.spawn(100, 100, 'X', { jitter: 20 });
    const first = parent.querySelector<HTMLDivElement>('.vol-floating-text')!.style.left;

    // Aynı seed aynı ofseti üretir.
    random.bipolar(); // FloatingText spawn'da bir değer tüketmişti; aynı sırayla tekrarlayalım.
    const secondRandom = createRandom(123);
    const parent2 = document.createElement('div');
    const manager2 = track(new FloatingTextManager(parent2, { random: secondRandom }));
    manager2.spawn(100, 100, 'X', { jitter: 20 });
    const second = parent2.querySelector<HTMLDivElement>('.vol-floating-text')!.style.left;

    expect(first).toBe(second);
  });

  it("destroy bekleyen tüm zamanlayıcıları temizler ve container'ı kaldırır", () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    const manager = new FloatingTextManager(parent);
    manager.spawn(0, 0, 'X');

    const clearSpy = vi.spyOn(window, 'clearTimeout');
    manager.destroy();

    expect(clearSpy).toHaveBeenCalled();
    expect(parent.querySelector('.vol-floating-text-container')).toBeNull();
  });
});

describe('ResourceCounter', () => {
  it("ikon dekoratif (aria-hidden), label erişilebilirlik için element'e uygulanır", () => {
    const counter = track(new ResourceCounter({ icon: '🔫', label: 'Mermi', value: 30 }));
    expect(counter.element.getAttribute('aria-label')).toBe('Mermi');
    const iconWrapper = counter.element.querySelector('.vol-resource-counter__icon')!;
    expect(iconWrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it("setValue/getValue içteki Counter'a delege eder", () => {
    const counter = track(new ResourceCounter({ icon: 'M', label: 'Mana', value: 10 }));
    counter.setValue(50);
    expect(counter.getValue()).toBe(50);
  });

  it("destroy içteki Counter'ı da yok eder", () => {
    const counter = new ResourceCounter({ icon: 'X', label: 'Test', value: 0 });
    const innerCounterEl = counter.element.querySelector('.vol-counter')!;
    counter.destroy();
    expect(innerCounterEl.isConnected).toBe(false);
    expect(counter.element.isConnected).toBe(false);
  });
});

describe('ResourceBar', () => {
  it('birden fazla kaynağı key ile bağımsız günceller', () => {
    const bar = track(
      new ResourceBar({
        resources: [
          { key: 'gold', icon: 'G', label: 'Altın', value: 100 },
          { key: 'wood', icon: 'W', label: 'Odun', value: 50 },
        ],
      }),
    );

    bar.setResource('gold', 150);
    expect(bar.getResource('gold')).toBe(150);
    expect(bar.getResource('wood')).toBe(50); // etkilenmedi
  });

  it('bilinmeyen key için setResource sessizce no-op, getResource undefined döner', () => {
    const bar = track(
      new ResourceBar({ resources: [{ key: 'gold', icon: 'G', label: 'Altın', value: 100 }] }),
    );
    expect(() => bar.setResource('unknown', 10)).not.toThrow();
    expect(bar.getResource('unknown')).toBeUndefined();
  });

  it("destroy tüm counter'ları yok eder", () => {
    const bar = new ResourceBar({
      resources: [{ key: 'gold', icon: 'G', label: 'Altın', value: 100 }],
    });
    const counterEl = bar.element.querySelector('.vol-resource-counter')!;
    bar.destroy();
    expect(counterEl.isConnected).toBe(false);
  });
});

describe('WaveCounter', () => {
  it('setWave/getWave totalWaves ile birlikte doğru metni üretir', () => {
    const counter = track(new WaveCounter({ totalWaves: 10 }));
    counter.setWave(3);
    expect(counter.getWave()).toBe(3);
    expect(counter.element.querySelector('.vol-wave-counter__wave')?.textContent).toBe(
      'Dalga 3 / 10',
    );
  });

  it('startCountdown her saniye azalır, süre dolunca onCountdownEnd çağrılır', () => {
    vi.useFakeTimers();
    const onCountdownEnd = vi.fn();
    const counter = track(new WaveCounter({ onCountdownEnd }));

    counter.startCountdown(3);
    const countdownEl = counter.element.querySelector<HTMLSpanElement>(
      '.vol-wave-counter__countdown',
    )!;
    expect(countdownEl.textContent).toBe('Sonraki dalga: 3s');

    vi.advanceTimersByTime(1000);
    expect(countdownEl.textContent).toBe('Sonraki dalga: 2s');

    vi.advanceTimersByTime(2000);
    expect(onCountdownEnd).toHaveBeenCalledTimes(1);
    expect(countdownEl.hidden).toBe(true);
  });

  it("startAutoLoop her mola bitiminde dalgayı otomatik artırır, totalWaves'e ulaşınca durur", () => {
    vi.useFakeTimers();
    const onWaveStart = vi.fn();
    const counter = track(new WaveCounter({ totalWaves: 2 }));

    counter.startAutoLoop({ countdownSeconds: 1, onWaveStart });
    vi.advanceTimersByTime(1000); // dalga 2 başlar
    expect(counter.getWave()).toBe(2);
    expect(onWaveStart).toHaveBeenCalledWith(2);

    onWaveStart.mockClear();
    vi.advanceTimersByTime(1000); // totalWaves=2'ye ulaşıldı, döngü durmalı
    expect(onWaveStart).not.toHaveBeenCalled();
    expect(counter.getWave()).toBe(2);
  });

  it('startCountdown ile startAutoLoop birbirini iptal eder (aynı anda yalnızca biri aktif)', () => {
    vi.useFakeTimers();
    const onCountdownEnd = vi.fn();
    const onWaveStart = vi.fn();
    const counter = track(new WaveCounter({ onCountdownEnd }));

    counter.startAutoLoop({ countdownSeconds: 5, onWaveStart });
    counter.startCountdown(2); // otomatik döngüyü iptal etmeli

    vi.advanceTimersByTime(2000);
    expect(onCountdownEnd).toHaveBeenCalledTimes(1);
    expect(onWaveStart).not.toHaveBeenCalled();
  });

  it('stopCountdown geri sayımı durdurur ve metni gizler', () => {
    vi.useFakeTimers();
    const counter = track(new WaveCounter());
    counter.startCountdown(10);
    counter.stopCountdown();

    const countdownEl = counter.element.querySelector<HTMLSpanElement>(
      '.vol-wave-counter__countdown',
    )!;
    expect(countdownEl.hidden).toBe(true);

    vi.advanceTimersByTime(20000);
    // interval temizlendiği için hiçbir güncelleme olmamalı, throw da olmamalı.
  });

  it("destroy bekleyen interval'i temizler", () => {
    vi.useFakeTimers();
    const counter = new WaveCounter();
    counter.startCountdown(10);
    const clearSpy = vi.spyOn(window, 'clearInterval');
    counter.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('XPBar', () => {
  const xpForLevel = (level: number) => level * 100;

  it('addXP eşiği aşmadığı sürece yalnızca bar değerini günceller', () => {
    const onLevelUp = vi.fn();
    const xpBar = track(new XPBar({ level: 1, xp: 0, xpForLevel, onLevelUp, animateMs: 0 }));

    xpBar.addXP(50);
    expect(xpBar.getXP()).toBe(50);
    expect(xpBar.getLevel()).toBe(1);
    expect(onLevelUp).not.toHaveBeenCalled();
  });

  it('addXP eşiği aşarsa seviye atlar, kalan XP bir sonraki seviyeye taşınır', () => {
    const onLevelUp = vi.fn();
    const xpBar = track(new XPBar({ level: 1, xp: 90, xpForLevel, onLevelUp, animateMs: 0 }));

    xpBar.addXP(30); // 90+30=120, eşik(1)=100 -> seviye 2'ye geç, kalan 20
    expect(xpBar.getLevel()).toBe(2);
    expect(xpBar.getXP()).toBe(20);
    expect(onLevelUp).toHaveBeenCalledWith(2);
  });

  it('büyük bir XP kazanımı ZİNCİRLEME olarak birden fazla seviye atlatabilir', () => {
    const onLevelUp = vi.fn();
    // level 1 eşiği 100, level 2 eşiği 200 — 350 XP hem 1->2 hem 2->3 atlatmalı.
    const xpBar = track(new XPBar({ level: 1, xp: 0, xpForLevel, onLevelUp, animateMs: 0 }));

    xpBar.addXP(350); // 100(lv1) + 200(lv2) = 300 tüketilir, kalan 50, seviye 3
    expect(xpBar.getLevel()).toBe(3);
    expect(xpBar.getXP()).toBe(50);
    expect(onLevelUp).toHaveBeenCalledTimes(1);
    expect(onLevelUp).toHaveBeenCalledWith(3);
  });

  it("seviye atlayınca --level-up class'ı kısa süreliğine eklenir", () => {
    vi.useFakeTimers();
    const xpBar = track(new XPBar({ level: 1, xp: 90, xpForLevel, animateMs: 0 }));

    xpBar.addXP(20);
    expect(xpBar.element.classList.contains('vol-xp-bar--level-up')).toBe(true);

    vi.advanceTimersByTime(600);
    expect(xpBar.element.classList.contains('vol-xp-bar--level-up')).toBe(false);
  });

  it('destroy bekleyen level-up zamanlayıcısını temizler', () => {
    vi.useFakeTimers();
    const xpBar = new XPBar({ level: 1, xp: 90, xpForLevel, animateMs: 0 });
    xpBar.addXP(20);

    const clearSpy = vi.spyOn(window, 'clearTimeout');
    xpBar.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('boş XP barı kritik/kırmızı duruma düşmez — dolan bir değerdir', () => {
    const xpBar = track(new XPBar({ level: 1, xp: 0, xpForLevel, animateMs: 0 }));
    expect(xpBar.element.classList.contains('vol-bar--low')).toBe(false);

    xpBar.addXP(1);
    expect(xpBar.element.classList.contains('vol-bar--low')).toBe(false);

    // Seviye atlayınca bar yeniden boşalır; yine kırmızıya dönmemeli.
    xpBar.addXP(200);
    expect(xpBar.element.classList.contains('vol-bar--low')).toBe(false);
  });

  it('setState barı dışarıdaki duruma eşitler', () => {
    const xpBar = track(new XPBar({ level: 1, xp: 0, xpForLevel, animateMs: 0 }));

    xpBar.setState(3, 42);

    expect(xpBar.getLevel()).toBe(3);
    expect(xpBar.getXP()).toBe(42);
  });

  it('setState seviye artışında vurgu oynatır ama onLevelUp tetiklemez', () => {
    vi.useFakeTimers();
    const onLevelUp = vi.fn();
    const xpBar = track(new XPBar({ level: 1, xp: 0, xpForLevel, onLevelUp, animateMs: 0 }));

    xpBar.setState(2, 10);

    expect(xpBar.element.classList.contains('vol-xp-bar--level-up')).toBe(true);
    // Seviye olayının sahibi dışarısı; bar ikinci kez haber vermez.
    expect(onLevelUp).not.toHaveBeenCalled();
  });

  it('setState aynı seviyede vurgu oynatmaz', () => {
    const xpBar = track(new XPBar({ level: 2, xp: 10, xpForLevel, animateMs: 0 }));

    xpBar.setState(2, 60);

    expect(xpBar.element.classList.contains('vol-xp-bar--level-up')).toBe(false);
    expect(xpBar.getXP()).toBe(60);
  });

  it('setState negatif XP’yi sıfıra kelepçeler', () => {
    const xpBar = track(new XPBar({ level: 1, xp: 50, xpForLevel, animateMs: 0 }));

    xpBar.setState(1, -20);

    expect(xpBar.getXP()).toBe(0);
  });
});
