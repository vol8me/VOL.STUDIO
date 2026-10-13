import { describe, expect, it } from 'vitest';
import { FrameProbe, STALL_MS } from '../../src/lab/probe';

/** `count` kare: her biri `interval` aralıklı, `update` + `render` ms iş. Sonraki başlangıcı verir. */
function feed(
  probe: FrameProbe,
  count: number,
  interval: number,
  update = 2,
  render = 3,
  from = 0,
): number {
  let now = from;
  for (let index = 0; index < count; index++) {
    probe.begin(now);
    probe.renderStart(now + update);
    probe.end(now + update + render);
    now += interval;
  }
  return now;
}

describe('FrameProbe', () => {
  it('kare aralığı, iş süresi ve FPS hesaplar', () => {
    const probe = new FrameProbe(256);
    feed(probe, 100, 16);
    const summary = probe.summary();
    expect(summary.frames).toBe(100);
    expect(summary.intervalMs.count).toBe(99);
    expect(summary.intervalMs.p50).toBe(16);
    expect(summary.fps).toBeCloseTo(62.5, 5);
    expect(summary.workMs.p95).toBe(5);
    expect(summary.updateMs.p95).toBe(2);
    expect(summary.renderMs.p95).toBe(3);
  });

  it('uzun kareleri eşik eşik sayar', () => {
    const probe = new FrameProbe(64);
    probe.begin(0);
    probe.end(1);
    probe.begin(40); // 40 ms: yalnız 33 üstü
    probe.end(41);
    probe.begin(100); // 60 ms: 50 üstü
    probe.end(101);
    probe.begin(250); // 150 ms: 100 üstü
    probe.end(251);
    const { longFrames } = probe.summary();
    expect(longFrames).toEqual({ over33: 3, over50: 2, over100: 1 });
  });

  it('duraklamayı ölçüme katmaz, ayrı sayar', () => {
    const probe = new FrameProbe(64);
    probe.begin(0);
    probe.end(1);
    probe.begin(STALL_MS + 100);
    probe.end(STALL_MS + 101);
    probe.begin(STALL_MS + 116);
    probe.end(STALL_MS + 117);
    const summary = probe.summary();
    expect(summary.stalls).toBe(1);
    expect(summary.intervalMs.count).toBe(1);
    expect(summary.intervalMs.max).toBe(16);
    expect(summary.frames).toBe(3);
  });

  it('başlamadan biten kareyi saymaz; çizim aşaması olmayan kare yalnız iş süresi verir', () => {
    const probe = new FrameProbe(8);
    probe.end(5);
    probe.renderStart(6);
    expect(probe.summary().frames).toBe(0);
    probe.begin(10);
    probe.end(14);
    const summary = probe.summary();
    expect(summary.frames).toBe(1);
    expect(summary.workMs.max).toBe(4);
    expect(summary.updateMs.count).toBe(0);
  });

  it('reset her şeyi sıfırlar; sıfırlamadan sonraki ilk aralık duraklama sayılmaz', () => {
    const probe = new FrameProbe(8);
    feed(probe, 20, 16);
    probe.reset();
    expect(probe.summary().frames).toBe(0);
    expect(probe.summary().fps).toBe(0);
    probe.begin(50000);
    probe.end(50001);
    expect(probe.summary().stalls).toBe(0);
    expect(probe.summary().intervalMs.count).toBe(0);
  });

  it('pencere dolunca yüzdelik son örneklerden, sayaç toplamdan gelir', () => {
    const probe = new FrameProbe(10);
    const next = feed(probe, 20, 100); // 19 aralık + gruplar arası geçiş: 20 aralık 100 ms
    feed(probe, 30, 10, 1, 1, next);
    const summary = probe.summary();
    expect(summary.intervalMs.p50).toBe(10);
    expect(summary.longFrames.over100).toBe(0);
    expect(summary.longFrames.over50).toBe(20);
    expect(summary.frames).toBe(50);
  });
});
