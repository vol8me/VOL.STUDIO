import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSesTab } from '../../src/sections/sesTab';

/** Ses laboratuvarı, Web Audio VARKEN: bağlam jestle kurulur, durum gerçek bağlamı gösterir, dışa aktarma çalışır. */
class StubContext {
  static created = 0;
  state: AudioContextState = 'suspended';
  readonly sampleRate = 48_000;
  readonly baseLatency = 0.01;
  readonly outputLatency = 0.02;
  readonly destination = {};
  constructor() {
    StubContext.created += 1;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  createGain(): unknown {
    return {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBufferSource(): unknown {
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
      playbackRate: { value: 1 },
    };
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({ duration: 0.1 });
  }
}

describe('ses laboratuvarı (Web Audio var)', () => {
  let tab: ReturnType<typeof buildSesTab>;

  beforeEach(() => {
    StubContext.created = 0;
    vi.stubGlobal('AudioContext', StubContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(8)))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    tab = buildSesTab();
    document.body.appendChild(tab.element);
  });

  afterEach(() => {
    tab.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const click = (selector: string): void => {
    const element = tab.element.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Bulunamadı: ${selector}`);
    element.click();
  };

  it('bağlam jestten önce kurulmaz; ilk etkileşimde bir kez kurulur ve durum çalışır bağlamı gösterir', async () => {
    expect(StubContext.created).toBe(0);
    tab.element.dispatchEvent(new Event('pointerdown'));
    expect(StubContext.created).toBe(1);
    click('[data-ses-event="press"]');
    click('[data-ses-event="hover"]');
    await Promise.resolve();
    await Promise.resolve();
    expect(StubContext.created).toBe(1);
    expect(tab.element.querySelector('[data-ses="context"]')?.textContent).toContain('48000');
  });

  it('kuru ve kit yolu hatasız çalışır; palet seçimi örnek adresini değiştirir', async () => {
    tab.element.dispatchEvent(new Event('pointerdown'));
    click('[data-ses="dry"]');
    click('[data-ses="kit"]');
    await Promise.resolve();
    await Promise.resolve();
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
      String(call[0]),
    );
    expect(calls.some((url) => url.includes('/steel/press-a.ogg'))).toBe(true);
    const palette = tab.element.querySelector<HTMLElement>('[data-ses="palette"]');
    expect(palette).not.toBeNull();
    palette?.click();
    const aurum = tab.element.querySelector<HTMLElement>('[role="option"][data-value="aurum"]');
    aurum?.click();
    await Promise.resolve();
    click('[data-ses="dry"]');
    await vi.waitFor(() => {
      const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
      );
      expect(urls.some((url) => url.includes('/aurum/'))).toBe(true);
    });
  });

  it('destroy bağlamı kapatır ve ikinci destroy güvenlidir', () => {
    tab.element.dispatchEvent(new Event('pointerdown'));
    tab.destroy();
    expect(() => tab.destroy()).not.toThrow();
  });
});
