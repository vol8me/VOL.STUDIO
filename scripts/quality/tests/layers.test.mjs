import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { exportViolation, validateLayerBoundaries } from '../layers.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-layers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  for (const [dir, name] of [
    ['core', 'core'],
    ['network', 'network'],
    ['games/demo', 'demo'],
    ['devtools/tool', 'tool'],
    ['devtools/other', 'other'],
  ]) {
    write(`${dir}/package.json`, JSON.stringify({ name: `@volstudio/${name}` }));
    write(`${dir}/src/index.ts`, 'export const value = 1;');
  }
  return { root, write };
}

for (const [file, source] of [
  ['games/demo/src/index.js', 'import(`@volstudio/tool`);'],
  ['games/demo/src/index.ts', 'import /* açıklama */ ("@volstudio/tool");'],
  ['devtools/tool/server/main.ts', 'import "@volstudio/demo";'],
  ['devtools/tool/scripts/main.mjs', 'import "@volstudio/other";'],
  ['network/src/index.ts', 'import "@volstudio/demo";'],
  ['core/src/index.ts', 'import "@volstudio/network";'],
  ['games/demo/server/index.ts', 'import "@volstudio/tool";'],
])
  test(`katman ihlali: ${file}`, (t) => {
    const { root, write } = fixture(t);
    assert.deepEqual(validateLayerBoundaries(root), []);
    write(file, source);
    assert.ok(validateLayerBoundaries(root).some((problem) => problem.includes(file)));
  });

test('tsconfig aliası tüketici sınırını delemez', (t) => {
  const { root, write } = fixture(t);
  write(
    'games/demo/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@hidden/*': ['../../devtools/tool/src/*'] },
      },
    }),
  );
  write('games/demo/src/index.ts', 'import { value } from "@hidden/index";');
  assert.match(validateLayerBoundaries(root).join('\n'), /@volstudio\/tool/);
});

test('oyun client kodu server Node kaynağına, oyun server kodu browser adapterına ulaşamaz', (t) => {
  const { root, write } = fixture(t);
  write('games/demo/src/main.ts', 'import "../server/WorldRoom";');
  write('games/demo/server/index.ts', 'import "@volstudio/network/client";');
  const issues = validateLayerBoundaries(root).join('\n');
  assert.match(issues, /oyun istemcisi Node sunucu kaynağını içe aktaramaz/);
  assert.match(issues, /Node sunucusu browser network istemcisini içe aktaramaz/);
});

test('manifest kenarları ve gerçek bağımlılık döngüsü görünürdür', (t) => {
  const { root, write } = fixture(t);
  write(
    'core/package.json',
    JSON.stringify({ name: '@volstudio/core', dependencies: { '@volstudio/tool': 'workspace:*' } }),
  );
  write(
    'devtools/tool/package.json',
    JSON.stringify({ name: '@volstudio/tool', dependencies: { '@volstudio/core': 'workspace:*' } }),
  );
  const problems = validateLayerBoundaries(root).join('\n');
  assert.match(problems, /CORE bir tüketici/);
  assert.match(problems, /döngü/);
});

test('build üreticisi devDependency olabilir; runtime sözleşmesine giremez', (t) => {
  const { root, write } = fixture(t);
  write(
    'games/demo/package.json',
    JSON.stringify({
      name: '@volstudio/demo',
      devDependencies: { '@volstudio/tool': 'workspace:*' },
    }),
  );
  assert.deepEqual(validateLayerBoundaries(root), []);
  write(
    'games/demo/package.json',
    JSON.stringify({ name: '@volstudio/demo', dependencies: { '@volstudio/tool': 'workspace:*' } }),
  );
  assert.match(validateLayerBoundaries(root).join('\n'), /package.json/);
});

test('yorum içindeki örnek import ihlal değildir', (t) => {
  const { root, write } = fixture(t);
  write('games/demo/src/index.ts', '// import "@volstudio/tool";\nexport {};');
  assert.deepEqual(validateLayerBoundaries(root), []);
});

