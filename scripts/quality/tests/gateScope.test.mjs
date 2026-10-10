import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { snapshotFiles } from '../gateCache.mjs';
import { deriveSharedInputs, readWorkspaceGraph, scopeInclude } from '../gateScope.mjs';

const root = resolve(import.meta.dirname, '../../..');

/** Tek aktif paketli (`p`) yapay bir depo grafiği. */
function graphOf(...names) {
  const packages = new Map(
    names.map((name) => [
      `@volstudio/${name}`,
      { name: `@volstudio/${name}`, dir: name, active: true, deps: [], scripts: {} },
    ]),
  );
  return { packages, allDirs: names, activeDirs: names };
}

/** Bellekteki dosya sistemi: `sources` yol → metin. */
function derive(sources, names = ['p']) {
  const graph = graphOf(...names);
  const files = Object.keys(sources);
  const read = (_root, path) => sources[path] ?? null;
  return deriveSharedInputs('/yok', graph, files, read);
}

const derived = (sources) => [...derive(sources).get('@volstudio/p')].sort();

test('paketin içe aktardığı betik ve onun geçişli göreli başvuruları türetilir', () => {
  assert.deepEqual(
    derived({
      'p/vitest.config.ts': "import { a } from '../scripts/vite/a.mjs';",
      'scripts/vite/a.mjs': "import { b } from './b.mjs'; import { c } from '../quality/c.mjs';",
      'scripts/vite/b.mjs': 'export const b = 1;',
      'scripts/quality/c.mjs': 'export const c = 1;',
      'scripts/quality/gate.mjs': "import './c.mjs';",
    }),
    ['scripts/quality/c.mjs', 'scripts/vite/a.mjs', 'scripts/vite/b.mjs'],
    'başvurulmayan gate.mjs kapsama girmez',
  );
});

test('yalnız yorumda geçen yol sabiti kapsamı şişirmez, tip import’u kalır', () => {
  assert.deepEqual(
    derived({
      'p/vitest.config.ts': "import '../scripts/vite/a.mjs';",
      'scripts/vite/a.mjs': [
        '/**',
        " * Bkz. 'scripts/quality/cli/ağır.mjs' ve `../quality/yorum.mjs`.",
        " * @type {import('../quality/tip.mjs').Tip}",
        ' */',
        '// ve "scripts/quality/baska.mjs"',
        'export const a = 1;',
      ].join('\n'),
      'scripts/quality/cli/ağır.mjs': '',
      'scripts/quality/yorum.mjs': '',
      'scripts/quality/tip.mjs': '',
      'scripts/quality/baska.mjs': '',
    }),
    ['scripts/quality/tip.mjs', 'scripts/vite/a.mjs'],
  );
});

test('parça parça kurulan ve şablonla kurulan betik yolları yakalanır', () => {
  assert.deepEqual(
    derived({
      'p/a.mjs': "execFileSync('node', [join(ROOT, 'scripts', 'linux', 'build.mjs')]);",
      'p/b.mjs': 'const path = `${ROOT}/scripts/quality/tool.mjs`;',
      'scripts/linux/build.mjs': '',
      'scripts/quality/tool.mjs': '',
      'scripts/quality/baska.mjs': '',
    }),
    ['scripts/linux/build.mjs', 'scripts/quality/tool.mjs'],
  );
});

test('değişken parçalı yol dizinin tamamını kapsar (eksik değil fazla kapsar)', () => {
  assert.deepEqual(
    derived({
      'p/a.mjs': "join(ROOT, 'scripts', name)",
      'scripts/linux/build.mjs': '',
      'scripts/quality/tool.mjs': '',
    }),
    ['scripts/linux/build.mjs', 'scripts/quality/tool.mjs'],
  );
});

test('dizin başvurusu yalnız paket dosyasından gelirse dizini kapsar', () => {
  assert.deepEqual(
    derived({
      'p/a.mjs': "const dir = resolve(here, '../scripts/linux');",
      'scripts/linux/build.mjs': "const up = '..';",
      'scripts/linux/targets.mjs': '',
      'scripts/quality/baska.mjs': '',
    }),
    ['scripts/linux/build.mjs', 'scripts/linux/targets.mjs'],
    'betiğin kendi içindeki ".." dizin okuması sayılmaz',
  );
});

