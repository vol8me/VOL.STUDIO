import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, resolve } from 'node:path';
import fastify, { type FastifyInstance } from 'fastify';
import type { ViteDevServer } from 'vite';
import type { SessionResponse } from '../shared/contracts.js';
import { ArtifactCache } from './artifactCache.js';
import { AssetCatalog } from './catalog.js';
import { loadProjectConfig } from './config.js';
import { AssetStudioError, toApiError } from './errors.js';
import { resolveAllowedHosts } from './hostPolicy.js';
import {
  cookieValue,
  createAccessToken,
  EditorLeaseManager,
  isLoopbackHost,
  LAN_SESSION_COOKIE,
  LanSessionManager,
  tokensEqual,
} from './lease.js';
import { TrashStore } from './fileOperations.js';
import { registerApiRoutes } from './routes.js';
import { packageRootFromRuntime, resolveCacheRoot } from './runtimePaths.js';
import { watchCatalog, type CatalogWatcher } from './watcher.js';

/** Piksel editörünün açabileceği azami kenar; genel raster sınırı. */
const MAX_RASTER_EDGE = 8192;

export interface AssetStudioServerOptions {
  repoRoot: string;
  configPath?: string;
  host?: string;
  /** LAN modunda kabul edilecek ek Host adları (bind adresi zaten dahildir). */
  allowedHosts?: string[];
  accessToken?: string;
  cacheRoot?: string;
  frontend?: 'development' | 'production' | 'none';
  clientRoot?: string;
  watch?: boolean;
  logger?: boolean;
}

export interface AssetStudioServer {
  app: FastifyInstance;
  catalog: AssetCatalog;
  host: string;
  accessToken?: string;
}

