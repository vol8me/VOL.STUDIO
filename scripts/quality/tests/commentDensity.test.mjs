import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import {
  validateCommentDensity,
  ACKNOWLEDGED,
  DENSITY_THRESHOLD,
  MAX_BLOCK_LINES,
} from '../commentDensity.mjs';

/**
 * `comment` yorum, `code` kod satırı olan bir dosya kurar.
 *
 * Yorumlar `run` uzunluğunda öbekler hâlinde serpiştirilir (varsayılan 4):
 * ORAN kuralı ile BLOK kuralı bağımsızdır ve bir fixture yalnız sınadığı
 * kuralı tetiklemelidir.
 */
function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-density-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, { comment, code, run = 4 }] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    const lines = [];
    let left = comment;
    let codeLeft = code;
    while (left > 0 || codeLeft > 0) {
      for (let i = 0; i < run && left > 0; i++, left--) lines.push('// y');
      if (codeLeft > 0) {
        lines.push('const x = 1;');
        codeLeft--;
      } else if (left === 0) break;
    }
    writeFileSync(join(root, path), lines.join('\n') + '\n');
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('seyrek dosya gerekçe İSTEMEZ', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 10, code: 90 } });
  assert.deepEqual(validateCommentDensity(root, {}, 0.4), []);
});

test('gerekçesiz yoğunluk reddedilir', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 60, code: 40 } });
  const problems = validateCommentDensity(root, {}, 0.4);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /gerekçesi YOK/);
  const reported = Number(/yorum oranı %(\d+)/.exec(problems[0])?.[1]);
  assert.ok(reported > 40, `bildirilen oran eşiğin üstünde olmalı, geldi: %${reported}`);
});

test('gerekçeli yoğunluk geçer', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 60, code: 40 } });
  assert.deepEqual(validateCommentDensity(root, { 'src/a.ts': 'tip bildirimi' }, 0.4), []);
});

test('dosya seyreldiğinde ÖLÜ gerekçe bildirilir', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 5, code: 95 } });
  const problems = validateCommentDensity(root, { 'src/a.ts': 'artık geçersiz' }, 0.4);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ölü muafiyet/);
});

test('KISA dosya ölçülmez — tek blok oranı uçurur', (t) => {
  /* 20 satırlık bir dosyada tek bir 10 satırlık blok %50 verir; bilgi değil gürültüdür. */
  const root = repo(t, { 'src/a.ts': { comment: 15, code: 5 } });
  assert.deepEqual(validateCommentDensity(root, {}, 0.4), []);
});

test('TESTLER ölçüm dışıdır', (t) => {
  const root = repo(t, { 'tests/a.test.ts': { comment: 80, code: 20 } });
  assert.deepEqual(validateCommentDensity(root, {}, 0.4), []);
});

test('UZUN tek blok, oran düşük olsa bile reddedilir', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 40, code: 400, run: 40 } });
  const problems = validateCommentDensity(root, {}, 0.4);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /40 satırlık tek yorum bloğu/);
});

test('eşiğin ALTINDAKİ blok geçer', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 24, code: 400, run: 24 } });
  assert.deepEqual(validateCommentDensity(root, {}, 0.4), []);
});

test('blok kuralı GEREKÇEYLE susturulamaz — muafiyet yalnız orana bakar', (t) => {
  const root = repo(t, { 'src/a.ts': { comment: 40, code: 400, run: 40 } });
  const problems = validateCommentDensity(root, { 'src/a.ts': 'tip bildirimi' }, 0.4);
  assert.equal(problems.length, 2, 'uzun blok + ölü oran gerekçesi');
  assert.ok(problems.some((p) => /tek yorum bloğu/.test(p)));
});

test('gerçek repoda her aşım GEREKÇELİ', () => {
  const problems = validateCommentDensity(process.cwd());
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(Object.keys(ACKNOWLEDGED).length > 0, 'liste boşsa tarama anlamsızdır');
  assert.equal(DENSITY_THRESHOLD, 0.4, 'eşik doktrindeki oranla aynı olmalı');
  assert.equal(MAX_BLOCK_LINES, 24, 'blok eşiği doktrindeki uzunlukla aynı olmalı');
});
