import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { ROOM_NAME } from '@/net/protocol';
import type { FactoryWorldConfig } from '../../server/FactoryRoom';
import { startFactory, type RunningFactory } from '../../server/index';
import { FactorySession } from '../../src/net/session';
import { KIND, PLAYER, SIM_VERSION } from '../../src/config/factory';
import type { FactoryState } from '../../src/sim/state';
import { WIRE_VERSION } from '../../src/net/protocol';
import { SMALL } from './world';

export async function until(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Koşul zamanında gerçekleşmedi.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Tankın inşa menzilindeki boş, cevhersiz tile'lar (tanktan en yakın başta). Tankın üstündeki ve
 * hemen yanındaki kareler dışarıda kalır: katı bina tankın altına konamaz.
 */
export function tilesNearTank(
  s: FactoryState,
  slot: number,
  count: number,
  skip = 0,
): { x: number; y: number }[] {
  const px = s.players.x[slot];
  const py = s.players.y[slot];
  const reach = PLAYER.buildRange - 1.5;
  const found: { x: number; y: number; distance: number }[] = [];
  for (let y = Math.max(0, Math.floor(py - reach)); y <= Math.min(s.height - 1, py + reach); y++)
    for (let x = Math.max(0, Math.floor(px - reach)); x <= Math.min(s.width - 1, px + reach); x++) {
      const tile = y * s.width + x;
      const distance = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (distance < 2 || distance > reach) continue;
      if (s.kind[tile] === KIND.empty && s.ore[tile] === 0) found.push({ x, y, distance });
    }
  found.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return found.slice(skip, skip + count).map(({ x, y }) => ({ x, y }));
}

/** İstemcinin kendi kopyasında tankı bekler (JOIN akıştan gelir; kopya ilerletilir) ve yuvasını verir. */
export async function tankReady(session: FactorySession): Promise<number> {
  let slot = -1;
  await until(() => {
    session.advance(64);
    slot = session.lockstep.sim?.state.players.slotOf(session.key) ?? -1;
    return slot >= 0;
  });
  return slot;
}

export interface TestFactory {
  readonly factory: RunningFactory;
  readonly dataDir: string;
  readonly sessions: FactorySession[];
  connect(key: string, worldId?: string): Promise<FactorySession>;
  /** Oturum açmadan ham SDK istemcisi: kötü niyetli ya da bozuk istemci testleri için. */
  raw(key: string, worldId?: string): ReturnType<Client['join']>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

export async function startTestFactory(
  config: Partial<FactoryWorldConfig> = {},
  options: { dataDir?: string; keepData?: boolean } = {},
): Promise<TestFactory> {
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'vol-test2-room-')));
  const world: FactoryWorldConfig = { worldId: 'test', dataDir, ...SMALL, ...config };
  let factory = await startFactory([world], 0);
  const sessions: FactorySession[] = [];
  const test: TestFactory = {
    get factory() {
      return factory;
    },
    dataDir,
    sessions,
    async connect(key, worldId = world.worldId) {
      const session = await FactorySession.connect({ endpoint: factory.endpoint, worldId, key });
      sessions.push(session);
      return session;
    },
    raw(key, worldId = world.worldId) {
      return new Client(factory.endpoint).join(ROOM_NAME, {
        worldId,
        protocol: PROTOCOL_VERSION,
        wire: WIRE_VERSION,
        sim: SIM_VERSION,
        key,
      });
    },
    async restart() {
      await Promise.allSettled(sessions.splice(0).map((session) => session.leave()));
      await factory.stop();
      factory = await startFactory([world], 0);
    },
    async close() {
      await Promise.allSettled(sessions.splice(0).map((session) => session.leave()));
      await factory.stop().catch(() => undefined);
      if (!options.keepData) await rm(dataDir, { recursive: true, force: true });
    },
  };
  return test;
}
