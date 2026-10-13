import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { errorData, type Logger, type LogLevel } from './log';
import { processSnapshot } from './metrics';

/** Rota işleyicisinin bilinçli olarak döndürdüğü durum kodlu hata. */
export class OpsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface OpsContext {
  readonly method: string;
  readonly url: URL;
  /** `POST`/`PUT` gövdesi; JSON ayrıştırılmış, boşsa `undefined`. */
  readonly body: unknown;
}

export type OpsRoute = (context: OpsContext) => unknown;

export interface OpsOptions {
  readonly port: number;
  readonly host?: string;
  /** `/metrics` yanıtına süreç özetinin yanına eklenen oyun ölçümleri. */
  readonly metrics?: () => unknown;
  readonly logger?: Logger;
  /** Ek rotalar: anahtar `"GET /yol"` ya da `"POST /yol"`. */
  readonly routes?: Readonly<Record<string, OpsRoute>>;
  readonly maxBodyBytes?: number;
}

export interface OpsServer {
  readonly http: HttpServer;
  readonly port: number;
  readonly endpoint: string;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function hostnameOf(header: string | undefined): string {
  if (!header) return '';
  if (header.startsWith('[')) return header.slice(0, header.indexOf(']') + 1);
  return header.split(':')[0];
}

async function readBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new OpsError(413, 'Gövde çok büyük.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new OpsError(400, 'Gövde geçerli JSON değil.');
  }
}

function integerParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new OpsError(400, `${name} ${min}–${max} arasında tam sayı olmalı.`);
  return value;
}

/**
 * Yerel işletim kapısı: sağlık, ölçüm ve günlük okuması ile oyunun ek rotaları. Oyun trafiğinden ayrı
 * bir portta, varsayılan olarak yalnız loopback'te dinler; `Host` başlığı loopback değilse reddedilir
 * (DNS yeniden bağlama). CORS yoktur: tarayıcı sayfaları bu kapıyı çağıramaz, ajan Node'dan okur.
 */
export async function serveOps(options: OpsOptions): Promise<OpsServer> {
  const host = options.host ?? '127.0.0.1';
  const wildcard = host === '0.0.0.0' || host === '::';
  const limit = options.maxBodyBytes ?? 64 * 1024;
  const routes = options.routes ?? {};
  const log = options.logger?.child('ops');
  const guard = (header: string | undefined): boolean =>
    wildcard || LOOPBACK.has(hostnameOf(header)) || hostnameOf(header) === host;

  const http = createServer((request, response) => {
    const send = (status: number, body: unknown, type = 'application/json'): void => {
      const text = type === 'application/json' ? JSON.stringify(body) : String(body);
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(text);
    };
    void (async () => {
      try {
        if (!guard(request.headers.host)) throw new OpsError(403, 'Host başlığı reddedildi.');
        const method = request.method ?? 'GET';
        const url = new URL(request.url ?? '/', 'http://ops.local');
        const key = `${method} ${url.pathname}`;
        if (key === 'GET /healthz') return send(200, 'ok', 'text/plain');
        if (key === 'GET /metrics') {
          return send(200, { ...processSnapshot(), ...((await options.metrics?.()) as object) });
        }
        if (key === 'GET /logs') {
          if (!options.logger) throw new OpsError(404, 'Günlük kapalı.');
          const level = url.searchParams.get('level') ?? 'debug';
          if (!LEVELS.includes(level as LogLevel))
            throw new OpsError(400, `level şunlardan biri olmalı: ${LEVELS.join(', ')}.`);
          return send(
            200,
            options.logger.since(
              integerParam(url, 'since', 0, 0, Number.MAX_SAFE_INTEGER),
              integerParam(url, 'limit', 200, 1, 2000),
              level as LogLevel,
            ),
          );
        }
        const route = routes[key];
        if (!route) {
          const known = Object.keys(routes).some((entry) => entry.endsWith(` ${url.pathname}`));
          throw new OpsError(known ? 405 : 404, known ? 'Yöntem desteklenmiyor.' : 'Bulunamadı.');
        }
        const body = method === 'GET' ? undefined : await readBody(request, limit);
        send(200, (await route({ method, url, body })) ?? { ok: true });
      } catch (error) {
        if (error instanceof OpsError) return send(error.status, { error: error.message });
        log?.error('route.failed', errorData(error));
        send(500, { error: 'İç hata.' });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, host, () => {
      http.off('error', reject);
      resolve();
    });
  });
  const port = (http.address() as AddressInfo).port;
  log?.info('listening', { host, port });
  return {
    http,
    port,
    endpoint: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}
