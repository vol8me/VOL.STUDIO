import { join } from 'node:path';
import { defineRoom, matchMaker } from '@colyseus/core';
import {
  guardSettings,
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  opsSettings,
  serveOps,
  startHost,
  stdoutSink,
  type GuardSettings,
  type ListenSettings,
  type StartedHost,
} from '@volstudio/network/server';
import { ROOM } from '../src/network/rooms';
import { FileClimateStore, type ClimateStore } from './ClimateStore';
import { WorldRoom, type WorldRoomOptions } from './WorldRoom';

/**
 * Oda kaydı: tek tür oda, kalıcı savaş dünyası. `defaults` her odaya geçen işletim seçenekleridir
 * (tohum, cephe başına araç sayısı); istemci bunları belirleyemez.
 */
export function createRooms(
  logger?: Logger,
  defaults: Omit<WorldRoomOptions, 'logger' | 'primary'> = {},
) {
  return {
    [ROOM.world]: defineRoom(WorldRoom, { ...defaults, logger }),
  };
}

export type Rooms = ReturnType<typeof createRooms>;

/**
 * Birincil dünyayı kurar: insan kalmasa da kapanmaz, bot savaşı sürer. Oyuncular `joinOrCreate`
 * ile bu odaya düşer; dolarsa Colyseus bir taşma dünyası kurar.
 */
export async function createPrimaryWorld(options: Omit<WorldRoomOptions, 'primary'> = {}) {
  return matchMaker.createRoom(ROOM.world, { ...options, primary: true });
}

export interface WorldServerOptions {
  /** Dünya iklimini kalıcı tutan depo; verilmezse iklim yalnız bellektedir. */
  readonly climateStore?: ClimateStore;
  /** Bağlantı kapısı (hız, soket ve köken sınırları); verilmezse kurulmaz. */
  readonly guard?: GuardSettings;
  /** İşletim kapısı (`/healthz`, `/metrics`, `/logs`); verilmezse açılmaz. */
  readonly ops?: ListenSettings;
}

/** Her dünya odasının adım süresi ve trafiği ile bağlantı kapısının sayaçları. */
export async function worldMetrics(guard: StartedHost<Rooms>['guard']) {
  const rooms = [];
  for (const listing of await matchMaker.query({ name: ROOM.world })) {
    const room = matchMaker.getLocalRoomById(listing.roomId) as WorldRoom | undefined;
    if (!room) continue;
    rooms.push({
      id: room.roomId,
      humans: room.playerCount,
      step: room.stepSummary(),
      traffic: room.trafficSummary(),
    });
  }
  return { rooms, guard: guard?.stats() ?? null };
}

/** Geliştirmede loopback; uzak testte listen adresi açıkça verilir. */
export async function startWorldServer(
  port = 2567,
  host = '127.0.0.1',
  logger?: Logger,
  options: WorldServerOptions = {},
) {
  const started = await startHost(
    createRooms(logger),
    { port, host },
    { logger, guard: options.guard },
  );
  await createPrimaryWorld({ seed: Date.now() >>> 0, climateStore: options.climateStore });
  const ops = options.ops
    ? await serveOps({ ...options.ops, logger, metrics: () => worldMetrics(started.guard) })
    : null;
  return {
    ...started,
    ops,
    async stop() {
      await ops?.close();
      await started.stop();
    },
  };
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const logger = Logger.create({ src: 'voltest', sinks: [stdoutSink()] });
  const { port, host } = listenSettings(process.env);
  const guard = guardSettings(process.env);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && guard.origins.length === 0)
    logger.warn('guard.origins.open', {
      host,
      hint: 'VOL_NET_ORIGINS ile köken izin listesi verin',
    });
  // İklim dosyası: yeşillik ve kar sunucu yeniden başlayınca da korunur (git dışı `.state/`).
  const climatePath =
    process.env.VOLTEST_CLIMATE_FILE ?? join(process.cwd(), '.state', 'climate.json');
  const started = await startWorldServer(port, host, logger, {
    guard,
    ops: opsSettings(process.env) ?? undefined,
    climateStore: new FileClimateStore(climatePath),
  });
  installShutdown(started.stop, { logger });
}
