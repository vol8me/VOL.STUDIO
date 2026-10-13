/**
 * Kurtarma süresi: yoğun bir dünya bir süre komut alır, süreç `SIGKILL` ile öldürülür, aynı veri dizininden
 * yeniden başlatılır ve sunucunun kendi yükleme raporu okunur (kaynak, tekrar edilen komut ve adım, süre,
 * karma sapması). Açılış süresi sürecin başlatılmasından "hazır" satırına kadardır; Node ve tsx başlangıcını da içerir.
 *
 *   pnpm --filter @volstudio/vol-test2 exec tsx --tsconfig tsconfig.json scripts/restore-bench.ts
 *
 * Süreç ölür, disk ölmez: işletim sistemi çökmesi ya da güç kaybı bu betikle ölçülmez.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIND, WORLD } from '../src/config/factory';
import { FactorySession } from '../src/net/session';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}
const belts = option('belts', 8000);
const units = option('units', 400);
const seconds = option('seconds', 70);

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

interface Boot {
  readonly child: ChildProcess;
  readonly endpoint: string;
  readonly metricsUrl: string;
  readonly readyMs: number;
}

async function boot(dataDir: string): Promise<Boot> {
  const metricsPort = await freePort();
  const startedAt = performance.now();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: packageDir,
    env: {
      ...(process.env as Record<string, string>),
      TSX_TSCONFIG_PATH: 'tsconfig.json',
      VOL_NET_PORT: '0',
      VOL_TEST2_METRICS_PORT: String(metricsPort),
      VOL_TEST2_DATA: dataDir,
      VOL_TEST2_WORLDS: '1',
      VOL_TEST2_BELTS: String(belts),
      VOL_TEST2_UNITS: String(units),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const endpoint = await new Promise<string>((resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = /Sunucu hazır: (http:\/\/[\d.]+:\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    child.once('exit', (code) => reject(new Error(`Sunucu çıktı (${code}): ${output}`)));
  });
  return {
    child,
    endpoint,
    metricsUrl: `http://127.0.0.1:${metricsPort}/metrics`,
    readyMs: performance.now() - startedAt,
  };
}

interface LoadMetrics {
  worlds: {
    tick: number;
    persistence: {
      load: {
        source: string;
        snapshotTick: number;
        replayedCommands: number;
        replayedTicks: number;
        tornTail: boolean;
        hashMismatches: number;
        ms: number;
      } | null;
    };
  }[];
}

const dataDir = await mkdtemp(join(tmpdir(), 'vol-test2-restore-'));
let exitCode = 0;
let current: Boot | null = null;
try {
  current = await boot(dataDir);
  const first = current;
  const session = await FactorySession.connect({
    endpoint: first.endpoint,
    worldId: 'world-1',
    key: 'player-restore',
  });
  let accepted = 0;
  const deadline = performance.now() + seconds * 1000;
  let attempt = 0;
  while (performance.now() < deadline) {
    const x = (attempt * 37) % WORLD.width;
    const y = (attempt * 91 + 13) % WORLD.height;
    attempt++;
    const ack = await session.place(
      x,
      y,
      attempt % 2 === 0 ? KIND.wall : KIND.conveyor,
      attempt % 4,
    );
    if (ack.result === 0) accepted++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const before = (await (await fetch(first.metricsUrl)).json()) as LoadMetrics;
  await session.leave().catch(() => undefined);
  first.child.kill('SIGKILL');
  await new Promise((resolve) => first.child.once('exit', resolve));

  const second = await boot(dataDir);
  current = second;
  const after = (await (await fetch(second.metricsUrl)).json()) as LoadMetrics;
  console.log(
    JSON.stringify(
      {
        belts,
        units,
        runSeconds: seconds,
        commandsAttempted: attempt,
        commandsAccepted: accepted,
        tickAtKill: before.worlds[0].tick,
        firstBootReadyMs: first.readyMs,
        restartReadyMs: second.readyMs,
        load: after.worlds[0].persistence.load,
        tickAfterRestart: after.worlds[0].tick,
      },
      null,
      2,
    ),
  );
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  current?.child.kill('SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(exitCode);
