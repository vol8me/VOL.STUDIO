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

// Sessiz şerit: zamanı sınırlayan sınamalar ana şeritten ayrılır (bkz. QUIET_SPECS). Şeritler yalnız tam koşuyu
// böler; bir sınama ikisinden de düşerse ya da ikisinde birden koşarsa kapsam sessizce bozulur.
test('vitrin şeritleri her spec dosyasını tam bir şeritte koşturur ve sessiz liste gerçek dosyaları adlar', async () => {
  const directory = resolve(root, 'devtools/vol-showcase');
  const configUrl = pathToFileURL(resolve(directory, 'playwright.config.ts')).href;
  const load = async (lane) => {
    const previous = process.env.VOL_UI_E2E_LANE;
    if (lane === undefined) delete process.env.VOL_UI_E2E_LANE;
    else process.env.VOL_UI_E2E_LANE = lane;
    try {
      return await tsImport(`${configUrl}?lane=${lane ?? 'all'}`, import.meta.url);
    } finally {
      if (previous === undefined) delete process.env.VOL_UI_E2E_LANE;
      else process.env.VOL_UI_E2E_LANE = previous;
    }
  };
  const all = await load(undefined);
  const main = await load('main');
  const quiet = await load('quiet');
  const testDir = resolve(directory, all.default.testDir);
  const specs = readdirSync(testDir)
    .filter((entry) => entry.endsWith('.spec.ts'))
    .sort();

  for (const name of all.QUIET_SPECS) {
    assert.ok(specs.includes(`${name}.spec.ts`), `QUIET_SPECS: ${name}.spec.ts diye bir dosya yok`);
  }
  assert.ok(all.QUIET_SPECS.length > 0, 'sessiz şerit boş: ayrım anlamsız');
  assert.equal(all.default.testIgnore, undefined, 'şerit verilmezse hiçbir spec dışlanmaz');
  assert.equal(all.default.testMatch, undefined, 'şerit verilmezse varsayılan eşleşme kalır');

  // Playwright'ta proje düzeyindeki `testIgnore`/`testMatch` üst düzeydekini EZER (ikisi birleşmez): WebKit'in kendi
  // `testIgnore`'u şerit listesini sessizce düşürmüştü. Bu yüzden şerit üyeliği her PROJENİN etkin listesinden okunur.
  const effective = (config, project, key) => project[key] ?? config.default[key];
  for (const project of main.default.projects) {
    const quietProject = quiet.default.projects.find((entry) => entry.name === project.name);
    const plainProject = all.default.projects.find((entry) => entry.name === project.name);
    assert.ok(quietProject && plainProject, `${project.name}: üç yapılandırmada da bulunmalı`);
    for (const spec of specs) {
      const file = resolve(testDir, spec);
      // Şeritsiz yapılandırmada bile dışlanan dosya (WebKit'te piksel temeli) hiçbir şeritte koşmaz.
      if (matches(effective(all, plainProject, 'testIgnore'), file)) continue;
      const inMain = !matches(effective(main, project, 'testIgnore'), file);
      const inQuiet =
        matches(effective(quiet, quietProject, 'testMatch'), file) &&
        !matches(effective(quiet, quietProject, 'testIgnore'), file);
      const isQuiet = all.QUIET_SPECS.includes(spec.replace(/\.spec\.ts$/, ''));
      assert.equal(
        isQuiet ? inQuiet && !inMain : inMain && !inQuiet,
        true,
        `${project.name} · ${spec}: tam bir şeritte koşmalı (ana ${inMain}, sessiz ${inQuiet})`,
      );
    }
  }
});
