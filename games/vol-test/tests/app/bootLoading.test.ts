import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootLoading } from '../../src/app/bootLoading';

const screen = () => document.querySelector<HTMLElement>('.vol-loading');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('açılış yüklemesi', () => {
  it('hızlı açılışta (200 ms altı) ekran hiç görünmez ve kaldırılır', () => {
    const loading = new BootLoading();
    expect(screen()?.classList.contains('vol-loading--pending')).toBe(true);
    loading.servicesReady();
    loading.assets(1);
    loading.worldReady();
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(300);
    expect(screen()).toBeNull();
  });

  it('görünür olduysa en az 400 ms kalır; ilerleme aşamalardan gelir', () => {
    const loading = new BootLoading();
    vi.advanceTimersByTime(250);
    expect(screen()?.classList.contains('vol-loading--pending')).toBe(false);
    loading.servicesReady();
    expect(screen()?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '25',
    );
    loading.assets(0.5);
    expect(screen()?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '58',
    );
    loading.worldReady();
    vi.advanceTimersByTime(100);
    expect(screen()).not.toBeNull(); // asgari süre dolmadı
    vi.advanceTimersByTime(900);
    expect(screen()).toBeNull();
  });

  it('abort ekranı hemen çeker', () => {
    const loading = new BootLoading();
    loading.abort();
    expect(screen()).toBeNull();
  });
});
