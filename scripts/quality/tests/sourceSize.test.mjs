import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { validateSourceSize, ACKNOWLEDGED, LINE_THRESHOLD } from '../sourceSize.mjs';

function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-size-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, lines] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), 'x\n'.repeat(lines));
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('eşiğin altındaki dosya gerekçe İSTEMEZ', (t) => {
  const root = repo(t, { 'src/small.ts': 10 });
  assert.deepEqual(validateSourceSize(root, {}, 100), []);
});

test('gerekçesiz aşım reddedilir', (t) => {
  const root = repo(t, { 'src/big.ts': 200 });
  const problems = validateSourceSize(root, {}, 100);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /gerekçesi YOK/);
  assert.match(problems[0], /src\/big\.ts/);
});

test('gerekçeli aşım geçer', (t) => {
  const root = repo(t, { 'src/big.ts': 200 });
  assert.deepEqual(validateSourceSize(root, { 'src/big.ts': 'sebep' }, 100), []);
});

test('dosya küçüldüğünde ÖLÜ gerekçe bildirilir', (t) => {
  /*
   * Muafiyet listesi çöplüğe dönmesin: bölme işi yapıldığında girdinin de
   * kalkması gerekir, yoksa liste gerçeği anlatmaz.
   */
  const root = repo(t, { 'src/big.ts': 10 });
  const problems = validateSourceSize(root, { 'src/big.ts': 'sebep' }, 100);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ölü muafiyet/);
});

test('TESTLER eşik dışıdır', (t) => {
  /* Test dosyaları uzundur ve olmalıdır; sınanan şey üretim kodunun sınırıdır. */
  const root = repo(t, { 'tests/huge.test.ts': 900, 'src/x.ts': 10 });
  assert.deepEqual(validateSourceSize(root, {}, 100), []);
});

test('gerçek repoda her aşım GEREKÇELİ', () => {
  const problems = validateSourceSize(process.cwd());
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(Object.keys(ACKNOWLEDGED).length > 0, 'liste boşsa tarama anlamsızdır');
  assert.equal(LINE_THRESHOLD, 600, 'eşik AGENTS.md doktriniyle aynı olmalı');
});
