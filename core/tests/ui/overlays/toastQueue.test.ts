import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_VISIBLE_TOASTS,
  TOAST_FADE_OUT_MS,
  ToastManager,
} from '../../../src/ui/overlays/Toast';

/**
 * Bildirim sözleşmesi: en çok 3 görünür, fazlası kaybolmadan sırada bekler; kritik bildirim önceliklidir,
 * `role="alert"` taşır ve sessizce düşmez; zorunlu 3 sn gizleme yok (eylemli/kritik kalıcıdır, fare ya da
 * odak süreyi durdurur); eylem ve kapatma düğmeleri çalışır.
 */
let toasts: ToastManager;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  toasts = new ToastManager(document.body);
});

afterEach(() => {
  toasts.destroy();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const texts = (): string[] =>
  [...document.querySelectorAll('.vol-toast__message')].map((el) => el.textContent ?? '');

describe('kuyruk', () => {
  it('en çok 3 görünür; fazlası sırada bekler ve yer açılınca sırayla gösterilir', () => {
    for (const n of ['1', '2', '3', '4', '5']) toasts.show(n, { durationMs: 1000 });
    expect(texts()).toEqual(['1', '2', '3']);
    expect(MAX_VISIBLE_TOASTS).toBe(3);
    vi.advanceTimersByTime(1000 + TOAST_FADE_OUT_MS + 1);
    expect(texts()).toEqual(['4', '5']);
    vi.advanceTimersByTime(1000 + TOAST_FADE_OUT_MS + 1);
    expect(texts()).toEqual([]);
  });

  it('kritik bildirim görünen geçici bildirimin yerine geçer, role=alert taşır ve kalıcıdır', () => {
    for (const n of ['1', '2', '3']) toasts.show(n, { durationMs: 60000 });
    toasts.show('Sağlık kritik', { variant: 'danger', dismissLabel: 'Kapat' });
    expect(texts()).toEqual(['2', '3', 'Sağlık kritik']);
    const alert = document.querySelector('.vol-toast[role="alert"]');
    expect(alert?.textContent).toContain('Sağlık kritik');
    vi.advanceTimersByTime(60_000);
    expect(texts()).toContain('Sağlık kritik');
  });

  it('görünenlerin hepsi kritikse yeni kritik sırada bekler ve sessizce düşmez', () => {
    for (const n of ['A', 'B', 'C']) toasts.show(n, { critical: true, dismissLabel: 'Kapat' });
    toasts.show('D', { critical: true, dismissLabel: 'Kapat' });
    expect(texts()).toEqual(['A', 'B', 'C']);
    (document.querySelector('.vol-toast__dismiss') as HTMLButtonElement).click();
    vi.advanceTimersByTime(TOAST_FADE_OUT_MS + 1);
    expect(texts()).toEqual(['B', 'C', 'D']);
  });

  it('sıra sınırı aşılınca kritik olmayan düşer, kritik sırada öne geçer ve hiç kaybolmaz', () => {
    for (const n of ['A', 'B', 'C']) toasts.show(n, { critical: true, dismissLabel: 'Kapat' });
    toasts.show('X', { critical: true, dismissLabel: 'Kapat' });
    for (let i = 0; i < 12; i += 1) toasts.show(`n${i}`, { durationMs: 60000 });
    toasts.show('Y', { critical: true, dismissLabel: 'Kapat' });

    const dismissFirst = (): void => {
      (document.querySelector('.vol-toast__dismiss') as HTMLButtonElement).click();
      vi.advanceTimersByTime(TOAST_FADE_OUT_MS + 1);
    };
    for (let i = 0; i < 3; i += 1) dismissFirst();
    // Kritikler (X, Y) normal bildirimlerin önüne geçti.
    expect(texts().slice(0, 2)).toEqual(['X', 'Y']);
    // Sıra sınırı: 12 normal bildirimin yalnız bir kısmı bekliyor (kritikler dahil 8 sınırı).
    for (let i = 0; i < 2; i += 1) dismissFirst();
    const seen = texts();
    expect(seen).toHaveLength(3);
    expect(seen.every((text) => text.startsWith('n'))).toBe(true);
  });
});

describe('zorunlu gizleme yok', () => {
  it('eylemli bildirim kalıcıdır; eylem çalışınca kapanır', () => {
    const onAction = vi.fn();
    toasts.show('Silindi', { action: { label: 'Geri al', onAction }, dismissLabel: 'Kapat' });
    vi.advanceTimersByTime(30_000);
    expect(texts()).toEqual(['Silindi']);
    (document.querySelector('.vol-toast__action') as HTMLButtonElement).click();
    expect(onAction).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_FADE_OUT_MS + 1);
    expect(texts()).toEqual([]);
  });

  it('kapatma düğmesi adlıdır ve kalıcı bildirimi kapatır', () => {
    toasts.show('Bağlantı koptu', { persistent: true, dismissLabel: 'Kapat' });
    const dismiss = document.querySelector('.vol-toast__dismiss') as HTMLButtonElement;
    expect(dismiss.getAttribute('aria-label')).toBe('Kapat');
    dismiss.click();
    vi.advanceTimersByTime(TOAST_FADE_OUT_MS + 1);
    expect(texts()).toEqual([]);
  });

  it('fare ya da odak üzerindeyken süre durur, ayrılınca kalan süre işler', () => {
    toasts.show('Okunuyor', { durationMs: 1000 });
    const element = document.querySelector('.vol-toast') as HTMLElement;
    vi.advanceTimersByTime(600);
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(10_000);
    expect(texts()).toEqual(['Okunuyor']);
    element.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(399);
    expect(texts()).toEqual(['Okunuyor']);
    vi.advanceTimersByTime(2 + TOAST_FADE_OUT_MS);
    expect(texts()).toEqual([]);
  });
});