function hostnameFromHeader(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  try {
    return new URL(`http://${header}`).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Host ve Origin başlıklarını allowlist'e karşı doğrular.
 *
 * Host denetimi DNS rebinding'e karşıdır: saldırganın alanı LAN adresine
 * çözülse bile tarayıcı `Host: evil.example` gönderir ve istek allowlist'te
 * olmadığı için burada düşer. Token kontrolü ikinci savunma hattıdır; bu katman
 * isteğin API'ye hiç ulaşmamasını sağlar.
 */
function assertRequestOrigin(
  request: {
    headers: { host?: string; origin?: string };
  },
  allowedHosts: ReadonlySet<string>,
): void {
  const host = request.headers.host;
  if (host === undefined) {
    throw new AssetStudioError('invalid_request', 400, { field: 'host' });
  }
  const hostname = hostnameFromHeader(host);
  if (hostname === undefined || !allowedHosts.has(hostname.toLowerCase())) {
    throw new AssetStudioError('invalid_request', 400, { field: 'host' });
  }
  if (request.headers.origin !== undefined) {
    let originHost: string;
    try {
      originHost = new URL(request.headers.origin).host;
    } catch {
      throw new AssetStudioError('invalid_request', 400, { field: 'origin' });
    }
    if (originHost.toLowerCase() !== host.toLowerCase()) {
      throw new AssetStudioError('invalid_request', 403, { field: 'origin' });
    }
  }
}

async function registerFrontend(
  app: FastifyInstance,
  mode: NonNullable<AssetStudioServerOptions['frontend']>,
  clientRoot: string,
): Promise<ViteDevServer | undefined> {
  if (mode === 'none') return undefined;

  if (mode === 'development') {
    const [{ default: middie }, { createServer }] = await Promise.all([
      import('@fastify/middie'),
      import('vite'),
    ]);
    await app.register(middie);
    await app.after();
    let vite: ViteDevServer | undefined;
    try {
      vite = await createServer({
        root: clientRoot,
        appType: 'spa',
        // HMR kendi WebSocket sunucusunu açmaz, Fastify'ın HTTP sunucusuna
        // biner. Ayrı port (varsayılan 24678) iki Asset Studio örneği aynı
        // anda çalıştığında çakışıyor ve ikincisinin HMR'ı sessizce ölüyordu;
        // ayrıca ayrı port istemci ile API'yi aynı origin'de tutma kuralını
        // deliyordu.
        server: { middlewareMode: true, hmr: { server: app.server } },
      });
      const middlewares = vite.middlewares;
      // Middie ara katmanları Fastify ROUTER'INDAN ÖNCE koşar ve Vite'ın SPA
      // fallback'i dosya olmayan her GET'i `index.html`e çevirir. Filtresiz
      // bağlandığında bütün `/api/**` uçları JSON yerine HTML döndürüyordu:
      // geliştirme modunda API tamamen erişilemezdi. API yolları Vite'a hiç
      // verilmez, doğrudan Fastify router'ına geçer.
      // Parametreler açıkça yazılır: middie'nin `Handler` tipi `@types/connect`
      // üzerinden gelir, o paket kurulu olmadığı için çıkarım `any`ye düşüyor.
      app.use(
        (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
          if (request.url?.startsWith('/api/')) {
            next();
            return;
          }
          middlewares(request, response, next);
        },
      );
      return vite;
    } catch (error) {
      await vite?.close();
      throw error;
    }
  }

  const { default: fastifyStatic } = await import('@fastify/static');
  await app.register(fastifyStatic, {
    root: resolve(clientRoot, 'dist'),
    prefix: '/',
  });
  return undefined;
}

/** Same-origin API, watcher ve istemci sunumunu tek yaşam döngüsünde kurar. */
export async function createAssetStudioServer(
  options: AssetStudioServerOptions,
): Promise<AssetStudioServer> {
  const host = options.host ?? '127.0.0.1';
  const loopback = isLoopbackHost(host);
  const frontendMode = options.frontend ?? 'development';
  if (!loopback && frontendMode === 'development') {
    throw new AssetStudioError('invalid_request', 400, { field: 'frontend', reason: 'lan_dev' });
  }
  const accessToken = loopback ? undefined : options.accessToken ?? createAccessToken();
  const allowedHosts = resolveAllowedHosts(host, options.allowedHosts ?? []);
  const loaded = await loadProjectConfig(options.repoRoot, options.configPath);
  const catalog = await AssetCatalog.create({
    repoRoot: loaded.repoRoot,
    project: loaded.project,
    maxAssetBytes: loaded.limits.maxAssetBytes,
    maxImagePixels: loaded.limits.maxImagePixels,
  });
  const app = fastify({
    // Varsayılan gövde sınırı KÜÇÜK tutulur: JSON uçları birkaç KiB'den
    // fazlasını hiç görmemeli. Büyük ikili yükler yalnız multipart kayıt
    // yolundan geçer ve kendi sınırını taşır.
    bodyLimit: 64 * 1024,
    logger: options.logger ?? false,
  });
  const { default: multipart } = await import('@fastify/multipart');
  await app.register(multipart, {
    limits: {
      fileSize: loaded.limits.maxAssetBytes,
      files: 64,
      fields: 8,
      fieldSize: 256 * 1024,
    },
  });
  const leases = new EditorLeaseManager();
  const lanSessions = new LanSessionManager();

  app.addHook('onRequest', (request, _reply, done) => {
    try {
      if (request.url.startsWith('/api/v1/')) {
        assertRequestOrigin(request, allowedHosts);
        if (
          accessToken !== undefined &&
          !(request.method === 'POST' && request.url.split('?')[0] === '/api/v1/session/auth')
        ) {
          const token = request.headers['x-vol-asset-token'];
          const headerAuthorized = tokensEqual(
            accessToken,
            Array.isArray(token) ? token[0] : token,
          );
          const sessionAuthorized = lanSessions.has(
            cookieValue(request.headers.cookie, LAN_SESSION_COOKIE),
          );
          if (!headerAuthorized && !sessionAuthorized) {
            throw new AssetStudioError('authentication_required', 401);
          }
        }
      }
      done();
    } catch (error) {
      done(error instanceof Error ? error : new Error('request_guard_failed'));
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (app.log.level !== 'silent') app.log.error(error);
    const response = toApiError(error);
    void reply.status(response.statusCode).send(response.body);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/v1/')) {
      return reply.status(404).send({ error: { code: 'asset_not_found' } });
    }
    if (frontendMode === 'production') return reply.sendFile('index.html');
    return reply.status(404).send({ error: { code: 'invalid_request' } });
  });

  app.post('/api/v1/session/auth', (request, reply): SessionResponse => {
    if (accessToken !== undefined) {
      const token = request.headers['x-vol-asset-token'];
      if (!tokensEqual(accessToken, Array.isArray(token) ? token[0] : token)) {
        throw new AssetStudioError('authentication_required', 401);
      }
    }
    const session = lanSessions.create();
    const maxAge = Math.floor(lanSessions.ttlMs / 1000);
    reply.header(
      'set-cookie',
      `${LAN_SESSION_COOKIE}=${session.sessionId}; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=${maxAge}`,
    );
    return { authenticated: true, expiresAt: new Date(session.expiresAt).toISOString() };
  });

  app.delete('/api/v1/session/auth', (request, reply) => {
    lanSessions.revoke(cookieValue(request.headers.cookie, LAN_SESSION_COOKIE));
    reply.header(
      'set-cookie',
      `${LAN_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=0`,
    );
    return reply.status(204).send();
  });

  const cacheRoot = options.cacheRoot ?? resolveCacheRoot(loaded.repoRoot);
  const trash = new TrashStore(resolve(cacheRoot, 'trash'));
  const thumbnailCache = new ArtifactCache({
    directory: cacheRoot,
    namespace: 'thumbnails',
    onError: (error) => app.log.error(error),
  });

  registerApiRoutes(app, {
    catalog,
    projectName: loaded.project.name ?? basename(loaded.repoRoot),
    repoRoot: loaded.repoRoot,
    network: loopback ? 'loopback' : 'lan',
    requiresToken: accessToken !== undefined,
    maxAssetBytes: loaded.limits.maxAssetBytes,
    maxImagePixels: loaded.limits.maxImagePixels,
    maxThumbnailSize: loaded.limits.maxThumbnailSize,
    maxEdge: MAX_RASTER_EDGE,
    trash,
    leases,
    thumbnailCache,
  });

  let watcher: CatalogWatcher | undefined;
  const packageRoot = options.clientRoot ?? packageRootFromRuntime();
  let vite: ViteDevServer | undefined;
  try {
    if (options.watch !== false) {
      watcher = await watchCatalog(catalog, {
        onError: (error) => app.log.error(error),
      });
    }
    vite = await registerFrontend(app, frontendMode, packageRoot);
  } catch (error) {
    await Promise.allSettled([vite?.close(), watcher?.close(), app.close()]);
    throw error;
  }

  app.addHook('onClose', async () => {
    await vite?.close();
    await watcher?.close();
  });

  return { app, catalog, host, ...(accessToken === undefined ? {} : { accessToken }) };
}
