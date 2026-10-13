import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { ROOM_NAME } from '@/net/protocol';
import type { FactoryWorldConfig } from '../../server/FactoryRoom';
import { startFactory, type RunningFactory } from '../../server/index';
import { FactorySession } from '../../src/net/session';
import { SIM_VERSION } from '../../src/config/factory';
import { WIRE_VERSION } from '../../src/net/protocol';
import { SMALL } from './world';

export async function until(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Koşul zamanında gerçekleşmedi.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
