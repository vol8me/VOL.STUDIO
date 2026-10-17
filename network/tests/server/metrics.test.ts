import { describe, expect, it } from 'vitest';
import { RollingWindow } from '@volstudio/core/collections';
import { drainEventLoopDelay, eventLoopDelay, processSnapshot, summarize } from '../../src/server';

describe('CORE ölçüm penceresinin sunucu özeti', () => {
  it('boşken sıfır verir', () => {
    expect(summarize(new RollingWindow(4))).toEqual({
      samples: 0,
      meanMs: 0,
      p50Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    });
  });

  it('halka dolunca eskiyi atar; yüzdelik, ortalama ve en büyük değer son N ölçüme aittir', () => {
    const window = new RollingWindow(4);
    for (const value of [100, 1, 2, 3, 4]) window.push(value);
    expect(summarize(window)).toEqual({ samples: 4, meanMs: 2.5, p50Ms: 3, p99Ms: 4, maxMs: 4 });
  });
});

describe('olay döngüsü ve süreç özeti', () => {
  it('ölçer süreç genelinde tektir', () => {
    expect(eventLoopDelay()).toBe(eventLoopDelay());
  });

  it('olay döngüsünü bloklamak ölçülür ve okuma ölçeri sıfırlar', async () => {
    // Histogram sıfırlanınca ilk örnek yalnız zaman çıpasıdır; ölçülmesi için önce bir örnek beklenir.
    drainEventLoopDelay();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const end = performance.now() + 120;
    while (performance.now() < end) {
      // Bilerek meşgul bekleme: olay döngüsü gecikmesi üretir.
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    const blocked = drainEventLoopDelay();
    expect(blocked.maxMs).toBeGreaterThan(50);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(drainEventLoopDelay().maxMs).toBeLessThan(blocked.maxMs);
  });

  it('süreç özeti çalışma ortamını ve belleği taşır', () => {
    const snapshot = processSnapshot();
    expect(snapshot.pid).toBe(process.pid);
    expect(snapshot.node).toBe(process.version);
    expect(snapshot.platform).toBe(process.platform);
    expect(snapshot.memory.rss).toBeGreaterThan(0);
    expect(snapshot.uptimeSeconds).toBeGreaterThan(0);
    expect(snapshot.loop.p99Ms).toBeGreaterThanOrEqual(0);
  });
});
