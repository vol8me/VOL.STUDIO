import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  createGame: vi.fn(),
  createServices: vi.fn(),
  disposeServices: vi.fn(),
  stopMenus: vi.fn(),
  suppressMenus: vi.fn(),
  stopEditMenu: vi.fn(),
  editMenu: vi.fn(),
  fatal: vi.fn(),
  applyLanguage: vi.fn(() => Promise.resolve()),
}));

vi.mock('@volstudio/core', () => ({
  createVolGame: boundary.createGame,
  i18n: { addResources: vi.fn(), init: () => Promise.resolve() },
  i18next: { t: () => 'VOL.TEST' },
  installEditMenu: boundary.editMenu,
  showFatalStartupError: boundary.fatal,
  suppressNativeMenus: boundary.suppressMenus,
}));
vi.mock('@/app/bootLoading', () => ({
  BootLoading: class {
    servicesReady = vi.fn();
    assets = vi.fn();
    worldReady = vi.fn();
    abort = vi.fn();
  },
}));
vi.mock('@/app/GameServices', () => ({ GameServices: { create: boundary.createServices } }));
vi.mock('@/app/AdaptiveResolution', () => ({
  AdaptiveResolution: class {
    scale = 1;
    attach = () => () => undefined;
  },
}));
vi.mock('@/app/language', () => ({ applyLanguage: boundary.applyLanguage }));
vi.mock('@/scenes/BootScene', () => ({ BootScene: class {} }));
vi.mock('@/scenes/MenuScene', () => ({ MenuScene: class {} }));
vi.mock('@/scenes/GarageScene', () => ({ GarageScene: class {} }));
vi.mock('@/scenes/SettingsScene', () => ({ SettingsScene: class {} }));
vi.mock('@/scenes/DevScene', () => ({ DevScene: class {} }));
vi.mock('@/scenes/WorldScene', () => ({ WorldScene: class {} }));

describe('oyun açılış sahipliği', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    history.replaceState({}, '', '/');
    boundary.createServices.mockResolvedValue({
      dispose: boundary.disposeServices,
      settings: { get: () => ({ language: 'auto' }) },
    });
    boundary.suppressMenus.mockReturnValue(boundary.stopMenus);
    boundary.editMenu.mockReturnValue(boundary.stopEditMenu);
  });

  it('oyun kurulumu reddedilirse edinilmiş servisleri bırakır', async () => {
    boundary.createGame.mockRejectedValue(new Error('renderer kurulamadı'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('../src/main');
    await vi.waitFor(() => expect(boundary.fatal).toHaveBeenCalledTimes(1));
    expect(boundary.disposeServices).toHaveBeenCalledTimes(1);
    expect(boundary.suppressMenus).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('oyun sonrası bağlama hatasında oyun ve servisleri bırakır', async () => {
    const destroy = vi.fn();
    boundary.createGame.mockResolvedValue({ events: { on: vi.fn(), once: vi.fn() }, destroy });
    boundary.suppressMenus.mockImplementationOnce(() => {
      throw new Error('bağlama reddi');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('../src/main');
    await vi.waitFor(() => expect(boundary.fatal).toHaveBeenCalledTimes(1));
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(boundary.disposeServices).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('başarılı açılışta yerel menü kapanır, düzenleme menüsü kurulur ve oyun yok olunca ikisi de bırakılır', async () => {
    const handlers: Record<string, () => void> = {};
    boundary.createGame.mockResolvedValue({
      events: {
        on: vi.fn(),
        once: vi.fn((name: string, handler: () => void) => {
          handlers[name] = handler;
        }),
      },
      destroy: vi.fn(),
    });
    await import('../src/main');
    await vi.waitFor(() => expect(boundary.editMenu).toHaveBeenCalledTimes(1));
    expect(boundary.suppressMenus).toHaveBeenCalledTimes(1);
    expect(boundary.applyLanguage).toHaveBeenCalledWith('auto');
    expect(boundary.stopMenus).not.toHaveBeenCalled();
    expect(boundary.stopEditMenu).not.toHaveBeenCalled();
    handlers.destroy();
    expect(boundary.stopMenus).toHaveBeenCalledTimes(1);
    expect(boundary.stopEditMenu).toHaveBeenCalledTimes(1);
  });
});
