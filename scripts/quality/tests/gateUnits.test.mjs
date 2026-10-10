import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { CONTRACT_SUITES, suiteEnvironment } from '../contractSuites.mjs';
import { STAGE_PLAN } from '../gatePlan.mjs';
import { readWorkspaceGraph } from '../gateScope.mjs';
import { crateDirectories, unitsFor } from '../gateUnits.mjs';
import { rustManifests } from '../rust.mjs';
import { buildActiveScriptCommand } from '../runActive.mjs';
import { listWorkspacePackages, loadWorkspaceLifecycle } from '../workspaceLifecycle.mjs';

const root = resolve(import.meta.dirname, '../../..');
const justfile = readFileSync(resolve(root, 'justfile'), 'utf8');
const graph = readWorkspaceGraph(root);
const ctx = { root, graph };
const read = (path) => readFileSync(join(root, path), 'utf8');

/** `just` tarifinin gövdesi: başlığın altındaki girintili satırlar. */
function recipeBody(name) {
  const lines = justfile.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${name}:`).test(line));
  assert.ok(start >= 0, `justfile'da ${name} tarifi yok`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !/^\s/.test(line)) break;
    if (line.trim() !== '') body.push(line.trim());
  }
  return body;
}

test('her birimli aşama için sağlayıcı vardır; birim kimlikleri aşama içinde tekildir', () => {
  for (const [stage, plan] of Object.entries(STAGE_PLAN)) {
    if (!plan.units) continue;
    const units = unitsFor(ctx, stage);
    assert.ok(units.length > 0, `${stage}: birim yok`);
    assert.equal(
      new Set(units.map((unit) => unit.unit)).size,
      units.length,
      `${stage}: kimlik çakışması`,
    );
    assert.equal(
      new Set(units.map((unit) => unit.label)).size,
      units.length,
      `${stage}: etiket çakışması`,
    );
    for (const unit of units) assert.ok(unit.unit, `${stage}: birimin kimliği yok`);
  }
  assert.throws(
    () => unitsFor(ctx, 'node-pin'),
    /bilinmeyen birim türü/,
    'birimsiz aşama sağlayıcıya gitmez',
  );
});

test('typecheck: paket birimleri runActive ile aynı paketlerdir, betik ağacı eklenir', () => {
  const recipe = recipeBody('typecheck');
  assert.deepEqual(recipe, [
    'node scripts/quality/runActive.mjs typecheck',
    'pnpm exec tsc -p scripts/tsconfig.json',
  ]);
  const lifecycle = loadWorkspaceLifecycle(resolve(root, 'workspace-lifecycle.json'));
  const expected = buildActiveScriptCommand(
    lifecycle,
    listWorkspacePackages(root),
    'typecheck',
  ).packages;

  const units = unitsFor(ctx, 'typecheck');
  const packages = units.filter((unit) => unit.unit !== 'scripts').map((unit) => unit.unit);
  assert.deepEqual(packages.sort(), [...expected].sort());
  const scripts = units.find((unit) => unit.unit === 'scripts');
  assert.deepEqual(scripts.args, ['exec', 'tsc', '-p', 'scripts/tsconfig.json']);
  assert.equal(scripts.scope.kind, 'code', 'betik tsconfig’i başka dizinlere uzanabilir');
});

test('lint: paket birimleri ve rest, `eslint .` ile aynı dosya kümesini böler', () => {
  assert.deepEqual(recipeBody('lint'), ['pnpm lint']);
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.scripts.lint, 'eslint .', 'bölme `eslint .` varsayımına dayanır');

  const units = unitsFor(ctx, 'lint');
  const activeDirs = [...graph.packages.values()].filter((pkg) => pkg.active).map((pkg) => pkg.dir);
  const perPackage = units.filter((unit) => unit.unit !== 'rest');
  assert.deepEqual(
    perPackage.map((unit) => unit.args.at(-1)).sort(),
    [...activeDirs].sort(),
    'her aktif paket dizini bir birimdir',
  );
  const rest = units.find((unit) => unit.unit === 'rest');
  assert.deepEqual(rest.args.slice(0, 3), ['exec', 'eslint', '.']);
  const ignored = rest.args.filter((_, index) => rest.args[index - 1] === '--ignore-pattern');
  assert.deepEqual(ignored.sort(), activeDirs.map((dir) => `${dir}/`).sort());
  assert.equal(rest.scope.kind, 'code');
  for (const unit of perPackage) {
    assert.equal(unit.scope.kind, 'closure', 'paket lint’i kapanışta kalır');
  }
});

test('contract: birimler takım tanımlarıdır ve tarif aynı betiği çağırır', () => {
  assert.deepEqual(recipeBody('contract'), ['node scripts/quality/contractSuites.mjs']);
  const units = unitsFor(ctx, 'contract');
  assert.deepEqual(
    units.map((unit) => unit.unit),
    Object.keys(CONTRACT_SUITES),
  );
  for (const unit of units) {
    assert.deepEqual(unit.args, ['scripts/quality/contractSuites.mjs', unit.unit]);
    assert.equal(unit.scope.kind, 'repo', 'bekçi testleri bütün repoyu okur');
  }
});

