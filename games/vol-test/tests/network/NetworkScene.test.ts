import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NetworkRoom } from '@volstudio/network/client';
import { i18next } from '@volstudio/core/i18n';
import type * as CoreModule from '@volstudio/core';
import { NetworkScene } from '@/network/NetworkScene';
import { fakeObject, fakeScene, lastCall, type FakeObject } from '../support/fakeScene';

const dependency = vi.hoisted(() => ({
  connect: vi.fn<(_endpoint: string, _name: string) => Promise<NetworkRoom>>(),
  read: vi.fn<(_x: number, _y: number, _delta: number) => void>(),
  step: vi.fn((_stepMs: number) => ({
    moveX: 1,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fire: true,
    boost: false,
    brake: false,
  })),
  destroyControls: vi.fn(),
}));

vi.mock('@volstudio/network/client', () => ({ connectRoom: dependency.connect }));
vi.mock('@/scenes/world/PlayerControls', () => ({
  PlayerControls: class {
    read = dependency.read;
    step = dependency.step;
    destroy = dependency.destroyControls;
  },
}));
vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  applyVolViewport: vi.fn(),
}));

const fighter = {
  vehicleId: 1,
  x: 2048,
  y: 2048,
  hull: 0,
  turret: 0.5,
  health: 100,
  maxHealth: 100,
  alive: true,
  respawnRemainingMs: 0,
};

function mockRoom() {
  let listener: (() => void) | undefined;
  let state: unknown = {
    tick: 1,
    players: new Map([['self', fighter]]),
  };
  const sendInput = vi.fn();
  const dispose = vi.fn(() => Promise.resolve());
  const room: NetworkRoom = {
    sessionId: 'self',
    sendInput,
    getState: () => state,
    dispose,
    onState: (onState) => {
      listener = onState;
      return () => {
        listener = undefined;
      };
    },
  };
  return {
    room,
    sendInput,
    dispose,
    get listening() {
      return Boolean(listener);
    },
    emit(next: unknown) {
      state = next;
      listener?.();
    },
  };
}

interface Harness {
  readonly scene: NetworkScene;
  readonly root: HTMLElement;
  readonly created: FakeObject[];
  readonly camera: FakeObject;
  readonly shutdown: () => void;
}

const active: Harness[] = [];

function mount(): Harness {
  const parent = document.createElement('div');
  document.body.append(parent);
  const fake = fakeScene();
  const camera = fakeObject('camera');
  const scene = new NetworkScene('http://localhost:2567');
  let shutdown: () => void = () => undefined;
  Object.assign(scene, {
    add: fake.add,
    cameras: { main: camera },
    game: { canvas: { parentElement: parent } },
    events: { once: (_event: string, handler: () => void) => (shutdown = handler) },
  });
  scene.create();
  const harness = { scene, root: parent, created: fake.created, camera, shutdown };
  active.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of active.splice(0)) {
    harness.shutdown();
    harness.root.remove();
  }
  await i18next.changeLanguage('tr');
  vi.clearAllMocks();
});

describe('NetworkScene görünüm ve yaşam döngüsü', () => {
  it('20Hz devlet karesinden yerel ve uzak tankı, gerçek canı ve ölümü çizer', async () => {
    const fake = mockRoom();
    dependency.connect.mockResolvedValue(fake.room);
    const { scene, root, created, camera, shutdown } = mount();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-testid="network-status"]')?.getAttribute('data-connection'),
      ).toBe('connected'),
    );
    expect(dependency.connect).toHaveBeenCalledWith('http://localhost:2567', 'voltest');
    expect(root.querySelector('[data-testid="network-summary"]')?.textContent).toContain(
      'Can: 100 / 100',
    );

    const remote = {
      ...fighter,
      vehicleId: 2,
      x: 2200,
      y: 2130,
      health: 0,
      alive: false,
      respawnRemainingMs: 1600,
    };
    fake.emit({
      tick: 10,
      players: new Map([
        ['self', { ...fighter, health: 48, alive: false, respawnRemainingMs: 1250 }],
        ['remote', remote],
      ]),
    });
    const summary = root.querySelector<HTMLElement>('[data-testid="network-summary"]')!;
    expect(summary.dataset.players).toBe('2');
    expect(summary.dataset.health).toBe('48');
    expect(summary.textContent).toContain('2 sn sonra');
    expect(lastCall(camera, 'centerOn')).toEqual([2048, 2048]);

    const labels = created.filter((object) => object.kind === 'text');
    expect(labels).toHaveLength(2);
    expect(labels.map((object) => lastCall(object, 'setText'))).toEqual([
      ['Siz'],
      ['Diğer oyuncu'],
    ]);
    const graphics = created.filter((object) => object.kind === 'graphics')[1];
    expect(graphics).toBeDefined();
    expect(graphics.calls.filter(([method]) => method === 'fillCircle').slice(-4)).toHaveLength(4);
    expect(graphics.calls.filter(([method]) => method === 'fillRect').at(-2)?.[1]).toEqual([
      remote.x - 25,
      remote.y - 43,
      50,
      6,
    ]);

    await i18next.changeLanguage('en');
    expect(summary.textContent).toContain('HP: 48 / 100');
    expect(labels.map((object) => lastCall(object, 'setText'))).toEqual([
      ['You'],
      ['Other player'],
    ]);
    expect(root.querySelector('[data-testid="network-leave"]')?.textContent).toBe('Leave room');

    fake.emit({ tick: 11, players: new Map([['self', fighter]]) });
    expect(summary.dataset.players).toBe('1');
    expect(labels[1].calls.some(([method]) => method === 'destroy')).toBe(true);
    scene.update(30, 1000 / 60);
    expect(fake.sendInput).toHaveBeenCalledWith({
      seq: 0,
      moveX: 1,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      fire: true,
      boost: false,
      brake: false,
    });
    shutdown();
    await vi.waitFor(() => expect(fake.dispose).toHaveBeenCalledTimes(1));
    expect(fake.listening).toBe(false);
    expect(root.querySelector('[data-testid="network-hud"]')).toBeNull();
    expect(dependency.destroyControls).toHaveBeenCalledTimes(1);
    scene.update(50, 1000 / 60);
    expect(fake.sendInput).toHaveBeenCalledTimes(1);
  });

  it('bağlanma hatası erişilebilir metni günceller; sahne kapanışı güvenlidir', async () => {
    dependency.connect.mockRejectedValue(new Error('server unavailable'));
    const { root, shutdown } = mount();
    await vi.waitFor(() =>
      expect(
        root.querySelector('[data-testid="network-status"]')?.getAttribute('data-connection'),
      ).toBe('error'),
    );
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Bağlantı kurulamadı');
    shutdown();
    shutdown();
    expect(root.querySelector('[data-testid="network-hud"]')).toBeNull();
  });
});
