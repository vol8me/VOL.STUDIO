import { describe, expect, it } from 'vitest';
import { GameMeasurements } from '@/app/GameMeasurements';

describe('GameMeasurements', () => {
  it('render gönderimi ve GPU süresini ayrı örneklerle tutar; sunum süresi uydurmaz', async () => {
    const records: Record<string, unknown>[] = [];
    const measurement = new GameMeasurements((record) => {
      records.push(record);
      return Promise.resolve();
    }, 30);
    measurement.frame(0, false, 'low', 0);
    measurement.renderCpu({ frameId: 1, durationMs: 2 });
    measurement.frame(16, false, 'low', 0);
    measurement.renderCpu({ frameId: 2, durationMs: 4 });
    measurement.renderGpu({ frameId: 1, status: 'ready', durationMs: 7 });
    measurement.frame(32, false, 'low', 0);
    measurement.renderGpu({ frameId: 2, status: 'ready', durationMs: 50 });
    measurement.renderCpu({ frameId: 3, durationMs: 0 });
    measurement.renderGpu({ frameId: null, status: 'unsupported', durationMs: null });
    measurement.frame(48, false, 'low', 0);
    await measurement.flush();
    expect(records[0]).toMatchObject({
      gpuTimeMs: 7,
      presentTimeMs: null,
      renderFrameStart: 1,
      renderFrameEnd: 2,
      metrics: { renderSubmitMs: { samples: 2, avg: 3 }, gpuTimeMs: { samples: 1, p95: 7 } },
      renderSlowestFrame: { frameId: 2, durationMs: 4 },
    });
    expect(records[1]).toMatchObject({
      gpuTimeMs: null,
      gpuStatus: 'unsupported',
      discardedGpuSamples: 1,
      metrics: { renderSubmitMs: { avg: 0 } },
    });
  });
  it('rapor hatasını flush sonucunda gösterir ve sonraki raporu kayıp sayısıyla gönderir', async () => {
    const records: Record<string, unknown>[] = [];
    const failure = new Error('report unavailable');
    const measurement = new GameMeasurements((record) => {
      records.push(record);
      return records.length === 1 ? Promise.reject(failure) : Promise.resolve();
    }, 10);
    measurement.frame(0, false, 'high', 0);
    measurement.frame(16, false, 'high', 0);
    await expect(measurement.flush()).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [failure],
    });
    measurement.frame(32, false, 'high', 0);
    measurement.frame(48, false, 'high', 0);
    await measurement.flush();
    expect(records[1]).toMatchObject({ lostReports: 1, window: 2 });
    expect(records[0]?.runId).toEqual(expect.any(String));
    expect(records[1]?.runId).toBe(records[0]?.runId);
  });
  it('senaryo ve hava geçişlerini ayrı pencerelerle, aşama maliyetleriyle kaydeder', async () => {
    const records: Record<string, unknown>[] = [];
    const measurement = new GameMeasurements((record) => {
      records.push(record);
      return Promise.resolve();
    }, 100);
    const first = { scenario: 'empty', seed: 731, weather: 'clear', season: 'summer' };
    measurement.beginFrame(0);
    measurement.mark('simulation', 2);
    measurement.frame(3, false, 'low', 0, first);
    measurement.beginFrame(16);
    measurement.mark('simulation', 18);
    measurement.frame(19, false, 'low', 1, first);
    const next = { ...first, scenario: 'sandbox', weather: 'rain' };
    measurement.beginFrame(1000);
    measurement.mark('simulation', 1005);
    measurement.frame(1006, false, 'high', 2, next);
    measurement.beginFrame(1016);
    measurement.mark('simulation', 1021);
    measurement.frame(1022, false, 'high', 3, next);
    await measurement.flush();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      ...first,
      quality: 'low',
      p95: 16,
      metrics: { 'cpuMs.simulation': { avg: 2 }, updateMs: { avg: 3 } },
    });
    expect(records[1]).toMatchObject({
      ...next,
      quality: 'high',
      p95: 16,
      metrics: { 'cpuMs.simulation': { avg: 5 }, updateMs: { avg: 6 } },
    });
  });
  it('kare aralıklarını kalite ve duraklatma geçişlerinde ayrı Deck pencerelerine yazar', async () => {
    const records: Record<string, unknown>[] = [];
    const measurement = new GameMeasurements((record) => {
      records.push(record);
      return Promise.resolve();
    }, 30);
    measurement.frame(0, false, 'low', 0);
    measurement.frame(16, false, 'low', 1);
    measurement.frame(32, false, 'low', 2);
    measurement.frame(1000, true, 'low', 0);
    measurement.frame(1016, true, 'low', 0);
    await measurement.flush();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: 'perf',
      phase: 'gameplay',
      p95: 16,
      frames: 2,
      window: 1,
    });
    expect(records[1]).toMatchObject({
      type: 'perf',
      phase: 'pause',
      p95: 16,
      frames: 1,
      window: 2,
    });
    measurement.frame(2000, false, 'high', 3);
    measurement.frame(2016, false, 'high', 4);
    measurement.reset();
    measurement.frame(9000, false, 'high', 0);
    measurement.frame(9016, false, 'high', 0);
    await measurement.flush();
    expect(records[3]).toMatchObject({ p95: 16 });
  });
});
