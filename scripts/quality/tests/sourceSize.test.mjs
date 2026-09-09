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

test('sınırı aşan dosya reddedilir', (t) => {
  const root = repo(t, { 'src/big.ts': 200 });
  const problems = validateSourceSize(root, {}, 100);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sert sınır/);
  assert.match(problems[0], /src\/big\.ts/);
});

/*
 * Muafiyet MEKANİZMASI duruyor ama üretimde haritası BOŞTUR; burada sınanan
 * şey mekanizmanın kendisi, kullanılan bir kaçış yolu değil.
 */
test('muafiyet haritası verildiğinde aşım geçer', (t) => {
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

/*
 * Testler bir dönem kapsam DIŞINDAYDI ("test dosyaları uzundur ve olmalıdır").
 * Pratikte bir test dosyası da birikir: `cards.test.ts` 1413 satıra çıkmıştı ve
 * içinde üç ayrı konu vardı. Aynı sebep, aynı sınır.
 */
test('TESTLER de kapsamdadır', (t) => {
  const root = repo(t, { 'tests/huge.test.ts': 900, 'src/x.ts': 10 });
  const problems = validateSourceSize(root, {}, 100);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /tests\/huge\.test\.ts/);
});

test('gerçek repoda hiçbir dosya sınırı AŞMAZ', () => {
  const problems = validateSourceSize(process.cwd());
  assert.deepEqual(problems, [], problems.join('\n'));
  /*
   * Muafiyet haritası BOŞ kalmalıdır. Bir girdi eklemek, kaldırılan gerekçe
   * modelini geri getirir ve eşiği yeniden anlamsızlaştırır.
   */
  assert.equal(Object.keys(ACKNOWLEDGED).length, 0, 'muafiyet listesi boş kalmalı');
  assert.equal(LINE_THRESHOLD, 1000, 'eşik doktrindeki satır sayısıyla aynı olmalı');
});
