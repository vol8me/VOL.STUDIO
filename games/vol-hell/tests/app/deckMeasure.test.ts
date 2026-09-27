import { describe, expect, it, vi, afterEach } from 'vitest';

// Probe'lar hoisted: modül her testte `vi.resetModules` ile taze yüklenir
// (module-level `running` bayrağı ve rAF döngüsü sızmasın).
const mocks = vi.hoisted(() => ({
  isTauri: true,
  env: {} as Record<string, string>,
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  records: [] as Record<string, unknown>[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mocks.isTauri,
  invoke: mocks.invoke,
}));

vi.mock('@volstudio/tauri-v2', () => ({
  getDiagnosticsEnv: () => Promise.resolve(mocks.env),
  isDeckMeasureRequested: (env: Record<string, string>) => env.VOL_DECK_MEASURE === '1',
  reportDiagnostics: (record: Record<string, unknown>) => {
    mocks.records.push(record);
    return Promise.resolve();
  },
  registerShutdownFlush: () => () => undefined,
}));

function stubClock() {
  // Manuel rAF: kuyruğa alınan callback'i test istediği anda besler.
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return {
    /** `count` kare boyunca `stepMs` aralıklarla sürer. */
    pump(count: number, stepMs: number, startAt = 0) {
      let now = startAt;
      for (let i = 0; i < count; i++) {
        const cb = queue.shift();
        if (!cb) break;
        now += stepMs;
        cb(now);
      }
      return now;
    },
  };
}

describe('summarizeDeltas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('boş pencere null verir', async () => {
    const { summarizeDeltas } = await import('@/app/deckMeasure');
    expect(summarizeDeltas([])).toBeNull();
  });

  it('16,7 ms aralıklar ~60 FPS verir ve eşik sayaçları sıfırdır', async () => {
    const { summarizeDeltas } = await import('@/app/deckMeasure');
    const summary = summarizeDeltas(Array.from({ length: 120 }, () => 16.7));
    expect(summary?.fps).toBeCloseTo(59.9, 0);
    expect(summary?.p95).toBeCloseTo(16.7, 1);
    expect(summary?.over20ms).toBe(0);
    expect(summary?.over34ms).toBe(0);
  });

  it('tek spike p95 ve over20ms sayaçlarına yansır', async () => {
    const { summarizeDeltas } = await import('@/app/deckMeasure');
    const deltas = [...Array.from({ length: 99 }, () => 16.7), 50];
    const summary = summarizeDeltas(deltas)!;
    expect(summary.frames).toBe(100);
    expect(summary.over20ms).toBe(1);
    expect(summary.p99).toBe(50);
  });
});

describe('startDeckMeasure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    mocks.records.length = 0;
    mocks.invoke.mockReset();
    mocks.isTauri = true;
    mocks.env = {};
  });

  it('tarayıcıda hiçbir şey kurmaz', async () => {
    mocks.isTauri = false;
    const { startDeckMeasure } = await import('@/app/deckMeasure');
    expect(await startDeckMeasure()).toBe(false);
    expect(mocks.records).toHaveLength(0);
  });

  it('VOL_DECK_MEASURE=1 olmadan pas geçer', async () => {
    mocks.env = { STEAMDECK: '1' };
    const { startDeckMeasure } = await import('@/app/deckMeasure');
    expect(await startDeckMeasure()).toBe(false);
    expect(mocks.records).toHaveLength(0);
  });

  it('bayrakla bilgi ve steamworks kayıtlarını yazar', async () => {
    mocks.env = { VOL_DECK_MEASURE: '1', STEAM_GAMESCOPE: '1' };
    mocks.invoke.mockResolvedValue({ available: true, manifestOk: true, appId: 480 });
    stubClock();
    const { startDeckMeasure } = await import('@/app/deckMeasure');
    expect(await startDeckMeasure()).toBe(true);

    const types = mocks.records.map((r) => r.type);
    expect(types).toContain('info');
    expect(types).toContain('steamworks');
    const sw = mocks.records.find((r) => r.type === 'steamworks');
    expect(sw).toMatchObject({ available: true, manifestOk: true, appId: 480 });
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:vol-steamworks|status');
  });

  it('10 sn penceresinde perf kaydı ve ilk kol basımında pad-input yazar', async () => {
    mocks.env = { VOL_DECK_MEASURE: '1' };
    mocks.invoke.mockResolvedValue({ available: false });
    const clock = stubClock();
    const pad = {
      id: 'Steam Deck Controller',
      mapping: 'standard',
      buttons: [{ pressed: true }],
      axes: [0, 0],
    } as unknown as Gamepad;
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [pad] });

    const { startDeckMeasure } = await import('@/app/deckMeasure');
    await startDeckMeasure();

    // Bağlı kol başlangıçta raporlanır.
    expect(mocks.records.some((r) => r.type === 'pad-connected')).toBe(true);

    clock.pump(610, 16.7); // ~10,2 sn → bir pencere kapanır
    const perf = mocks.records.filter((r) => r.type === 'perf');
    expect(perf.length).toBeGreaterThanOrEqual(1);
    expect(perf[0]).toMatchObject({ phase: 'vol-hell oyun', window: 0 });
    expect(perf[0].fps).toBeGreaterThan(50);

    const input = mocks.records.find((r) => r.type === 'pad-input');
    expect(input).toMatchObject({ button: 0 });
  });
});
