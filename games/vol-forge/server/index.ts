import { createServer, type Server as HttpServer } from 'node:http';
import { join, resolve } from 'node:path';
import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { SYNC_MODE, type SyncMode } from '@/net/protocol';
import { BOOT_TOKEN, ForgeRoom, ROOM_NAME, type ForgeWorldConfig } from './ForgeRoom';
import { drainEventLoopDelay } from './metrics';

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

export interface RuntimeSettings {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly worlds: number;
  readonly mode: SyncMode;
  readonly metricsPort: number | null;
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
  const mode = env.VOL_FORGE_MODE ?? 'lockstep';
  if (mode !== 'lockstep' && mode !== 'aoi')
    throw new RangeError('VOL_FORGE_MODE lockstep ya da aoi olmalı.');
  const metricsPort = integer('VOL_FORGE_METRICS_PORT', 0, 0, 65535);
  return {
    port: integer('VOL_NET_PORT', 2567, 0, 65535),
    host: env.VOL_NET_HOST ?? '127.0.0.1',
    dataDir: resolve(env.VOL_FORGE_DATA ?? join('records', 'forge-data')),
    worlds: integer('VOL_FORGE_WORLDS', 1, 1, 64),
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
      worlds: [...running.rooms.values()].map((room) => room.metrics()),
    };
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  http.listen(port, host);
  return http;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href
) {
  const settings = runtimeSettings(process.env);
  const worlds: ForgeWorldConfig[] = Array.from({ length: settings.worlds }, (_, index) => ({
    worldId: `world-${index + 1}`,
    dataDir: settings.dataDir,
    mode: settings.mode,
  }));
  const running = await startForge(worlds, settings.port, settings.host);
  if (settings.metricsPort !== null) serveMetrics(running, settings.metricsPort);
  console.info(`[VOL.FORGE] Sunucu hazır: ${running.endpoint} (${worlds.length} dünya)`);
  const shutdown = (): void => {
    void running.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
