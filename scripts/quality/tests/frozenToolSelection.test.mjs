import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getFileInfo } from 'prettier';
import { frozenWorkspacePaths, loadRepoLifecycle } from '../workspaceLifecycle.mjs';

const root = resolve(import.meta.dirname, '../../..');
const lifecycle = loadRepoLifecycle(root);
assert.ok(lifecycle, 'workspace-lifecycle.json okunamadı');
// Frozen paket yokken denetimler boş geçer; mekanizma yeni bir freeze'de devreye girer.
const frozen = frozenWorkspacePaths(lifecycle);

/**
 * Rutin araçların frozen ağaçları SEÇMEDİĞİNİN kilit testi.
 * Her assertion, ilgili aracın KENDİ yapılandırmasından veya gerçek seçim
 * API'sinden beslenir — beklenen değer test içinde yeniden yazılmaz.
 */

test('Prettier frozen ağaçları gerçekten ignore eder (getFileInfo)', async () => {
  for (const path of frozen) {
    const probe = join(root, path, 'package.json');
    assert.equal(
      (await getFileInfo(probe, { ignorePath: join(root, '.prettierignore') })).ignored,
      true,
      `${path}/ hâlâ rutin Prettier seçiminde`,
    );
  }
  const control = await getFileInfo(join(root, 'core/package.json'), {
    ignorePath: join(root, '.prettierignore'),
  });
  assert.equal(control.ignored, false, 'aktif paket yanlışlıkla ignore edildi');
});

test('stylelint ignoreFiles her frozen ağacı kapsar', () => {
  const ignoreFiles = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).stylelint
    .ignoreFiles;
  for (const path of frozen) {
    assert.ok(ignoreFiles.includes(`${path}/**`), `stylelint ignoreFiles "${path}/**" içermiyor`);
  }
});

test('ESLint config frozen ağaçları ignores listesinde taşır', async () => {
  // Dinamik import yol değil URL ister; Windows'ta ham yol 'c:' protokolü sayılır.
  const config = (await import(pathToFileURL(join(root, 'eslint.config.mjs')).href)).default;
  const ignores = config.flatMap((entry) => entry.ignores ?? []);
  for (const path of frozen) {
    assert.ok(ignores.includes(`${path}/**`), `eslint.config.mjs ignores "${path}/**" içermiyor`);
  }
});

test('quality.json aktif kalite bölümleri frozen anahtar taşımaz', () => {
  const quality = JSON.parse(readFileSync(join(root, 'quality.json'), 'utf8'));
  const sections = {
    packages: Object.keys(quality.packages ?? {}),
    bundles: Object.keys(quality.bundles ?? {}),
    scaling: Object.keys(quality.scaling ?? {}).filter((key) => !key.startsWith('$')),
    'coverageShape.acknowledged': Object.keys(quality.coverageShape?.acknowledged ?? {}),
  };
  const lifecycle = JSON.parse(readFileSync(join(root, 'workspace-lifecycle.json'), 'utf8'));
  const frozenNames = new Set(
    lifecycle.workspaces.filter((w) => w.status === 'frozen').map((w) => w.packageName),
  );
  for (const [section, keys] of Object.entries(sections)) {
    for (const key of keys) {
      assert.ok(
        !frozenNames.has(key) && !frozen.some((path) => key === path || key.startsWith(`${path}/`)),
        `quality.json ${section} hâlâ frozen girdisi taşıyor: ${key}`,
      );
    }
  }
});

test('root package.json script yüzeyi frozen paket adı taşımaz', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lifecycle = JSON.parse(readFileSync(join(root, 'workspace-lifecycle.json'), 'utf8'));
  const frozenNames = lifecycle.workspaces
    .filter((w) => w.status === 'frozen')
    .map((w) => w.packageName);
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    for (const frozenName of frozenNames) {
      assert.ok(
        !name.includes(frozenName) && !String(command).includes(frozenName),
        `package.json script "${name}" frozen ${frozenName} paketine rutin gönderme yapıyor`,
      );
    }
  }
});

// Rutin ürün-kalitesi tarayıcılarının hepsi lifecycle filtresi taşımak
// ZORUNDA — biri filtreyi kaybederse frozen kaynak sessizce kapıya döner.
const PRODUCT_QUALITY_SCANNERS = [
  'sourceSize.mjs',
  'commentDensity.mjs',
  'deadI18n.mjs',
  'moduleCycles.mjs',
  'layers.mjs',
  'devPorts.mjs',
  'productIcons.mjs',
  'cargoWorkspace.mjs',
];

test('ürün-kalitesi tarayıcıları lifecycle filtresiyle türer', () => {
  for (const scanner of PRODUCT_QUALITY_SCANNERS) {
    const path = join(root, 'scripts/quality', scanner);
    assert.ok(existsSync(path), `${scanner} yok — liste bayatlamış olabilir`);
    const source = readFileSync(path, 'utf8');
    assert.ok(
      /excludingFrozenPaths|frozenWorkspacePaths|activeWorkspacePaths|activeWorkspaceNames/.test(
        source,
      ),
      `${scanner} lifecycle filtresi taşımıyor — frozen kaynak rutin taramaya döner`,
    );
  }
});
