import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Diagnostics } from '../../src/debug/Diagnostics';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getSnapshotBody(fetchMock: ReturnType<typeof vi.fn>, index: number): unknown {
  const init = fetchMock.mock.calls[index][1] as { body: string } | undefined;
  if (!init) throw new Error(`fetch call ${index} has no init`);
  return JSON.parse(init.body);
}

describe('Diagnostics', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    Diagnostics.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Diagnostics.reset();
  });

  it('singleton koruması: ikinci constructor hata atar', () => {
    new Diagnostics({ gameId: 'test', overlay: false });
    expect(() => new Diagnostics({ gameId: 'test', overlay: false })).toThrow(
      'Diagnostics zaten oluşturulmuş',
    );
  });

  it('recordEvent kaydedilen olayları snapshot ile gönderir ve buffer temizler', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as unknown as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const diag = new Diagnostics({ gameId: 'test', sampleEvery: 1, overlay: false });
    diag.recordEvent('enemyHit', { x: 10, y: 20 });

    diag.beginFrame();
    await wait(2);
    diag.endFrame();
    await wait(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = getSnapshotBody(fetchMock, 0) as {
      events: { type: string; data: unknown }[];
    };
    expect(firstBody.events).toHaveLength(1);
    expect(firstBody.events[0].type).toBe('enemyHit');
    expect(firstBody.events[0].data).toEqual({ x: 10, y: 20 });

    // Sonraki frame'de buffer boş olmalı
    diag.beginFrame();
    await wait(2);
    diag.endFrame();
    await wait(0);

    const secondBody = getSnapshotBody(fetchMock, 1) as { events: unknown[] };
    expect(secondBody.events).toHaveLength(0);
  });

  it('markResume() duraklatma süresini frame istatistiğine yansıtmaz', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as unknown as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const diag = new Diagnostics({ gameId: 'test', sampleEvery: 1, overlay: false });

    // İlk frame
    diag.beginFrame();
    await wait(5);
    diag.endFrame();
    await wait(0);

    // Uzun bir duraklatma simüle et
    await wait(100);
    diag.markResume();

    // Resume sonrası frame
    diag.beginFrame();
    await wait(5);
    diag.endFrame();
    await wait(0);

    const body = getSnapshotBody(fetchMock, fetchMock.mock.calls.length - 1) as {
      frame: { max: number };
      update: { avg: number };
    };
    // 100ms'lik pause frame time'a yansımadıysa max 50ms'den küçük kalmalı
    expect(body.frame.max).toBeLessThan(50);
    expect(body.update.avg).toBeGreaterThan(0);
  });
});
