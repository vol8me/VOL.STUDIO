import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { Bar } from '../../../src/ui/feedback/Bar';
import { Counter } from '../../../src/ui/feedback/Counter';
import {
  FLOATING_TEXT_MAX_ACTIVE,
  FloatingTextManager,
} from '../../../src/ui/feedback/FloatingText';
import { TimerBar } from '../../../src/ui/feedback/TimerBar';
import { MAX_LEVELS_PER_XP_GAIN, XPBar, applyXPGain } from '../../../src/ui/feedback/XPBar';
import { MotionController } from '../../../src/ui/motion/MotionController';

/**
 * HUD göstergelerinin durum matrisi (UI-08.1): boş/dolu, geçersiz sayı ve eşik, çoklu kazanım, 6 haneli düşüş, meşgul,
 * hata, hareket azaltma ve okuyucu değer metni. Gerçek tarayıcı sonucu `devtools/vol-showcase/tests/e2e/hudStates.spec.ts`tedir.
 */
const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

function reduceMotion(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const fillOf = (bar: Bar): HTMLElement => bar.element.querySelector<HTMLElement>('.vol-bar__fill')!;

describe('Bar okuyucu değer metni', () => {
  it('Bar altı haneli dolu değeri ve boş sıfırı görsel/okuyucu olarak aynı anda taşır', () => {
    const bar = track(
      new Bar({ max: 999999, value: 999999, label: (value) => String(value), animateMs: 0 }),
    );
    expect(bar.element.textContent).toBe('999999');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('999999');
    expect(fillOf(bar).style.width).toBe('100%');
    const emptyValue = 0;
    bar.setValue(emptyValue);
    expect(bar.element.textContent).toBe('0');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('0');
    expect(fillOf(bar).style.width).toBe('0%');
  });

  it('XPBar altı haneli seviye ve ilerlemeyi kırpmadan aktarır', () => {
    const bar = track(
      new XPBar({ level: 999999, xp: 100000, xpForLevel: () => 999999, animateMs: 0 }),
    );
    expect(bar.getLevel()).toBe(999999);
    expect(bar.getXP()).toBe(100000);
    expect(bar.element.textContent).toContain('999999');
    expect(bar.element.textContent).toContain('100000');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('100000');
  });

  it('etiketsiz ya da sabit etiketli çubuk "değer / üst sınır" okunur; adı değeri taşıyan formatter etikette tekrar yazılmaz', () => {
    const plain = track(new Bar({ max: 250, value: 100 }));
    expect(plain.element.getAttribute('aria-valuetext')).toBe('100 / 250');

    const fixed = track(new Bar({ max: 100, value: 50, label: 'CAN' }));
    expect(fixed.element.getAttribute('aria-valuetext')).toBe('50 / 100');

    const formatted = track(new Bar({ max: 100, value: 50, label: (v, m) => `${v} / ${m}` }));
    expect(formatted.element.hasAttribute('aria-valuetext')).toBe(false);
  });

  it('valueText seçeneği varsayılanı ezer ve değer değişince yenilenir', () => {
    const bar = track(
      new Bar({ max: 3, value: 3, valueText: (value) => `${value} can`, label: (v) => `${v}` }),
    );
    expect(bar.element.getAttribute('aria-valuetext')).toBe('3 can');
    bar.setValue(1);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('1 can');
  });

  it('öznitelikleri yalnız değişince yazar (aynı değer yeniden duyuruya yol açmasın)', () => {
    const bar = track(new Bar({ max: 100, value: 50, animateMs: 0 }));
    const set = vi.spyOn(bar.element, 'setAttribute');
    bar.setValue(50);
    bar.setValue(50);
    expect(set).not.toHaveBeenCalled();
    bar.setValue(51);
    expect(set).toHaveBeenCalledWith('aria-valuenow', '51');
  });

  it('dil değişince değer metni yeni dilde yazılır', async () => {
    const bar = track(new Bar({ max: 100, value: 7, animateMs: 0, status: 'error' }));
    const before = bar.element.getAttribute('aria-valuetext');
    await i18next.changeLanguage('en');
    const english = bar.element.getAttribute('aria-valuetext');
    await i18next.changeLanguage('tr');
    expect(english).toBe('error');
    expect(before).toBe('hata');
  });
});

describe('Bar ad, değer metni ve düşük durum', () => {
  it('ariaLabel ile görünür etiket birlikte verilince ad ariaLabel olur, etiket değer metnine döner ve gizlenir', () => {
    const bar = track(
      new Bar({
        max: 100,
        value: 80,
        animateMs: 0,
        ariaLabel: 'Can',
        label: (value, max) => `${value} / ${max}`,
      }),
    );
    expect(bar.element.getAttribute('aria-label')).toBe('Can');
    expect(bar.element.hasAttribute('aria-labelledby')).toBe(false);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('80 / 100');
    expect(bar.element.querySelector('.vol-bar__label')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('yalnız görünür etiket varsa ad etikettir (eski sözleşme), etiket gizlenmez', () => {
    const bar = track(new Bar({ max: 100, value: 80, label: (value) => `${value}` }));
    const label = bar.element.querySelector('.vol-bar__label')!;
    expect(bar.element.getAttribute('aria-labelledby')).toBe(label.id);
    expect(label.hasAttribute('aria-hidden')).toBe(false);
  });

  it('düşük durum yalnız renkle değil metinle de söylenir: "değer / üst sınır, düşük"', () => {
    const bar = track(new Bar({ max: 100, value: 100, animateMs: 0 }));
    expect(bar.element.getAttribute('aria-valuetext')).toBe('100 / 100');
    bar.setValue(20);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('20 / 100, düşük');
    bar.setValue(90);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('90 / 100');
  });

  it('adı değeri taşıyan formatter etiketli barda düşük durum tek başına "düşük" olarak okunur', () => {
    const bar = track(new Bar({ max: 100, value: 10, animateMs: 0, label: (value) => `${value}` }));
    expect(bar.element.getAttribute('aria-valuetext')).toBe('düşük');
    bar.setValue(80);
    expect(bar.element.hasAttribute('aria-valuetext')).toBe(false);
  });

  it('düşük uyarısı hedef değerden türer (animasyonun ara karesinden değil)', () => {
    const bar = track(new Bar({ max: 100, value: 100, animateMs: 400 }));
    bar.setValue(10);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('10 / 100, düşük');
  });

  it('setAriaLabel adı yeniler; ad kaynağı etikete bağlı barda etkisizdir', () => {
    const named = track(new Bar({ max: 10, ariaLabel: 'Can', label: (value) => `${value}` }));
    named.setAriaLabel('Mana');
    expect(named.element.getAttribute('aria-label')).toBe('Mana');
    const labelled = track(new Bar({ max: 10, label: (value) => `${value}` }));
    labelled.setAriaLabel('Mana');
    expect(labelled.element.hasAttribute('aria-label')).toBe(false);
    const plain = track(new Bar({ max: 10 }));
    plain.setAriaLabel('Mana');
    expect(plain.element.getAttribute('aria-label')).toBe('Mana');
  });
});

describe('Bar boş, dolu ve geçersiz girdi', () => {
  it('boş ve dolu durum oranı tam yansıtır; dolu çubuk düşük değildir', () => {
    const bar = track(new Bar({ max: 100, value: 0, animateMs: 0 }));
    expect(fillOf(bar).style.width).toBe('0%');
    expect(bar.element.classList.contains('vol-bar--low')).toBe(true);
    bar.setValue(100);
    expect(fillOf(bar).style.width).toBe('100%');
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('100');
  });

  it('NaN ve sonsuz değer yok sayılır: son geçerli değer kalır, "NaN%" yazılmaz', () => {
    const bar = track(new Bar({ max: 100, value: 60, animateMs: 0 }));
    bar.setValue(Number.NaN);
    bar.setValue(Number.POSITIVE_INFINITY);
    bar.setValue(Number.NEGATIVE_INFINITY);
    expect(bar.getValue()).toBe(60);
    expect(fillOf(bar).style.width).toBe('60%');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('60');
  });

  it('geçersiz üst sınır (NaN, sonsuz, negatif) 0 olur ve çubuk boş kalır', () => {
    for (const max of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const bar = track(new Bar({ max, value: 10, animateMs: 0 }));
      expect(bar.element.getAttribute('aria-valuemax')).toBe('0');
      expect(fillOf(bar).style.width).toBe('0%');
      bar.setMax(50);
      bar.setValue(25);
      expect(fillOf(bar).style.width).toBe('50%');
      bar.setMax(Number.NaN);
      expect(bar.getValue()).toBe(0);
    }
  });

  it('başlangıç değeri NaN ise 0 başlar', () => {
    const bar = track(new Bar({ max: 100, value: Number.NaN }));
    expect(bar.getValue()).toBe(0);
  });

  it('geçersiz düşük eşik güvenli aralığa iner: NaN varsayılan, >1 ve <0 kenetlenir, null kapatır', () => {
    const at = (threshold: number | null, value: number): boolean =>
      track(
        new Bar({ max: 100, value, animateMs: 0, lowThreshold: threshold }),
      ).element.classList.contains('vol-bar--low');
    expect(at(Number.NaN, 20)).toBe(true); // varsayılan %25
    expect(at(Number.NaN, 90)).toBe(false);
    expect(at(5, 90)).toBe(true); // 1'e kenetlenir: her değer düşük
    expect(at(-1, 0)).toBe(true); // 0'a kenetlenir: yalnız boş çubuk düşük
    expect(at(-1, 1)).toBe(false);
    expect(at(null, 0)).toBe(false);
  });
});

describe('Bar meşgul ve hata durumu', () => {
  it('meşgul: değer yerine aria-busy yazılır, boyutu CSS belirler; normale dönünce değer yerinde durur', () => {
    const bar = track(new Bar({ max: 100, value: 40, animateMs: 0 }));
    bar.setStatus('busy');
    expect(bar.getStatus()).toBe('busy');
    expect(bar.element.getAttribute('aria-busy')).toBe('true');
    for (const name of ['aria-valuenow', 'aria-valuemax', 'aria-valuetext']) {
      expect(bar.element.hasAttribute(name), name).toBe(false);
    }
    expect(bar.element.classList.contains('vol-bar--busy')).toBe(true);
    expect(fillOf(bar).style.width).toBe('');

    bar.setValue(70); // değer saklanır, gösterilmez
    expect(fillOf(bar).style.width).toBe('');

    bar.setStatus('normal');
    expect(bar.element.hasAttribute('aria-busy')).toBe(false);
    expect(bar.element.getAttribute('aria-valuenow')).toBe('70');
    expect(fillOf(bar).style.width).toBe('70%');
    expect(bar.element.classList.contains('vol-bar--busy')).toBe(false);
  });

  it('meşgul çubuk düşük uyarısı vermez (kayan bant tehlike rengine boyanmaz)', () => {
    const bar = track(new Bar({ max: 100, value: 0, animateMs: 0, status: 'busy' }));
    expect(bar.element.classList.contains('vol-bar--low')).toBe(false);
    bar.setStatus('normal');
    expect(bar.element.classList.contains('vol-bar--low')).toBe(true);
  });

  it('dikey meşgul çubuk yüksekliği de CSS’e bırakır', () => {
    const bar = track(new Bar({ max: 100, value: 40, animateMs: 0, orientation: 'vertical' }));
    expect(fillOf(bar).style.height).toBe('40%');
    bar.setStatus('busy');
    expect(fillOf(bar).style.height).toBe('');
  });

  it('hata: sınıf ve okuyucu metni "hata"; son değer korunur', () => {
    const bar = track(new Bar({ max: 100, value: 35, animateMs: 0 }));
    bar.setStatus('error');
    expect(bar.element.classList.contains('vol-bar--error')).toBe(true);
    expect(bar.element.getAttribute('aria-valuetext')).toBe('hata');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('35');
    expect(fillOf(bar).style.width).toBe('35%');
    bar.setStatus('normal');
    expect(bar.element.getAttribute('aria-valuetext')).toBe('35 / 100');
  });

  it('aynı durumu yeniden vermek hiçbir şey yazmaz', () => {
    const bar = track(new Bar({ max: 100, value: 35, status: 'error' }));
    const set = vi.spyOn(bar.element, 'setAttribute');
    const toggle = vi.spyOn(bar.element.classList, 'toggle');
    bar.setStatus('error');
    expect(set).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('Bar hareket azaltma', () => {
  it('dolgu doğrudan son değere gider: rAF animasyonu kurulmaz, aria ve genişlik aynı anda hedefte', () => {
    reduceMotion();
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const bar = track(new Bar({ max: 100, value: 100, animateMs: 400 }));
    bar.setValue(20);
    expect(raf).not.toHaveBeenCalled();
    expect(fillOf(bar).style.width).toBe('20%');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('20');
  });

  it('hareket azaltma yokken aynı çağrı animasyon kurar (karşı sınama)', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const bar = track(new Bar({ max: 100, value: 100, animateMs: 400 }));
    bar.setValue(20);
    expect(raf).toHaveBeenCalled();
    expect(fillOf(bar).style.width).toBe('100%');
  });

  it('süren animasyon sırasında tercih açılırsa bir sonraki değer son duruma atlar ve eski animasyonu bırakır', () => {
    const bar = track(new Bar({ max: 100, value: 100, animateMs: 400 }));
    bar.setValue(50);
    reduceMotion();
    bar.setValue(10);
    vi.advanceTimersByTime(1000);
    expect(fillOf(bar).style.width).toBe('10%');
  });
});

describe('Counter geçersiz sayı, 6 haneli düşüş ve hareket azaltma', () => {
  const display = (counter: Counter): string =>
    counter.element.querySelector('.vol-counter__display')!.textContent ?? '';

  it('NaN ve sonsuz sayı yazılmaz: ekran, değer ve duyuru son geçerli sayıda kalır', () => {
    const counter = track(new Counter({ value: 12, animateMs: 0 }));
    counter.setValue(Number.NaN);
    counter.setValue(Number.POSITIVE_INFINITY);
    expect(display(counter)).toBe('12');
    expect(counter.getValue()).toBe(12);
    expect(counter.element.querySelector('.vol-sr-only')!.textContent).toBe('12');
    expect(counter.element.classList.contains('vol-counter--increase')).toBe(false);
  });

  it('6 haneli düşüş (999 999 → 0) sayarak iner, son durumda tam sıfırdır ve tek duyuru üretir', () => {
    const counter = track(
      new Counter({
        value: 999_999,
        animateMs: 300,
        format: (value) => Math.round(value).toLocaleString('tr-TR'),
      }),
    );
    expect(display(counter)).toBe('999.999');
    counter.setValue(0);
    expect(counter.element.classList.contains('vol-counter--decrease')).toBe(true);
    vi.advanceTimersByTime(100);
    const mid = Number(display(counter).replaceAll('.', ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(999_999);
    vi.advanceTimersByTime(400);
    expect(display(counter)).toBe('0');
    expect(counter.element.querySelector('.vol-sr-only')!.textContent).toBe('0');
  });

  it('hareket azaltmada sayı doğrudan son değere gider (rAF yok); yön vurgusu renkle kalır', () => {
    reduceMotion();
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const counter = track(new Counter({ value: 999_999, animateMs: 300 }));
    counter.setValue(0);
    expect(raf).not.toHaveBeenCalled();
    expect(display(counter)).toBe('0');
    expect(counter.element.classList.contains('vol-counter--decrease')).toBe(true);
  });

  it('hareket azaltma yokken sayma sürer (karşı sınama)', () => {
    const counter = track(new Counter({ value: 100, animateMs: 300 }));
    counter.setValue(0);
    expect(display(counter)).toBe('100');
    vi.advanceTimersByTime(400);
    expect(display(counter)).toBe('0');
  });
});

describe('XPBar çoklu kazanım ve geçersiz girdi', () => {
  const xpForLevel = (level: number): number => 50 + level * 25;

  it('tek kazanımla birden çok seviye atlanır: bar son seviyeyi gösterir, düzey vurgusu TEK kez oynar', () => {
    const bar = track(new XPBar({ xpForLevel, label: (value, max) => `${value}/${max}` }));
    const next = applyXPGain(1, 0, 500, xpForLevel);
    expect(next.levelsGained).toBeGreaterThan(1);
    const addClass = vi.spyOn(bar.element.classList, 'add');
    bar.setState(next.level, next.xp);
    expect(bar.getLevel()).toBe(next.level);
    expect(addClass.mock.calls.filter(([name]) => name === 'vol-xp-bar--level-up')).toHaveLength(1);
    expect(bar.element.getAttribute('aria-valuemax')).toBe(String(xpForLevel(next.level)));
  });

  it('seviye düşmesi ya da aynı seviye vurgu oynatmaz', () => {
    const bar = track(new XPBar({ xpForLevel, level: 5, xp: 10 }));
    bar.setState(3, 0);
    bar.setState(3, 20);
    expect(bar.element.classList.contains('vol-xp-bar--level-up')).toBe(false);
  });

  it('setState geçersiz sayıyı yok sayar; mevcut seviye ve XP korunur', () => {
    const bar = track(new XPBar({ xpForLevel, level: 2, xp: 30 }));
    bar.setState(Number.NaN, 5);
    bar.setState(3, Number.NaN);
    bar.setState(3, Number.POSITIVE_INFINITY);
    expect(bar.getLevel()).toBe(2);
    expect(bar.getXP()).toBe(30);
  });

  it('applyXPGain: sonlu olmayan kazanç 0 sayılır, negatif kazanç XP’yi düşürür ama sıfırın altına indirmez', () => {
    expect(applyXPGain(1, 10, Number.NaN, xpForLevel)).toEqual({
      level: 1,
      xp: 10,
      levelsGained: 0,
    });
    expect(applyXPGain(1, 10, Number.POSITIVE_INFINITY, xpForLevel).levelsGained).toBe(0);
    expect(applyXPGain(1, 10, -100, xpForLevel)).toEqual({ level: 1, xp: 0, levelsGained: 0 });
  });

  it('applyXPGain: dev kazanç ve küçük eşik ana iş parçacığını dondurmaz; seviye atlama sınırlıdır', () => {
    const start = performance.now();
    const result = applyXPGain(1, 0, 1e12, () => 1);
    expect(result.levelsGained).toBe(MAX_LEVELS_PER_XP_GAIN);
    expect(result.level).toBe(1 + MAX_LEVELS_PER_XP_GAIN);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('applyXPGain: sıfır ya da negatif eşik döngüyü durdurur', () => {
    expect(applyXPGain(1, 0, 999, () => 0).levelsGained).toBe(0);
    expect(applyXPGain(1, 0, 999, () => -5).levelsGained).toBe(0);
  });

  it('eşik 0 olan seviyede bar boş ve geçerli kalır (üst sınır 0)', () => {
    const bar = track(new XPBar({ xpForLevel: () => 0, level: 1, xp: 0 }));
    expect(bar.element.getAttribute('aria-valuemax')).toBe('0');
    expect(bar.element.querySelector<HTMLElement>('.vol-bar__fill')!.style.width).toBe('0%');
  });
});

describe('TimerBar işlevsel zaman', () => {
  it('okuyucu metni yalnız tam saniye değişince yazılır ve kalan saniyeyi söyler', () => {
    const bar = track(new TimerBar({ durationSeconds: 5, mode: 'drain' }));
    const set = vi.spyOn(bar.element, 'setAttribute');
    expect(bar.element.getAttribute('aria-valuetext')).toBe('5 sn kaldı');
    bar.start();
    vi.advanceTimersByTime(500);
    expect(set.mock.calls.filter(([name]) => name === 'aria-valuetext')).toHaveLength(0);
    vi.advanceTimersByTime(1700); // 2,2 sn geçti: 2,8 sn kaldı
    expect(bar.element.getAttribute('aria-valuetext')).toBe('3 sn kaldı');
    expect(bar.element.getAttribute('aria-valuenow')).toBe('3');
    // 5 → 4 → 3: iki yazım; yüzlerce kare boyunca kare başına yazılmaz.
    expect(set.mock.calls.filter(([name]) => name === 'aria-valuetext')).toHaveLength(2);
  });

  it('hareket azaltmada çubuk yine akar ve süre dolunca tam zamanında tamamlanır', () => {
    reduceMotion();
    const onComplete = vi.fn();
    const bar = track(new TimerBar({ durationSeconds: 2, onComplete }));
    bar.start();
    vi.advanceTimersByTime(1000);
    // Kare aralığı (16 ms) kadar sapma olur; yarı yolda olduğunu ve henüz bitmediğini doğrular.
    const width = parseFloat(
      bar.element.querySelector<HTMLElement>('.vol-timer-bar__fill')!.style.width,
    );
    expect(width).toBeGreaterThan(47);
    expect(width).toBeLessThan(53);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('hareket bütçesinden hak istemez: MotionController.requestGroup çağrılmaz', () => {
    const request = vi.spyOn(MotionController.prototype, 'requestGroup');
    const bars = Array.from({ length: 6 }, () => track(new TimerBar({ durationSeconds: 3 })));
    for (const bar of bars) bar.start();
    vi.advanceTimersByTime(3200);
    expect(request).not.toHaveBeenCalled();
    for (const bar of bars) expect(bar.isRunning()).toBe(false);
  });

  it('reset geri sarma geçişini yalnız hareket azaltma yokken oynatır', () => {
    const normal = track(new TimerBar({ durationSeconds: 4 }));
    normal.start();
    vi.advanceTimersByTime(2000);
    normal.reset();
    vi.advanceTimersByTime(20);
    const mid = parseFloat(
      normal.element.querySelector<HTMLElement>('.vol-timer-bar__fill')!.style.width,
    );
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(50);

    reduceMotion();
    const calm = track(new TimerBar({ durationSeconds: 4 }));
    calm.start();
    vi.advanceTimersByTime(2000);
    calm.reset();
    expect(calm.element.querySelector<HTMLElement>('.vol-timer-bar__fill')!.style.width).toBe('0%');
  });

  it('geçersiz süre (NaN, sonsuz, negatif) boş çubuktur; döngü sonsuza dönmez', () => {
    for (const durationSeconds of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0]) {
      const onComplete = vi.fn();
      const bar = track(new TimerBar({ durationSeconds, loop: true, onComplete }));
      expect(bar.element.getAttribute('aria-valuemax')).toBe('0');
      bar.start();
      vi.advanceTimersByTime(5000);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});

describe('FloatingTextManager havuz ve okuyucu', () => {
  const make = (maxActive?: number): { parent: HTMLElement; manager: FloatingTextManager } => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const manager = track(new FloatingTextManager(parent, { maxActive }));
    return { parent, manager };
  };
  const live = (parent: HTMLElement): HTMLElement[] => [
    ...parent.querySelectorAll<HTMLElement>('.vol-floating-text'),
  ];

  it('kap okuyucu ağacından gizlenir (görsel yankı, durum bölgeleri zaten duyurur)', () => {
    const { parent } = make();
    expect(parent.querySelector('.vol-floating-text-container')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('aynı anda en çok maxActive metin durur; en eski toplanır, en yeni her zaman görünür', () => {
    const { parent, manager } = make(5);
    for (let index = 0; index < 40; index += 1) manager.spawn(index, 0, `#${index}`, { jitter: 0 });
    expect(manager.activeCount).toBe(5);
    expect(live(parent).map((el) => el.textContent)).toEqual(['#35', '#36', '#37', '#38', '#39']);
  });

  it('varsayılan sınır belgelenmiş sabittir', () => {
    const { manager } = make();
    for (let index = 0; index < FLOATING_TEXT_MAX_ACTIVE + 10; index += 1) {
      manager.spawn(0, 0, String(index));
    }
    expect(manager.activeCount).toBe(FLOATING_TEXT_MAX_ACTIVE);
  });

  it('toplanan eleman havuza döner ve yeniden kullanılır; eski durumdan iz taşımaz', () => {
    const { parent, manager } = make(1);
    manager.spawn(10, 20, 'ilk', { variant: 'negative', jitter: 0 });
    const first = live(parent)[0];
    manager.spawn(30, 40, 'ikinci', { variant: 'positive', jitter: 0 });
    const second = live(parent)[0];
    expect(second).toBe(first);
    expect(live(parent)).toHaveLength(1);
    expect(second.textContent).toBe('ikinci');
    expect(second.className).toBe('vol-floating-text vol-floating-text--positive');
    expect(second.style.left).toBe('30px');
    expect(second.style.top).toBe('40px');
  });

  it('süre dolunca hepsi kaldırılır, zamanlayıcı kalmaz ve havuz sınırlıdır', () => {
    const { parent, manager } = make(100);
    for (let index = 0; index < 60; index += 1) manager.spawn(0, 0, 'x', { durationMs: 100 });
    vi.advanceTimersByTime(100 + 400);
    expect(manager.activeCount).toBe(0);
    expect(live(parent)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('havuz sınırlıdır: 60 metin toplanınca sonraki 60 metin en çok 16 eski elemanı yeniden kullanır', () => {
    const { parent, manager } = make(100);
    for (let index = 0; index < 60; index += 1) manager.spawn(0, 0, 'x', { durationMs: 100 });
    const first = new Set(live(parent));
    vi.advanceTimersByTime(100 + 400);
    for (let index = 0; index < 60; index += 1) manager.spawn(0, 0, 'y');
    const reused = live(parent).filter((el) => first.has(el));
    expect(live(parent)).toHaveLength(60);
    expect(reused).toHaveLength(16);
  });

  it('geçersiz konum metin üretmez', () => {
    const { manager } = make();
    manager.spawn(Number.NaN, 0, 'x');
    manager.spawn(0, Number.POSITIVE_INFINITY, 'x');
    expect(manager.activeCount).toBe(0);
  });

  it('toplanan metnin zamanlayıcıları iptal edilir (eski metnin kaldırması yeniden kullanılan elemanı silmez)', () => {
    const { parent, manager } = make(1);
    manager.spawn(0, 0, 'eski', { durationMs: 100, jitter: 0 });
    vi.advanceTimersByTime(50);
    manager.spawn(0, 0, 'yeni', { durationMs: 1000, jitter: 0 });
    vi.advanceTimersByTime(300); // eski metnin solma/kaldırma süresi geçti
    const [only] = live(parent);
    expect(only.textContent).toBe('yeni');
    expect(only.classList.contains('vol-floating-text--fading')).toBe(false);
  });

  it('destroy havuzu ve kabı bırakır', () => {
    const { parent, manager } = make(3);
    for (let index = 0; index < 8; index += 1) manager.spawn(0, 0, 'x');
    manager.destroy();
    expect(parent.querySelector('.vol-floating-text-container')).toBeNull();
    expect(manager.activeCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
