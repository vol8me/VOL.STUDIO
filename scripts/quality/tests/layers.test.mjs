import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validateLayerBoundaries } from '../layers.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-layers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  for (const [dir, name] of [
    ['core', 'core'],
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
