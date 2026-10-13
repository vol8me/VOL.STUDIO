import { beforeEach, describe, expect, it, vi } from 'vitest';

const resources = vi.hoisted(() => ({
  listener: () => {},
  appDestroy: vi.fn(),
  appCreated: vi.fn(),
  gameDestroy: vi.fn(),
  menus: vi.fn(),
  kitDispose: vi.fn(),
  handleDestroy: vi.fn(),
  attach: vi.fn(),
}));
vi.mock('@volstudio/core', () => ({
  i18n: { addResources: vi.fn(), init: vi.fn().mockResolvedValue(undefined) },
  createVolGame: vi.fn().mockResolvedValue({
    destroy: resources.gameDestroy,
    events: {
      once: (_event: string, listener: () => void) => {
        resources.listener = listener;
      },
    },
  }),
  suppressNativeMenus: vi.fn(() => resources.menus),
}));
vi.mock('../../src/app/App', () => ({
  App: class {
    constructor() {
      resources.appCreated();
    }
    destroy = resources.appDestroy;
  },
}));
vi.mock('../../src/scenes/FactoryScene', () => ({ FactoryScene: class FactorySceneStub {} }));
vi.mock('../../src/net/session', () => ({ FactorySession: { connect: vi.fn() } }));
const labScene = vi.hoisted(() => class LabSceneStub {});
const createLabKit = vi.hoisted(() => vi.fn());
vi.mock('../../src/lab/install', () => ({ createLabKit }));

import { createVolGame, i18n, suppressNativeMenus } from '@volstudio/core';
import { boot } from '../../src/bootstrap/boot';

const diagnostics = { marker: 'diagnostics' };

function kit(mode: 'run' | 'observe'): Record<string, unknown> {
  return {
    mode,
    diagnostics,
    scenes: [labScene],
    attach: resources.attach,
    dispose: resources.kitDispose,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="hud"></div><div id="game"></div>';
  resources.attach.mockReturnValue({ destroy: resources.handleDestroy });
  createLabKit.mockReturnValue(kit('run'));
});

function gameConfig(): Record<string, unknown> {
  return vi.mocked(createVolGame).mock.calls[0][0] as unknown as Record<string, unknown>;
}

describe('oyun kipi', () => {
  it('çeviri ve CORE açılışını kurar; kaynakları bir kez kapatır', async () => {
    await boot('');
    resources.listener();
    resources.listener();
    expect(i18n.init).toHaveBeenCalled();
    expect(createVolGame).toHaveBeenCalled();
    expect(resources.appDestroy).toHaveBeenCalledTimes(1);
    expect(resources.menus).toHaveBeenCalledTimes(1);
  });

  it('oyuncu paketinde laboratuvar yoktur: kit kurulmaz, teşhis ve WebGL zorlaması verilmez', async () => {
    await boot('');
    expect(createLabKit).not.toHaveBeenCalled();
    expect(gameConfig()).not.toHaveProperty('diagnostics');
    expect(gameConfig()).not.toHaveProperty('renderer');
  });

  it('oyun açılışı başarısızsa kurulmuş App geri alınır', async () => {
    const failure = new Error('boot failed');
    vi.mocked(createVolGame).mockRejectedValueOnce(failure);
    await expect(boot('')).rejects.toBe(failure);
    expect(resources.appDestroy).toHaveBeenCalledTimes(1);
    expect(resources.gameDestroy).not.toHaveBeenCalled();
    expect(suppressNativeMenus).not.toHaveBeenCalled();
  });

  it('oyun kurulduktan sonraki hata oyunu ve App kaynaklarını geri alır', async () => {
    const failure = new Error('menus failed');
    vi.mocked(suppressNativeMenus).mockImplementationOnce(() => {
      throw failure;
    });
    await expect(boot('')).rejects.toBe(failure);
    expect(resources.gameDestroy).toHaveBeenCalledWith(true);
    expect(resources.appDestroy).toHaveBeenCalledTimes(1);
  });

  it('oyun destroy hata verse de App kaynakları geri alınır', async () => {
    vi.mocked(suppressNativeMenus).mockImplementationOnce(() => {
      throw new Error('menus failed');
    });
    resources.gameDestroy.mockImplementationOnce(() => {
      throw new Error('destroy failed');
    });
    await expect(boot('')).rejects.toThrow('destroy failed');
    expect(resources.appDestroy).toHaveBeenCalledTimes(1);
  });
});

describe('laboratuvar kipleri', () => {
  it('bilinmeyen kip hiçbir şey kurmadan açık hatayla düşer', async () => {
    await expect(boot('?lab=runn')).rejects.toThrow(
      'Bilinmeyen lab kipi: "runn" (geçerli: run, observe)',
    );
    expect(i18n.init).not.toHaveBeenCalled();
    expect(createVolGame).not.toHaveBeenCalled();
    expect(resources.appCreated).not.toHaveBeenCalled();
  });

  it('run: oyuncu arayüzü yok, laboratuvar sahnesi önde, WebGL zorunlu, teşhis kitten', async () => {
    await boot('?lab=run');
    expect(createLabKit).toHaveBeenCalledWith('run');
    expect(resources.appCreated).not.toHaveBeenCalled();
    const config = gameConfig();
    expect(config.renderer).toBe('webgl');
    expect(config.diagnostics).toBe(diagnostics);
    const scenes = config.scenes as { name: string }[];
    expect(scenes.map((scene) => scene.name)).toEqual(['LabSceneStub', 'FactorySceneStub']);
    expect(resources.attach).toHaveBeenCalledTimes(1);
  });

  it('observe: canlı oyun (App var), yalnız gözlem; çizici değiştirilmez', async () => {
    createLabKit.mockReturnValue(kit('observe'));
    await boot('?lab=observe');
    expect(createLabKit).toHaveBeenCalledWith('observe');
    expect(resources.appCreated).toHaveBeenCalledTimes(1);
    const config = gameConfig();
    expect(config).not.toHaveProperty('renderer');
    expect((config.scenes as unknown[]).length).toBe(1);
    expect(config.diagnostics).toBe(diagnostics);
  });

  it('oyun kapanınca el, kit ve App tam bir kez bırakılır', async () => {
    await boot('?lab=run');
    resources.listener();
    resources.listener();
    expect(resources.handleDestroy).toHaveBeenCalledTimes(1);
    expect(resources.kitDispose).toHaveBeenCalledTimes(1);
  });

  it('oyun açılışı düşerse kit geri alınır (sayfa yakalayıcı ve teşhis serbest kalır)', async () => {
    vi.mocked(createVolGame).mockRejectedValueOnce(new Error('webgl yok'));
    await expect(boot('?lab=run')).rejects.toThrow('webgl yok');
    expect(resources.kitDispose).toHaveBeenCalledTimes(1);
    expect(resources.attach).not.toHaveBeenCalled();
  });

  it('attach düşerse oyun ve kit geri alınır', async () => {
    resources.attach.mockImplementationOnce(() => {
      throw new Error('attach failed');
    });
    await expect(boot('?lab=run')).rejects.toThrow('attach failed');
    expect(resources.gameDestroy).toHaveBeenCalledWith(true);
    expect(resources.kitDispose).toHaveBeenCalledTimes(1);
  });
});
