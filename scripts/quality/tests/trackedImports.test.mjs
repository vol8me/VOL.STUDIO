import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validateTrackedImports } from '../trackedImports.mjs';
import { sourceImports } from '../sourceImports.mjs';

test('import keşfi yorumları atlar; export, require ve sabit template importunu kapsar', () => {
  assert.deepEqual(
    sourceImports(
      [
        '// import "./hayalet.ts";',
        'const text = "from \'./yanlis.ts\'";',
        'export { a } from "./a.js";',
        'import("./b.ts");',
        'import(`./c.ts`);',
        'require("./d.cjs");',
      ].join('\n'),
      'fixture.ts',
    ),
    ['./a.js', './b.ts', './c.ts', './d.cjs'],
  );
});

test('ignore edilen build yardımcısı temiz klonun girdisi sayılamaz', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  write('.gitignore', 'build/\n');
  write('vite.config.ts', 'import { helper } from "./scripts/build/helper.mjs";');
  write('scripts/build/helper.mjs', 'export const helper = 1;');
  assert.match(validateTrackedImports(root).join('\n'), /git dışında: scripts\/build\/helper.mjs/);
  write('vite.config.ts', 'import { helper } from "./scripts/vite/helper.mjs";');
  write('scripts/vite/helper.mjs', 'export const helper = 1;');
  assert.deepEqual(validateTrackedImports(root), []);
  rmSync(join(root, 'scripts/vite/helper.mjs'));
  assert.match(validateTrackedImports(root).join('\n'), /dosya yok/);
});

test('NodeNext .js importu kaynak .ts dosyasına çözülür', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-nodenext-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, 'a.ts'), 'import "./b.js";');
  writeFileSync(join(root, 'b.ts'), 'export {};');
  assert.deepEqual(validateTrackedImports(root), []);
});
