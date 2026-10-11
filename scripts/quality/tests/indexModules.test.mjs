import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { executableStatements, validateIndexModules } from '../indexModules.mjs';

function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-index-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const noFrozen = { schemaVersion: 1, workspaces: [] };

test('yeniden dışa aktarım, import, tip ve declare çalıştırılabilir sayılmaz', () => {
  const text = [
    "import type { A } from './a';",
    "import { b } from './b';",
    "export * from './c';",
    "export { b } from './b';",
    "export type { A } from './a';",
    'export { b as default };',
    'export type Alias = A | string;',
    'export interface Shape { size: number }',
    'declare const injected: string;',
    'declare module "x" { export const y: number }',
    'export default b;',
  ].join('\n');
  assert.deepEqual(executableStatements('a/src/index.ts', text), []);
});

test('işlev, sabit, sınıf, enum ve ifade çalıştırılabilir sayılır ve satırı söylenir', () => {
  const text = [
    "export * from './c';",
    'export function find() { return 1; }',
    'export const ALL = { a: 1 };',
    'class K {}',
    'enum E { A }',
    'console.log("yan etki");',
  ].join('\n');
  assert.deepEqual(
    executableStatements('a/src/index.ts', text).map(({ line, kind }) => [line, kind]),
    [
      [2, 'FunctionDeclaration'],
      [3, 'FirstStatement'],
      [4, 'ClassDeclaration'],
      [5, 'EnumDeclaration'],
      [6, 'ExpressionStatement'],
    ],
  );
});

test('src altındaki her index.ts denetlenir; mantık taşıyanı dosya ve satırla reddedilir', (t) => {
  const root = repo(t, {
    'pkg/src/index.ts': "export * from './a';\n",
    'pkg/src/deep/index.ts': "export { x } from './x';\nexport function y() {}\n",
    'pkg/src/a.ts': 'export const a = 1;\n',
    'pkg/tests/index.ts': 'export const fine = 1;\n',
    'pkg/src/notindex.ts': 'export function z() {}\n',
  });
  const problems = validateIndexModules(root, noFrozen);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^pkg\/src\/deep\/index\.ts:2:/);
  assert.match(problems[0], /FunctionDeclaration/);
  assert.match(problems[0], /ayrı dosyaya taşıyın/);
});

test('izlenmeyen ama yok sayılmayan yeni index.ts de denetlenir', (t) => {
  const root = repo(t, { 'pkg/src/a.ts': 'export const a = 1;\n' });
  mkdirSync(join(root, 'pkg/src/new'), { recursive: true });
  writeFileSync(join(root, 'pkg/src/new/index.ts'), 'export const x = 1;\n');
  assert.equal(validateIndexModules(root, noFrozen).length, 1);
});

test('temiz ağaçta sorun yoktur', (t) => {
  const root = repo(t, { 'pkg/src/index.ts': "export * from './a';\n", 'pkg/src/a.ts': '' });
  assert.deepEqual(validateIndexModules(root, noFrozen), []);
});
