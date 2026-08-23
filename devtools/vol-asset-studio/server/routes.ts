import { basename } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import sharp from 'sharp';
import type {
  AssetEvent,
  AssetSummary,
  LeaseResponse,
  ProjectResponse,
  SaveTransactionRequest,
  SaveTransactionResponse,
} from '../shared/contracts.js';
import type { ArtifactCache } from './artifactCache.js';
import { openVerifiedAsset } from './assetFile.js';
import { probeAudioHandle } from './audio.js';
import type { AssetCatalog } from './catalog.js';
import { AssetStudioError } from './errors.js';
import type { EditorLeaseManager } from './lease.js';
import { contentTypeForPath } from './mime.js';
import { parseByteRange } from './range.js';
import { decodeRaster } from './raster.js';
import { runSaveTransaction, type SaveTarget } from './saveTransaction.js';

interface AssetParams {
  id: string;
}

interface ThumbnailQuery {
  size?: string;
}

interface LeaseBody {
  clientId?: unknown;
  leaseId?: unknown;
}

export interface ApiRouteOptions {
  catalog: AssetCatalog;
  projectName: string;
  repoRoot: string;
  network: 'loopback' | 'lan';
  requiresToken: boolean;
  maxImagePixels: number;
  maxAssetBytes: number;
  maxThumbnailSize: number;
  leases: EditorLeaseManager;
  thumbnailCache: ArtifactCache;
  maxEdge: number;
}

function quotedEtag(revision: string): string {
  return `"${revision}"`;
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseThumbnailSize(raw: string | undefined, maximum: number): number {
  if (raw === undefined) return Math.min(192, maximum);
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size < 16 || size > maximum) {
    throw new AssetStudioError('invalid_request', 400, { field: 'size' });
  }
  return size;
}

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PART_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const REVISION_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Kayıt planını doğrular ve parçalarla eşleştirir.
 *
 * Doğrulama gövdeyi diske YAZMADAN ÖNCE biter: geçersiz bir plan yüzünden
 * yarım yazılmış geçici dosya bırakmak, geri sarılacak bir durum üretirdi.
 */
function buildSaveTargets(
  plan: SaveTransactionRequest | undefined,
  payloads: ReadonlyMap<string, Buffer>,
): SaveTarget[] {
  if (plan === undefined || !Array.isArray(plan.targets) || plan.targets.length === 0) {
    throw new AssetStudioError('invalid_request', 400, { field: 'transaction.targets' });
  }
  return plan.targets.map((target, index) => {
    const field = `transaction.targets.${index}`;
    if (typeof target.assetId !== 'string' || !ASSET_ID_PATTERN.test(target.assetId)) {
      throw new AssetStudioError('invalid_request', 400, { field: `${field}.assetId` });
    }
    if (
      typeof target.expectedRevision !== 'string' ||
      !REVISION_PATTERN.test(target.expectedRevision)
    ) {
      throw new AssetStudioError('invalid_request', 400, { field: `${field}.expectedRevision` });
    }
    if (typeof target.payloadPart !== 'string' || !PART_NAME_PATTERN.test(target.payloadPart)) {
      throw new AssetStudioError('invalid_request', 400, { field: `${field}.payloadPart` });
    }
    const payload = payloads.get(target.payloadPart);
    if (payload === undefined) {
      throw new AssetStudioError('invalid_request', 400, {
        field: `${field}.payloadPart`,
        reason: 'missing_part',
      });
    }
    return { assetId: target.assetId, expectedRevision: target.expectedRevision, payload };
  });
}

function clientIdFrom(body: LeaseBody): string {
  if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(body.clientId)) {
    throw new AssetStudioError('invalid_request', 400, { field: 'clientId' });
  }
  return body.clientId;
}

function leaseIdFrom(body: LeaseBody): string {
  if (typeof body.leaseId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(body.leaseId)) {
    throw new AssetStudioError('invalid_request', 400, { field: 'leaseId' });
  }
  return body.leaseId;
}

export function formatSseEvent(event: AssetEvent): string {
  // `event:` bilerek yoktur: istemci standart EventSource `message` olayını
  // dinler; olay türü yapılandırılmış JSON gövdesinde taşınır.
  return `id: ${event.revision}\ndata: ${JSON.stringify(event)}\n\n`;
}

function writeSse(reply: FastifyReply, event: AssetEvent): void {
  reply.raw.write(formatSseEvent(event));
}

