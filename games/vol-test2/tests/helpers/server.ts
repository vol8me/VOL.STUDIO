import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { ROOM_NAME, type ForgeWorldConfig } from '../../server/ForgeRoom';
import { startForge, type RunningForge } from '../../server/index';
import { ForgeSession } from '../../src/net/session';
import { SIM_VERSION } from '../../src/config/forge';
import { WIRE_VERSION } from '../../src/net/protocol';
import { SMALL } from './world';

export async function until(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Koşul zamanında gerçekleşmedi.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export interface TestForge {
  readonly forge: RunningForge;
  readonly dataDir: string;
  readonly sessions: ForgeSession[];
  connect(key: string, worldId?: string): Promise<ForgeSession>;
  /** Oturum açmadan ham SDK istemcisi: kötü niyetli ya da bozuk istemci testleri için. */
  raw(key: string, worldId?: string): ReturnType<Client['join']>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

export async function startTestForge(
  config: Partial<ForgeWorldConfig> = {},
  options: { dataDir?: string; keepData?: boolean } = {},
): Promise<TestForge> {
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'vol-test2-room-')));
  const world: ForgeWorldConfig = { worldId: 'test', dataDir, ...SMALL, ...config };
  let forge = await startForge([world], 0);
  const sessions: ForgeSession[] = [];
  const test: TestForge = {
    get forge() {
      return forge;
    },
    dataDir,
    sessions,
    async connect(key, worldId = world.worldId) {
      const session = await ForgeSession.connect({ endpoint: forge.endpoint, worldId, key });
      sessions.push(session);
      return session;
    },
    raw(key, worldId = world.worldId) {
      return new Client(forge.endpoint).join(ROOM_NAME, {
        worldId,
        protocol: PROTOCOL_VERSION,
        wire: WIRE_VERSION,
        sim: SIM_VERSION,
        key,
      });
    },
    async restart() {
      await Promise.allSettled(sessions.splice(0).map((session) => session.leave()));
      await forge.stop();
      forge = await startForge([world], 0);
    },
    async close() {
      await Promise.allSettled(sessions.splice(0).map((session) => session.leave()));
      await forge.stop().catch(() => undefined);
      if (!options.keepData) await rm(dataDir, { recursive: true, force: true });
    },
  };
  return test;
}
