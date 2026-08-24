import { copyFile, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { get as httpGet, type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAssetStudioServer, type AssetStudioServer } from '../../server/app.js';
import type { AssetSummary, CatalogResponse } from '../../shared/contracts.js';
import { createFixtureProject, type FixtureProject } from './fixtures.js';

const fixtures: FixtureProject[] = [];
const servers: AssetStudioServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function setup(
  options: { host?: string; accessToken?: string; allowedHosts?: string[] } = {},
): Promise<{
  fixture: FixtureProject;
  server: AssetStudioServer;
  assets: AssetSummary[];
}> {
  const fixture = await createFixtureProject();
  fixtures.push(fixture);
  const server = await createAssetStudioServer({
    repoRoot: fixture.repoRoot,
    cacheRoot: fixture.cacheRoot,
    frontend: 'none',
    watch: false,
    ...options,
  });
  servers.push(server);
  const headers =
    server.accessToken === undefined ? {} : { 'x-vol-asset-token': server.accessToken };
  const catalog = await server.app.inject({ method: 'GET', url: '/api/v1/catalog', headers });
  return { fixture, server, assets: catalog.json<CatalogResponse>().assets };
}

describe('Asset Studio API', () => {
  it('bilinmeyen API ve bozuk JSON için yapılandırılmış 4xx hata döndürür', async () => {
    const { server } = await setup();
    const missing = await server.app.inject({ method: 'GET', url: '/api/v1/nope' });
    const malformed = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/lease',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: 'asset_not_found' } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: { code: 'invalid_request' } });
  });

  it('proje ve katalog bilgisini yapılandırılmış sözleşmeyle döndürür', async () => {
    const { server, assets } = await setup();
    const response = await server.app.inject({ method: 'GET', url: '/api/v1/project' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      name: 'Fixture Repo',
      roots: [{ id: 'assets', path: 'assets', available: true }],
      access: { network: 'loopback', requiresToken: false },
    });
    expect(assets).toHaveLength(3);
  });

  it('içeriği Range ve ETag ile sunar', async () => {
    const { server, assets } = await setup();
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const range = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${audio.id}/content`,
      headers: { range: 'bytes=0-3' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-range']).toBe(`bytes 0-3/${audio.bytes}`);
    expect(range.rawPayload.toString('ascii')).toBe('RIFF');

    const cached = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${audio.id}/content`,
      headers: { 'if-none-match': `"${audio.revision}"` },
    });
    expect(cached.statusCode).toBe(304);
  });

  it('geçersiz range için yapılandırılmış 416 döndürür', async () => {
    const { server, assets } = await setup();
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${audio.id}/content`,
      headers: { range: 'bytes=99999-' },
    });
    expect(response.statusCode).toBe(416);
    expect(response.json()).toEqual({
      error: { code: 'range_not_satisfiable', details: { size: audio.bytes } },
    });
  });

  it('görsel thumbnail ve ses metadata üretir', async () => {
    const { server, assets } = await setup();
    const image = assets.find((asset) => asset.name === 'car.png')!;
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const thumbnail = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${image.id}/thumbnail?size=64`,
    });
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toContain('image/png');

    const metadata = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${audio.id}/audio`,
    });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({ codec: 'pcm_s16le', sampleRate: 8000, channels: 1 });
  });

  it('ses işlem zincirini FFmpeg ile uygulayıp revizyon kontrollü kaydeder', async () => {
    const { server, assets, fixture } = await setup();
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const before = await readFile(fixture.wavPath);
    const response = await server.app.inject({
      method: 'POST',
      url: `/api/v1/assets/${audio.id}/audio/render`,
      payload: {
        expectedRevision: audio.revision,
        operations: [{ kind: 'gain', decibels: -6 }],
      },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json<{ assetId: string; bytes: number }>();
    expect(result).toMatchObject({ assetId: audio.id });
    expect(typeof result.bytes).toBe('number');
    const after = await readFile(fixture.wavPath);
    expect(after.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(after.equals(before)).toBe(false);

    const stale = await server.app.inject({
      method: 'POST',
      url: `/api/v1/assets/${audio.id}/audio/render`,
      payload: {
        expectedRevision: audio.revision,
        operations: [{ kind: 'reverse' }],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect((await readFile(fixture.wavPath)).equals(after)).toBe(true);
  });

  it('ses işlemlerinin önizlemesini blob olarak döner ve dosyayı kaydetmez', async () => {
    const { server, assets, fixture } = await setup();
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const before = await readFile(fixture.wavPath);

    const response = await server.app.inject({
      method: 'POST',
      url: `/api/v1/assets/${audio.id}/audio/preview`,
      payload: {
        expectedRevision: audio.revision,
        operations: [{ kind: 'gain', decibels: -6 }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/wav');
    expect(response.headers['x-vol-asset-revision']).toBe(audio.revision);
    const preview = Buffer.from(response.payload, 'binary');
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.subarray(0, 4).toString('ascii')).toBe('RIFF');

    const after = await readFile(fixture.wavPath);
    expect(after.equals(before)).toBe(true);
  });

  it('boyut sınırını aşan medyayı stream eder fakat decode işlemine almaz', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await writeFile(
      join(fixture.repoRoot, 'asset-studio.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        roots: [
          {
            id: 'assets',
            path: 'assets',
            role: 'source',
            kinds: ['image', 'audio', 'metadata'],
          },
        ],
        ignore: [],
        limits: { maxAssetBytes: 10 },
      })}\n`,
    );
    const server = await createAssetStudioServer({
      repoRoot: fixture.repoRoot,
      frontend: 'none',
      watch: false,
    });
    servers.push(server);
    const image = server.catalog.snapshot().assets.find((asset) => asset.name === 'car.png')!;
    expect(image.problemCodes).toContain('asset_too_large');

    const thumbnail = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${image.id}/thumbnail`,
    });
    const content = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${image.id}/content`,
      headers: { range: 'bytes=0-3' },
    });
    expect(thumbnail.statusCode).toBe(413);
    expect(thumbnail.json()).toEqual({
      error: { code: 'asset_too_large', details: { maximum: 10 } },
    });
    expect(content.statusCode).toBe(206);
  });

  it('seek gerektiren gerçek OGG dosyasının süresini descriptor üzerinden okur', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    const repositoryOgg = join(
      import.meta.dirname,
      '../../../..',
      'games/vol-hell/public/assets/audio/ambience/null-drift.ogg',
    );
    await copyFile(repositoryOgg, join(fixture.assetsRoot, 'real.ogg'));
    const server = await createAssetStudioServer({
      repoRoot: fixture.repoRoot,
      frontend: 'none',
      watch: false,
    });
    servers.push(server);
    const ogg = server.catalog.snapshot().assets.find((asset) => asset.name === 'real.ogg')!;
    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${ogg.id}/audio`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ durationSeconds: number }>().durationSeconds).toBeGreaterThan(1);
  });

  it('tek editör lease verir', async () => {
    const { server } = await setup();
    const first = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/lease',
      payload: { clientId: 'client-a' },
    });
    const second = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/lease',
      payload: { clientId: 'client-b' },
    });
    expect(first.json()).toMatchObject({ clientId: 'client-a', mode: 'editor' });
    expect(second.json()).toEqual({ clientId: 'client-b', mode: 'readonly' });
  });

  it('LAN modunda API tokenı zorunlu tutar', async () => {
    const { server } = await setup({ host: '0.0.0.0', accessToken: 'known-token' });
    const denied = await server.app.inject({ method: 'GET', url: '/api/v1/project' });
    const allowed = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { 'x-vol-asset-token': 'known-token' },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toEqual({ error: { code: 'authentication_required' } });
    expect(allowed.statusCode).toBe(200);
  });

  it('LAN üzerinde Vite geliştirme dosya yüzeyini açmayı reddeder', async () => {
    const fixture = await createFixtureProject();
    fixtures.push(fixture);
    await expect(
      createAssetStudioServer({
        repoRoot: fixture.repoRoot,
        host: '0.0.0.0',
        frontend: 'development',
        watch: false,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', details: { reason: 'lan_dev' } });
  });

  it('LAN tokenını URLye koymadan HttpOnly same-origin oturumuna dönüştürür', async () => {
    const { server, assets } = await setup({ host: '0.0.0.0', accessToken: 'known-token' });
    const authenticated = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/auth',
      headers: { 'x-vol-asset-token': 'known-token' },
    });
    const setCookieHeader = authenticated.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(authenticated.statusCode).toBe(200);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('known-token');

    if (setCookie === undefined) throw new Error('set_cookie_missing');
    const cookie = setCookie.split(';')[0];
    const image = assets.find((asset) => asset.name === 'car.png')!;
    const nativeMediaRequest = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${image.id}/thumbnail`,
      headers: { cookie },
    });
    expect(nativeMediaRequest.statusCode).toBe(200);
  });

  it('katalogdan sonra değişen dosyayı stale revision ile açmaz', async () => {
    const { server, fixture, assets } = await setup();
    const image = assets.find((asset) => asset.name === 'car.png')!;
    await writeFile(fixture.pngPath, Buffer.from('replacement'));
    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${image.id}/content`,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'asset_conflict' } });
  });

  it('katalogdan sonra dışarı çevrilen symlinki medya routeunda reddeder', async () => {
    const { server, fixture, assets } = await setup();
    const audio = assets.find((asset) => asset.name === 'tone.wav')!;
    const outside = join(fixture.repoRoot, '..', `${audio.id}-outside.wav`);
    await writeFile(outside, Buffer.from('outside'));
    try {
      await rm(fixture.wavPath);
      await symlink(outside, fixture.wavPath);
      const response = await server.app.inject({
        method: 'GET',
        url: `/api/v1/assets/${audio.id}/audio`,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: { code: 'path_outside_workspace' } });
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("LAN hostunda rebinding'i reddeder, izin verilen adı kabul eder", async () => {
    const { server } = await setup({
      host: '192.168.1.50',
      accessToken: 'known-token',
      allowedHosts: ['studio.local'],
    });
    const headers = { 'x-vol-asset-token': 'known-token' };
    const rebound = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { ...headers, host: 'attacker.example' },
    });
    // Belirli bir LAN adresine bind edildiğinde loopback adı o adrese ulaşmaz;
    // allowlist de onu taşımaz.
    const loopbackName = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { ...headers, host: 'localhost:5175' },
    });
    const allowed = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { ...headers, host: 'studio.local:5175' },
    });

    expect(rebound.statusCode).toBe(400);
    expect(loopbackName.statusCode).toBe(400);
    expect(allowed.statusCode).toBe(200);
  });

  it('tekil varlık özetini opaque kimlikle döndürür', async () => {
    const { server, assets } = await setup();
    const png = assets.find((asset) => asset.path.endsWith('car.png'));
    if (png === undefined) throw new Error('fixture png bulunamadı');

    const found = await server.app.inject({ method: 'GET', url: `/api/v1/assets/${png.id}` });
    const missing = await server.app.inject({ method: 'GET', url: '/api/v1/assets/yok-boyle' });

    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ id: png.id, path: png.path, kind: 'image' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: 'asset_not_found' } });
  });

  it('thumbnaili içerik hashiyle diske yazar ve ikinci istekte oradan servis eder', async () => {
    const { server, fixture, assets } = await setup();
    const png = assets.find((asset) => asset.path.endsWith('car.png'));
    if (png === undefined) throw new Error('fixture png bulunamadı');

    const first = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${png.id}/thumbnail?size=32`,
    });
    const cached = join(fixture.cacheRoot, 'thumbnails', png.revision.slice(0, 2));
    const entries = await readdir(cached);

    const second = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${png.id}/thumbnail?size=32`,
    });

    expect(first.statusCode).toBe(200);
    expect(entries).toContain(`${png.revision}-32`);
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);
  });

  it('loopback hostunda DNS rebinding ve çapraz origin isteklerini reddeder', async () => {
    const { server } = await setup();
    const rebound = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { host: 'attacker.example' },
    });
    const crossOrigin = await server.app.inject({
      method: 'GET',
      url: '/api/v1/project',
      headers: { host: 'localhost:5175', origin: 'https://attacker.example' },
    });
    expect(rebound.statusCode).toBe(400);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it('açık SSE bağlantısını kontrollü kapatıp sunucunun kapanmasını tamamlar', async () => {
    const { server } = await setup();
    await server.app.listen({ host: '127.0.0.1', port: 0 });
    const address = server.app.server.address() as AddressInfo;
    const request = await new Promise<ClientRequest>((resolve, reject) => {
      const candidate = httpGet(`http://127.0.0.1:${address.port}/api/v1/events`, (response) => {
        response.once('data', () => resolve(candidate));
      });
      candidate.once('error', reject);
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server_close_timeout')), 2_000);
      void server.app.close().then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error('server_close_failed'));
        },
      );
    });
    request.destroy();
  });
});