test('başka pakete yalnız exports haritasındaki yoldan girilir', () => {
  const core = {
    name: '@volstudio/core',
    manifest: { exports: { '.': './a.ts', './ui': './ui.ts' } },
  };
  assert.equal(exportViolation('@volstudio/core', core), null);
  assert.equal(exportViolation('@volstudio/core/ui', core), null);
  assert.match(
    exportViolation('@volstudio/core/src/ui/Button', core) ?? '',
    /exports haritasında yok/,
  );
  assert.equal(exportViolation('@volstudio/core-extra', core), null);
  const closed = { name: '@volstudio/tool', manifest: {} };
  assert.match(exportViolation('@volstudio/tool', closed) ?? '', /dışarıya kapalıdır/);
});

test('oyun istemcisi network sunucu çalışma zamanını içe aktaramaz; oyun sunucusu aktarabilir', (t) => {
  const { root, write } = fixture(t);
  write(
    'network/package.json',
    JSON.stringify({
      name: '@volstudio/network',
      exports: { './server': './src/server/index.ts', './client': './src/client/index.ts' },
    }),
  );
  write('games/demo/server/index.ts', 'import "@volstudio/network/server";');
  assert.deepEqual(validateLayerBoundaries(root), []);
  write('games/demo/src/main.ts', 'import "@volstudio/network/server";');
  assert.match(
    validateLayerBoundaries(root).join('\n'),
    /oyun istemcisi network sunucu çalışma zamanını ya da yük sürücüsünü içe aktaramaz/,
  );
  write('games/demo/src/main.ts', 'import "@volstudio/network/drive";');
  assert.match(
    validateLayerBoundaries(root).join('\n'),
    /oyun istemcisi network sunucu çalışma zamanını ya da yük sürücüsünü içe aktaramaz/,
  );
});

test('network yüzeyleri birbirine ve Node bağımlılığına yalnız izin verilen yönde uzanır', (t) => {
  const { root, write } = fixture(t);
  write('network/src/protocol/input.ts', 'export const v = 1;');
  write('network/src/client/room.ts', 'import "../protocol/input";\nimport "@colyseus/sdk";');
  write('network/src/server/host.ts', 'import "../protocol/input";\nimport "node:http";');
  write(
    'network/src/drive/fleet.ts',
    'import "../protocol/input";\nimport "../client/room";\nimport "node:fs";',
  );
  assert.deepEqual(validateLayerBoundaries(root), []);

  for (const [file, source, pattern] of [
    ['network/src/client/a.ts', 'import "../server/host";', /client kodu server kodunu/],
    ['network/src/client/b.ts', 'import "@volstudio/network/server";', /client kodu server kodunu/],
    ['network/src/server/c.ts', 'import "../client/room";', /server kodu client kodunu/],
    ['network/src/protocol/d.ts', 'import "../client/room";', /protocol kodu client kodunu/],
    ['network/src/protocol/e.ts', 'import "../server/host";', /protocol kodu server kodunu/],
    ['network/src/client/f.ts', 'import "node:fs";', /Node\/sunucu bağımlılığı/],
    ['network/src/client/g.ts', 'import "http";', /Node\/sunucu bağımlılığı/],
    ['network/src/client/h.ts', 'import "fs/promises";', /Node\/sunucu bağımlılığı/],
    ['network/src/protocol/i.ts', 'import "@colyseus/core";', /Node\/sunucu bağımlılığı/],
    ['network/src/client/j.ts', 'import "@colyseus/ws-transport";', /Node\/sunucu bağımlılığı/],
    ['network/src/drive/k.ts', 'import "../server/host";', /drive kodu server kodunu/],
    ['network/src/server/l.ts', 'import "../drive/fleet";', /server kodu drive kodunu/],
    ['network/src/client/m.ts', 'import "../drive/fleet";', /client kodu drive kodunu/],
    ['network/src/protocol/n.ts', 'import "../drive/fleet";', /protocol kodu drive kodunu/],
  ]) {
    write(file, source);
    assert.match(validateLayerBoundaries(root).join('\n'), pattern, file);
    rmSync(join(root, file));
  }
});
