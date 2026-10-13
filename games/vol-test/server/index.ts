import { createServer } from 'node:http';
import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { WorldRoom } from './WorldRoom';
import { isEntryModule } from './entry';

export function createWorldServer() {
  const http = createServer();
  const server = defineServer({
    greet: false,
    transport: new WebSocketTransport({ server: http, maxPayload: 1024 }),
    rooms: { voltest: defineRoom(WorldRoom) },
  });
  return { http, server };
}

/** Geliştirmede loopback; uzak testte listen adresi açıkça verilir. */
export async function startWorldServer(port = 2567, host = '127.0.0.1') {
  const { http, server } = createWorldServer();
  await server.listen(port, host);
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Sunucu adresi çözülemedi.');
  return { server, endpoint: `http://${host}:${address.port}` };
}

/** Ortam değişkenlerinden dinleme adresini okur; geçersiz port başlatmayı durdurur. */
export function listenSettings(env: Readonly<Record<string, string | undefined>>): {
  port: number;
  host: string;
} {
  const port = Number(env.VOL_NET_PORT ?? 2567);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('VOL_NET_PORT 0–65535 arasında olmalı.');
  }
  return { port, host: env.VOL_NET_HOST ?? '127.0.0.1' };
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const { port, host } = listenSettings(process.env);
  const started = await startWorldServer(port, host);
  console.info(`[VOL.TEST] Network hazır: ${started.endpoint}`);
}
