import { createServer, type Server as HttpServer } from 'node:http';
import { defineServer, type RegisteredHandler, type Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { ListenSettings } from './env';
import { errorData, type Logger } from './log';
import { eventLoopDelay } from './metrics';

/** Bir mesajın üst sınırı; bu sınır tek mesajın sunucuyu şişirmesini önler. */
export const DEFAULT_MAX_PAYLOAD_BYTES = 1024;

export interface HostOptions {
  readonly maxPayload?: number;
  readonly logger?: Logger;
}

export interface Host<T extends Record<string, RegisteredHandler>> {
  readonly http: HttpServer;
  readonly server: Server<T>;
}

/**
 * Colyseus sunucusunu WebSocket taşımasıyla kurar; dinlemez. Colyseus'un kendi sinyal ve çökme
 * kancaları kapalıdır: süreç yaşam döngüsü `installShutdown`indır, aksi halde her sunucu örneği
 * `process`e dinleyici ekler ve iki kapanış yolu yarışır.
 */
export function createHost<T extends Record<string, RegisteredHandler>>(
  rooms: T,
  options: HostOptions = {},
): Host<T> {
  const http = createServer();
  const server = defineServer({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({
      server: http,
      maxPayload: options.maxPayload ?? DEFAULT_MAX_PAYLOAD_BYTES,
    }),
    rooms,
  });
  return { http, server: server as Server<T> };
}

/**
 * Colyseus `listen` yalnız dinlemeye başladıktan sonra `error` olayını dinler: port doluysa
 * (`EADDRINUSE`) söz hiç çözülmez ve süreç sessizce asılı kalır. Hata burada önceden yakalanır.
 */
function listenOn<T extends Record<string, RegisteredHandler>>(
  host: Host<T>,
  listen: ListenSettings,
): Promise<void> {
  let onError: (error: Error) => void = () => undefined;
  return new Promise<void>((resolve, reject) => {
    onError = reject;
    host.http.once('error', onError);
    host.server.listen(listen.port, listen.host).then(resolve, reject);
  }).finally(() => host.http.off('error', onError));
}

export interface StartedHost<T extends Record<string, RegisteredHandler>> extends Host<T> {
  readonly endpoint: string;
  readonly port: number;
  stop(): Promise<void>;
}

/**
 * Sunucuyu kurar ve dinletir. Olay döngüsü ölçeri açılır; `stop` odaları düzgünce kapatır
 * ve süreci sonlandırmaz.
 */
export async function startHost<T extends Record<string, RegisteredHandler>>(
  rooms: T,
  listen: ListenSettings,
  options: HostOptions = {},
): Promise<StartedHost<T>> {
  eventLoopDelay();
  const log = options.logger?.child('host');
  const host = createHost(rooms, options);
  let port: number;
  try {
    await listenOn(host, listen);
    const address = host.http.address();
    if (!address || typeof address === 'string') throw new Error('Sunucu adresi çözülemedi.');
    port = address.port;
  } catch (error) {
    log?.error('listen.failed', { ...errorData(error), port: listen.port, host: listen.host });
    await host.server.gracefullyShutdown(false).catch(() => undefined);
    throw error;
  }
  const endpoint = `http://${listen.host}:${port}`;
  log?.info('listening', { endpoint, rooms: Object.keys(rooms) });
  let stopped: Promise<void> | null = null;
  return {
    ...host,
    endpoint,
    port,
    stop() {
      stopped ??= host.server.gracefullyShutdown(false).then(() => log?.info('stopped'));
      return stopped;
    },
  };
}

/** `process`in yaşam döngüsü olaylarını dinleyen kısmı; testte sahte yayıcı verilir. */
export interface SignalTarget {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ShutdownOptions {
  readonly logger?: Logger;
  readonly exit?: (code: number) => void;
  readonly signals?: readonly string[];
  /** Yakalanmamış hata ve reddedilmiş söz de düzgün kapanışı tetikler; çıkış kodu 1'dir. */
  readonly crashEvents?: readonly string[];
  /** `stop` bu sürede bitmezse süreç yine de 1 koduyla çıkar. */
  readonly graceMs?: number;
  readonly target?: SignalTarget;
}

/**
 * SIGINT/SIGTERM'de `stop` çalışır, günlük kapanır ve süreç çıkar; yakalanmamış hata ya da reddedilmiş
 * söz aynı yolu 1 koduyla izler. Kapanış hata verir ya da `graceMs` aşılırsa çıkış kodu 1'dir; kapanış
 * sürerken ikinci olay beklemeyi bırakır. Dönüş değeri kaydı kaldırır.
 */
export function installShutdown(
  stop: () => Promise<void>,
  options: ShutdownOptions = {},
): () => void {
  const {
    logger,
    exit = (code: number) => process.exit(code),
    signals = ['SIGINT', 'SIGTERM'],
    crashEvents = ['uncaughtException', 'unhandledRejection'],
    graceMs = 10_000,
    target = process,
  } = options;
  let stopping = false;
  const finish = (code: number): void => {
    logger?.close();
    exit(code);
  };
  const begin = (event: string, data: Record<string, unknown>, failed: boolean): void => {
    if (stopping) return finish(1);
    stopping = true;
    if (failed) logger?.error(event, data);
    else logger?.info(event, data);
    const timer = setTimeout(() => {
      logger?.error('host.stop.timeout', { graceMs });
      finish(1);
    }, graceMs);
    timer.unref();
    let stopped: Promise<void>;
    try {
      stopped = stop();
    } catch (error) {
      stopped = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    stopped.then(
      () => {
        clearTimeout(timer);
        finish(failed ? 1 : 0);
      },
      (error: unknown) => {
        clearTimeout(timer);
        logger?.error('host.stop.failed', errorData(error));
        finish(1);
      },
    );
  };
  const handlers = new Map<string, (...args: unknown[]) => void>();
  for (const signal of signals) {
    handlers.set(signal, () => begin('host.signal', { signal }, false));
  }
  for (const event of crashEvents) {
    handlers.set(event, (reason) => begin('host.crash', { event, ...errorData(reason) }, true));
  }
  for (const [event, handler] of handlers) target.on(event, handler);
  return () => {
    for (const [event, handler] of handlers) target.off(event, handler);
  };
}
