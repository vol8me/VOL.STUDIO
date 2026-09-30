import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { activeWorkspacePaths, loadRepoLifecycle } from '../workspaceLifecycle.mjs';

const root = resolve(import.meta.dirname, '../../..');

// E2E config kalitesi rutin ürün kapısıdır: yalnız `active` workspace'ler
// taranır. Frozen paketin playwright.config.ts'i değiştirilemez — bir kural
// ihlali orada sonsuza dek düzeltilemez kalırdı.
const lifecycle = loadRepoLifecycle(root);
assert.ok(lifecycle, 'workspace-lifecycle.json okunamadı');

test('yerel E2E yalnız seçilmiş teste veya açık geliştirme sunucusuna güvenmez', async () => {
  let count = 0;
  for (const workspacePath of activeWorkspacePaths(lifecycle)) {
    const directory = resolve(root, workspacePath);
    const configPath = resolve(directory, 'playwright.config.ts');
    if (!existsSync(configPath)) continue;
    const config = (await tsImport(pathToFileURL(configPath).href, import.meta.url)).default;
    assert.equal(config.forbidOnly, true, directory);
    if ((config.projects?.length ?? 0) > 1) {
      const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
      assert.ok(manifest.scripts?.['test:e2e'], `${directory}: test:e2e eksik`);
      assert.doesNotMatch(
        manifest.scripts['test:e2e'],
        /--project(?:=|\s)/,
        `${directory}: ek projeler rutin E2E kapısından dışlanamaz`,
      );
    }
    for (const server of [config.webServer].flat()) {
      assert.equal(server.reuseExistingServer, false, directory);
      assert.match(
        server.command,
        /\bvite preview\b/,
        directory,
      );
    }
    count++;
  }
  assert.ok(count > 0, 'En az bir gerçek E2E yapılandırması bulunmalı');
});
