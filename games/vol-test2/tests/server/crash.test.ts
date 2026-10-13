// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { KIND } from '../../src/config/factory';
import { FactorySession } from '../../src/net/session';
import { RESULT } from '../../src/sim/commands';
import { until } from '../helpers/server';

const packageDir = fileURLToPath(new URL('../..', import.meta.url));

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

interface Child {
  readonly process: ChildProcess;
  readonly endpoint: string;
  readonly metricsUrl: string;
  readonly exited: Promise<void>;
}

/** Gerçek sunucu süreci: `node --import tsx` doğrudan sunucudur, araya sarmalayıcı girmez. */
async function boot(dataDir: string): Promise<Child> {
  const metricsPort = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: packageDir,
    env: {
      ...(process.env as Record<string, string>),
      TSX_TSCONFIG_PATH: 'tsconfig.json',
      VOL_NET_PORT: '0',
      VOL_TEST2_METRICS_PORT: String(metricsPort),
      VOL_TEST2_DATA: dataDir,
      VOL_TEST2_WORLDS: '1',
      VOL_TEST2_SIZE: '64',
      // Kısa aralık: öldürme anı sık sık anlık görüntü + günlük değişimine denk gelir.
      VOL_TEST2_SNAPSHOT_EVERY: '60',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  let output = '';
  const endpoint = await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = /Sunucu hazır: (http:\/\/[\d.]+:\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    void exited.then(() => reject(new Error(`Sunucu çıktı:\n${output}`)));
    setTimeout(() => reject(new Error(`Sunucu hazır olmadı:\n${output}`)), 60_000);
  });
  // Hazır satırı metrik kapısı da dinlerken yazılır; ilk istek reddedilirse süreç erken "hazır" demiştir.
  const metricsUrl = `http://127.0.0.1:${metricsPort}/metrics`;
  await (await fetch(metricsUrl)).arrayBuffer();
  return { process: child, endpoint, metricsUrl, exited };
}

function emptyTiles(session: FactorySession, count: number, skip: number) {
  const s = session.lockstep.sim!.state;
  const tiles: { x: number; y: number }[] = [];
  let seen = 0;
  for (let y = 4; y < s.height - 4 && tiles.length < count; y++)
    for (let x = 4; x < s.width - 4 && tiles.length < count; x++) {
      const tile = y * s.width + x;
      if (s.kind[tile] === KIND.empty && s.ore[tile] === 0 && seen++ >= skip) tiles.push({ x, y });
    }
  return tiles;
}

const children: Child[] = [];
let directory: string | undefined;

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.process.kill('SIGKILL');
    await child.exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('süreç öldürülünce (SIGKILL)', () => {
  it(
    'onaylanan her komut kalıcıdır ve günlük tekrarı sapma vermez',
    { timeout: 240_000 },
    async () => {
      directory = await mkdtemp(join(tmpdir(), 'vol-test2-crash-'));
      const confirmed = new Map<number, { x: number; y: number }>();
      let highestSeq = 0;

      for (let cycle = 0; cycle < 3; cycle++) {
        const child = await boot(directory);
        children.push(child);
        const session = await FactorySession.connect({
          endpoint: child.endpoint,
          worldId: 'world-1',
          key: 'player-crash',
        });
        await until(() => session.status === 'live', 20_000);

        // Önceki öldürmelerde onaylanan komutların hepsi ayaktadır.
        const width = session.lockstep.sim!.state.width;
        for (const { x, y } of confirmed.values())
          expect(session.lockstep.sim!.state.kind[y * width + x]).toBe(KIND.conveyor);
        expect(session.welcome!.lastSeq).toBeGreaterThanOrEqual(highestSeq);

        const metrics = (await (await fetch(child.metricsUrl)).json()) as {
          worlds: {
            persistence: {
              load: {
                source: string;
                hashMismatches: number;
                replayedCommands: number;
                tornTail: boolean;
              };
            };
          }[];
        };
        const load = metrics.worlds[0].persistence.load;
        if (cycle > 0) {
          expect(load.source).toBe('snapshot');
          expect(load.hashMismatches).toBe(0);
        }

        // Rastgele bir anda öldürülecek bir komut akışı; ack gelenler kayda geçer.
        const tiles = emptyTiles(session, 40, cycle * 40);
        const killAfterMs = 300 + ((cycle * 397) % 900);
        const started = Date.now();
        for (const tile of tiles) {
          if (Date.now() - started > killAfterMs) break;
          void session.place(tile.x, tile.y, KIND.conveyor, 0).then((ack) => {
            if (ack.result === RESULT.ok) {
              confirmed.set(ack.seq, tile);
              highestSeq = Math.max(highestSeq, ack.seq);
            }
          });
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        await new Promise((resolve) => setTimeout(resolve, killAfterMs / 2));
        child.process.kill('SIGKILL');
        await child.exited;
        children.splice(children.indexOf(child), 1);
      }

      expect(confirmed.size).toBeGreaterThan(10);

      // Son açılış: hiçbir şey kaybolmamış, tekrar temiz.
      const last = await boot(directory);
      children.push(last);
      const session = await FactorySession.connect({
        endpoint: last.endpoint,
        worldId: 'world-1',
        key: 'player-crash',
      });
      await until(() => session.status === 'live', 20_000);
      const width = session.lockstep.sim!.state.width;
      for (const { x, y } of confirmed.values())
        expect(session.lockstep.sim!.state.kind[y * width + x]).toBe(KIND.conveyor);
      expect(session.welcome!.lastSeq).toBeGreaterThanOrEqual(highestSeq);
    },
  );
});
