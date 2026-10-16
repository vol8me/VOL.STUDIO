import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { getBackHandlerCount, triggerBack } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import type { GameServices } from '@/app/GameServices';
import { FACTION_AUTO, type GamePreferences } from '@/app/GameSettings';
import { VEHICLES } from '@/config/vehicles';
import { GarageScene } from '@/scenes/GarageScene';
import { MenuScene } from '@/scenes/MenuScene';
import { DevScene } from '@/scenes/DevScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import type { ScreenScene } from '@/scenes/ScreenScene';

const showroom = vi.hoisted(() => ({
  setVehicle: vi.fn(),
  update: vi.fn(),
  destroy: vi.fn(),
  clock: 0,
  area: undefined as { x: number; y: number; width: number; height: number } | undefined,
  created: 0,
}));
const online = vi.hoisted(() => ({
  connectWar: vi.fn(),
  lobbyErrorKey: vi.fn(() => 'voltest:online.error.unreachable'),
}));

const sceneAudio = vi.hoisted(() => ({ create: vi.fn((): unknown => null) }));
vi.mock('@/audio/sceneAudio', () => ({ createSceneAudio: sceneAudio.create }));

vi.mock('@/view/Showroom', () => ({
  Showroom: class {
    setVehicle = showroom.setVehicle;
    update = showroom.update;
    destroy = showroom.destroy;
    clockMs = 0;
    constructor() {
      showroom.created += 1;
    }
    get freeArea() {
      return showroom.area;
    }
  },
}));
vi.mock('@/scenes/world/online', () => online);
vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  applyVolViewport: vi.fn(),
}));

interface Harness<T extends ScreenScene> {
  scene: T;
  parent: HTMLElement;
  start: ReturnType<typeof vi.fn>;
  /** Şerit çıkış süresine kurulan zamanlayıcı çağrıları (`time.delayedCall`). */
  transition: ReturnType<typeof vi.fn>;
  registry: Map<string, unknown>;
  scenePlugin: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    launch: ReturnType<typeof vi.fn>;
    active: Set<string>;
  };
  /** Kayma bitti: bekleyen sahne geçişini tamamlar. */
  finishFade: () => void;
  shutdown: () => void;
  find: <E extends HTMLElement = HTMLElement>(id: string) => E;
  update: ReturnType<typeof vi.fn>;
}

const harnesses: Array<Harness<ScreenScene>> = [];

function services(
  overrides: Partial<GamePreferences> = {},
  platform = 'windows',
): {
  services: GameServices;
  update: ReturnType<typeof vi.fn>;
  /** Ayar değişimini abonelere yayar (kayıt `patch` ile güncellenir). */
  emit: (patch: Partial<GamePreferences>) => void;
} {
  const preferences = {
    vehicle: 'striker',
    faction: FACTION_AUTO,
    playerName: 'Ada',
    quality: 'high',
    language: 'auto',
    volume: 1,
    haptics: true,
    grid: true,
    display: 'windowed',
    scenario: 'empty',
    seed: 1,
    backdropDensity: 5,
    season: 'auto',
    weather: 'auto',
    ...overrides,
  };
  const update = vi.fn(() => Promise.resolve());
  const listeners = new Set<(value: typeof preferences) => void>();
  return {
    update,
    emit: (patch) => {
      Object.assign(preferences, patch);
      for (const listener of listeners) listener(preferences);
    },
    services: {
      platform,
      displayAvailable: true,
      settings: {
        get: () => preferences,
        update,
        subscribe: (listener: (value: typeof preferences) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      onResume: () => () => undefined,
    } as unknown as GameServices,
  };
}

function mount<T extends ScreenScene>(make: () => T): Harness<T> {
  const scene = make();
  const parent = document.createElement('div');
  document.body.append(parent);
  const start = vi.fn();
  const handlers: Array<() => void> = [];
  const registry = new Map<string, unknown>();
  const active = new Set<string>();
  const scenePlugin = {
    start,
    stop: vi.fn((key: string) => active.delete(key)),
    launch: vi.fn((key: string) => active.add(key)),
    active,
  };
  const transition = vi.fn((_ms: number, handler: () => void) => handlers.push(handler));
  let shutdown = (): void => undefined;
  Object.assign(scene, {
    cameras: { main: { width: 1280, height: 800, setBackgroundColor: vi.fn() } },
    game: {
      canvas: { parentElement: parent },
      registry: {
        get: (key: string) => registry.get(key),
        set: (key: string, value: unknown) => registry.set(key, value),
      },
    },
    events: { once: (_name: string, handler: () => void) => (shutdown = handler) },
    time: { delayedCall: transition },
    scene: {
      start,
      get: (key: string) => (key === 'Backdrop' ? {} : null),
      isActive: (key: string) => active.has(key),
      launch: scenePlugin.launch,
      stop: scenePlugin.stop,
    },
  });
  scene.create();
  const harness: Harness<T> = {
    scene,
    parent,
    start,
    transition,
    registry,
    scenePlugin,
    finishFade: () => handlers.splice(0).forEach((handler) => handler()),
    shutdown: () => shutdown(),
    find: <E extends HTMLElement = HTMLElement>(id: string): E =>
      parent.querySelector<E>(`[data-testid="${id}"]`)!,
    update: showroom.update,
  };
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    harness.shutdown();
    harness.parent.remove();
  }
  vi.clearAllMocks();
  await i18next.changeLanguage('tr');
});

