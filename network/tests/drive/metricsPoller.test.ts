import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { MetricsPoller } from '../../src/drive/metricsPoller';

const servers: Server[] = [];
const pollers: MetricsPoller[] = [];
afterEach(async () => {
  await Promise.all(pollers.splice(0).map((poller) => poller.stop()));
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

async function endpoint(handle: (response: ServerResponse) => void): Promise<string> {
  const server = createServer((_request, response) => handle(response));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/metrics`;
}

it('gerçek HTTP gövdesi beklerken stop iptal eder; tek istek ve kapanıştan sonra sıfır gözlemci', async () => {
  let requests = 0;
  let opened!: () => void;
  const ready = new Promise<void>((resolve) => {
    opened = resolve;
  });
  let closed!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const url = await endpoint((response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"rooms":');
    response.on('close', closed);
    opened();
  });
  const onSample = vi.fn();
  const onError = vi.fn();
  const poller = new MetricsPoller({ url, intervalMs: 5, timeoutMs: 1000, onSample, onError });
  pollers.push(poller);
  await ready;
  // İstek uçuşta kalırken birkaç yoklama vuruşu yeni istek açmamalı.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const first = poller.stop();
  expect(poller.stop()).toBe(first);
  await first;
  await disconnected;
  expect(requests).toBe(1);
  expect(onSample).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(poller.errors).toBe(0);
});

it('HTTP hatası ve bozuk JSON ölçülmez; geçmişin yalnız alan bazında en kötüsü kalır', async () => {
  let requests = 0;
  const data = (step: number, loop: number, evictions: number) => ({
    loop: { p99Ms: loop },
    rooms: [{ step: { p95: step, count: 1 }, traffic: { evictions } }],
  });
  const url = await endpoint((response) => {
    requests++;
    if (requests === 1) {
      response.writeHead(503);
      response.end(JSON.stringify(data(999, 999, 999)));
    } else if (requests === 2) response.end('{invalid');
    else response.end(JSON.stringify(requests === 3 ? data(4, 8, 1) : data(9, 2, 3)));
  });
  let complete!: () => void;
  const sampled = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let samples = 0;
  const poller = new MetricsPoller({
    url,
    intervalMs: 5,
    onSample: () => {
      if (++samples === 2) complete();
    },
  });
  pollers.push(poller);
  await sampled;
  await poller.stop();
  expect(poller.errors).toBe(2);
  expect(poller.observation).toEqual({ stepP95Ms: 9, loopP99Ms: 8, evictions: 3 });
  const snapshot = poller.observation!;
  Object.assign(snapshot, { stepP95Ms: 999 });
  expect(poller.observation?.stepP95Ms).toBe(9);
});

it('başarısız HTTP yanıtının tamamlanmayan gövdesi de bağlantıyı açık bırakmaz', async () => {
  let closed!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const url = await endpoint((response) => {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.write('{"rooms":');
    response.on('close', closed);
  });
  let failed!: () => void;
  const failure = new Promise<void>((resolve) => {
    failed = resolve;
  });
  const poller = new MetricsPoller({ url, intervalMs: 5, onError: failed });
  pollers.push(poller);
  await failure;
  await poller.stop();
  await disconnected;
  expect(poller.errors).toBe(1);
  expect(poller.observation).toBeNull();
});

it('timeout asılı isteği bırakır ve sonraki örnek ölçülebilir', async () => {
  let requests = 0;
  let complete!: () => void;
  const sampled = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const url = await endpoint((response) => {
    if (++requests === 1) return;
    response.end('{}');
  });
  const poller = new MetricsPoller({
    url,
    intervalMs: 5,
    timeoutMs: 30,
    onSample: complete,
    onError: () => {
      throw new Error('gözlemci');
    },
  });
  pollers.push(poller);
  await sampled;
  await poller.stop();
  expect(poller.errors).toBe(2);
  expect(requests).toBeGreaterThan(1);
  expect(poller.observation).toBeNull();
});

it('geçersiz veya taşan timer kaynak kurmadan reddedilir', () => {
  for (const intervalMs of [0, -1, NaN, Infinity, 2_147_483_648])
    expect(() => new MetricsPoller({ intervalMs })).toThrow(RangeError);
});