test('contract takımları kancanın GIT_* ortamını yalnız testler için siler', () => {
  const base = { GIT_DIR: '/x', GIT_INDEX_FILE: '/y', PATH: '/bin', KEEP: '1' };
  assert.deepEqual(suiteEnvironment(CONTRACT_SUITES['node-test'], base), {
    PATH: '/bin',
    KEEP: '1',
  });
  assert.equal(suiteEnvironment(CONTRACT_SUITES.cli, base), base);
});

test('rust: her aktif Cargo manifesti bir birimdir ve crate kapsamı yoldaşlarını içerir', () => {
  assert.deepEqual(recipeBody('rust'), ['node scripts/quality/rust.mjs']);
  const manifests = rustManifests(root);
  const units = unitsFor(ctx, 'rust');
  assert.deepEqual(
    units.map((unit) => unit.unit),
    manifests,
  );
  for (const unit of units) {
    assert.deepEqual(unit.args, ['scripts/quality/rust.mjs', '--manifest', unit.unit]);
    assert.ok(unit.scope.dirs.includes(dirname(unit.unit)), `${unit.unit}: kendi dizini`);
  }
  const game = units.find((unit) => unit.unit === 'games/vol-test/src-tauri/Cargo.toml');
  for (const dependency of [
    'tauri-v2/src-tauri',
    'tauri-v2/plugins/vol-steamworks',
    'tauri-v2/plugins/vol-haptics',
  ]) {
    assert.ok(game.scope.dirs.includes(dependency), `vol-test → ${dependency} path bağımlılığı`);
  }
  const plugin = units.find((unit) => unit.unit === 'tauri-v2/plugins/vol-haptics/Cargo.toml');
  assert.ok(!plugin.scope.dirs.includes('games/vol-test/src-tauri'), 'bağımlılık tek yönlüdür');
});

test('crateDirectories: geçişli path bağımlılığı, kök path bağımlılığı, yerel ön yüz dizini', () => {
  const files = {
    'Cargo.toml': '[workspace.dependencies]\nortak = { path = "ortak" }\n',
    'app/src-tauri/Cargo.toml': '[dependencies]\na = { path = "../../libs/a" }\nserde = "1"\n',
    'libs/a/Cargo.toml': '[dependencies]\nb = { path = "../b" }\n',
    'libs/b/Cargo.toml': '[package]\n',
    'app/src-tauri/tauri.conf.json': JSON.stringify({ build: { frontendDist: '../web' } }),
  };
  const reader = (path) => {
    if (!(path in files)) throw new Error('yok');
    return files[path];
  };
  assert.deepEqual(crateDirectories('app/src-tauri/Cargo.toml', reader), [
    'app/src-tauri',
    'app/web',
    'libs/a',
    'libs/b',
    'ortak',
  ]);
  files['app/src-tauri/tauri.conf.json'] = JSON.stringify({
    build: { frontendDist: 'https://example.test' },
  });
  assert.ok(!crateDirectories('app/src-tauri/Cargo.toml', reader).includes('app/src-tauri/https:'));
});

test('crate kapsamı dışına uzanan derleme okuması yoktur (gizli bağımlılık bekçisi)', () => {
  /*
   * Bir crate'in derlemesi dizini dışındaki dosyayı gömüyor ya da okuyorsa, o dosya
   * değişince crate makbuzu sessizce eski kalırdı. `include_*!` yolları dosyaya göre,
   * `tauri.conf.json` yolları crate dizinine göre çözülür; hepsi kapsamda olmalıdır.
   */
  const SOURCE_FILES = /\.(?:rs|toml|json)$/;
  const SKIPPED = new Set(['target', 'node_modules', 'gen', 'dist']);
  const walk = (directory) =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      if (SKIPPED.has(entry.name)) return [];
      const path = posix.join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : SOURCE_FILES.test(entry.name) ? [path] : [];
    });

  for (const unit of unitsFor(ctx, 'rust')) {
    const crateDir = dirname(unit.unit);
    const inScope = (path) =>
      unit.scope.dirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
    for (const file of walk(crateDir)) {
      const text = read(file);
      for (const match of text.matchAll(/include(?:_str|_bytes)?!\(\s*"([^"]+)"/g)) {
        const target = posix.normalize(posix.join(dirname(file), match[1]));
        assert.ok(inScope(target), `${file}: include → ${target} crate kapsamı dışında`);
      }
      if (file.endsWith('tauri.conf.json') && file === `${crateDir}/tauri.conf.json`) {
        const bundle = JSON.parse(text).bundle ?? {};
        const paths = [...(bundle.resources ?? []), ...(bundle.icon ?? [])];
        for (const entry of paths.filter((value) => typeof value === 'string')) {
          const target = posix.normalize(posix.join(crateDir, entry));
          assert.ok(inScope(target), `${file}: ${entry} → ${target} crate kapsamı dışında`);
        }
      }
    }
  }
});
