import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
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
      assert.match(server.command, /\bvite preview\b/, directory);
    }
    count++;
  }
  assert.ok(count > 0, 'En az bir gerçek E2E yapılandırması bulunmalı');
});

// Çift motor kapsamı: bir spec dosyası yalnız tek motorda koşuyorsa bu bilinçli ve
// gerekçeli olmalıdır. İstisna listesi büyütülerek değil, kapsam genişletilerek çözülür.
const ENGINE_ASYMMETRY = new Map([
  [
    'devtools/vol-showcase:visual.spec.ts',
    'piksel temeli yalnız Chromium; WebKit temeli bilinçli kalibrasyonla kurulur, otomatik güncellemeyle saklanmaz',
  ],
]);

function matches(pattern, file) {
  if (pattern === undefined) return false;
  return [pattern].flat().some((entry) => (entry instanceof RegExp ? entry.test(file) : false));
}

test('iki motorlu pakette her spec her projede koşar; tek istisna gerekçeli piksel temelidir', async () => {
  let checked = 0;
  for (const workspacePath of activeWorkspacePaths(lifecycle)) {
    const directory = resolve(root, workspacePath);
    const configPath = resolve(directory, 'playwright.config.ts');
    if (!existsSync(configPath)) continue;
    const config = (await tsImport(pathToFileURL(configPath).href, import.meta.url)).default;
    if ((config.projects?.length ?? 0) < 2) continue;
    const testDir = resolve(directory, config.testDir ?? '.');
    const specs = readdirSync(testDir, { recursive: true })
      .map((entry) => String(entry).split(sep).join('/'))
      .filter((entry) => entry.endsWith('.spec.ts'))
      .map((entry) => entry.split('/').pop());
    const perProject = new Map(
      config.projects.map((project) => [
        project.name,
        new Set(
          specs.filter(
            (file) =>
              (project.testMatch === undefined || matches(project.testMatch, file)) &&
              !matches(project.testIgnore, file),
          ),
        ),
      ]),
    );
    const report = [...perProject].map(([name, set]) => `${name}: ${[...set].sort().join(', ')}`);
    console.log(`[e2e-motorlar] ${workspacePath}\n  ${report.join('\n  ')}`);
    for (const spec of new Set(specs)) {
      const missing = [...perProject].filter(([, set]) => !set.has(spec)).map(([name]) => name);
      if (missing.length === 0) continue;
      const key = `${workspacePath}:${spec}`;
      assert.ok(
        ENGINE_ASYMMETRY.has(key),
        `${key}: ${missing.join(', ')} projesinde koşmuyor ve gerekçeli istisnası yok`,
      );
    }
    for (const key of ENGINE_ASYMMETRY.keys()) {
      if (!key.startsWith(`${workspacePath}:`)) continue;
      const spec = key.split(':')[1];
      assert.ok(
        [...perProject].some(([, set]) => !set.has(spec)),
        `${key}: ölü istisna; spec artık her motorda koşuyor`,
      );
    }
    checked++;
  }
  assert.ok(checked > 0, 'İki projeli en az bir E2E yapılandırması bulunmalı');
});
