import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimePlatform } from '../../src/platform/runtimePlatform';

const fakes = vi.hoisted(() => ({ isTauri: vi.fn(() => false) }));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: vi.fn() }));

/* Gerçek cihazlardan alınmış kullanıcı ajanları; tespit bunlara karşı sınanır. */
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 16; SM-G990B2 Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/152.0.7977.87 Mobile Safari/537.36';
const LINUX_WEBKITGTK =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_WEBVIEW2 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

function probe(tauri: boolean, userAgent: string) {
  return { isTauri: () => tauri, userAgent: () => userAgent };
}

afterEach(() => {
  vi.unstubAllGlobals();
  fakes.isTauri.mockReturnValue(false);
});

describe('getRuntimePlatform', () => {
  it('Tauri dışında her kullanıcı ajanı web sayılır — telefon tarayıcısı dahil', () => {
    expect(getRuntimePlatform(probe(false, ANDROID_WEBVIEW))).toBe('web');
    expect(getRuntimePlatform(probe(false, WINDOWS_WEBVIEW2))).toBe('web');
  });

  it('Tauri içindeki Android WebView android sayılır', () => {
    expect(getRuntimePlatform(probe(true, ANDROID_WEBVIEW))).toBe('android');
  });

  it("Tauri içindeki masaüstü WebView'ları desktop sayılır", () => {
    expect(getRuntimePlatform(probe(true, LINUX_WEBKITGTK))).toBe('desktop');
    expect(getRuntimePlatform(probe(true, WINDOWS_WEBVIEW2))).toBe('desktop');
  });

  it('"Android" kelime olarak aranır; içinde geçen başka bir ad eşleşmez', () => {
    expect(getRuntimePlatform(probe(true, 'Mozilla/5.0 (X11; Linux) NotAndroidish/1.0'))).toBe(
      'desktop',
    );
  });

  it("varsayılan sonda Tauri'nin isTauri'sini ve navigator kullanıcı ajanını okur", () => {
    expect(getRuntimePlatform()).toBe('web');

    fakes.isTauri.mockReturnValue(true);
    vi.stubGlobal('navigator', { userAgent: ANDROID_WEBVIEW });
    expect(getRuntimePlatform()).toBe('android');
  });

  it('navigator olmayan ortamda Tauri içi masaüstü sayılır', () => {
    fakes.isTauri.mockReturnValue(true);
    vi.stubGlobal('navigator', undefined);
    expect(getRuntimePlatform()).toBe('desktop');
  });
});
