import { describe, it, expect, vi } from 'vitest';
import { WaveManager } from '@/runtime/systems/WaveManager';
import { waveConfig } from '@/config/wave';

type WaveListener = (wave: number) => void;

function makeManager(overrides: { isBlockerAlive?: () => boolean } = {}) {
  const events = {
    onWaveStart: vi.fn<WaveListener>(),
    onWaveEnd: vi.fn<WaveListener>(),
    onWaveClear: vi.fn<WaveListener>(),
    onEliteWave: vi.fn<WaveListener>(),
    onBossWave: vi.fn<WaveListener>(),
    onRunComplete: vi.fn<() => void>(),
  };
  return {
    manager: new WaveManager({ ...events, ...overrides }),
    events,
  };
}

/** Dalgaları frame frame ilerletir — gerçek oyun döngüsüne yakın. */
function advanceWaves(manager: WaveManager, waves: number, stepMs = 1000): void {
  const totalMs = waveConfig.waveDurationMs * waves;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    manager.update(stepMs);
  }
}

describe('WaveManager', () => {
  it('start ilk dalgayı başlatır', () => {
    const { manager, events } = makeManager();
    manager.start();

    expect(manager.getCurrentWave()).toBe(1);
    expect(events.onWaveStart).toHaveBeenCalledWith(1);
    expect(manager.getRemainingMs()).toBe(waveConfig.waveDurationMs);
  });

  it('start çağrılmadan update hiçbir şey yapmaz', () => {
    const { manager, events } = makeManager();
    manager.update(waveConfig.waveDurationMs * 3);

    expect(manager.getCurrentWave()).toBe(0);
    expect(events.onWaveStart).not.toHaveBeenCalled();
  });

  it('dalga süresi dolunca sonraki dalgaya geçer', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, 1);

    expect(events.onWaveEnd).toHaveBeenCalledWith(1);
    expect(events.onWaveStart).toHaveBeenCalledWith(2);
    expect(manager.getCurrentWave()).toBe(2);
  });

  it('kalan süre ve ilerleme dalga içinde doğru raporlanır', () => {
    const { manager } = makeManager();
    manager.start();
    manager.update(waveConfig.waveDurationMs / 4);

    expect(manager.getRemainingMs()).toBe((waveConfig.waveDurationMs * 3) / 4);
    expect(manager.getProgress()).toBeCloseTo(0.25, 6);
  });

  it('dükkan tetikleyicisi her dalga sonunda bir kez ateşlenir', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, 3);

    expect(events.onWaveEnd.mock.calls.map(([wave]) => wave)).toEqual([1, 2, 3]);
  });

  it('elite olayı yalnızca elite dalgasında ateşlenir', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, waveConfig.eliteWave);

    expect(events.onEliteWave).toHaveBeenCalledTimes(1);
    expect(events.onEliteWave).toHaveBeenCalledWith(waveConfig.eliteWave);
  });

  it('elite dalgasından önce elite olayı ateşlenmez', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, waveConfig.eliteWave - 2);

    expect(events.onEliteWave).not.toHaveBeenCalled();
  });

  it('boss olayı son dalgada ateşlenir', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, waveConfig.bossWave - 1);

    expect(events.onBossWave).toHaveBeenCalledTimes(1);
    expect(events.onBossWave).toHaveBeenCalledWith(waveConfig.bossWave);
  });

  it('tüm dalgalar bitince koşu tamamlanır ve yeni dalga başlamaz', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, waveConfig.totalWaves);

    expect(events.onRunComplete).toHaveBeenCalledTimes(1);
    expect(manager.isRunComplete()).toBe(true);
    expect(manager.getCurrentWave()).toBe(waveConfig.totalWaves);
    expect(events.onWaveStart).toHaveBeenCalledTimes(waveConfig.totalWaves);
    expect(events.onWaveEnd).toHaveBeenCalledTimes(waveConfig.totalWaves);
  });

  it('koşu bittikten sonra update hiçbir olay üretmez', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, waveConfig.totalWaves);
    events.onWaveStart.mockClear();
    events.onRunComplete.mockClear();

    manager.update(waveConfig.waveDurationMs * 5);

    expect(events.onWaveStart).not.toHaveBeenCalled();
    expect(events.onRunComplete).not.toHaveBeenCalled();
    expect(manager.getRemainingMs()).toBe(0);
    expect(manager.getProgress()).toBe(1);
  });

  it('tek bir uzun frame birden fazla dalgayı atlamaz — hepsi işlenir', () => {
    const { manager, events } = makeManager();
    manager.start();
    // Sekme arka planda kalıp tek seferde 3 dalga süresi gelirse.
    manager.update(waveConfig.waveDurationMs * 3);

    expect(events.onWaveEnd.mock.calls.map(([wave]) => wave)).toEqual([1, 2, 3]);
    expect(manager.getCurrentWave()).toBe(4);
  });

  it('start yeniden çağrılınca koşu baştan başlar', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, 5);
    events.onWaveStart.mockClear();

    manager.start();

    expect(manager.getCurrentWave()).toBe(1);
    expect(manager.isRunComplete()).toBe(false);
    expect(events.onWaveStart).toHaveBeenCalledWith(1);
  });

  it('callback verilmese bile çökmeden çalışır', () => {
    const manager = new WaveManager();
    manager.start();
    expect(() => manager.update(waveConfig.waveDurationMs * 2)).not.toThrow();
    expect(manager.getCurrentWave()).toBe(3);
  });

  it('normal dalga bitince onWaveClear sahneyi temizler', () => {
    const { manager, events } = makeManager();
    manager.start();
    advanceWaves(manager, 1);

    expect(events.onWaveClear).toHaveBeenCalledWith(1);
    expect(events.onWaveEnd).toHaveBeenCalledWith(1);
  });

  it('elite dalgasında süre dolsa bile engel hayattaysa dalga bitmez', () => {
    const isBlockerAlive = vi.fn(() => true);
    const { manager, events } = makeManager({ isBlockerAlive });
    manager.start();

    advanceWaves(manager, waveConfig.eliteWave - 1);
    events.onWaveEnd.mockClear();
    events.onWaveClear.mockClear();

    manager.update(waveConfig.waveDurationMs);

    expect(isBlockerAlive).toHaveBeenCalled();
    expect(manager.getCurrentWave()).toBe(waveConfig.eliteWave);
    expect(manager.isAwaitingBlocker()).toBe(true);
    expect(manager.getRemainingMs()).toBe(0);
    expect(events.onWaveEnd).not.toHaveBeenCalled();
    expect(events.onWaveClear).not.toHaveBeenCalled();
  });

  it('elite ölünce dalga o an biter ve sonraki dalga başlar', () => {
    const isBlockerAlive = vi.fn(() => true);
    const { manager, events } = makeManager({ isBlockerAlive });
    manager.start();

    advanceWaves(manager, waveConfig.eliteWave - 1);
    manager.update(waveConfig.waveDurationMs);
    events.onWaveEnd.mockClear();
    events.onWaveStart.mockClear();
    events.onWaveClear.mockClear();

    isBlockerAlive.mockReturnValue(false);
    manager.notifyBlockerDefeated();

    expect(events.onWaveEnd).toHaveBeenCalledWith(waveConfig.eliteWave);
    expect(events.onWaveClear).not.toHaveBeenCalled();
    expect(events.onWaveStart).toHaveBeenCalledWith(waveConfig.eliteWave + 1);
    expect(manager.getCurrentWave()).toBe(waveConfig.eliteWave + 1);
    expect(manager.isAwaitingBlocker()).toBe(false);
  });

  it('elite erken öldürülse de dalga o an biter', () => {
    const isBlockerAlive = vi.fn(() => true);
    const { manager, events } = makeManager({ isBlockerAlive });
    manager.start();

    advanceWaves(manager, waveConfig.eliteWave - 1);
    manager.update(waveConfig.waveDurationMs / 2);

    expect(manager.getCurrentWave()).toBe(waveConfig.eliteWave);
    expect(manager.isAwaitingBlocker()).toBe(false);

    isBlockerAlive.mockReturnValue(false);
    manager.notifyBlockerDefeated();

    expect(events.onWaveEnd).toHaveBeenCalledWith(waveConfig.eliteWave);
    expect(events.onWaveStart).toHaveBeenCalledWith(waveConfig.eliteWave + 1);
  });

  it('boss ölünce koşu tamamlanır', () => {
    const isBlockerAlive = vi.fn(() => true);
    const { manager, events } = makeManager({ isBlockerAlive });
    manager.start();

    // 1-9 normal dalgalarda engel yok.
    advanceWaves(manager, waveConfig.eliteWave - 1);
    // Dalga 10'da elite belirir; onu öldürüp ilerle.
    manager.update(waveConfig.waveDurationMs);
    manager.notifyBlockerDefeated();

    // 11-19 normal dalgalar.
    advanceWaves(manager, waveConfig.bossWave - waveConfig.eliteWave - 1);
    events.onWaveEnd.mockClear();
    events.onWaveClear.mockClear();

    // Dalga 20'de boss belirir; süre dolsun ve öldür.
    manager.update(waveConfig.waveDurationMs);
    expect(manager.getCurrentWave()).toBe(waveConfig.bossWave);
    expect(manager.isAwaitingBlocker()).toBe(true);

    isBlockerAlive.mockReturnValue(false);
    manager.notifyBlockerDefeated();

    expect(events.onWaveEnd).toHaveBeenLastCalledWith(waveConfig.bossWave);
    expect(events.onRunComplete).toHaveBeenCalled();
    expect(events.onWaveClear).not.toHaveBeenCalled();
    expect(manager.isRunComplete()).toBe(true);
  });
});
