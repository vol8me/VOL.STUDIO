import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@volstudio/core/i18n', () => ({
  i18next: {
    t: (key: string, options?: Record<string, unknown>) => {
      const plain = key.replace(/^volforge:/, '');
      return options ? `${plain}:${JSON.stringify(options)}` : plain;
    },
  },
}));

import { App, type AppDeps } from '../../src/app/App';
import { ForgeHost } from '../../src/app/host';
import { ITEM } from '../../src/config/forge';
import { SIM_MISMATCH, SYNC_MODE } from '../../src/net/protocol';
import type { ForgeSession, SessionEvent } from '../../src/net/session';
import { RESULT } from '../../src/sim/commands';
import { smallSim } from '../helpers/world';

function fakeSession() {
  const sim = smallSim();
  const listeners = new Set<(event: SessionEvent) => void>();
  const session = {
    status: 'live',
    welcome: null as { mode: number } | null,
    lockstep: { sim, status: 'running', lagTicks: 4, players: 3, metrics: { hashChecks: 5 } },
    rttMs: 17.4,
    submit: vi.fn((command: { x: number; y: number }) =>
      Promise.resolve({ seq: 1, result: RESULT.needsOre, tick: 1, command }),
    ),
    advance: vi.fn(() => 0),
    resync: vi.fn(),
    nextCommandSeq: 1,
    subscribe: (listener: (event: SessionEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    leave: vi.fn(() => Promise.resolve()),
  };
  const emit = (event: SessionEvent) => listeners.forEach((listener) => listener(event));
  return { session, sim, emit, listeners };
}

function setup(overrides: Partial<AppDeps> = {}, fake = fakeSession()) {
  const host = new ForgeHost();
  const storage = new Map<string, string>();
  const deps: AppDeps = {
    host,
    settings: {
      server: 'http://127.0.0.1:2567',
      worldId: 'world-1',
      key: 'player-abcdefgh1234',
      autoJoin: false,
    },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    },
    connect: vi.fn(() => Promise.resolve(fake.session as unknown as ForgeSession)),
    hudIntervalMs: 20,
    ...overrides,
  };
  const app = new App(document.body, deps);
  return { app, host, deps, storage, ...fake };
}

const connectCard = () => document.querySelector<HTMLElement>('.forge-connect')!;
const playing = () => document.querySelector<HTMLElement>('.forge-play')!;
const errorText = () => document.querySelector('.forge-connect__error')!.textContent;
const inputs = () => [...document.querySelectorAll<HTMLInputElement>('.forge-connect input')];
const key = (init: KeyboardEventInit, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('App bağlantı formu', () => {
  it('bağlantı formuyla açılır ve başlığı ayarlar', () => {
    const { app } = setup();
    expect(document.title).toBe('app.title');
    expect(connectCard().hidden).toBe(false);
    expect(playing().hidden).toBe(true);
    expect(app.currentPhase).toBe('connect');
    expect(inputs().map((input) => input.value)).toEqual(['http://127.0.0.1:2567', 'world-1']);
  });

  it('geçersiz sunucu adresinde bağlanmaz ve nedenini söyler', async () => {
    const { app, deps } = setup();
    inputs()[0].value = 'ftp://x';
    inputs()[0].dispatchEvent(new Event('input'));
    await app.join();
    expect(deps.connect).not.toHaveBeenCalled();
    expect(errorText()).toBe('connect.invalidServer');
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
  });

  it('geçersiz dünya kimliğinde bağlanmaz', async () => {
    const { app, deps } = setup();
    inputs()[1].value = 'Kötü Dünya';
    inputs()[1].dispatchEvent(new Event('input'));
    await app.join();
    expect(deps.connect).not.toHaveBeenCalled();
    expect(errorText()).toBe('connect.invalidWorld');
  });

  it('başarılı katılım denetleyiciyi sahneye bağlar, adresi saklar ve oyun arayüzünü açar', async () => {
    const { app, host, deps, storage } = setup();
    await app.join();
    expect(deps.connect).toHaveBeenCalledWith({
      endpoint: 'http://127.0.0.1:2567',
      worldId: 'world-1',
      key: 'player-abcdefgh1234',
    });
    expect(host.controller).not.toBeNull();
    expect(storage.get('volforge.server')).toBe('http://127.0.0.1:2567');
    expect(connectCard().hidden).toBe(true);
    expect(playing().hidden).toBe(false);
    expect(document.querySelector('.forge-hud__status')!.textContent).toBe('status.live');
    expect(document.querySelector('.forge-hud__stats')!.textContent).toContain('hud.players 3');
  });

  it('ölçüm değerlerini otomasyon için veri öznitelikleri olarak yayımlar', async () => {
    const { app } = setup();
    await app.join();
    const stats = document.querySelector<HTMLElement>('[data-testid="forge-stats"]')!;
    expect(stats.dataset.hashChecks).toBe('5');
    expect(stats.dataset.lag).toBe('4');
    expect(stats.dataset.units).toBe(String(Number(stats.dataset.units)));
    for (const name of ['fps', 'frameP99', 'stepP50', 'stepP99'] as const)
      expect(Number.isFinite(Number(stats.dataset[name]))).toBe(true);
  });

  it('sunucu simülasyon sürümü uyuşmazlığını bildirirse güncelleme ister', async () => {
    const mismatch = Object.assign(new Error(SIM_MISMATCH.message), { code: SIM_MISMATCH.code });
    const { app, host } = setup({ connect: vi.fn(() => Promise.reject(mismatch)) });
    await app.join();
    expect(host.controller).toBeNull();
    expect(connectCard().hidden).toBe(false);
    expect(errorText()).toBe('connect.simMismatch');
  });

  it('bağlantı kurulamazsa formda kalır ve hatayı söyler', async () => {
    const { app, host } = setup({
      connect: vi.fn(() => Promise.reject(new Error('ağ yok'))),
    });
    await app.join();
    expect(errorText()).toBe('connect.failed');
    expect(app.currentPhase).toBe('connect');
    expect(host.controller).toBeNull();
    expect(connectCard().hidden).toBe(false);
  });

  it('katılım sürerken ikinci katılım isteği yok sayılır', async () => {
    let release: (session: ForgeSession) => void = () => undefined;
    const fake = fakeSession();
    const connect = vi.fn(
      () =>
        new Promise<ForgeSession>((resolve) => {
          release = resolve;
        }),
    );
    const { app } = setup({ connect }, fake);
    const first = app.join();
    await app.join();
    expect(connect).toHaveBeenCalledTimes(1);
    release(fake.session as unknown as ForgeSession);
    await first;
    expect(app.currentPhase).toBe('playing');
  });

  it('adres sorgusuyla gelince kendiliğinden katılır', async () => {
    const { deps } = setup({
      settings: {
        server: 'http://10.1.1.1:2567',
        worldId: 'beta',
        key: 'player-abcdefgh1234',
        autoJoin: true,
      },
    });
    await vi.waitFor(() => expect(deps.connect).toHaveBeenCalledTimes(1));
  });
});

describe('App oturum yaşam döngüsü', () => {
  it('ilgi alanı dünyasında kullanıcıya söyler ve ayrılır', async () => {
    const fake = fakeSession();
    fake.session.welcome = { mode: SYNC_MODE.aoi };
    const { app, host } = setup({}, fake);
    await app.join();
    await vi.waitFor(() => expect(fake.session.leave).toHaveBeenCalled());
    expect(errorText()).toBe('connect.unsupportedMode');
    expect(host.controller).toBeNull();
    expect(app.currentPhase).toBe('connect');
  });

  it('hoş geldin olayı sonradan ilgi alanı kipi bildirirse yine ayrılır', async () => {
    const fake = fakeSession();
    const { app } = setup({}, fake);
    await app.join();
    fake.emit({
      type: 'welcome',
      welcome: { mode: SYNC_MODE.aoi } as never,
    });
    await vi.waitFor(() => expect(fake.session.leave).toHaveBeenCalled());
    expect(errorText()).toBe('connect.unsupportedMode');
  });

  it('oturum kapanınca forma döner ve nedenini söyler', async () => {
    const fake = fakeSession();
    const { app, host } = setup({}, fake);
    await app.join();
    fake.emit({ type: 'status', status: 'closed' });
    await vi.waitFor(() => expect(app.currentPhase).toBe('connect'));
    expect(errorText()).toBe('connect.closed');
    expect(host.controller).toBeNull();
  });

  it('Ayrıl düğmesi oturumu bırakır ve hata göstermez', async () => {
    const fake = fakeSession();
    const { app, host } = setup({}, fake);
    await app.join();
    document.querySelector<HTMLButtonElement>('.forge-hud button')!.click();
    await vi.waitFor(() => expect(fake.session.leave).toHaveBeenCalled());
    expect(host.controller).toBeNull();
    expect(errorText()).toBe('');
    expect(app.currentPhase).toBe('connect');
  });

  it('kapatma oturumu bırakır, sahneyi ayırır ve arayüzü kaldırır; iki kez güvenlidir', async () => {
    const fake = fakeSession();
    const { app, host } = setup({}, fake);
    await app.join();
    app.destroy();
    app.destroy();
    expect(fake.session.leave).toHaveBeenCalledTimes(1);
    expect(host.controller).toBeNull();
    expect(document.querySelector('.forge-app')).toBeNull();
    expect(fake.listeners.size).toBe(0);
  });

  it('katılım tamamlanmadan kapatılırsa gelen oturum bırakılır', async () => {
    let release: (session: ForgeSession) => void = () => undefined;
    const fake = fakeSession();
    const connect = vi.fn(
      () =>
        new Promise<ForgeSession>((resolve) => {
          release = resolve;
        }),
    );
    const { app, host } = setup({ connect }, fake);
    const joining = app.join();
    app.destroy();
    release(fake.session as unknown as ForgeSession);
    await joining;
    expect(fake.session.leave).toHaveBeenCalledTimes(1);
    expect(host.controller).toBeNull();
  });
});

describe('App oyun arayüzü', () => {
  it('klavye kısayolları araç seçer, döndürür ve seçimi bırakır', async () => {
    const { app, host } = setup();
    await app.join();
    const controller = host.controller!;
    key({ key: '4' });
    expect(controller.tool).toBe('turret');
    expect(document.querySelector('[data-item-id="turret"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    key({ key: 'r' });
    expect(controller.rot).toBe(1);
    expect(document.querySelector('.forge-tools')!.textContent).toContain('dir.south');
    key({ key: 'Escape' });
    expect(controller.tool).toBeNull();
  });

  it('yazı alanındaki basış kısayol sayılmaz', async () => {
    const { app, host } = setup();
    await app.join();
    const input = document.createElement('input');
    document.body.appendChild(input);
    key({ key: '2' }, input);
    expect(host.controller!.tool).toBeNull();
    void app;
  });

  it('menüden araç seçilince denetleyiciye geçer, tekrar basınca bırakılır', async () => {
    const { app, host } = setup();
    await app.join();
    const button = document.querySelector<HTMLButtonElement>('[data-item-id="wall"]')!;
    button.click();
    expect(host.controller!.tool).toBe('wall');
    button.click();
    expect(host.controller!.tool).toBeNull();
  });

  it('kaynak yetmeyen araç kullanılamaz görünür, yetince açılır', async () => {
    const { app, sim } = setup();
    sim.state.inventory[ITEM.ore] = 0;
    sim.state.inventory[ITEM.plate] = 0;
    await app.join();
    const turret = () => document.querySelector('[data-item-id="turret"]')!;
    expect(turret().getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('[data-item-id="remove"]')!.hasAttribute('aria-disabled')).toBe(
      false,
    );
    sim.state.inventory[ITEM.ore] = 500;
    sim.state.inventory[ITEM.plate] = 500;
    vi.advanceTimersByTime(40);
    expect(turret().getAttribute('aria-disabled')).toBe('false');
  });

  it('reddedilen komutun nedeni bildirim olarak görünür', async () => {
    const { app, host } = setup();
    await app.join();
    host.controller!.select('drill');
    await host.controller!.tap(3, 3);
    expect(document.querySelector('.vol-toast-container')!.textContent).toContain(
      'result.needsOre',
    );
  });

  it('simülasyon yokken durum satırı yalnız oturum durumunu söyler', async () => {
    const fake = fakeSession();
    fake.session.status = 'reconnecting';
    fake.session.lockstep.sim = null as never;
    const { app } = setup({}, fake);
    await app.join();
    expect(document.querySelector('.forge-hud__status')!.textContent).toBe('status.reconnecting');
    expect(document.querySelector('.forge-hud__stats')!.textContent).toBe('');
  });
});
