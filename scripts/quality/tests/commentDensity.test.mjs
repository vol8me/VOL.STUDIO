import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { validateCommentDensity, ACKNOWLEDGED, DENSITY_THRESHOLD } from '../commentDensity.mjs';

/** `comment` yorum, `code` kod satırı olan bir dosya kurar. */
function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-density-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, { comment, code }] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), '// y\n'.repeat(comment) + 'const x = 1;\n'.repeat(code));
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

test('gerçek repoda her aşım GEREKÇELİ', () => {
  const problems = validateCommentDensity(process.cwd());
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(Object.keys(ACKNOWLEDGED).length > 0, 'liste boşsa tarama anlamsızdır');
  assert.equal(DENSITY_THRESHOLD, 0.4, 'eşik AGENTS.md doktriniyle aynı olmalı');
});
