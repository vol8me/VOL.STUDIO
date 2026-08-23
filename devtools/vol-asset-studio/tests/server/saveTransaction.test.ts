import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createAssetStudioServer, type AssetStudioServer } from '../../server/app.js';
import type { AssetSummary, CatalogResponse } from '../../shared/contracts.js';
import { createFixtureProject, type FixtureProject } from './fixtures.js';

const fixtures: FixtureProject[] = [];
const servers: AssetStudioServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function setup(): Promise<{
  fixture: FixtureProject;
  server: AssetStudioServer;
  png: AssetSummary;
}> {
  const fixture = await createFixtureProject();
  fixtures.push(fixture);
  const server = await createAssetStudioServer({
    repoRoot: fixture.repoRoot,
    cacheRoot: fixture.cacheRoot,
    frontend: 'none',
    watch: false,
  });
  servers.push(server);
  const catalog = await server.app.inject({ method: 'GET', url: '/api/v1/catalog' });
  const png = catalog.json<CatalogResponse>().assets.find((a) => a.path.endsWith('car.png'));
  if (png === undefined) throw new Error('fixture png bulunamadı');
  return { fixture, server, png };
}

/** Multipart kayıt gövdesini elle kurar (undici FormData yerine deterministik). */
function multipartBody(
  boundary: string,
  transaction: unknown,
  parts: { name: string; data: Buffer }[],
): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="transaction"\r\n\r\n${JSON.stringify(
        transaction,
      )}\r\n`,
    ),
  );
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.name}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      part.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function save(
  server: AssetStudioServer,
  targets: { assetId: string; expectedRevision: string; payload: Buffer }[],
): Promise<LightMyRequestResponse> {
  const boundary = 'volboundary123';
  const plan = {
    transactionId: 'tx-1',
    targets: targets.map((target, index) => ({
      assetId: target.assetId,
      expectedRevision: target.expectedRevision,
      width: 2,
      height: 2,
      payloadPart: `p${index}`,
    })),
  };
  return server.app.inject({
    method: 'POST',
    url: '/api/v1/save-transactions',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: multipartBody(
      boundary,
      plan,
      targets.map((target, index) => ({ name: `p${index}`, data: target.payload })),
    ),
  });
}

/** 2×2 düz renk PNG üretir. */
async function solidPng(hex: string): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 4, background: hex } })
    .png()
    .toBuffer();
}

describe('raster ucu', () => {
  it('ham RGBA ve boyut başlıklarıyla döner', async () => {
    const { server, png } = await setup();

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${png.id}/raster`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['x-vol-raster-width']).toBe('2');
    expect(response.headers['x-vol-raster-height']).toBe('2');
    expect(response.headers['x-vol-asset-revision']).toBe(png.revision);
    expect(response.rawPayload.length).toBe(2 * 2 * 4);
    // Fixture #ff5500ff dolu: unpremultiplied RGBA olarak birebir gelmeli.
    expect(Array.from(response.rawPayload.subarray(0, 4))).toEqual([255, 85, 0, 255]);
  });

  it('görsel olmayan varlığı reddeder', async () => {
    const { server } = await setup();
    const catalog = await server.app.inject({ method: 'GET', url: '/api/v1/catalog' });
    const wav = catalog.json<CatalogResponse>().assets.find((a) => a.path.endsWith('tone.wav'));

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${wav?.id ?? 'x'}/raster`,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: { code: 'unsupported_format' } });
  });
});

describe('save-transaction', () => {
  it('doğru revizyonla kaydeder ve dosyayı gerçekten değiştirir', async () => {
    const { server, fixture, png } = await setup();
    const payload = await solidPng('#00ff00ff');

    const response = await save(server, [
      { assetId: png.id, expectedRevision: png.revision, payload },
    ]);

    expect(response.statusCode).toBe(200);
    const body = response.json<{ results: { assetId: string; revision: string }[] }>();
    expect(body.results[0].assetId).toBe(png.id);
    expect(body.results[0].revision).not.toBe(png.revision);

    const onDisk = await readFile(fixture.pngPath);
    expect(onDisk.equals(payload)).toBe(true);
  });

  it('bayat revizyonla gelen kaydı reddeder ve dosyayı EZMEZ', async () => {
    const { server, fixture, png } = await setup();
    const before = await readFile(fixture.pngPath);

    const response = await save(server, [
      { assetId: png.id, expectedRevision: 'a'.repeat(64), payload: await solidPng('#0000ffff') },
    ]);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'asset_conflict' } });
    expect((await readFile(fixture.pngPath)).equals(before)).toBe(true);
  });

  it('harici değişiklikten sonraki kayıt conflict verir', async () => {
    const { server, fixture, png } = await setup();

    // Kullanıcı düzenlerken başka bir araç dosyayı değiştirdi.
    await writeFile(fixture.pngPath, await solidPng('#123456ff'));
    const external = await readFile(fixture.pngPath);

    const response = await save(server, [
      { assetId: png.id, expectedRevision: png.revision, payload: await solidPng('#abcdefff') },
    ]);

    expect(response.statusCode).toBe(409);
    expect((await readFile(fixture.pngPath)).equals(external)).toBe(true);
  });

  it('readonly rolündeki varlığa yazmayı reddeder', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await writeFile(
      join(fixture.repoRoot, 'asset-studio.json'),
      JSON.stringify({
        schemaVersion: 1,
        roots: [{ id: 'assets', path: 'assets', role: 'readonly', kinds: ['image'] }],
        ignore: [],
      }),
    );
    const server = await createAssetStudioServer({
      repoRoot: fixture.repoRoot,
      cacheRoot: fixture.cacheRoot,
      frontend: 'none',
      watch: false,
    });
    servers.push(server);
    const catalog = await server.app.inject({ method: 'GET', url: '/api/v1/catalog' });
    const png = catalog.json<CatalogResponse>().assets.find((a) => a.path.endsWith('car.png'));
    if (png === undefined) throw new Error('fixture png bulunamadı');

    const response = await save(server, [
      { assetId: png.id, expectedRevision: png.revision, payload: await solidPng('#ffffffff') },
    ]);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'asset_readonly' } });
  });

  it('başarısız kayıt geçici veya yedek dosya bırakmaz', async () => {
    const { server, fixture, png } = await setup();

    await save(server, [
      { assetId: png.id, expectedRevision: 'b'.repeat(64), payload: await solidPng('#101010ff') },
    ]);

    const entries = await readdir(fixture.assetsRoot);
    expect(entries.filter((name) => name.includes('vol-part'))).toEqual([]);
    expect(entries.filter((name) => name.includes('vol-backup'))).toEqual([]);
  });

  it('geçersiz planı diske dokunmadan reddeder', async () => {
    const { server, fixture, png } = await setup();
    const before = await readFile(fixture.pngPath);

    const missingPart = await server.app.inject({
      method: 'POST',
      url: '/api/v1/save-transactions',
      headers: { 'content-type': 'multipart/form-data; boundary=b1' },
      payload: multipartBody(
        'b1',
        {
          transactionId: 'tx',
          targets: [
            {
              assetId: png.id,
              expectedRevision: png.revision,
              width: 2,
              height: 2,
              payloadPart: 'yok',
            },
          ],
        },
        [],
      ),
    });

    expect(missingPart.statusCode).toBe(400);
    expect((await readFile(fixture.pngPath)).equals(before)).toBe(true);
  });

  it('multipart olmayan gövdeyi reddeder', async () => {
    const { server } = await setup();

    const response = await server.app.inject({
      method: 'POST',
      url: '/api/v1/save-transactions',
      payload: { transactionId: 'x', targets: [] },
    });

    expect(response.statusCode).toBe(400);
  });
});
