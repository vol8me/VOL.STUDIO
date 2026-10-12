import { performance } from 'node:perf_hooks';
import { Client } from '@colyseus/sdk';
import { startWorldServer } from '../server/index.ts';

// Dünya motoru yalnız tank/hasar simülasyonu içerir; fabrika maliyeti burada ölçülmez.
function option(name, defaultValue, min, max) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = raw ? Number(raw.split('=')[1]) : defaultValue;
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`--${name}=${min}..${max} arasında tam sayı olmalı`);
  return value;
}

const clientsPerWorld = option('clients', 12, 1, 12);
const worlds = option('worlds', 1, 1, 20);
const seconds = option('seconds', 10, 1, 300);
const joined = [];
const patchGaps = [];
let patches = 0;
let inputSeq = 0;
const controller = new AbortController();
const running = await startWorldServer(0);

function percentile(values, q) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return Number(
    values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))].toFixed(3),
  );
}

try {
  const client = new Client(running.endpoint);
  for (let world = 0; world < worlds; world++) {
    const first = await client.create('voltest', { protocol: 1 });
    joined.push(first);
    for (let index = 1; index < clientsPerWorld; index++)
      joined.push(await client.joinById(first.roomId, { protocol: 1 }));
  }

  const lastUpdate = new Map();
  for (const room of joined) {
    room.onStateChange(() => {
      const time = performance.now();
      const previous = lastUpdate.get(room);
      if (previous != null) patchGaps.push(time - previous);
      lastUpdate.set(room, time);
      patches++;
    });
  }

  // Her istemci gerçek WS üstünden oyun niyetini sunucuya 60Hz civarında yollar.
  const timer = setInterval(() => {
    for (const room of joined) {
      room.send('input', {
        seq: inputSeq,
        moveX: Math.sin(inputSeq / 120),
        moveY: 0,
        aimX: 1,
        aimY: 0,
        fire: inputSeq % 10 === 0,
        boost: false,
        brake: false,
      });
    }
    inputSeq++;
  }, 1000 / 60);
  const startingCpu = process.cpuUsage();
  const start = performance.now();
  const rssStart = process.memoryUsage().rss;
  try {
    await new Promise((resolve) =>
      setTimeout(resolve, seconds * 1000, undefined, { signal: controller.signal }),
    );
  } finally {
    clearInterval(timer);
  }
  const durationMs = performance.now() - start;
  const cpu = process.cpuUsage(startingCpu);
  const clientTicks = joined.map((room) => Number(room.state?.tick ?? 0));
  const rssEnd = process.memoryUsage().rss;
  console.log(
    JSON.stringify(
      {
        kind: 'voltest-network-probe',
        proof: 'tek Node sürecinde gerçek localhost WS + tank simülasyonu; otomasyon fabrikası yok',
        worlds,
        clientsPerWorld,
        connections: joined.length,
        durationSeconds: Number((durationMs / 1000).toFixed(2)),
        serverTicksMin: Math.min(...clientTicks),
        serverTicksMax: Math.max(...clientTicks),
        totalInputPackets: inputSeq * joined.length,
        clientStateCallbacks: patches,
        patchGapMsP50: percentile(patchGaps, 0.5),
        patchGapMsP95: percentile(patchGaps, 0.95),
        cpuCorePercent: Number(((cpu.user + cpu.system) / (durationMs * 10)).toFixed(1)),
        rssStartMiB: Number((rssStart / 1048576).toFixed(1)),
        rssEndMiB: Number((rssEnd / 1048576).toFixed(1)),
      },
      null,
      2,
    ),
  );
} finally {
  controller.abort();
  await Promise.allSettled(joined.map((room) => room.leave()));
  await running.server.gracefullyShutdown(false);
}
