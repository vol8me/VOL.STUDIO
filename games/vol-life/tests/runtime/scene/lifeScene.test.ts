import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import {
  ViewportManager,
  VIEWPORT_REGISTRY_KEY,
  i18n,
  i18next,
  setHapticsDriver,
  setHapticsEnabled,
} from '@volstudio/core';
import type { SaveManager } from '@volstudio/core';
import { LifePreferences } from '@/app/LifePreferences';
import { OrientationPreference } from '@/app/OrientationPreference';
import { lifeGraphicsConfig } from '@/config/graphics';
import { LifeScene, type LifeSceneServices } from '@/runtime/scene/LifeScene';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import { stubViewport } from '../../support/viewport';

interface Harness {
  scene: LifeScene;
  camera: { setViewport: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn> };
  worldRuntime: {
    update: ReturnType<typeof vi.fn>;
    refreshViewport: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

const scenes: LifeScene[] = [];

function mountScene(
  services: Partial<LifeSceneServices>,
  registry?: { get(key: string): unknown },
): Harness {
  const worldRuntime = { update: vi.fn(), refreshViewport: vi.fn(), destroy: vi.fn() };
  const scene = new LifeScene({
    ...services,
    createRuntime: services.createRuntime ?? (() => worldRuntime),
  });
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  document.body.appendChild(container);
  const camera = { setViewport: vi.fn(), setZoom: vi.fn(), centerOn: vi.fn() };
  Object.assign(scene as unknown as Record<string, unknown>, {
    game: { canvas, registry },
    cameras: { main: camera },
    events: new Phaser.Events.EventEmitter(),
  });
  scene.create();
  scenes.push(scene);
  return { scene, camera, worldRuntime };
}

function actionOrder(): string[] {
  return [...document.querySelectorAll('.vol-life-hud__actions > button')].map((button) =>
    button.classList.contains('vol-life-hud__options') ? 'options' : 'fullscreen',
  );
}

/** Kullanıcı gibi seçenekler yüzeyini açar. */
function openOptions(): void {
  if (document.querySelector('.vol-life-options-sheet.vol-modal--visible')) return;
  document.querySelector<HTMLButtonElement>('.vol-life-hud__options')!.click();
}

function optionRows(): NodeListOf<Element> {
  openOptions();
  return document.querySelectorAll('.vol-life-options__row');
}

function rowButtons(key: string): HTMLButtonElement[] {
  openOptions();
  const row = document.querySelector<HTMLElement>(`[data-option="${key}"]`)!;
  return [...row.querySelectorAll<HTMLButtonElement>('button')];
}

function memorySaveManager(): SaveManager {
  const data = new Map<string, unknown>();
  return {
    load: vi.fn((key: string, fallback: unknown) =>
      Promise.resolve(data.has(key) ? data.get(key) : fallback),
    ),
    save: vi.fn((key: string, value: unknown) => {
      data.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as SaveManager;
}

beforeAll(async () => {
  i18n.addResources('tr', 'life', tr);
  i18n.addResources('en', 'life', en);
  await i18n.init();
}, 60_000);

afterEach(() => {
  setHapticsDriver(null);
  setHapticsEnabled(false);
  while (scenes.length > 0) scenes.pop()?.events.emit('shutdown');
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LifeScene yaşam döngüsü', () => {
  it('sabit bir sahne anahtarıyla kurulur', () => {
    const scene = new LifeScene({ platform: 'web' });
    expect(scene.sys.settings.key).toBe('LifeScene');
  });

  /*
   * Sahne SHUTDOWN almadan yeniden kurulursa önceki kapsam sahipsiz kalır:
   * HUD elemanları DOM'da, rAF döngüsü ve dil aboneliği ayakta kalırdı.
   */
  it('yeniden kurulumda ÖNCEKİ kapsamı toplar', () => {
    const scene = new LifeScene({ platform: 'web' });
    const disposed: string[] = [];
    (scene as unknown as { runtimeScope: unknown }).runtimeScope = {
      dispose: () => disposed.push('ilk'),
    };

    // `create()` Phaser bağlamı ister; burada yalnız ilk satırın etkisi ölçülür.
    try {
      scene.create();
    } catch {
      /* Phaser bağlamı yok; kapsam temizliği create()in İLK işidir. */
    }

    expect(disposed).toEqual(['ilk']);
  });

  it('SHUTDOWN ve DESTROY olaylarının her ikisi de kapsamı temizler', () => {
    const { scene, worldRuntime } = mountScene({ platform: 'web' });
    const scope = () => (scene as unknown as { runtimeScope: unknown }).runtimeScope;
    expect(scope()).not.toBeNull();

    scene.events.emit('shutdown');
    expect(scope()).toBeNull();
    expect(document.querySelector('.vol-life-hud')).toBeNull();
    expect(worldRuntime.destroy).toHaveBeenCalledOnce();

    scene.create();
    expect(scope()).not.toBeNull();
    scene.events.emit('destroy');
    expect(scope()).toBeNull();
  });

  it('Phaser update deltasını dünya runtimeına iletir', () => {
    const { scene, worldRuntime } = mountScene({ platform: 'web' });

    scene.update(100, 16.67);

    expect(worldRuntime.update).toHaveBeenCalledWith(16.67);
  });
});

describe('LifeScene platform matrisi (DESIGN.md §6)', () => {
  it('web: tam ekran + seçenekler; çıkış onayı ve görüntü kipi satırı yok', () => {
    mountScene({ platform: 'web' });

    expect(actionOrder()).toEqual(['fullscreen', 'options']);
    expect(optionRows()).toHaveLength(4);
    window.dispatchEvent(new Event('vol:androidback'));
    expect(document.querySelector('.vol-modal--visible')).toBeNull();
  });

  it('masaüstü: yalnız seçenekler; pencere / tam ekran satırı tercihi iki yönde izler', async () => {
    const preferences = new LifePreferences(memorySaveManager());
    mountScene({ platform: 'desktop', preferences });

    expect(actionOrder()).toEqual(['options']);
    const [windowed, fullscreen] = rowButtons('display');
    expect(windowed.getAttribute('aria-checked')).toBe('true');

    // F11 ya da pencere yöneticisi tercihi değiştirir; panel gerçeği gösterir.
    await preferences.setDisplayMode('fullscreen');
    expect(fullscreen.getAttribute('aria-checked')).toBe('true');

    windowed.click();
    expect(preferences.getDisplayMode()).toBe('windowed');
  });

  it('tercih yazılamazsa kullanıcıya görünür uyarı çıkarır', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saveManager = memorySaveManager();
    vi.mocked(saveManager.save).mockRejectedValueOnce(new Error('disk dolu'));
    const preferences = new LifePreferences(saveManager);
    mountScene({ platform: 'web', preferences });

    await preferences.setShowFps(true);

    expect(document.querySelector('.vol-toast--danger')?.textContent).toBe(
      i18next.t('life:options.saveFailed'),
    );
  });

  it('Android: yalnız seçenekler; geri hareketi önce paneli kapatır, sonra çıkış onayı sorar', () => {
    mountScene({ platform: 'android' });
    expect(actionOrder()).toEqual(['options']);

    document.querySelector<HTMLButtonElement>('.vol-life-hud__options')!.click();
    expect(document.querySelector('.vol-life-options-sheet.vol-modal--visible')).not.toBeNull();

    window.dispatchEvent(new Event('vol:androidback'));
    expect(document.querySelector('.vol-life-options-sheet.vol-modal--visible')).toBeNull();
    expect(document.querySelector('.vol-modal--visible')).toBeNull();

    window.dispatchEvent(new Event('vol:androidback'));
    expect(document.querySelector('.vol-modal--visible')).not.toBeNull();
  });

  it('Android: dokunsalı açan ilk seçim native geri bildirimi hemen üretir', async () => {
    const play = vi.fn();
    setHapticsDriver({ play });
    const preferences = new LifePreferences(memorySaveManager());
    mountScene({ platform: 'android', preferences });
    const input = document.querySelector<HTMLInputElement>('[data-option="haptics"] input')!;

    input.click();

    expect(play).toHaveBeenCalledWith('select');
    await vi.waitFor(() => expect(preferences.get().hapticsEnabled).toBe(true));
  });
});

describe('LifeScene ekran yönü', () => {
  it('köprü yokken yön kontrolü pasiftir ve ekranın gerçek yönünü izler', () => {
    const viewport = stubViewport('portrait');
    mountScene({ platform: 'web', orientation: new OrientationPreference(null) });

    const [portrait, landscape] = rowButtons('orientation');
    expect(portrait.disabled && landscape.disabled).toBe(true);
    expect(portrait.getAttribute('aria-checked')).toBe('true');

    viewport.rotate('landscape');
    expect(landscape.getAttribute('aria-checked')).toBe('true');
  });

  it('Android: seçim köprüye gider; istek uygulanmazsa seçim gerçek yöne döner', async () => {
    vi.useFakeTimers();
    stubViewport('portrait');
    const bridge = {
      getState: vi.fn(() =>
        Promise.resolve({ current: 'portrait' as const, preferred: null, supported: true }),
      ),
      set: vi.fn(() =>
        Promise.resolve({
          current: 'portrait' as const,
          preferred: 'landscape' as const,
          supported: true,
        }),
      ),
    };
    const orientation = new OrientationPreference(bridge, 500);
    await orientation.load();
    mountScene({ platform: 'android', orientation });

    const [portrait, landscape] = rowButtons('orientation');
    expect(landscape.disabled).toBe(false);
    landscape.click();
    expect(bridge.set).toHaveBeenCalledWith('landscape');
    expect(landscape.getAttribute('aria-checked')).toBe('true');

    await vi.advanceTimersByTimeAsync(500);
    expect(portrait.getAttribute('aria-checked')).toBe('true');
  });

  it('Android: çoklu pencere değişimi yön kontrolünün etkinliğine canlı yansır', async () => {
    stubViewport('portrait');
    const bridge = {
      getState: vi.fn(() =>
        Promise.resolve({ current: 'portrait' as const, preferred: null, supported: true }),
      ),
      set: vi.fn(),
    };
    const orientation = new OrientationPreference(bridge);
    await orientation.load();
    mountScene({ platform: 'android', orientation });
    const buttons = rowButtons('orientation');
    expect(buttons.every((button) => !button.disabled)).toBe(true);

    bridge.getState.mockResolvedValueOnce({
      current: 'portrait',
      preferred: null,
      supported: false,
    });
    window.dispatchEvent(new Event('vol:windowmodechange'));

    await vi.waitFor(() => expect(buttons.every((button) => button.disabled)).toBe(true));
  });
});

describe('LifeScene viewport sözleşmesi', () => {
  /*
   * Gerçek `ViewportManager` ve gerçek `applyVolViewport` üzerinden: sahne
   * sözleşmeye bağlanmazsa arka tampon DPR ile büyür ama kamera 1'de kalır.
   */
  it.each([1, 2, 3])('DPR %i: kamera zoomu rasterleme çarpanına eşitlenir', (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    const manager = new ViewportManager({
      strategy: 'resize',
      renderScale: lifeGraphicsConfig.renderScale,
    });
    const { camera } = mountScene(
      { platform: 'web' },
      { get: (key) => (key === VIEWPORT_REGISTRY_KEY ? manager : undefined) },
    );

    const quality = dpr * lifeGraphicsConfig.renderScale;
    expect(manager.resolveRenderQuality()).toBe(quality);
    expect(camera.setZoom).toHaveBeenCalledWith(quality);
    expect(camera.setViewport).toHaveBeenCalledWith(
      0,
      0,
      window.innerWidth * quality,
      window.innerHeight * quality,
    );
  });
});
