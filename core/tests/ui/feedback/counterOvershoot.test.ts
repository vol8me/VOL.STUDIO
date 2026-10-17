import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Counter } from '../../../src/ui/feedback/Counter';

/**
 * Sayma aşımı: hedefi kısa süre aşıp oturur; yalnız görsel. Okuyucu duyurusu ve `getValue()` hedeftir,
 * varsayılan kapalıdır, azaltılmış harekette yoktur.
 */
let frame = 0;
let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  frame = 0;
  rafQueue = [];
  vi.stubGlobal('performance', { now: () => frame });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** Her 10 ms'de bir kare işleyip ekrandaki sayıları sırayla toplar. */
function run(counter: Counter, durationMs: number): number[] {
  const shown: number[] = [];
  for (let at = 10; at <= durationMs + 10; at += 10) {
    frame = at;
    const callbacks = rafQueue;
    rafQueue = [];
    for (const callback of callbacks) callback(at);
    shown.push(Number(counter.element.querySelector('.vol-counter__display')!.textContent));
  }
  return shown;
}

describe('Counter aşımı', () => {
  it('açıkken sayı hedefi aşar, sonra hedefte durur; duyuru ve değer hedeftir', () => {
    const counter = new Counter({ value: 0, animateMs: 300, overshoot: true });
    counter.setValue(1000);
    expect(counter.getValue()).toBe(1000);
    const shown = run(counter, 300);
    const peak = Math.max(...shown);
    expect(peak).toBeGreaterThan(1000);
    expect(peak).toBeLessThanOrEqual(1037);
    expect(shown.at(-1)).toBe(1000);
    expect(counter.element.querySelector('.vol-sr-only')!.textContent).toBe('1000');
  });

  it('varsayılan kapalıdır: sayı hiçbir karede hedefi aşmaz', () => {
    const counter = new Counter({ value: 0, animateMs: 300 });
    counter.setValue(1000);
    const shown = run(counter, 300);
    expect(Math.max(...shown)).toBeLessThanOrEqual(1000);
    expect(shown.at(-1)).toBe(1000);
  });

  it('azaltılmış harekette açık olsa da aşmaz', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const counter = new Counter({ value: 0, animateMs: 300, overshoot: true });
    counter.setValue(1000);
    expect(Math.max(...run(counter, 300))).toBeLessThanOrEqual(1000);
  });

  it('azalışta hedefin altına sarkar (aynı yumuşak aşım) ve hedefte durur', () => {
    const counter = new Counter({ value: 1000, animateMs: 300, overshoot: true });
    counter.setValue(0);
    const shown = run(counter, 300);
    expect(Math.min(...shown)).toBeLessThan(0);
    expect(Math.min(...shown)).toBeGreaterThanOrEqual(-37);
    expect(shown.at(-1)).toBe(0);
  });
});