function nativeWindow(available = true) {
  return { isAvailable: () => available, close: vi.fn(() => Promise.resolve()) };
}

describe('ScreenScene arayüz sesi', () => {
  it('menü ekranları oyun içi UI ses kitini kökün niyet veriyoluna bağlar, ayardaki ses düzeyini uygular ve kapanışta söker', () => {
    const audio = {
      attachUi: vi.fn(),
      setVolume: vi.fn(),
      resumeAfterWake: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
    };
    sceneAudio.create.mockReturnValueOnce(audio);
    const { services: env } = services({ volume: 0.4 });
    const menu = mount(() => new MenuScene(env, nativeWindow() as never));
    expect(audio.attachUi).toHaveBeenCalledTimes(1);
    expect(audio.setVolume).toHaveBeenCalledWith(0.4);
    menu.shutdown();
    expect(audio.dispose).toHaveBeenCalledTimes(1);
  });

  it('Web Audio yoksa ekran sessiz açılır', () => {
    sceneAudio.create.mockReturnValueOnce(null);
    const { services: env } = services();
    expect(() => mount(() => new MenuScene(env, nativeWindow() as never))).not.toThrow();
  });
});

describe('ScreenScene odağı', () => {
  it('ilk karede varsayılan öğeye odak verir, ama kullanıcının seçtiği alanı çalmaz', async () => {
    const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
    const { services: env } = services();
    const idle = mount(() => new GarageScene(env));
    await frame();
    await frame();
    expect(document.activeElement).toBe(
      idle.find('garage-vehicle-striker').querySelector('.vol-card__action'),
    );
    idle.shutdown();
    idle.parent.remove();

    const typing = mount(() => new GarageScene(env));
    const name = typing.find<HTMLInputElement>('garage-name');
    name.focus();
    await frame();
    await frame();
    expect(document.activeElement).toBe(name);
  });
});

