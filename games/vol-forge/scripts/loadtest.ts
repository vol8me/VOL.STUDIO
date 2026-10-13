/**
 * Tam sunucu yük testi: gerçek `server/index.ts` ayrı süreç(ler)de, botlar bu süreçte ve gerçek
 * WebSocket üzerinden. Birincil ölçüler SUNUCU tarafındadır (`/metrics`): ulaşılan adım hızı,
 * adım süresi (komut + simülasyon + kodlama + gönderim), adımlar arası gecikme, olay döngüsü
 * gecikmesi, çıkış baytı ve süreç CPU'su. Bot tarafı yalnız yük üretir ve ack gecikmesini ölçer.
 *
 *   pnpm --filter @volstudio/vol-forge loadtest -- --worlds 1 --mode lockstep --belts 8000 --units 400
 *
 * Bot sunucuyla aynı makinede koşar: bot CPU'su sunucu sayılarını bir miktar kötüleştirebilir
 * (ölçüm bu yönde temkinlidir). Telde WebSocket çerçeve başlığı sayılmaz, yük baytı sayılır.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { cpus, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { ByteWriter } from '../src/net/bytes';
import { NET, WORLD } from '../src/config/forge';
import {
  TO_CLIENT,
  TO_SERVER,
  WIRE_VERSION,
  readAck,
  writeView,
  type ChunkRect,
} from '../src/net/protocol';
import { ForgeSession } from '../src/net/session';
import { COMMAND, writeCommand } from '../src/sim/commands';
import { Ring } from '../server/metrics';

interface Args {
  worlds: number;
  processes: number;
  mode: 'lockstep' | 'aoi';
  bots: number;
  seconds: number;
  warmup: number;
  belts: number;
  units: number;
  turrets: number;
  fill: number;
  size: number;
  cmds: number;
  verify: number;
  spread: number;
  json: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = {
    worlds: 1,
    processes: 1,
    mode: 'lockstep',
    bots: 12,
    seconds: 30,
    warmup: 8,
    belts: 8000,
    units: 400,
    turrets: 24,
    fill: 2,
    size: 256,
    cmds: 2,
    verify: 0,
    spread: 1,
    json: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--json') args.json = true;
    else if (flag === '--mode') {
      const value = argv[++index];
      if (value !== 'lockstep' && value !== 'aoi') throw new Error('--mode lockstep|aoi');
      args.mode = value;
    } else if (flag.startsWith('--')) {
      const key = flag.slice(2) as keyof Args;
      if (!(key in args)) throw new Error(`Bilinmeyen bayrak: ${flag}`);
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Sayı bekleniyordu: ${flag}`);
      (args[key] as number) = value;
    }
  }
  return args;
}

const args = parse(process.argv.slice(2).filter((value) => value !== '--'));
const packageDir = fileURLToPath(new URL('..', import.meta.url));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

interface Instance {
  readonly child: ChildProcess;
  readonly endpoint: string;
  readonly metricsUrl: string;
  readonly worldIds: string[];
}

async function startServer(
  dataDir: string,
  first: number,
  count: number,
  port: number,
  metricsPort: number,
): Promise<Instance> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TSX_TSCONFIG_PATH: 'tsconfig.json',
    VOL_NET_PORT: String(port),
    VOL_FORGE_METRICS_PORT: String(metricsPort),
    VOL_FORGE_DATA: dataDir,
    VOL_FORGE_WORLDS: String(count),
    VOL_FORGE_FIRST_WORLD: String(first),
    VOL_FORGE_MODE: args.mode,
    VOL_FORGE_SIZE: String(args.size),
    VOL_FORGE_BELTS: String(args.belts),
    VOL_FORGE_UNITS: String(args.units),
    VOL_FORGE_TURRETS: String(args.turrets),
    VOL_FORGE_FILL: String(args.fill),
  };
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: packageDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('Sunucu hazır')) resolve();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('exit', (code) => reject(new Error(`Sunucu çıktı (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`Sunucu zamanında hazır olmadı:\n${output}`)), 120_000);
  });
  await ready;
  return {
    child,
    endpoint: `http://127.0.0.1:${port}`,
    metricsUrl: `http://127.0.0.1:${metricsPort}/metrics`,
    worldIds: Array.from({ length: count }, (_, index) => `world-${first + index}`),
  };
}

// ---- Botlar ---------------------------------------------------------------------------------

const ackRtt = new Ring(1 << 16);
const botStats = { packets: 0, packetBytes: 0, frames: 0, frameBytes: 0, acks: 0, snapshots: 0 };
let botErrors = 0;

function commandBytes(
  seq: number,
  x: number,
  y: number,
  remove: boolean,
  kind: number,
): Uint8Array {
  const out = new ByteWriter(16);
  out.u32(seq);
  writeCommand(
    out,
    remove ? { type: COMMAND.remove, x, y } : { type: COMMAND.place, x, y, kind, rot: seq & 3 },
  );
  return out.finish();
}

function randomRect(random: () => number, centered: boolean): ChunkRect {
  const chunksX = args.size / WORLD.chunk;
  const w = NET.maxAoiChunks.x;
  const h = NET.maxAoiChunks.y;
  const cx = Math.floor(chunksX / 2);
  const x0 = centered
    ? Math.max(0, cx - (w >> 1))
    : Math.floor(random() * Math.max(1, chunksX - w + 1));
  const y0 = centered
    ? Math.max(0, cx - (h >> 1))
    : Math.floor(random() * Math.max(1, chunksX - h + 1));
  return { x0, y0, x1: Math.min(chunksX - 1, x0 + w - 1), y1: Math.min(chunksX - 1, y0 + h - 1) };
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const timers: ReturnType<typeof setInterval>[] = [];
const rooms: Room[] = [];

async function thinBot(endpoint: string, worldId: string, index: number): Promise<void> {
  const room = await new Client(endpoint).join('forge', {
    worldId,
    protocol: PROTOCOL_VERSION,
    wire: WIRE_VERSION,
    key: `bot-${worldId}-${index}`,
  });
  rooms.push(room);
  const random = mulberry(index * 7919 + worldId.length);
  const sentAt = new Map<number, number>();
  let seq = 1;
  room.onMessage(TO_CLIENT.ticks, (payload: Uint8Array) => {
    botStats.packets++;
    botStats.packetBytes += payload.byteLength;
  });
  room.onMessage(TO_CLIENT.frame, (payload: Uint8Array) => {
    botStats.frames++;
    botStats.frameBytes += payload.byteLength;
  });
  room.onMessage(TO_CLIENT.snapshot, () => {
    botStats.snapshots++;
  });
  room.onMessage(TO_CLIENT.welcome, () => undefined);
  room.onMessage(TO_CLIENT.pong, () => undefined);
  room.onMessage(TO_CLIENT.ack, (payload: Uint8Array) => {
    const ack = readAck(payload);
    const sent = sentAt.get(ack.seq);
    if (sent === undefined) return;
    sentAt.delete(ack.seq);
    ackRtt.push(performance.now() - sent);
    botStats.acks++;
  });
  room.onError(() => {
    botErrors++;
  });
  const centered = args.spread === 0;
  const view = args.mode === 'aoi' ? randomRect(random, centered) : null;
  room.sendBytes(TO_SERVER.hello, view ? writeView(view) : new Uint8Array(0));

  const period = args.cmds > 0 ? 1000 / args.cmds : 0;
  if (period > 0) {
    // Başlangıç kayıklığı: botlar aynı anda komut yağdırmasın.
    setTimeout(() => {
      timers.push(
        setInterval(() => {
          const x = 16 + Math.floor(random() * (args.size - 32));
          const y = 16 + Math.floor(random() * (args.size - 32));
          const remove = random() < 0.4;
          const kind = 1 + Math.floor(random() * 5);
          const id = seq++;
          sentAt.set(id, performance.now());
          room.sendBytes(TO_SERVER.command, commandBytes(id, x, y, remove, kind));
        }, period),
      );
    }, random() * period);
  }
}

// ---- Ölçüm ---------------------------------------------------------------------------------

interface WorldMetric {
  worldId: string;
  tick: number;
  players: number;
  achievedHz: number;
  tickMs: { p50Ms: number; p99Ms: number; maxMs: number; meanMs: number };
  stepMs: { p50Ms: number; p99Ms: number; maxMs: number; meanMs: number };
  sendMs: { p50Ms: number; p99Ms: number; maxMs: number; meanMs: number };
  intervalMs: { p50Ms: number; p99Ms: number; maxMs: number; meanMs: number };
  commands: Record<string, number>;
  egress: {
    lockstepPackets: number;
    lockstepBytes: number;
    aoiFrames: number;
    aoi: Record<string, number>;
    backpressureSkips: number;
    snapshotsSent: number;
    snapshotBytesSent: number;
    snapshotRawBytes: number;
  };
  journal: { fsyncs: number; maxFsyncMs: number; lastFsyncMs: number; bytes: number } | null;
  persistence: { snapshots: number; lastSnapshot: { serializeMs: number; bytes: number } | null };
  fault: string | null;
}

interface ProcessMetric {
  loop: { meanMs: number; p99Ms: number; maxMs: number };
  memory: { rss: number; heapUsed: number };
  cpu: { user: number; system: number };
  uptimeSeconds: number;
  worlds: WorldMetric[];
}

async function sample(instance: Instance): Promise<ProcessMetric> {
  const response = await fetch(instance.metricsUrl);
  return (await response.json()) as ProcessMetric;
}

const dataDir = await mkdtemp(join(tmpdir(), 'vol-forge-load-'));
const instances: Instance[] = [];
let exitCode = 0;
try {
  const perProcess = Math.ceil(args.worlds / args.processes);
  for (let process_ = 0; process_ < args.processes; process_++) {
    const first = process_ * perProcess + 1;
    const count = Math.min(perProcess, args.worlds - process_ * perProcess);
    if (count <= 0) break;
    instances.push(await startServer(dataDir, first, count, await freePort(), await freePort()));
  }
  console.log(
    `${instances.length} sunucu süreci hazır; ${args.worlds} dünya x ${args.bots} bot (${args.mode})`,
  );

  const verifySessions: ForgeSession[] = [];
  for (const instance of instances) {
    for (const worldId of instance.worldIds) {
      // Doğrulama botları ilk dünyanın yuvalarından yer alır: dünya başına toplam `bots` kalır.
      const verifySlots =
        worldId === instances[0].worldIds[0] && args.mode === 'lockstep' ? args.verify : 0;
      await Promise.all(
        Array.from({ length: args.bots - verifySlots }, (_, index) =>
          thinBot(instance.endpoint, worldId, index),
        ),
      );
    }
  }
  if (args.verify > 0 && args.mode === 'lockstep') {
    const target = instances[0];
    for (let index = 0; index < args.verify; index++) {
      const session = await ForgeSession.connect({
        endpoint: target.endpoint,
        worldId: target.worldIds[0],
        key: `verify-${index}-aaaa`,
      });
      verifySessions.push(session);
      timers.push(setInterval(() => session.advance(8), 1000 / 30));
    }
  }

  await new Promise((resolve) => setTimeout(resolve, args.warmup * 1000));
  const startedAt = performance.now();
  const before = await Promise.all(instances.map(sample));
  const bytesBefore = { ...botStats };
  const loopSamples: number[] = [];
  const timeline = setInterval(() => {
    void Promise.all(instances.map(sample)).then((all) => {
      for (const one of all) loopSamples.push(one.loop.p99Ms);
    });
  }, 5000);
  await new Promise((resolve) => setTimeout(resolve, args.seconds * 1000));
  clearInterval(timeline);
  const after = await Promise.all(instances.map(sample));
  const elapsed = (performance.now() - startedAt) / 1000;

  const worlds = after.flatMap((one) => one.worlds);
  const beforeWorlds = new Map(before.flatMap((one) => one.worlds).map((w) => [w.worldId, w]));
  const sum = (pick: (world: WorldMetric) => number) =>
    worlds.reduce((total, world) => total + pick(world), 0);
  const delta = (pick: (world: WorldMetric) => number) =>
    worlds.reduce(
      (total, world) => total + pick(world) - pick(beforeWorlds.get(world.worldId)!),
      0,
    );
  const worst = (pick: (world: WorldMetric) => number) =>
    worlds.reduce((max, world) => Math.max(max, pick(world)), 0);

  const lockstepBytes = delta((w) => w.egress.lockstepBytes);
  const aoiBytes = delta((w) => Object.values(w.egress.aoi).reduce((a, b) => a + b, 0));
  const cpuSeconds = after.map((one, index) => {
    const used =
      one.cpu.user + one.cpu.system - (before[index].cpu.user + before[index].cpu.system);
    return used / 1e6 / elapsed;
  });
  const clientCount = args.worlds * args.bots;
  const summary = {
    env: {
      node: process.version,
      platform: process.platform,
      cpu: cpus()[0]?.model.trim(),
      cores: cpus().length,
      memoryGb: Math.round((totalmem() / 2 ** 30) * 10) / 10,
    },
    scenario: { ...args, clients: clientCount, measuredSeconds: elapsed },
    server: {
      achievedHzMin: Math.min(...worlds.map((w) => w.achievedHz)),
      achievedHzMean: sum((w) => w.achievedHz) / worlds.length,
      tickMsP50Worst: worst((w) => w.tickMs.p50Ms),
      tickMsP99Worst: worst((w) => w.tickMs.p99Ms),
      tickMsMax: worst((w) => w.tickMs.maxMs),
      stepMsP99Worst: worst((w) => w.stepMs.p99Ms),
      sendMsP99Worst: worst((w) => w.sendMs.p99Ms),
      intervalMsP99Worst: worst((w) => w.intervalMs.p99Ms),
      intervalMsMax: worst((w) => w.intervalMs.maxMs),
      eventLoopP99MsMax: Math.max(...loopSamples, ...after.map((one) => one.loop.p99Ms)),
      eventLoopMaxMs: Math.max(...after.map((one) => one.loop.maxMs)),
      cpuCoresPerProcess: cpuSeconds,
      rssMbPerProcess: after.map((one) => one.memory.rss / 2 ** 20),
      playersConnected: sum((w) => w.players),
      commandsAccepted: delta((w) => w.commands.accepted),
      commandsRejected: delta((w) => w.commands.rejected),
      commandsRateLimited: delta((w) => w.commands.rateLimited),
      faults: worlds.filter((w) => w.fault).length,
      journalFsyncsPerSecond: delta((w) => w.journal?.fsyncs ?? 0) / elapsed,
      journalMaxFsyncMs: worst((w) => w.journal?.maxFsyncMs ?? 0),
      backpressureSkips: delta((w) => w.egress.backpressureSkips),
      snapshotSerializeMsMax: worst((w) => w.persistence.lastSnapshot?.serializeMs ?? 0),
      snapshotBytes: worst((w) => w.persistence.lastSnapshot?.bytes ?? 0),
      snapshotsTaken: sum((w) => w.persistence.snapshots),
    },
    egress: {
      payloadBytesPerSecondTotal: (lockstepBytes + aoiBytes) / elapsed,
      payloadKBPerSecondPerClient: (lockstepBytes + aoiBytes) / elapsed / clientCount / 1024,
      payloadMbitPerSecondPerWorld: ((lockstepBytes + aoiBytes) * 8) / elapsed / args.worlds / 1e6,
      joinSnapshotRawBytes: worst(
        (w) => w.egress.snapshotRawBytes / Math.max(1, w.egress.snapshotsSent),
      ),
      joinSnapshotSentBytes: worst(
        (w) => w.egress.snapshotBytesSent / Math.max(1, w.egress.snapshotsSent),
      ),
    },
    clients: {
      receivedPacketsPerSecondPerBot:
        (botStats.packets - bytesBefore.packets) / elapsed / clientCount,
      receivedPacketKBPerSecondPerBot:
        (botStats.packetBytes - bytesBefore.packetBytes) / elapsed / clientCount / 1024,
      receivedFrameKBPerSecondPerBot:
        (botStats.frameBytes - bytesBefore.frameBytes) / elapsed / clientCount / 1024,
      acks: botStats.acks,
      ackRttMs: {
        p50: ackRtt.percentile(0.5),
        p99: ackRtt.percentile(0.99),
        max: ackRtt.max,
        samples: ackRtt.count,
      },
      errors: botErrors,
    },
    verify: verifySessions.map((session) => ({
      status: session.lockstep.status,
      hashChecks: session.lockstep.metrics.hashChecks,
      lagTicks: session.lockstep.lagTicks,
      stepsRun: session.lockstep.metrics.stepsRun,
      tick: session.lockstep.sim?.tick ?? -1,
    })),
  };

  const f = (value: number, digits = 2) => value.toFixed(digits);
  if (!args.json) {
    const s = summary.server;
    console.log(
      `\n[${args.mode}] ${args.worlds} dünya / ${instances.length} süreç / ${clientCount} bot ` +
        `| ${args.belts} bant ${args.units} birim | ${f(elapsed, 1)} sn ölçüm`,
    );
    console.log(
      `adım hızı  en kötü dünya ${f(s.achievedHzMin, 2)} Hz (ort ${f(s.achievedHzMean, 2)}) | ` +
        `adımlar arası p99 ${f(s.intervalMsP99Worst)} ms maks ${f(s.intervalMsMax)} ms`,
    );
    console.log(
      `adım süresi (komut+sim+kodlama+gönderim) p50 ${f(s.tickMsP50Worst, 3)} p99 ${f(s.tickMsP99Worst, 3)} ` +
        `maks ${f(s.tickMsMax)} ms | yalnız sim p99 ${f(s.stepMsP99Worst, 3)} | gönderim p99 ${f(s.sendMsP99Worst, 3)}`,
    );
    console.log(
      `olay döngüsü p99 (en kötü 5 sn penceresi) ${f(s.eventLoopP99MsMax)} ms maks ${f(s.eventLoopMaxMs)} ms | ` +
        `CPU çekirdek/süreç ${s.cpuCoresPerProcess.map((v) => f(v)).join(', ')} | ` +
        `RSS MB ${s.rssMbPerProcess.map((v) => f(v, 0)).join(', ')}`,
    );
    console.log(
      `çıkış yükü ${f(summary.egress.payloadKBPerSecondPerClient, 2)} KB/sn/istemci | ` +
        `${f(summary.egress.payloadMbitPerSecondPerWorld, 3)} Mbit/sn/dünya | ` +
        `katılım anlık görüntüsü ${f(summary.egress.joinSnapshotRawBytes / 1024, 0)} KB → ` +
        `${f(summary.egress.joinSnapshotSentBytes / 1024, 0)} KB`,
    );
    console.log(
      `komut: ${s.commandsAccepted} kabul, ${s.commandsRejected} red, ${s.commandsRateLimited} sınırlı | ` +
        `ack RTT p50 ${f(summary.clients.ackRttMs.p50)} p99 ${f(summary.clients.ackRttMs.p99)} ` +
        `maks ${f(summary.clients.ackRttMs.max)} ms (${summary.clients.ackRttMs.samples} örnek)`,
    );
    console.log(
      `günlük: ${f(s.journalFsyncsPerSecond, 1)} fsync/sn, en uzun ${f(s.journalMaxFsyncMs)} ms | ` +
        `anlık görüntü ${f(s.snapshotBytes / 1024, 0)} KB, serileştirme en çok ${f(s.snapshotSerializeMsMax)} ms ` +
        `(${s.snapshotsTaken} adet) | geri basınç atlaması ${s.backpressureSkips} | hata ${s.faults}/${summary.clients.errors}`,
    );
    for (const verify of summary.verify)
      console.log(
        `doğrulama botu: ${verify.status}, ${verify.hashChecks} karma denetimi, gecikme ${verify.lagTicks} adım`,
      );
  }
  console.log(JSON.stringify(summary));
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  for (const timer of timers) clearInterval(timer);
  await Promise.allSettled(rooms.map((room) => room.leave()));
  for (const instance of instances) instance.child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(exitCode);
