import { once } from 'node:events';
import { createServer, type Server as HttpServer } from 'node:http';
import { join, resolve } from 'node:path';
import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NET } from '@/config/forge';
import { SYNC_MODE, type SyncMode } from '@/net/protocol';
import { buildComb } from '@/sim/scenario';
import { BOOT_TOKEN, ForgeRoom, ROOM_NAME, type ForgeWorldConfig } from './ForgeRoom';
import { isEntryModule } from './entry';
import { drainEventLoopDelay, eventLoopDelay } from './metrics';

/** Bir komut en çok birkaç yüz bayt; bu sınır tek mesajın sunucuyu şişirmesini önler. */
const MAX_PAYLOAD_BYTES = 1024;

export function createForgeServer() {
  const http = createServer();
  const server = defineServer({
    greet: false,
    transport: new WebSocketTransport({ server: http, maxPayload: MAX_PAYLOAD_BYTES }),
    rooms: { [ROOM_NAME]: defineRoom(ForgeRoom).filterBy(['worldId']) },
  });
  return { http, server };
}

export interface RunningForge {
  readonly server: ReturnType<typeof createForgeServer>['server'];
  readonly http: HttpServer;
  readonly endpoint: string;
  readonly rooms: Map<string, ForgeRoom>;
  stop(): Promise<void>;
}

/**
 * Sunucuyu başlatır ve dünyaları kurar. Dünyalar açılışta oluşturulur: oyuncu yokken de çalışırlar.
 * Bir dünya diskte başka bir süreçte kilitliyse başlatma durur ve hata verir.
 */
export async function startForge(
  worlds: readonly ForgeWorldConfig[],
  port = 2567,
  host = '127.0.0.1',
): Promise<RunningForge> {
  eventLoopDelay();
  const { http, server } = createForgeServer();
  await server.listen(port, host);
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Sunucu adresi çözülemedi.');
  const rooms = new Map<string, ForgeRoom>();
  try {
    for (const world of worlds) {
      const listing = await matchMaker.createRoom(ROOM_NAME, { ...world, boot: BOOT_TOKEN });
      rooms.set(world.worldId, matchMaker.getLocalRoomById(listing.roomId) as unknown as ForgeRoom);
    }
  } catch (error) {
    await server.gracefullyShutdown(false).catch(() => undefined);
    throw error;
  }
  return {
    server,
    http,
    endpoint: `http://${host}:${address.port}`,
    rooms,
    async stop() {
      await server.gracefullyShutdown(false);
    },
  };
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
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new RangeError(`${name} ${min}–${max} arasında olmalı.`);
    return value;
  };
  const mode = env.VOL_TEST2_MODE ?? 'lockstep';
  if (mode !== 'lockstep' && mode !== 'aoi')
    throw new RangeError('VOL_TEST2_MODE lockstep ya da aoi olmalı.');
  const metricsPort = integer('VOL_TEST2_METRICS_PORT', 0, 0, 65535);
  const belts = integer('VOL_TEST2_BELTS', 0, 0, 60000);
  const units = integer('VOL_TEST2_UNITS', 0, 0, 2000);
  const worldPrefix = env.VOL_TEST2_WORLD_PREFIX ?? 'world-';
  if (!/^[a-z][a-z0-9_-]{0,15}$/.test(worldPrefix))
    throw new RangeError('VOL_TEST2_WORLD_PREFIX geçersiz.');
  return {
    port: integer('VOL_NET_PORT', 2567, 0, 65535),
    host: env.VOL_NET_HOST ?? '127.0.0.1',
    dataDir: resolve(env.VOL_TEST2_DATA ?? join('records', 'forge-data')),
    worlds: integer('VOL_TEST2_WORLDS', 1, 1, 64),
    worldPrefix,
    firstWorld: integer('VOL_TEST2_FIRST_WORLD', 1, 0, 10000),
    tickHz: integer('VOL_TEST2_TICK_HZ', 30, 1, 240),
    size: integer('VOL_TEST2_SIZE', 256, 32, 1024),
    snapshotEvery: integer('VOL_TEST2_SNAPSHOT_EVERY', NET.snapshotEvery, 30, 10_000_000),
    scene:
      belts > 0 || units > 0
        ? {
            belts,
            units,
            turrets: integer('VOL_TEST2_TURRETS', 24, 0, 400),
            fill: integer('VOL_TEST2_FILL', 2, 0, 4),
            smelterEvery: integer('VOL_TEST2_SMELTER_EVERY', 3, 0, 100),
          }
        : null,
    mode: mode === 'aoi' ? SYNC_MODE.aoi : SYNC_MODE.lockstep,
    metricsPort: metricsPort === 0 ? null : metricsPort,
  };
}

/** Yalnız yerel izleme: dünya başına özet ve süreç genelinde olay döngüsü gecikmesi. */
export function serveMetrics(running: RunningForge, port: number, host = '127.0.0.1'): HttpServer {
  const http = createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200).end('ok');
      return;
    }
    if (request.url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    const body = {
      loop: drainEventLoopDelay(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptimeSeconds: process.uptime(),
      worlds: [...running.rooms.values()].map((room) => room.metrics()),
    };
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  http.listen(port, host);
  return http;
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const settings = runtimeSettings(process.env);
  const scene = settings.scene;
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
  const running = await startForge(worlds, settings.port, settings.host);
  // Hazır satırı yalnız metrik kapısı da dinlerken yazılır: süreci başlatan ölçüm betiği satırı görür görmez bağlanır.
  if (settings.metricsPort !== null)
    await once(serveMetrics(running, settings.metricsPort), 'listening');
  console.info(`[VOL.TEST2] Sunucu hazır: ${running.endpoint} (${worlds.length} dünya)`);
  const shutdown = (): void => {
    void running.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