/** Bütün v1 endpointlerini aynı katalog ve hata sözleşmesine bağlar. */
export function registerApiRoutes(app: FastifyInstance, options: ApiRouteOptions): void {
  const closeSseConnections = new Set<() => void>();

  app.addHook('preClose', (done) => {
    for (const close of [...closeSseConnections]) close();
    done();
  });

  app.get('/api/v1/health', () => ({ ok: true }));

  app.get(
    '/api/v1/project',
    (): ProjectResponse => ({
      schemaVersion: 1,
      name: options.projectName || basename(options.repoRoot),
      roots: options.catalog.roots.map((root) => ({
        id: root.id,
        path: root.configuredPath,
        role: root.role,
        kinds: root.kinds,
        available: root.available,
      })),
      access: { network: options.network, requiresToken: options.requiresToken },
    }),
  );

  app.get('/api/v1/catalog', () => options.catalog.snapshot());

  app.get<{ Params: AssetParams }>(
    '/api/v1/assets/:id',
    (request): AssetSummary => options.catalog.get(request.params.id).summary,
  );

  app.get<{ Params: AssetParams }>('/api/v1/assets/:id/content', async (request, reply) => {
    const record = options.catalog.get(request.params.id);
    const verified = await openVerifiedAsset(record);
    const etag = quotedEtag(record.summary.revision);
    reply.header('accept-ranges', 'bytes');
    reply.header('etag', etag);
    reply.header('content-type', contentTypeForPath(record.absolutePath));
    reply.header('x-content-type-options', 'nosniff');

    if (headerString(request.headers['if-none-match']) === etag) {
      await verified.handle.close();
      return reply.status(304).send();
    }

    const rangeHeader = headerString(request.headers.range);
    const range = parseByteRange(rangeHeader, verified.size);
    if (rangeHeader !== undefined && range === null) {
      await verified.handle.close();
      reply.header('content-range', `bytes */${verified.size}`);
      throw new AssetStudioError('range_not_satisfiable', 416, { size: verified.size });
    }

    if (range !== null) {
      reply.status(206);
      reply.header('content-range', `bytes ${range.start}-${range.end}/${verified.size}`);
      reply.header('content-length', range.length);
      return reply.send(
        verified.handle.createReadStream({ start: range.start, end: range.end, autoClose: true }),
      );
    }

    reply.header('content-length', verified.size);
    return reply.send(verified.handle.createReadStream({ autoClose: true }));
  });

  app.get<{ Params: AssetParams; Querystring: ThumbnailQuery }>(
    '/api/v1/assets/:id/thumbnail',
    async (request, reply) => {
      const record = options.catalog.get(request.params.id);
      if (record.summary.kind !== 'image') {
        throw new AssetStudioError('unsupported_format', 415, { kind: record.summary.kind });
      }
      if (record.summary.problemCodes.includes('asset_too_large')) {
        throw new AssetStudioError('asset_too_large', 413, { maximum: options.maxAssetBytes });
      }
      const size = parseThumbnailSize(request.query.size, options.maxThumbnailSize);
      const verified = await openVerifiedAsset(record);
      const etag = quotedEtag(`${record.summary.revision}-thumb-${size}`);
      reply.header('cache-control', 'private, max-age=31536000, immutable');
      reply.header('content-type', 'image/png');
      reply.header('etag', etag);
      if (headerString(request.headers['if-none-match']) === etag) {
        await verified.handle.close();
        return reply.status(304).send();
      }
      // Anahtar içerik hash'i + boyut: dosya değişince anahtar da değişir,
      // ayrı bir invalidation adımı gerekmez.
      const cacheKey = `${record.summary.revision}-${size}`;
      let thumbnail: Buffer;
      try {
        thumbnail = await options.thumbnailCache.resolve(cacheKey, async () => {
          const source = await verified.handle.readFile();
          try {
            return await sharp(source, { limitInputPixels: options.maxImagePixels })
              .rotate()
              .resize(size, size, { fit: 'contain', withoutEnlargement: true })
              .png()
              .toBuffer();
          } catch (error) {
            throw new AssetStudioError('decode_failed', 422, { kind: 'image' }, { cause: error });
          }
        });
      } finally {
        await verified.handle.close();
      }

      return reply.send(thumbnail);
    },
  );

  /**
   * Düzenlenebilir piksel verisi: JSON değil ham RGBA döner.
   *
   * 2048² bir görüntü JSON'da ~50 MB metin olurdu; ikili gövde hem küçük hem
   * istemcide kopyasız `Uint8ClampedArray`ye sarılabilir. Boyut ve revizyon
   * gövdeye karışmasın diye başlıklarda taşınır.
   */
  app.get<{ Params: AssetParams }>('/api/v1/assets/:id/raster', async (request, reply) => {
    const record = options.catalog.get(request.params.id);
    if (record.summary.kind !== 'image') {
      throw new AssetStudioError('unsupported_format', 415, { kind: record.summary.kind });
    }
    const verified = await openVerifiedAsset(record);
    let source: Buffer;
    try {
      source = await verified.handle.readFile();
    } finally {
      await verified.handle.close();
    }
    const raster = await decodeRaster(source, {
      maxImagePixels: options.maxImagePixels,
      maxEdge: options.maxEdge,
    });
    reply.header('content-type', 'application/octet-stream');
    reply.header('x-vol-raster-width', String(raster.width));
    reply.header('x-vol-raster-height', String(raster.height));
    reply.header('x-vol-asset-revision', record.summary.revision);
    reply.header('x-vol-stripped-metadata', raster.strippedMetadata.join(','));
    reply.header('cache-control', 'no-store');
    return reply.send(raster.rgba);
  });

  app.get<{ Params: AssetParams }>('/api/v1/assets/:id/audio', async (request) => {
    const record = options.catalog.get(request.params.id);
    if (record.summary.kind !== 'audio') {
      throw new AssetStudioError('unsupported_format', 415, { kind: record.summary.kind });
    }
    if (record.summary.problemCodes.includes('asset_too_large')) {
      throw new AssetStudioError('asset_too_large', 413, { maximum: options.maxAssetBytes });
    }
    const verified = await openVerifiedAsset(record);
    try {
      return await probeAudioHandle(verified.handle);
    } finally {
      await verified.handle.close();
    }
  });

  app.get('/api/v1/events', (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('retry: 1500\n\n');

    const rawRevision = headerString(request.headers['last-event-id']);
    const lastRevision = rawRevision === undefined ? 0 : Number(rawRevision);
    for (const event of options.catalog.journal.since(lastRevision)) writeSse(reply, event);
    const unsubscribe = options.catalog.journal.subscribe((event) => writeSse(reply, event));
    const heartbeat = setInterval(() => reply.raw.write(': keepalive\n\n'), 15_000);
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      request.raw.off('close', cleanup);
      clearInterval(heartbeat);
      unsubscribe();
      closeSseConnections.delete(close);
    };
    const close = (): void => {
      cleanup();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    closeSseConnections.add(close);
    request.raw.once('close', cleanup);
  });

  /**
   * Tek mantıksal kayıt işlemi.
   *
   * Multipart: `transaction` alanı JSON planı, kalan parçalar ham RGBA
   * gövdeleridir. Plan ve veri ayrı taşınır çünkü ikili payload'ı JSON'a
   * gömmek base64 ile %33 şişirir ve bellekte iki kopya yaratır.
   */
  app.post('/api/v1/save-transactions', async (request): Promise<SaveTransactionResponse> => {
    if (!request.isMultipart()) {
      throw new AssetStudioError('invalid_request', 400, { field: 'content-type' });
    }
    let plan: SaveTransactionRequest | undefined;
    const payloads = new Map<string, Buffer>();
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        payloads.set(part.fieldname, await part.toBuffer());
        continue;
      }
      if (part.fieldname !== 'transaction') continue;
      try {
        plan = JSON.parse(String(part.value)) as SaveTransactionRequest;
      } catch (error) {
        throw new AssetStudioError(
          'invalid_request',
          400,
          { field: 'transaction' },
          {
            cause: error,
          },
        );
      }
    }
    const targets = buildSaveTargets(plan, payloads);
    const results = await runSaveTransaction(options.catalog, targets, {
      maxAssetBytes: options.maxAssetBytes,
    });
    return { transactionId: plan?.transactionId ?? '', results };
  });

  app.post<{ Body: LeaseBody }>('/api/v1/session/lease', (request): LeaseResponse => {
    return options.leases.acquire(clientIdFrom(request.body ?? {}));
  });

  app.post<{ Body: LeaseBody }>('/api/v1/session/lease/renew', (request): LeaseResponse => {
    const body = request.body ?? {};
    return options.leases.renew(clientIdFrom(body), leaseIdFrom(body));
  });

  app.delete<{ Body: LeaseBody }>('/api/v1/session/lease', (request, reply) => {
    const body = request.body ?? {};
    options.leases.release(clientIdFrom(body), leaseIdFrom(body));
    return reply.status(204).send();
  });
}