describe('MenuScene', () => {
  it('menüyü kurar, vitrini çizer ve her seçeneği solarak ilgili sahneye götürür', () => {
    const { services: env } = services();
    showroom.created = 0;
    const harness = mount(() => new MenuScene(env, nativeWindow() as never));
    expect(harness.find('menu')).not.toBeNull();
    harness.scene.update(0, 16);
    // Ana menüde araç tablası yoktur; yalnız arkadaki alay görünür.
    expect(showroom.created).toBe(0);
    expect(showroom.update).not.toHaveBeenCalled();

    harness.find('menu-play').click();
    expect(harness.find('menu').dataset.leaving).toBe('true');
    expect(harness.transition).toHaveBeenCalledTimes(1);
    expect(harness.start).not.toHaveBeenCalled();
    // Geçiş sürerken ikinci seçim yok sayılır.
    harness.find('menu-practice').click();
    expect(harness.transition).toHaveBeenCalledTimes(1);
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith('Garage', {});
  });

  it.each([
    ['menu-practice', 'World'],
    ['menu-settings', 'Settings'],
    ['menu-dev', 'Dev'],
  ])('%s → %s', (id, target) => {
    const { services: env } = services();
    const harness = mount(() => new MenuScene(env, nativeWindow() as never));
    harness.find(id).click();
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith(target, {});
  });

  it('çıkış yalnız native masaüstünde vardır; Android ve tarayıcıda yoktur', () => {
    const desktop = mount(() => new MenuScene(services().services, nativeWindow() as never));
    expect(desktop.find('menu-exit')).not.toBeNull();
    const android = mount(
      () => new MenuScene(services({}, 'android').services, nativeWindow() as never),
    );
    expect(android.find('menu-exit')).toBeNull();
    const web = mount(
      () => new MenuScene(services({}, 'web').services, nativeWindow(false) as never),
    );
    expect(web.find('menu-exit')).toBeNull();
  });

  it('çıkış onaylanınca uygulama kapanır, vazgeçilince kapanmaz', async () => {
    const native = nativeWindow();
    const { services: env } = services();
    const harness = mount(() => new MenuScene(env, native as never));
    // Kapanan önceki modal geçiş süresince DOM'da kalır; en son açılan geçerlidir.
    const confirmButton = (label: string): HTMLButtonElement | undefined =>
      [...harness.parent.querySelectorAll<HTMLButtonElement>('.vol-modal button')]
        .filter((button) => button.textContent === label)
        .at(-1);

    harness.find('menu-exit').click();
    await vi.waitFor(() => expect(confirmButton('Vazgeç')).toBeDefined());
    confirmButton('Vazgeç')?.click();
    await vi.waitFor(() => expect(harness.parent.querySelector('.vol-modal--open')).toBeNull());
    expect(native.close).not.toHaveBeenCalled();

    harness.find('menu-exit').click();
    await vi.waitFor(() => expect(confirmButton('Çık')).toBeDefined());
    confirmButton('Çık')?.click();
    await vi.waitFor(() => expect(native.close).toHaveBeenCalledTimes(1));
  });

  it('geri tuşu çıkış onayını açar, ikinci basış kapatır; sahne kapanınca kayıt kalkar', async () => {
    const native = nativeWindow();
    const { services: env } = services();
    const before = getBackHandlerCount();
    const harness = mount(() => new MenuScene(env, native as never));
    expect(getBackHandlerCount()).toBe(before + 1);
    expect(triggerBack()).toBe(true);
    await vi.waitFor(() => expect(harness.parent.querySelector('.vol-modal')).not.toBeNull());
    expect(triggerBack()).toBe(true);
    await vi.waitFor(() => expect(harness.parent.querySelector('.vol-modal--open')).toBeNull());
    expect(native.close).not.toHaveBeenCalled();
    harness.shutdown();
    expect(getBackHandlerCount()).toBe(before);
    expect(harness.parent.querySelector('[data-testid="menu"]')).toBeNull();
    expect(showroom.destroy).not.toHaveBeenCalled();
  });
});

describe('SettingsScene', () => {
  it('geri düğmesi de geri tuşu da menüye döner', () => {
    const { services: env } = services();
    const harness = mount(() => new SettingsScene(env));
    expect(harness.find('settings')).not.toBeNull();
    harness.find('settings-back').click();
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith('Menu', {});

    const again = mount(() => new SettingsScene(env));
    expect(triggerBack()).toBe(true);
    again.finishFade();
    expect(again.start).toHaveBeenCalledWith('Menu', {});
  });
});

describe('DevScene', () => {
  it('senaryo ve tohum burada; geri düğmesi de geri tuşu da menüye döner', () => {
    const { services: env } = services();
    const harness = mount(() => new DevScene(env));
    expect(harness.find('dev')).not.toBeNull();
    expect(harness.find('dev-scenario')).not.toBeNull();
    expect(harness.find('dev-seed')).not.toBeNull();
    harness.find('dev-back').click();
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith('Menu', {});

    const again = mount(() => new DevScene(env));
    expect(triggerBack()).toBe(true);
    again.finishFade();
    expect(again.start).toHaveBeenCalledWith('Menu', {});
  });
});

