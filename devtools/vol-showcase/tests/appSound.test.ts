import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeController } from '@volstudio/core/ui';
import { startAppSound } from '../src/appSound';

/** Uygulama geneli arayüz sesi: bağlam ilk kullanıcı jestine kadar KURULMAZ, tek kez kurulur, sökülünce susar. */
class StubContext {
  static created = 0;
  state: AudioContextState = 'suspended';
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
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

describe('startAppSound', () => {
  let root: HTMLElement;

  beforeEach(() => {
    StubContext.created = 0;
    root = document.createElement('div');
    document.body.append(root);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(8)))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('bağlam yoksa hiçbir şey kurmaz ve fırlatmaz', () => {
    vi.stubGlobal('AudioContext', undefined);
    const handle = startAppSound(root, new ThemeController());
    expect(() => root.dispatchEvent(new Event('pointerdown'))).not.toThrow();
    expect(() => handle.dispose()).not.toThrow();
  });

  it('bağlam ilk jestte bir kez kurulur; jestten önce kurulmaz', () => {
    vi.stubGlobal('AudioContext', StubContext);
    const handle = startAppSound(root, new ThemeController());
    expect(StubContext.created).toBe(0);
    root.dispatchEvent(new Event('pointerdown'));
    root.dispatchEvent(new Event('keydown'));
    root.dispatchEvent(new Event('pointerdown'));
    expect(StubContext.created).toBe(1);
    handle.dispose();
  });

  it('sökülünce jest dinleyicisi kalkar ve ikinci söküm güvenlidir', () => {
    vi.stubGlobal('AudioContext', StubContext);
    const handle = startAppSound(root, new ThemeController());
    handle.dispose();
    handle.dispose();
    root.dispatchEvent(new Event('pointerdown'));
    expect(StubContext.created).toBe(0);
  });

  it('aurum temasında kit aurum paletinden başlar', () => {
    vi.stubGlobal('AudioContext', StubContext);
    const theme = new ThemeController({ theme: 'aurum' });
    const handle = startAppSound(root, theme);
    root.dispatchEvent(new Event('pointerdown'));
    expect(StubContext.created).toBe(1);
    theme.setTheme('default');
    handle.dispose();
  });
});
