import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

test('yerel E2E yalnız seçilmiş teste veya açık geliştirme sunucusuna güvenmez', async () => {
  let count = 0;
  for (const root of ['games', 'devtools']) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = resolve(root, entry.name);
      if (!(await readdir(directory)).includes('playwright.config.ts')) continue;
      const config = (
        await tsImport(
          pathToFileURL(resolve(directory, 'playwright.config.ts')).href,
          import.meta.url,
        )
      ).default;
      assert.equal(config.forbidOnly, true, directory);
      for (const server of [config.webServer].flat()) {
        assert.equal(server.reuseExistingServer, false, directory);
        assert.match(
          server.command,
          /\bvite preview\b|\bnode dist-server\/.* --production\b/,
          directory,
        );
      }
      count++;
    }
  }
  assert.ok(count > 0, 'En az bir gerçek E2E yapılandırması bulunmalı');
});
