import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isScenePresent, RunFinisher, type RunFinisherDeps } from '@/runtime/scene/RunFinisher';
import type { RunResult } from '@/app/GameStats';

const RESULT: RunResult = {
  bestScore: 1,
  bestTimeMs: 2,
  bestKills: 3,
  totalKills: 4,
  isNewBestScore: false,
  isNewBestTime: false,
  isNewBestKills: false,
};

function setup(over: Partial<RunFinisherDeps> = {}) {
  const state = { sceneActive: true, summaryVisible: false };
  const deps: RunFinisherDeps = {
    isSceneActive: () => state.sceneActive,
    isSummaryVisible: () => state.summaryVisible,
    forcePause: vi.fn(),
    playOutcomeAudio: vi.fn(),
    submitStats: vi.fn(() => Promise.resolve(RESULT)),
    showSummary: vi.fn(),
    goToMainMenu: vi.fn(),
    ...over,
  };
  return { finisher: new RunFinisher(deps), deps, state };
}

describe('RunFinisher', () => {
  it('Phaser duraklatılmış sahnesini kapanmış saymaz', () => {
    expect(
      isScenePresent(
        {
          isActive: () => false,
          isPaused: () => true,
        },
        'Game',
      ),
    ).toBe(true);
  });

  it('yenilgi akışı: duraklat, ses, gönder, özet göster', async () => {
    const s = setup();
    await s.finisher.finish('defeat');

    expect(s.deps.forcePause).toHaveBeenCalledOnce();
    expect(s.deps.playOutcomeAudio).toHaveBeenCalledWith('defeat');
    expect(s.deps.submitStats).toHaveBeenCalledOnce();
    expect(s.deps.showSummary).toHaveBeenCalledWith('defeat', RESULT);
    expect(s.finisher.isFinished).toBe(true);
  });

  it('zafer akışı aynı yolu zafer sesiyle koşar', async () => {
    const s = setup();
    await s.finisher.finish('victory');
    expect(s.deps.playOutcomeAudio).toHaveBeenCalledWith('victory');
    expect(s.deps.showSummary).toHaveBeenCalledWith('victory', RESULT);
  });

  it('forcePause sonrası duraklatılmış sahnede özet yine gösterilir', async () => {
    // Phaser `pause()` sonrası `isActive()` false, `isPaused()` true döner.
    // Bitiş akışının kendi duraklatması sahneyi "yok" sayarsa Android store
    // IPC'sinden dönüldüğünde özet atlanır ve oyuncu donuk tuvalde kalır.
    let active = true;
    let paused = false;
    const showSummary = vi.fn();
    const finisher = new RunFinisher({
      isSceneActive: () => active || paused,
      isSummaryVisible: () => false,
      forcePause: () => {
        active = false;
        paused = true;
      },
      playOutcomeAudio: vi.fn(),
      submitStats: () => Promise.resolve(RESULT),
      showSummary,
      goToMainMenu: vi.fn(),
    });

    await finisher.finish('defeat');

    expect(paused).toBe(true);
    expect(showSummary).toHaveBeenCalledWith('defeat', RESULT);
  });

  describe('çift bitiş koruması', () => {
    it('aynı frame içinde zafer ve yenilgi tetiklenirse yalnızca ilki geçer', async () => {
      // Boss ölürken son vuruşu oyuncuyu da öldürebilir: iki çıkış aynı anda.
      const s = setup();
      await Promise.all([s.finisher.finish('victory'), s.finisher.finish('defeat')]);

      expect(s.deps.submitStats).toHaveBeenCalledOnce();
      expect(s.deps.showSummary).toHaveBeenCalledOnce();
      expect(s.deps.showSummary).toHaveBeenCalledWith('victory', RESULT);
    });

    it('bittikten sonra tekrar çağrılırsa hiçbir şey yapmaz', async () => {
      const s = setup();
      await s.finisher.finish('defeat');
      await s.finisher.finish('defeat');
      expect(s.deps.submitStats).toHaveBeenCalledOnce();
    });

    it('özet ekranı zaten görünürse başlamaz', async () => {
      const s = setup();
      s.state.summaryVisible = true;
      await s.finisher.finish('defeat');
      expect(s.deps.submitStats).not.toHaveBeenCalled();
      expect(s.finisher.isFinished).toBe(false);
    });
  });

  describe('sahne kapanma yarışı', () => {
    it('sahne baştan aktif değilse hiç başlamaz', async () => {
      const s = setup();
      s.state.sceneActive = false;
      await s.finisher.finish('defeat');
      expect(s.deps.forcePause).not.toHaveBeenCalled();
      expect(s.deps.submitStats).not.toHaveBeenCalled();
    });

    it('await sırasında sahne kapanırsa özet ölü sahneye yazılmaz', async () => {
      // Oyuncu submitStats beklenirken restart'a basarsa sahne ölür.
      const state = { sceneActive: true, summaryVisible: false };
      const showSummary = vi.fn();
      const finisher = new RunFinisher({
        isSceneActive: () => state.sceneActive,
        isSummaryVisible: () => state.summaryVisible,
        forcePause: vi.fn(),
        playOutcomeAudio: vi.fn(),
        submitStats: () => {
          state.sceneActive = false;
          return Promise.resolve(RESULT);
        },
        showSummary,
        goToMainMenu: vi.fn(),
      });

      await finisher.finish('defeat');
      expect(showSummary).not.toHaveBeenCalled();
    });

    it('eski koşunun geciken sonucu restart edilen yeni koşuya özet açmaz', async () => {
      let resolveSubmit: ((value: RunResult) => void) | undefined;
      const pending = new Promise<RunResult>((resolve) => {
        resolveSubmit = resolve;
      });
      const s = setup({ submitStats: () => pending });

      const oldFinish = s.finisher.finish('defeat');
      s.finisher.reset();
      resolveSubmit?.(RESULT);
      await oldFinish;

      expect(s.deps.showSummary).not.toHaveBeenCalled();
      expect(s.finisher.isFinished).toBe(false);
      expect(s.finisher.isFinishing).toBe(false);
    });
  });

  describe('beklenmedik hata', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('özet ekranı patlarsa oyun donmaz, ana menüye döner', async () => {
      const s = setup({
        showSummary: vi.fn(() => {
          throw new Error('DOM patladı');
        }),
      });

      await expect(s.finisher.finish('defeat')).resolves.toBeUndefined();
      expect(s.deps.goToMainMenu).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('hata sonrası akış kilitli kalmaz', async () => {
      const s = setup({
        showSummary: vi.fn(() => {
          throw new Error('DOM patladı');
        }),
      });
      await s.finisher.finish('defeat');
      expect(s.finisher.isFinishing).toBe(false);
    });
  });

  it('reset restart için durumu sıfırlar', async () => {
    const s = setup();
    await s.finisher.finish('defeat');
    s.finisher.reset();
    expect(s.finisher.isFinished).toBe(false);

    await s.finisher.finish('victory');
    expect(s.deps.submitStats).toHaveBeenCalledTimes(2);
  });
});
