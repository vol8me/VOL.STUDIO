import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisposableScope, VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { JoinError } from '@volstudio/network/client';
import type { GameServices } from '@/app/GameServices';
import { EFFECT_LEVELS, type EffectLevel, type EffectProfile } from '@/config/quality';
import { DART, modelOf, STRIKER } from '@/config/vehicles';
import { WORLD } from '@/config/world';
import { Hud } from '@/hud/Hud';
import type { TestAction } from '@/input/bindings';
import { OnlineSession } from '@/network/OnlineSession';
import { connectWar, createLobby, lobbyErrorKey, sessionEndpoint } from '@/scenes/world/online';
import type { PlayerControls } from '@/scenes/world/PlayerControls';
import type { DriverContext, WorldStartData } from '@/scenes/world/WorldDriver';
import { World } from '@/sim/world/World';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  history.replaceState(null, '', '/');
});

describe('lobbyErrorKey', () => {
  it('katılım hatasını oyuncuya gösterilecek ileti anahtarına çevirir', () => {
    expect(lobbyErrorKey(new JoinError('full'))).toBe('voltest:online.error.full');
    expect(lobbyErrorKey(new JoinError('code'))).toBe('voltest:online.error.failed');
    expect(lobbyErrorKey(new JoinError('protocol'))).toBe('voltest:online.error.protocol');
    expect(lobbyErrorKey(new JoinError('not-found'))).toBe('voltest:online.error.notFound');
    expect(lobbyErrorKey(new Error('ağ'))).toBe('voltest:online.error.unreachable');
    expect(lobbyErrorKey('garip')).toBe('voltest:online.error.failed');
  });
});

describe('sessionEndpoint', () => {
  it('adres çubuğundaki ?server= değerini, yoksa geliştirme adresini verir', () => {
    expect(sessionEndpoint()).toBe('http://127.0.0.1:2567');
    history.replaceState(null, '', '/?server=oyun.example:9000');
    expect(sessionEndpoint()).toBe('http://oyun.example:9000');
  });
});

interface Setup {
  lobby: ReturnType<typeof createLobby>;
  restart: ReturnType<typeof vi.fn<(data?: WorldStartData) => void>>;
  scope: DisposableScope;
  parent: HTMLElement;
  update: ReturnType<typeof vi.fn>;
  find: <T extends HTMLElement = HTMLElement>(id: string) => T;
}