describe('GarageScene', () => {
  it('kayıtlı seçimle açılır; araç seçimi tercihe yazılır ve vitrini değiştirir', () => {
    const { services: env, update } = services({ vehicle: 'dart', faction: 1, playerName: 'Ada' });
    const harness = mount(() => new GarageScene(env));
    expect(harness.find<HTMLInputElement>('garage-name').value).toBe('Ada');
    const pick = (id: string): HTMLButtonElement =>
      harness.find(`garage-vehicle-${id}`).querySelector<HTMLButtonElement>('.vol-card__action')!;
    expect(pick('dart').getAttribute('aria-pressed')).toBe('true');
    pick('arachnid').click();
    expect(update).toHaveBeenCalledWith({ vehicle: 'arachnid' });
    expect(showroom.setVehicle).toHaveBeenCalledWith(VEHICLES.arachnid);
  });

  it('savaşa katılır: seçimle bağlanır ve çevrimiçi başlatma verisiyle dünyaya geçer', async () => {
    const { services: env, update } = services({ faction: 1 });
    const start = { weather: 'clear' as const };
    online.connectWar.mockResolvedValue({ start, abandon: vi.fn() });
    const harness = mount(() => new GarageScene(env));
    harness.find('garage-join').click();
    expect(harness.find('garage-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    await vi.waitFor(() => expect(harness.transition).toHaveBeenCalled());
    expect(online.connectWar).toHaveBeenCalledWith(env, { name: 'Ada', faction: 1 });
    expect(update).toHaveBeenCalledWith({ playerName: 'Ada' });
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith('World', start);
  });

  it('cephe otomatikse sunucuya cephe istemez', async () => {
    const { services: env } = services({ faction: FACTION_AUTO });
    online.connectWar.mockResolvedValue({ start: {}, abandon: vi.fn() });
    const harness = mount(() => new GarageScene(env));
    harness.find('garage-join').click();
    await vi.waitFor(() => expect(online.connectWar).toHaveBeenCalled());
    expect(online.connectWar).toHaveBeenCalledWith(env, { name: 'Ada', faction: undefined });
  });

  it('bağlantı hatası durum satırında kalır ve ekran açık kalır', async () => {
    const { services: env } = services();
    online.connectWar.mockRejectedValue(new Error('yok'));
    const harness = mount(() => new GarageScene(env));
    harness.find('garage-join').click();
    await vi.waitFor(() =>
      expect(harness.find('garage-status').textContent).toBe(
        i18next.t('voltest:online.error.unreachable'),
      ),
    );
    expect(harness.find<HTMLButtonElement>('garage-join').disabled).toBe(false);
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('bağlanırken geri dönülürse geç gelen oturum bırakılır', async () => {
    const { services: env } = services();
    const abandon = vi.fn();
    let resolve: (value: unknown) => void = () => undefined;
    online.connectWar.mockReturnValue(new Promise((done) => (resolve = done)));
    const harness = mount(() => new GarageScene(env));
    harness.find('garage-join').click();
    await vi.waitFor(() => expect(online.connectWar).toHaveBeenCalled());
    harness.find('garage-back').click();
    harness.finishFade();
    expect(harness.start).toHaveBeenCalledWith('Menu', {});
    resolve({ start: {}, abandon });
    await vi.waitFor(() => expect(abandon).toHaveBeenCalledTimes(1));
    expect(harness.start).toHaveBeenCalledTimes(1);
  });

  it('ekran kapanırsa geç gelen oturum bırakılır', async () => {
    const { services: env } = services();
    const abandon = vi.fn();
    let resolve: (value: unknown) => void = () => undefined;
    online.connectWar.mockReturnValue(new Promise((done) => (resolve = done)));
    const harness = mount(() => new GarageScene(env));
    harness.find('garage-join').click();
    await vi.waitFor(() => expect(online.connectWar).toHaveBeenCalled());
    harness.shutdown();
    resolve({ start: {}, abandon });
    await vi.waitFor(() => expect(abandon).toHaveBeenCalledTimes(1));
  });

  it('alıştırma çevrimdışı dünyayı açar, geri tuşu menüye döner', () => {
    const { services: env } = services();
    const practice = mount(() => new GarageScene(env));
    practice.find('garage-practice').click();
    practice.finishFade();
    expect(practice.start).toHaveBeenCalledWith('World', {});

    const back = mount(() => new GarageScene(env));
    expect(triggerBack()).toBe(true);
    back.finishFade();
    expect(back.start).toHaveBeenCalledWith('Menu', {});
  });
});

describe('ScreenScene canlı arka plan', () => {
  it('her ekran arka plan sahnesini başlatır ve kamerayı saydam yapar; ayar yoktur', () => {
    for (const make of [
      (env: GameServices) => new MenuScene(env, nativeWindow(false) as never),
      (env: GameServices) => new SettingsScene(env),
      (env: GameServices) => new GarageScene(env),
      (env: GameServices) => new DevScene(env),
    ]) {
      const { services: env } = services();
      const harness = mount(() => make(env));
      expect(harness.scenePlugin.launch).toHaveBeenCalledWith('Backdrop');
      expect(harness.scene.cameras.main.setBackgroundColor).toHaveBeenCalledWith('rgba(0,0,0,0)');
    }
  });

  it('araç tablası yalnız araç seçilen ekranlarda (garaj, geliştirici) kurulur', () => {
    const count = (make: (env: GameServices) => ScreenScene): number => {
      const { services: env } = services();
      showroom.created = 0;
      mount(() => make(env));
      return showroom.created;
    };
    expect(count((env) => new MenuScene(env, nativeWindow(false) as never))).toBe(0);
    expect(count((env) => new SettingsScene(env))).toBe(0);
    expect(count((env) => new GarageScene(env))).toBe(1);
    expect(count((env) => new DevScene(env))).toBe(1);
  });

  it('vitrinsiz ekran boş alanı panelden kendisi hesaplar ve yalnız değişince yayınlar', () => {
    const { services: env } = services();
    const menu = mount(() => new MenuScene(env, nativeWindow(false) as never));
    menu.scene.update(0, 16);
    // Panel ölçüsü jsdom'da sıfırdır: tüm ekran boştur.
    expect(menu.registry.get('vol-test:menu-area')).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 800,
    });
    const area = menu.registry.get('vol-test:menu-area');
    menu.scene.update(0, 16);
    expect(menu.registry.get('vol-test:menu-area')).toBe(area);
  });

  it('vitrinli ekran boş alanı vitrinin kamera alanından yayınlar', () => {
    const { services: env } = services();
    showroom.area = { x: 0, y: 0, width: 840, height: 800 };
    const garage = mount(() => new GarageScene(env));
    garage.scene.update(0, 16);
    expect(garage.registry.get('vol-test:menu-area')).toEqual(showroom.area);
    showroom.area = undefined;
  });

  it('dünyaya geçerken arka plan sahnesi sahne değişmeden önce durdurulur', () => {
    const { services: env } = services();
    const menu = mount(() => new MenuScene(env, nativeWindow(false) as never));
    menu.find('menu-practice').click();
    expect(menu.scenePlugin.stop).not.toHaveBeenCalled();
    menu.finishFade();
    expect(menu.scenePlugin.stop).toHaveBeenCalledWith('Backdrop');
    const order = [
      menu.scenePlugin.stop.mock.invocationCallOrder[0],
      menu.start.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);
  });

  it('diğer menü ekranlarına geçerken arka plan sürer', () => {
    const { services: env } = services();
    const menu = mount(() => new MenuScene(env, nativeWindow(false) as never));
    menu.find('menu-settings').click();
    menu.finishFade();
    expect(menu.scenePlugin.stop).not.toHaveBeenCalled();
    expect(menu.start).toHaveBeenCalledWith('Settings', {});
  });

  it('tabla saati vitrinli ekranın kapanışında yazılır; vitrinsiz ekran saat yazmaz', () => {
    const { services: env } = services();
    const garage = mount(() => new GarageScene(env));
    garage.shutdown();
    expect(garage.registry.has('vol-test:showroom-clock')).toBe(true);
    const menu = mount(() => new MenuScene(env, nativeWindow(false) as never));
    menu.shutdown();
    expect(menu.registry.has('vol-test:showroom-clock')).toBe(false);
  });
});

describe('ScreenScene ayar değişimi', () => {
  it('geliştirici ekranında araç seçimi vitrine anında yansır', () => {
    const { services: env, emit } = services();
    mount(() => new DevScene(env));
    showroom.setVehicle.mockClear();
    emit({ vehicle: 'rhino' });
    expect(showroom.setVehicle).toHaveBeenCalledWith(VEHICLES.rhino);
    // Araçla ilgisiz değişim vitrini tazelemez.
    showroom.setVehicle.mockClear();
    emit({ volume: 0.2 });
    expect(showroom.setVehicle).not.toHaveBeenCalled();
  });
});

describe('ScreenScene geçiş', () => {
  it('geçiş süresi ve kayma mesafesi panele CSS değişkeni olarak yazılır', () => {
    const { services: env } = services();
    const menu = mount(() => new MenuScene(env, nativeWindow(false) as never));
    const panel = menu.find('menu');
    expect(panel.style.getPropertyValue('--vt-slide')).toBe('36px');
    expect(panel.style.getPropertyValue('--vt-slide-ms')).toBe('200ms');
    menu.find('menu-settings').click();
    expect(menu.transition).toHaveBeenCalledWith(200, expect.any(Function));
  });
});
