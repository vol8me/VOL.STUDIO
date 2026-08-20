import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Diagnostics, createDiagnostics } from '../../src/debug/Diagnostics';
import {
  LocalServerTransport,
  NoopTransport,
  type DiagnosticsTransport,
} from '../../src/debug/transport';
import type { DiagnosticsSnapshot } from '../../src/debug/types';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Gönderilen snapshot'ları biriktiren test taşıyıcısı. */
function recordingTransport(): DiagnosticsTransport & { sent: DiagnosticsSnapshot[] } {
  const sent: DiagnosticsSnapshot[] = [];
  return {
    sent,
    send(snapshot) {
      sent.push(structuredClone(snapshot));
    },
  };
}

describe('Diagnostics', () => {
  it('iki örnek yan yana yaşayabilir', () => {
    // Aynı process'te birden fazla Diagnostics örneği çalışabilmeli.
    const first = createDiagnostics({ gameId: 'a', overlay: false });
    const second = createDiagnostics({ gameId: 'b', overlay: false });

    expect(first).not.toBe(second);
    first.destroy();
    second.destroy();
  });

  it('iki örnek birbirinin olaylarını GÖRMEZ', () => {
    const a = recordingTransport();
    const b = recordingTransport();
    const first = createDiagnostics({ gameId: 'a', sampleEvery: 1, overlay: false, transport: a });
    const second = createDiagnostics({ gameId: 'b', sampleEvery: 1, overlay: false, transport: b });

    first.recordEvent('alfa');
    second.recordEvent('beta');

    for (const diag of [first, second]) {
      diag.beginFrame();
      diag.endFrame();
    }

    expect(a.sent[0].events.map((e) => e.type)).toEqual(['alfa']);
    expect(b.sent[0].events.map((e) => e.type)).toEqual(['beta']);
    expect(a.sent[0].gameId).toBe('a');
    expect(b.sent[0].gameId).toBe('b');

    first.destroy();
    second.destroy();
  });

  it('transport verilmezse HİÇBİR ağ isteği açılmaz', async () => {
    // CORE'un varsayılan davranışı bir hata ayıklama sunucusuna bağlanmak
    // olmamalı; adres bilgisi tüketiciye ait.
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const diag = new Diagnostics({ gameId: 'test', sampleEvery: 1, overlay: false });
    diag.beginFrame();
    diag.endFrame();
    await wait(0);

    expect(fetchMock).not.toHaveBeenCalled();
    diag.destroy();
    globalThis.fetch = originalFetch;
  });

  it('recordEvent kaydedilen olayları snapshot ile gönderir ve buffer temizler', () => {
    const transport = recordingTransport();
    const diag = createDiagnostics({
      gameId: 'test',
      sampleEvery: 1,
      overlay: false,
      transport,
    });

    diag.recordEvent('enemyHit', { x: 10, y: 20 });
    diag.beginFrame();
    diag.endFrame();

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].events).toHaveLength(1);
    expect(transport.sent[0].events[0].type).toBe('enemyHit');
    expect(transport.sent[0].events[0].data).toEqual({ x: 10, y: 20 });

    // Sonraki frame'de buffer boş olmalı
    diag.beginFrame();
    diag.endFrame();
    expect(transport.sent[1].events).toHaveLength(0);

    diag.destroy();
  });

  it('markResume() duraklatma süresini frame istatistiğine yansıtmaz', async () => {
    const transport = recordingTransport();
    const diag = createDiagnostics({
      gameId: 'test',
      sampleEvery: 1,
      overlay: false,
      transport,
    });

    diag.beginFrame();
    await wait(5);
    diag.endFrame();

    // Uzun bir duraklatma simüle et
    await wait(100);
    diag.markResume();

    diag.beginFrame();
    await wait(5);
    diag.endFrame();

    const last = transport.sent[transport.sent.length - 1];
    // 100ms'lik pause frame time'a yansımadıysa max 50ms'den küçük kalmalı
    expect(last.frame.max).toBeLessThan(50);
    expect(last.update.avg).toBeGreaterThan(0);

    diag.destroy();
  });
});

describe('DiagnosticsTransport', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('NoopTransport hiçbir şey yapmaz', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    new NoopTransport().send();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('LocalServerTransport verilen adrese POST eder', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({ ok: true } as unknown as Response),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new LocalServerTransport({ url: 'http://127.0.0.1:1234/x' });
    await transport.send({ gameId: 'test' } as unknown as DiagnosticsSnapshot);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:1234/x');
  });

  it('bir istek UÇUŞTAYKEN gelen snapshot atlanır (istekler birikmez)', async () => {
    // Uçuşta iken yeni istek açılmamalı; snapshot atlanır.
    let release: () => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve({ ok: true } as unknown as Response);
    });
    const fetchMock = vi.fn(() => pending);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new LocalServerTransport({ url: 'http://127.0.0.1:1234/x' });
    const snapshot = { gameId: 'test' } as unknown as DiagnosticsSnapshot;

    void transport.send(snapshot);
    expect(transport.isInFlight()).toBe(true);

    void transport.send(snapshot);
    void transport.send(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release();
    await pending;
    await Promise.resolve();

    expect(transport.isInFlight()).toBe(false);
    void transport.send(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skipWhileInFlight: false verilirse her snapshot kendi isteğini açar', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as unknown as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new LocalServerTransport({
      url: 'http://127.0.0.1:1234/x',
      skipWhileInFlight: false,
    });
    const snapshot = { gameId: 'test' } as unknown as DiagnosticsSnapshot;

    await Promise.all([transport.send(snapshot), transport.send(snapshot)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ağ hatası yutulur — hata ayıklama aracı oyunu düşürmez', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error('bağlantı yok')),
    ) as unknown as typeof fetch;

    const transport = new LocalServerTransport({ url: 'http://127.0.0.1:1234/x' });
    await expect(
      transport.send({ gameId: 'test' } as unknown as DiagnosticsSnapshot),
    ).resolves.toBeUndefined();
    expect(transport.isInFlight()).toBe(false);
  });
});
