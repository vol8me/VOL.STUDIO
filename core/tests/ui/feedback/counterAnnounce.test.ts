import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTER_ANNOUNCE_GAP_MS, Counter } from '../../../src/ui/feedback/Counter';
import { ResourceCounter } from '../../../src/ui/feedback/ResourceCounter';

const status = (c: { element: HTMLElement }) =>
  c.element.querySelector('.vol-sr-only')!.textContent;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Counter okuyucu duyurusu', () => {
  it('ilk değişim hemen, sıkışık değişimler aralık sonunda SON değerle duyulur', () => {
    const counter = new Counter({ value: 0, animateMs: 0 });
    counter.setValue(1);
    expect(status(counter)).toBe('1');
    for (let v = 2; v <= 50; v += 1) {
      vi.advanceTimersByTime(16);
      counter.setValue(v);
    }
    expect(status(counter)).toBe('1'); // birleştirildi: ara değerler duyulmadı
    vi.advanceTimersByTime(COUNTER_ANNOUNCE_GAP_MS);
    expect(status(counter)).toBe('50');
    counter.destroy();
  });

  it('sessiz dönemden sonraki değişim yine hemen duyulur; destroy bekleyeni iptal eder', () => {
    const counter = new Counter({ value: 0, animateMs: 0 });
    counter.setValue(5);
    vi.advanceTimersByTime(COUNTER_ANNOUNCE_GAP_MS + 10);
    counter.setValue(6);
    expect(status(counter)).toBe('6');
    counter.setValue(7);
    counter.destroy();
    vi.advanceTimersByTime(5000);
    expect(status(counter)).toBe('6');
  });
});

describe('ResourceCounter erişilebilirlik', () => {
  it('kök adlı gruptur ve duyuru kaynak adını taşır', () => {
    const counter = new ResourceCounter({ icon: '🔫', label: 'Mermi', value: 12, animateMs: 0 });
    expect(counter.element.getAttribute('role')).toBe('group');
    expect(counter.element.getAttribute('aria-label')).toBe('Mermi');
    expect(status(counter)).toBe('Mermi 12');
    counter.setValue(11);
    expect(status(counter)).toBe('Mermi 11');
    counter.destroy();
  });
});
