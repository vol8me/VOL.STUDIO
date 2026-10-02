import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  createGame: vi.fn(),
  createServices: vi.fn(),
  disposeServices: vi.fn(),
  stopMenus: vi.fn(),
  suppressMenus: vi.fn(),
  fatal: vi.fn(),
}));

vi.mock('@volstudio/core', () => ({
  createVolGame: boundary.createGame,
  i18n: { addResources: vi.fn(), init: () => Promise.resolve() },
  i18next: { t: () => 'VOL.TEST' },
  showFatalStartupError: boundary.fatal,
  suppressNativeMenus: boundary.suppressMenus,
}));
vi.mock('@/app/GameServices', () => ({ GameServices: { create: boundary.createServices } }));
vi.mock('@/scenes/BootScene', () => ({ BootScene: class {} }));
vi.mock('@/scenes/WorldScene', () => ({ WorldScene: class {} }));

describe('oyun açılış sahipliği', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    boundary.createServices.mockResolvedValue({ dispose: boundary.disposeServices });
    boundary.suppressMenus.mockReturnValue(boundary.stopMenus);
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
    boundary.createGame.mockResolvedValue({ events: { once: vi.fn() }, destroy });
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
});
