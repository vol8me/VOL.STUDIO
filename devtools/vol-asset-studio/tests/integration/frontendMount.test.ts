import { afterEach, describe, expect, it } from 'vitest';
import { createAssetStudioServer, type AssetStudioServer } from '../../server/app.js';
import type { CatalogResponse, ProjectResponse } from '../../shared/contracts.js';
import { createFixtureProject, type FixtureProject } from '../server/fixtures.js';

/**
 * İstemci sunumu açıkken API'nin hâlâ erişilebilir olduğunu doğrular.
 *
 * Diğer sunucu testleri `frontend: 'none'` ile koşar; o kurulumda Vite ara
 * katmanı hiç bağlanmaz. Tam da bu boşlukta bir regresyon üretime kaçtı: Vite
 * ara katmanı filtresiz bağlandığında SPA fallback'i her `/api/**` isteğini
 * `index.html`e çeviriyor, geliştirme modunda uygulama katalogu hiç
 * yükleyemiyordu. Bu dosya iki frontend modunu da gerçek sunucuyla dener.
 *
 * Vite dev sunucusu bu testler için gerçekten başlatılır; süre onun maliyetidir.
 */
const MOUNT_TIMEOUT_MS = 60_000;

const fixtures: FixtureProject[] = [];
const servers: AssetStudioServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function startServer(frontend: 'development' | 'production'): Promise<AssetStudioServer> {
  const fixture = await createFixtureProject();
  fixtures.push(fixture);
  const server = await createAssetStudioServer({
    repoRoot: fixture.repoRoot,
    cacheRoot: fixture.cacheRoot,
    frontend,
    watch: false,
  });
  servers.push(server);
  return server;
}

describe('frontend bağlıyken API yüzeyi', () => {
  it(
    'geliştirme modunda API JSON döndürür, SPA fallbacke düşmez',
    async () => {
      const server = await startServer('development');

      const project = await server.app.inject({ method: 'GET', url: '/api/v1/project' });
      const catalog = await server.app.inject({ method: 'GET', url: '/api/v1/catalog' });

      expect(project.headers['content-type']).toContain('application/json');
      expect(project.json<ProjectResponse>().schemaVersion).toBe(1);
      expect(catalog.headers['content-type']).toContain('application/json');
      expect(catalog.json<CatalogResponse>().assets.length).toBeGreaterThan(0);
    },
    MOUNT_TIMEOUT_MS,
  );

  it(
    'geliştirme modunda bilinmeyen API yolu HTML değil yapılandırılmış 404 verir',
    async () => {
      const server = await startServer('development');

      const missing = await server.app.inject({ method: 'GET', url: '/api/v1/yok-boyle' });

      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: { code: 'asset_not_found' } });
    },
    MOUNT_TIMEOUT_MS,
  );

  it(
    'geliştirme modunda uygulama kabuğu hâlâ HTML olarak servis edilir',
    async () => {
      const server = await startServer('development');

      const shell = await server.app.inject({ method: 'GET', url: '/' });

      expect(shell.statusCode).toBe(200);
      expect(shell.headers['content-type']).toContain('text/html');
      expect(shell.body).toContain('<div id="app">');
    },
    MOUNT_TIMEOUT_MS,
  );
});
