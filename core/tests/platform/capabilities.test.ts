import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canHover,
  hasTouchInput,
  isTouchPrimary,
  shouldUseTouchControls,
} from '../../src/platform/capabilities';

/** Verilen sorguları eşleşir sayan bir matchMedia sahtesi kurar. */
function mockMedia(matching: readonly string[]): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
    media: query,
  }));
  // `window.matchMedia` erişimi de aynı sahteyi görmeli.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: matching.includes(query), media: query }),
  });
}

function mockTouchPoints(count: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => count,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockTouchPoints(0);
});

describe('cihaz yetenek tespiti', () => {
  it('telefon profili: kaba işaretçi, hover yok → ekran üstü kontroller AÇIK', () => {
    mockMedia(['(pointer: coarse)', '(any-pointer: coarse)']);
    mockTouchPoints(5);

    expect(isTouchPrimary()).toBe(true);
    expect(canHover()).toBe(false);
    expect(hasTouchInput()).toBe(true);
    expect(shouldUseTouchControls()).toBe(true);
  });

  it('fareli masaüstü profili: ekran üstü kontroller KAPALI', () => {
    mockMedia(['(pointer: fine)', '(hover: hover)']);
    mockTouchPoints(0);

    expect(isTouchPrimary()).toBe(false);
    expect(canHover()).toBe(true);
    expect(hasTouchInput()).toBe(false);
    expect(shouldUseTouchControls()).toBe(false);
  });

  it('dokunmatik ekranlı dizüstü: dokunmatik VAR ama birincil DEĞİL', () => {
    // Ayrımın asıl gerekçesi: burada ekranı kaplayan düğmeler zarar verir,
    // çünkü oyuncu klavye/fare kullanıyordur.
    mockMedia(['(pointer: fine)', '(hover: hover)', '(any-pointer: coarse)']);
    mockTouchPoints(10);

    expect(hasTouchInput()).toBe(true);
    expect(isTouchPrimary()).toBe(false);
    expect(shouldUseTouchControls()).toBe(false);
  });

  it('maxTouchPoints yoksa any-pointer sorgusuna düşer', () => {
    mockMedia(['(any-pointer: coarse)']);
    mockTouchPoints(0);

    expect(hasTouchInput()).toBe(true);
  });

  it('matchMedia bulunmayan ortamda sessizce false döner', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    mockTouchPoints(0);

    expect(isTouchPrimary()).toBe(false);
    expect(canHover()).toBe(false);
    expect(shouldUseTouchControls()).toBe(false);
  });
});
