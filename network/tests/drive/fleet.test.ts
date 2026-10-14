import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Room, defineRoom } from '@colyseus/core';
import { afterEach, describe, expect, it } from 'vitest';
import { Histogram, JsonlReport, runFleet, summarizeHistogram } from '../../src/drive';
import { DEFAULT_GUARD, startHost, type StartedHost } from '../../src/server';

class TickRoom extends Room {
  override maxClients = 16;
  override onCreate(): void {
    let tick = 0;
    this.clock.setInterval(() => this.broadcast('tick', tick++), 50);
    this.onMessage('input', (client, message: unknown) => client.send('echo', message));
    this.onMessage('kick', (client) => client.leave(4001));
  }
}

const rooms = { tick: defineRoom(TickRoom) };
const started: StartedHost<typeof rooms>[] = [];
const dirs: string[] = [];

async function start(guard?: typeof DEFAULT_GUARD): Promise<StartedHost<typeof rooms>> {
  const host = await startHost(rooms, { port: 0, host: '127.0.0.1' }, { guard });
  started.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((host) => host.stop()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Histogram', () => {
  it('yüzdelik, ortalama ve en büyük değeri kova duyarlığında verir', () => {
    const histogram = new Histogram(1, 100);
    for (let value = 1; value <= 100; value++) histogram.record(value - 0.5);
    expect(histogram.count).toBe(100);
    expect(histogram.percentile(0.5)).toBe(50);
    expect(histogram.percentile(0.99)).toBe(99);
    expect(histogram.max).toBe(99.5);
    expect(summarizeHistogram(histogram).mean).toBeCloseTo(50, 5);
  });

  it('son kovayı aşan değeri gerçek en büyükle bildirir; boşken sıfırdır; geçersizi yok sayar', () => {
    const histogram = new Histogram(10, 3);
    expect(histogram.percentile(0.99)).toBe(0);
    histogram.record(1000);
    histogram.record(Number.NaN);
    histogram.record(-5);
    expect(histogram.count).toBe(1);
    expect(histogram.percentile(0.99)).toBe(1000);
    histogram.reset();
    expect(histogram.count).toBe(0);
    expect(histogram.max).toBe(0);
  });

  it('geçersiz kova ayarını reddeder', () => {
    expect(() => new Histogram(0, 10)).toThrow(RangeError);
    expect(() => new Histogram(1, 1)).toThrow(RangeError);
  });
});

describe('JsonlReport', () => {
  it('dosyaya her olayı bir JSON satırı olarak yazar, üst dizini kurar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-drive-'));
    dirs.push(dir);
    const path = join(dir, 'derin', 'rapor.jsonl');
    const report = JsonlReport.toFile(path);
    report.write('a', { x: 1 });
    report.write('b');
    await report.close();
    await report.close();
    const lines = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { ev: string; t: number; x?: number });
    expect(lines.map((line) => line.ev)).toEqual(['a', 'b']);
    expect(lines[0]).toMatchObject({ x: 1 });
    expect(typeof lines[0].t).toBe('number');
    expect(report.failed).toBe(0);
  });

  it('bellekte tutar', () => {
    const report = JsonlReport.toMemory();
    report.write('a');
    expect(report.records).toHaveLength(1);
  });
});

describe('runFleet', () => {
  it('istemcileri katar, girdi yollatır ve katılım, yama aralığı ve ping özetini verir', async () => {
    const host = await start();
    const report = JsonlReport.toMemory();
    let acted = 0;
    const summary = await runFleet({
      endpoint: host.endpoint,
      roomName: 'tick',
      clients: 4,
      durationMs: 1500,
      rampMs: 100,
      sampleMs: 500,
      actMs: 50,
      act: ({ room }) => {
        acted++;
        room.send('input', 1);
      },
      report,
    });
    expect(summary).toMatchObject({ clients: 4, joined: 4, dropped: 0, errors: 0, actErrors: 0 });
    expect(summary.joinFailures).toEqual({});
    expect(acted).toBeGreaterThan(4);
    expect(summary.joinMs.count).toBe(4);
    expect(summary.pingMs.count).toBeGreaterThan(0);
    // Oda 20 Hz yayın yapar; Windows zamanlayıcı kırpması payı bırakılarak ölçülür.
    expect(summary.messagesPerSecond).toBeGreaterThan(10);
    expect(summary.messagesPerSecond).toBeLessThan(60);
    const events = report.records.map((record) => record.ev);
    expect(events[0]).toBe('start');
    expect(events.filter((ev) => ev === 'join')).toHaveLength(4);
    expect(events).toContain('fleet');
    expect(events).toContain('sample');
    expect(events.at(-1)).toBe('summary');
  });

  it('sunucunun attığı botu kopma sayar, kodu kaydeder ve diğerini etkilemez', async () => {
    const host = await start();
    const report = JsonlReport.toMemory();
    let kicked = false;
    const summary = await runFleet({
      endpoint: host.endpoint,
      roomName: 'tick',
      clients: 2,
      durationMs: 1200,
      rampMs: 0,
      sampleMs: 400,
      act: ({ index, room }) => {
        if (index === 0 && !kicked) {
          kicked = true;
          room.send('kick');
        }
      },
      report,
    });
    expect(summary).toMatchObject({ joined: 2, dropped: 1 });
    expect(summary.closeCodes).toEqual({ '4001': 1 });
    expect(report.records.filter((record) => record.ev === 'drop')).toHaveLength(1);
  });

  it('kapıya takılan katılımları nedenine göre sayar', async () => {
    const host = await start({
      ...DEFAULT_GUARD,
      maxSockets: 2,
      requestBurst: 100,
      requestsPerSecond: 100,
    });
    const summary = await runFleet({
      endpoint: host.endpoint,
      roomName: 'tick',
      clients: 4,
      durationMs: 1200,
      rampMs: 100,
    });
    expect(summary.joined).toBe(2);
    expect(Object.values(summary.joinFailures).reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(host.guard?.stats().rejected.sockets).toBeGreaterThanOrEqual(2);
  });

  it('bozuk ayarı reddeder; iptal sinyali koşuyu erken bitirir', async () => {
    const host = await start();
    await expect(
      runFleet({ endpoint: host.endpoint, roomName: 'tick', clients: 0, durationMs: 100 }),
    ).rejects.toThrow(RangeError);
    await expect(
      runFleet({ endpoint: host.endpoint, roomName: 'tick', clients: 1, durationMs: 0 }),
    ).rejects.toThrow(RangeError);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    const began = performance.now();
    const summary = await runFleet({
      endpoint: host.endpoint,
      roomName: 'tick',
      clients: 1,
      durationMs: 30_000,
      signal: controller.signal,
    });
    expect(performance.now() - began).toBeLessThan(5000);
    expect(summary.joined).toBe(1);
  });
});
