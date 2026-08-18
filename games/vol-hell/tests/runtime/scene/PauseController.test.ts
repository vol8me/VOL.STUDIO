import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PauseController } from '@/runtime/scene/PauseController';

/**
 * Duraklatmanın üç tetikleyicisi (ESC, kart ekranı, koşu sonu) birbirini
 * ezmemeli. Buradaki testler sahnenin içindeyken doğrulanamayan kuralları
 * kilitler: ölüm ekranı açıkken hiçbir yol oyunu devam ettiremez.
 */
function setup(overrides: Partial<{ deathVisible: boolean; cardOpen: boolean }> = {}): {
  ctl: PauseController;
  deps: {
    pauseScene: ReturnType<typeof vi.fn>;
    resumeScene: ReturnType<typeof vi.fn>;
    resetPointer: ReturnType<typeof vi.fn>;
    isDeathScreenVisible: () => boolean;
    isCardScreenOpen: () => boolean;
    onMenuPause: ReturnType<typeof vi.fn>;
    onMenuResume: ReturnType<typeof vi.fn>;
    onResume: ReturnType<typeof vi.fn>;
  };
  state: { deathVisible: boolean; cardOpen: boolean };
} {
  const state = {
    deathVisible: overrides.deathVisible ?? false,
    cardOpen: overrides.cardOpen ?? false,
  };
  const deps = {
    pauseScene: vi.fn(),
    resumeScene: vi.fn(),
    resetPointer: vi.fn(),
    isDeathScreenVisible: () => state.deathVisible,
    isCardScreenOpen: () => state.cardOpen,
    onMenuPause: vi.fn(),
    onMenuResume: vi.fn(),
    onResume: vi.fn(),
  };
  return { ctl: new PauseController(deps), deps, state };
}

describe('PauseController', () => {
  let s: ReturnType<typeof setup>;

  beforeEach(() => {
    s = setup();
  });

  it('başlangıçta duraklamamış', () => {
    expect(s.ctl.isPaused).toBe(false);
  });

  describe('kart ekranı yolu', () => {
    it('pauseForScreen duraklatır ama menü sesi/ekranı açmaz', () => {
      s.ctl.pauseForScreen();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.pauseScene).toHaveBeenCalledOnce();
      expect(s.deps.resetPointer).toHaveBeenCalledOnce();
      expect(s.deps.onMenuPause).not.toHaveBeenCalled();
    });

    it('zaten duraklamışken tekrar duraklatmaz', () => {
      s.ctl.pauseForScreen();
      s.ctl.pauseForScreen();
      expect(s.deps.pauseScene).toHaveBeenCalledOnce();
    });

    it('resumeAfterScreen devam ettirir', () => {
      s.ctl.pauseForScreen();
      s.ctl.resumeAfterScreen();
      expect(s.ctl.isPaused).toBe(false);
      expect(s.deps.resumeScene).toHaveBeenCalledOnce();
      expect(s.deps.onResume).toHaveBeenCalledOnce();
    });

    it('ölüm ekranı açıldıysa kart ekranı kapanışı oyunu devam ETTİRMEZ', () => {
      s.ctl.pauseForScreen();
      s.state.deathVisible = true;
      s.ctl.resumeAfterScreen();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.resumeScene).not.toHaveBeenCalled();
    });

    it('duraklamamışken resumeAfterScreen hiçbir şey yapmaz', () => {
      s.ctl.resumeAfterScreen();
      expect(s.deps.resumeScene).not.toHaveBeenCalled();
    });
  });

  describe('ESC menüsü', () => {
    it('toggle duraklatır, sonra devam ettirir', () => {
      s.ctl.toggle();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.onMenuPause).toHaveBeenCalledOnce();

      s.ctl.toggle();
      expect(s.ctl.isPaused).toBe(false);
      expect(s.deps.onMenuResume).toHaveBeenCalledOnce();
    });

    it('kart ekranı açıkken toggle hiçbir şey yapmaz', () => {
      s.state.cardOpen = true;
      s.ctl.toggle();
      expect(s.ctl.isPaused).toBe(false);
      expect(s.deps.pauseScene).not.toHaveBeenCalled();
    });

    it('ölüm ekranı açıkken toggle hiçbir şey yapmaz', () => {
      s.state.deathVisible = true;
      s.ctl.toggle();
      expect(s.ctl.isPaused).toBe(false);
      expect(s.deps.pauseScene).not.toHaveBeenCalled();
    });

    it('ölüm ekranı açıkken menüden devam edilemez', () => {
      s.ctl.pauseForMenu();
      s.state.deathVisible = true;
      s.ctl.resumeFromMenu();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.resumeScene).not.toHaveBeenCalled();
    });
  });

  describe('koşu sonu', () => {
    it('forcePause duraklamamışken duraklatır', () => {
      s.ctl.forcePause();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.pauseScene).toHaveBeenCalledOnce();
      expect(s.deps.onMenuPause).not.toHaveBeenCalled();
    });

    it('forcePause zaten duraklamışken de durumu kesinleştirir', () => {
      s.ctl.pauseForScreen();
      s.ctl.forcePause();
      expect(s.ctl.isPaused).toBe(true);
      expect(s.deps.pauseScene).toHaveBeenCalledTimes(2);
    });
  });

  it('reset restart için durumu sıfırlar', () => {
    s.ctl.pauseForMenu();
    s.ctl.reset();
    expect(s.ctl.isPaused).toBe(false);
  });
});
