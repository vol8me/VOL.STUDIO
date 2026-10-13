import { join, resolve } from 'node:path';
import { defineRoom, matchMaker } from '@colyseus/core';
import {
  envChoice,
  envInteger,
  envText,
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  serveOps,
  startHost,
  stdoutSink,
  type StartedHost,
} from '@volstudio/network/server';
import { NET } from '@/config/forge';
import { SYNC_MODE, type SyncMode } from '@/net/protocol';
import { buildComb } from '@/sim/scenario';
import { BOOT_TOKEN, ForgeRoom, ROOM_NAME, type ForgeWorldConfig } from './ForgeRoom';

const rooms = { [ROOM_NAME]: defineRoom(ForgeRoom).filterBy(['worldId']) };

export interface RunningForge extends StartedHost<typeof rooms> {
  readonly rooms: Map<string, ForgeRoom>;
}

/**
 * Sunucuyu başlatır ve dünyaları kurar. Dünyalar açılışta oluşturulur: oyuncu yokken de çalışırlar.
 * Bir dünya diskte başka bir süreçte kilitliyse başlatma durur ve hata verir.
 */
export async function startForge(
  worlds: readonly ForgeWorldConfig[],
  port = 2567,
  host = '127.0.0.1',
  logger?: Logger,
): Promise<RunningForge> {
  const started = await startHost(rooms, { port, host }, { logger });
  const worldRooms = new Map<string, ForgeRoom>();
  try {
    for (const world of worlds) {
      const listing = await matchMaker.createRoom(ROOM_NAME, { ...world, boot: BOOT_TOKEN });
      worldRooms.set(
        world.worldId,
        matchMaker.getLocalRoomById(listing.roomId) as unknown as ForgeRoom,
      );
    }
  } catch (error) {
    await started.stop().catch(() => undefined);
    throw error;
  }
  return { ...started, rooms: worldRooms };
}

/** Ölçüm dünyası: yeni kurulan dünyaya "tarak" fabrikası ve canlı birim hedefi eklenir. */
export interface SceneSettings {
  readonly belts: number;
  readonly turrets: number;
  readonly fill: number;
  readonly smelterEvery: number;
  readonly units: number;
}

export interface RuntimeSettings {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly worlds: number;
  /** Dünya kimliklerinin ön eki ve ilk sıra numarası; süreçler arası bölüşümde çakışmayı önler. */
  readonly worldPrefix: string;
  readonly firstWorld: number;
  readonly mode: SyncMode;
  readonly metricsPort: number | null;
  readonly tickHz: number;
  readonly size: number;
  /** Anlık görüntü aralığı (adım); ölçüm ve kapanış testleri kısaltır. */
  readonly snapshotEvery: number;
  readonly scene: SceneSettings | null;
}

/** Ortam değişkenlerinden ayarları okur; geçersiz değer başlatmayı durdurur. */
export function runtimeSettings(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeSettings {
  const mode = envChoice(env, 'VOL_TEST2_MODE', ['lockstep', 'aoi'], 'lockstep');
  const metricsPort = envInteger(env, 'VOL_TEST2_METRICS_PORT', 0, 0, 65535);
  const belts = envInteger(env, 'VOL_TEST2_BELTS', 0, 0, 60000);
  const units = envInteger(env, 'VOL_TEST2_UNITS', 0, 0, 2000);
  return {
    ...listenSettings(env),
    dataDir: resolve(envText(env, 'VOL_TEST2_DATA', join('records', 'forge-data'))),
    worlds: envInteger(env, 'VOL_TEST2_WORLDS', 1, 1, 64),
    worldPrefix: envText(env, 'VOL_TEST2_WORLD_PREFIX', 'world-', /^[a-z][a-z0-9_-]{0,15}$/),
    firstWorld: envInteger(env, 'VOL_TEST2_FIRST_WORLD', 1, 0, 10000),
    tickHz: envInteger(env, 'VOL_TEST2_TICK_HZ', 30, 1, 240),
    size: envInteger(env, 'VOL_TEST2_SIZE', 256, 32, 1024),
    snapshotEvery: envInteger(env, 'VOL_TEST2_SNAPSHOT_EVERY', NET.snapshotEvery, 30, 10_000_000),
    scene:
      belts > 0 || units > 0
        ? {
            belts,
            units,
            turrets: envInteger(env, 'VOL_TEST2_TURRETS', 24, 0, 400),
            fill: envInteger(env, 'VOL_TEST2_FILL', 2, 0, 4),
            smelterEvery: envInteger(env, 'VOL_TEST2_SMELTER_EVERY', 3, 0, 100),
          }
        : null,
    mode: mode === 'aoi' ? SYNC_MODE.aoi : SYNC_MODE.lockstep,
    metricsPort: metricsPort === 0 ? null : metricsPort,
  };
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const settings = runtimeSettings(process.env);
  const scene = settings.scene;
  const logger = Logger.create({ src: 'forge', sinks: [stdoutSink()] });
  const worlds: ForgeWorldConfig[] = Array.from({ length: settings.worlds }, (_, index) => ({
    worldId: `${settings.worldPrefix}${settings.firstWorld + index}`,
    dataDir: settings.dataDir,
    mode: settings.mode,
    width: settings.size,
    height: settings.size,
    seed: 0x5eed1234 + settings.firstWorld + index,
    tickHz: settings.tickHz,
    snapshotEvery: settings.snapshotEvery,
    sustainUnits: scene?.units,
    prepare: scene
      ? (sim) =>
          buildComb(sim, {
            maxBelts: scene.belts,
            turrets: scene.turrets,
            fill: scene.fill,
            smelterEvery: scene.smelterEvery,
          })
      : undefined,
  }));
  const running = await startForge(worlds, settings.port, settings.host, logger);
  // Hazır satırı yalnız işletim kapısı da dinlerken yazılır: süreci başlatan ölçüm betiği satırı görür görmez bağlanır.
  const ops =
    settings.metricsPort === null
      ? null
      : await serveOps({
          port: settings.metricsPort,
          logger,
          metrics: () => ({ worlds: [...running.rooms.values()].map((room) => room.metrics()) }),
        });
  logger.info('ready', { endpoint: running.endpoint, worlds: worlds.length, ops: ops?.endpoint });
  console.info(`[VOL.TEST2] Sunucu hazır: ${running.endpoint} (${worlds.length} dünya)`);
  installShutdown(
    async () => {
      await running.stop();
      await ops?.close();
    },
    { logger },
  );
}