function setup(): Setup {
  const parent = document.createElement('div');
  document.body.append(parent);
  const hud = new Hud({
    parent,
    metre: WORLD.metre,
    worldWidth: WORLD.width,
    worldHeight: WORLD.height,
    mapGridStep: WORLD.gridStep,
    mapGridMajorEvery: WORLD.gridMajorEvery,
    actionSource: new VirtualActionSource<TestAction>(),
    stickSource: new VirtualStickSource(),
    touch: false,
    fullscreen: false,
    onResume: vi.fn(),
    quality: new GraphicsQuality<EffectLevel, EffectProfile>({
      levels: EFFECT_LEVELS,
      initial: 'high',
    }),
  });
  const scope = new DisposableScope();
  const restart = vi.fn<(data?: WorldStartData) => void>();
  const update = vi.fn();
  const services = {
    settings: { get: () => ({ playerName: 'Ada', vehicle: 'dart' }), update },
  } as unknown as GameServices;
  const context: DriverContext = {
    scene: {} as Phaser.Scene,
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    weather: undefined as never,
    controls: {} as PlayerControls,
    services,
    seed: 0,
    scope,
    restart,
    toMenu: vi.fn(),
  };
  const lobby = createLobby(hud, context);
  cleanups.push(() => {
    scope.dispose();
    hud.destroy();
    parent.remove();
  });
  return {
    lobby,
    restart,
    scope,
    parent,
    update,
    find: <T extends HTMLElement = HTMLElement>(id: string) =>
      parent.querySelector<T>(`[data-testid="${id}"]`)!,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** `OnlineSession.open` sahtesi; kurulum dosyasının tuval taklidini bozmamak için yalnız bu casus geri alınır. */
function spyOpen() {
  const spy = vi.spyOn(OnlineSession, 'open');
  cleanups.push(() => spy.mockRestore());
  return spy;
}

const fakeSession = () => ({ dispose: vi.fn() }) as unknown as OnlineSession;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('connectWar', () => {
  const choice = { name: 'Ada', faction: 1 } as const;
  const services = {
    settings: { get: () => ({ vehicle: 'dart' }) },
  } as unknown as GameServices;

  it('tercihlerdeki araçla bağlanır ve çevrimiçi sürücülü başlatma verisi döner', async () => {
    const session = fakeSession();
    const open = spyOpen().mockResolvedValue(session);
    const connection = await connectWar(services, choice);
    expect(open).toHaveBeenCalledWith({
      endpoint: 'http://127.0.0.1:2567',
      name: 'Ada',
      model: modelOf(DART),
      faction: 1,
    });
    expect(connection.start.weather).toBe('clear');
    expect(typeof connection.start.createDriver).toBe('function');
    expect(session.dispose).not.toHaveBeenCalled();
    connection.abandon();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('hizmet yoksa Striker ile bağlanır; hata çağırana fırlar', async () => {
    const open = spyOpen().mockResolvedValue(fakeSession());
    await connectWar(undefined, { name: '', faction: undefined });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ model: modelOf(STRIKER) }));
    open.mockRejectedValue(new JoinError('full'));
    await expect(connectWar(services, choice)).rejects.toBeInstanceOf(JoinError);
  });
});

describe('createLobby', () => {
  it('kayıtlı adla açılır ve seçim bağlandığında sahneyi çevrimiçi sürücüyle yeniden başlatır', async () => {
    const { lobby, restart, find, update } = setup();
    const session = fakeSession();
    const open = spyOpen().mockResolvedValue(session);
    lobby.open();
    expect(find<HTMLInputElement>('lobby-name').value).toBe('Ada');
    find('lobby-enter').click();
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    await settle();
    expect(open).toHaveBeenCalledWith({
      endpoint: 'http://127.0.0.1:2567',
      name: 'Ada',
      model: modelOf(DART),
      faction: undefined,
    });
    expect(update).toHaveBeenCalledWith({ playerName: 'Ada' });
    expect(lobby.isOpen).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
    const data = restart.mock.calls[0][0]!;
    expect(data.weather).toBe('clear');
    expect(typeof data.createDriver).toBe('function');
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it('katılım hatası lobide gösterilir ve yeniden denemeye izin verir', async () => {
    const { lobby, restart, find } = setup();
    spyOpen().mockRejectedValue(new JoinError('full'));
    lobby.open();
    find('lobby-enter').click();
    await settle();
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.full'));
    expect(lobby.isOpen).toBe(true);
    expect(find('lobby-enter').hasAttribute('disabled')).toBe(false);
    expect(restart).not.toHaveBeenCalled();
  });

  it('bağlanırken vazgeçilirse geç gelen oturum bırakılır, sahne yeniden başlamaz', async () => {
    const { lobby, restart, find } = setup();
    const pending = deferred<OnlineSession>();
    spyOpen().mockReturnValue(pending.promise);
    lobby.open();
    find('lobby-enter').click();
    find('lobby-cancel').click();
    expect(find('lobby-enter').hasAttribute('disabled')).toBe(false);
    const session = fakeSession();
    pending.resolve(session);
    await settle();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(restart).not.toHaveBeenCalled();
  });

  it('vazgeçilen denemenin hatası sonraki denemenin durumunu bozmaz', async () => {
    const { lobby, find } = setup();
    const first = deferred<OnlineSession>();
    const second = deferred<OnlineSession>();
    const open = spyOpen();
    open.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    lobby.open();
    find('lobby-enter').click();
    find('lobby-cancel').click();
    lobby.open();
    find('lobby-enter').click();
    first.reject(new JoinError('unreachable'));
    await settle();
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    second.reject(new JoinError('not-found'));
    await settle();
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.notFound'));
  });

  it('sahne kapanırsa geç gelen oturum bırakılır ve lobi sökülür', async () => {
    const { lobby, restart, find, scope, parent } = setup();
    const pending = deferred<OnlineSession>();
    spyOpen().mockReturnValue(pending.promise);
    lobby.open();
    find('lobby-enter').click();
    scope.dispose();
    expect(parent.querySelector('.vt-lobby')).toBeNull();
    const session = fakeSession();
    pending.resolve(session);
    await settle();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(restart).not.toHaveBeenCalled();
  });

  it('seçilen cepheyi oturum seçeneğine iletir', async () => {
    const { lobby, find } = setup();
    const open = spyOpen().mockRejectedValue(new JoinError('full'));
    lobby.open();
    const blue = i18next.t('voltest:war.faction.blue');
    [...find('lobby-faction').querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === blue)!
      .click();
    find('lobby-enter').click();
    await settle();
    expect(open.mock.calls[0][0].faction).toBe(1);
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.full'));
  });
});