test('paketin kendi iç scripts/ dizini ve çözülemeyen başvuru kapsamı değiştirmez', () => {
  assert.deepEqual(
    derived({
      'p/t.test.ts': "join(PACKAGE, 'scripts/audio-job.ts'); import '../../yok/yok.mjs';",
      'p/scripts/audio-job.ts': '',
      'scripts/quality/baska.mjs': '',
    }),
    [],
  );
});

test('türetme her paket için ayrı yapılır', () => {
  const sources = {
    'p/a.mjs': "import '../scripts/vite/a.mjs';",
    'q/b.mjs': "import '../scripts/vite/b.mjs';",
    'scripts/vite/a.mjs': '',
    'scripts/vite/b.mjs': '',
  };
  const result = derive(sources, ['p', 'q']);
  assert.deepEqual([...result.get('@volstudio/p')], ['scripts/vite/a.mjs']);
  assert.deepEqual([...result.get('@volstudio/q')], ['scripts/vite/b.mjs']);
});

test('closure kapsamı: paket + türetilen betikler + kök yapılandırma; başka betik ve belge hayır', () => {
  const graph = graphOf('p', 'q');
  const shared = new Map([['@volstudio/p', new Set(['scripts/vite/a.mjs'])]]);
  const include = scopeInclude(graph, { kind: 'closure', package: '@volstudio/p' }, shared);
  assert.equal(include('p/src/x.ts'), true);
  assert.equal(include('q/src/x.ts'), false, 'ilgisiz paket');
  assert.equal(include('scripts/vite/a.mjs'), true, 'türetilen betik');
  assert.equal(include('scripts/quality/gate.mjs'), false, 'başvurulmayan betik');
  assert.equal(include('pnpm-lock.yaml'), true);
  assert.equal(include('eslint.config.mjs'), true);
  assert.equal(include('docs/gates.md'), false);
  assert.equal(include('README.md'), false);
});

test('crate kapsamı: crate + path bağımlılıkları + Cargo kökü; JS yapılandırması hayır', () => {
  const graph = graphOf('p');
  const include = scopeInclude(graph, { kind: 'crate', dirs: ['p/src-tauri', 'plugins/x'] });
  assert.equal(include('p/src-tauri/src/lib.rs'), true);
  assert.equal(include('plugins/x/Cargo.toml'), true);
  assert.equal(include('Cargo.lock'), true);
  assert.equal(include('rust-toolchain.toml'), true);
  assert.equal(include('.cargo/config.toml'), true);
  assert.equal(include('p/src/x.ts'), false, 'aynı paketin TypeScript kaynağı Rust’ı etkilemez');
  assert.equal(include('eslint.config.mjs'), false);
  assert.equal(include('scripts/quality/gate.mjs'), false);
  assert.throws(() => scopeInclude(graph, { kind: 'yok' }), /Bilinmeyen kapsam/);
});

test('gerçek depo: türetilen betik kümeleri dardır ve bilinen bağımlılıkları içerir', () => {
  const graph = readWorkspaceGraph(root);
  const files = [...snapshotFiles(root).keys()];
  const result = deriveSharedInputs(root, graph, files);
  const scripts = files.filter((path) => path.startsWith('scripts/')).length;

  const voltest = result.get('@volstudio/vol-test');
  assert.ok(voltest.has('scripts/vite/audioBankRuntime.mjs'));
  assert.ok(voltest.has('scripts/vite/coreAliases.mjs'));
  assert.ok(voltest.has('scripts/quality/config.mjs'), 'vitest.config → kalite yapılandırması');

  const deck = result.get('@volstudio/deck');
  assert.ok(deck.has('scripts/linux/build-steamrt4.mjs'), 'deck.mjs yolu parça parça kurar');

  for (const [name, set] of result) {
    assert.ok(
      set.size < scripts / 4,
      `${name}: ${set.size}/${scripts} betik; türetme betik ağacının büyük kısmını çekiyor`,
    );
    assert.ok(!set.has('scripts/quality/gate.mjs'), `${name}: kapı koşucusu paket girdisi değil`);
  }
});
