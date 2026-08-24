import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAssetStudioServer, type AssetStudioServer } from '../../server/app.js';
import type { CatalogResponse, LeaseResponse } from '../../shared/contracts.js';
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
  pngId: string;
  wavId: string;
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
  const assets = catalog.json<CatalogResponse>().assets;
  const png = assets.find((asset) => asset.path.endsWith('car.png'));
  const wav = assets.find((asset) => asset.path.endsWith('tone.wav'));
  if (png === undefined || wav === undefined) throw new Error('fixture eksik');
  return { fixture, server, pngId: png.id, wavId: wav.id };
}

async function acquireLease(
  server: AssetStudioServer,
): Promise<{ clientId: string; leaseId: string }> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/v1/session/lease',
    payload: { clientId: 'repo-test' },
  });
  const body = response.json<LeaseResponse>();
  if (body.leaseId === undefined) throw new Error('lease unavailable');
  return { clientId: body.clientId, leaseId: body.leaseId };
}

describe('waveform ucu', () => {
  it('peak piramidi ve QA raporu döner', async () => {
    const { server, wavId } = await setup();

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${wavId}/waveform`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      sampleRate: number;
      channelCount: number;
      frameCount: number;
      levels: { framesPerPeak: number; channels: number[][] }[];
      qa: { pass: boolean; clippedFrames: number };
    }>();
    expect(body.sampleRate).toBeGreaterThan(0);
    expect(body.channelCount).toBe(1);
    expect(body.frameCount).toBeGreaterThan(0);
    expect(body.levels.length).toBeGreaterThan(0);
    // Her peak min VE max taşır.
    expect(body.levels[0].channels[0].length % 2).toBe(0);
    expect(body.qa.clippedFrames).toBe(0);
  }, 30_000);

  it('görsel varlığı reddeder', async () => {
    const { server, pngId } = await setup();

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/assets/${pngId}/waveform`,
    });

    expect(response.statusCode).toBe(415);
  });
});

describe('referans indeksi ucu', () => {
  it('varlığa referans veren dosyaları listeler', async () => {
    const { server, fixture, pngId } = await setup();
    await writeFile(join(fixture.repoRoot, 'kod.ts'), "const yol = 'assets/car.png';");

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/references/${pngId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ hits: { file: string }[] }>();
    expect(body.hits.some((hit) => hit.file === 'kod.ts')).toBe(true);
  });
});

describe('rename önizleme ucu', () => {
  it('hedefi ve referansları döner, DOSYAYA DOKUNMAZ', async () => {
    const { server, fixture, pngId } = await setup();
    await writeFile(join(fixture.repoRoot, 'kod.ts'), "const yol = 'assets/car.png';");

    const response = await server.app.inject({
      method: 'POST',
      url: `/api/v1/file-operations/rename/preview/${pngId}`,
      payload: { targetName: 'araba.png' },
    });

    expect(response.statusCode).toBe(200);
    const preview = response.json<{
      from: string;
      to: string;
      targetExists: boolean;
      references: { file: string }[];
    }>();
    expect(preview.from).toBe('assets/car.png');
    expect(preview.to).toBe('assets/araba.png');
    expect(preview.targetExists).toBe(false);
    expect(preview.references.some((hit) => hit.file === 'kod.ts')).toBe(true);
    // Önizleme UYGULAMAZ: dosya yerinde kalır.
    await expect(stat(fixture.pngPath)).resolves.toBeTruthy();
  });

  it('eksik hedef adını reddeder', async () => {
    const { server, pngId } = await setup();

    const response = await server.app.inject({
      method: 'POST',
      url: `/api/v1/file-operations/rename/preview/${pngId}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('kurtarılabilir silme uçları', () => {
  it('siler, listeler ve geri yükler', async () => {
    const { server, fixture, pngId } = await setup();
    const { clientId, leaseId } = await acquireLease(server);
    const before = await readFile(fixture.pngPath);

    const deleted = await server.app.inject({
      method: 'POST',
      url: `/api/v1/file-operations/delete/${pngId}`,
      headers: { 'x-vol-client-id': clientId, 'x-vol-lease-id': leaseId },
    });
    expect(deleted.statusCode).toBe(200);
    const entry = deleted.json<{ trashId: string; originalPath: string }>();
    expect(entry.originalPath).toBe('assets/car.png');
    await expect(stat(fixture.pngPath)).rejects.toThrow();

    const listed = await server.app.inject({
      method: 'GET',
      url: '/api/v1/file-operations/trash',
    });
    expect(listed.json<{ trashId: string }[]>()).toHaveLength(1);

    const restored = await server.app.inject({
      method: 'POST',
      url: '/api/v1/file-operations/restore',
      headers: { 'x-vol-client-id': clientId, 'x-vol-lease-id': leaseId },
      payload: { trashId: entry.trashId },
    });

    expect(restored.statusCode).toBe(200);
    expect((await readFile(fixture.pngPath)).equals(before)).toBe(true);
  });

  it('salt okunur varlığın silinmesini reddeder', async () => {
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
    const { clientId, leaseId } = await acquireLease(server);

    const response = await server.app.inject({
      method: 'POST',
      url: `/api/v1/file-operations/delete/${png?.id ?? 'x'}`,
      headers: { 'x-vol-client-id': clientId, 'x-vol-lease-id': leaseId },
    });

    expect(response.statusCode).toBe(403);
    await expect(stat(fixture.pngPath)).resolves.toBeTruthy();
  });

  it('geçersiz trashId reddedilir', async () => {
    const { server } = await setup();
    const { clientId, leaseId } = await acquireLease(server);

    const response = await server.app.inject({
      method: 'POST',
      url: '/api/v1/file-operations/restore',
      headers: { 'x-vol-client-id': clientId, 'x-vol-lease-id': leaseId },
      payload: { trashId: 42 },
    });

    expect(response.statusCode).toBe(400);
  });
});
