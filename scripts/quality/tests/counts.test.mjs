import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSkipBudget,
  describeCounts,
  formatCounts,
  parseCounts,
  totalCounts,
} from '../counts.mjs';
import { summarizeOutcomes } from '../countsReporter.mjs';

const row = (key, skipped, passed = 10) => ({ key, passed, skipped, failed: 0, flaky: 0 });

test('işaret satırı gidiş-dönüşte aynı kalır ve aynı anahtarın son değeri alınır', () => {
  const output = [
    'çalışıyor…',
    formatCounts(row('vol-showcase/webkit/main', 16)),
    `  ${formatCounts(row('vol-showcase/chromium/main', 1))}`,
    formatCounts(row('vol-showcase/webkit/main', 17)),
  ].join('\n');
  assert.deepEqual(parseCounts(output), [
    row('vol-showcase/webkit/main', 17),
    row('vol-showcase/chromium/main', 1),
  ]);
});

test('bozuk ya da eksik alanlı işaret yok sayılır', () => {
  const output = [
    '##counts:{bozuk',
    '##counts:{"key":"a","passed":-1,"skipped":0,"failed":0,"flaky":0}',
    '##counts:{"key":"","passed":1,"skipped":0,"failed":0,"flaky":0}',
    '##counts:{"key":"b","passed":1,"skipped":"x","failed":0,"flaky":0}',
  ].join('\n');
  assert.deepEqual(parseCounts(output), []);
});

test('node --test TAP özeti yalnız işaret yokken ve anahtarla okunur', () => {
  const tap = [
    'ok 1 - x',
    '# tests 561',
    '# suites 40',
    '# pass 559',
    '# fail 0',
    '# cancelled 0',
    '# skipped 2',
    '# todo 0',
    '',
  ].join('\n');
  assert.deepEqual(parseCounts(tap, { fallbackKey: 'node-test' }), [
    { key: 'node-test', passed: 559, skipped: 2, failed: 0, flaky: 0 },
  ]);
  assert.deepEqual(parseCounts(tap), []);
  assert.deepEqual(
    parseCounts(`${formatCounts(row('k', 0))}\n${tap}`, { fallbackKey: 'node-test' }),
    [row('k', 0)],
  );
  assert.deepEqual(parseCounts('# tests 3\n# pass 3\n', { fallbackKey: 'x' }), []);
});

test('bütçeyi aşan, bütçesiz ve okunamayan anahtar ayrı ayrı bildirilir', () => {
  const problems = checkSkipBudget([row('a', 3), row('b', 1), row('c', 0)], { a: 3, c: 0, d: 1 }, [
    'a',
    'c',
    'd',
  ]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^b: 1 atlama, bütçe 0 \(anahtar bütçede yok\)/);
  assert.match(problems[1], /^d: bütçesi var ama sayım okunamadı/);
  assert.deepEqual(checkSkipBudget([row('a', 3)], { a: 3 }, ['a']), []);
  assert.deepEqual(checkSkipBudget([], { a: 3 }, []), []);
});

test('kısa sayım metni toplamı gösterir ve sıfır alanları saklar', () => {
  assert.equal(describeCounts([]), '');
  assert.equal(describeCounts([row('a', 0, 4)]), '4 geçti');
  const rows = [
    { key: 'a', passed: 4, skipped: 1, failed: 0, flaky: 1 },
    { key: 'b', passed: 6, skipped: 2, failed: 1, flaky: 0 },
  ];
  assert.deepEqual(totalCounts(rows), { passed: 10, skipped: 3, failed: 1, flaky: 1 });
  assert.equal(describeCounts(rows), '10 geçti, 3 atlandı, 1 kararsız, 1 düştü');
});

test('Playwright çıktıları proje ve şerit anahtarına göre sayılır', () => {
  const fake = (project, outcome) => ({
    outcome: () => outcome,
    parent: { project: () => (project ? { name: project } : undefined) },
  });
  const tests = [
    fake('webkit', 'expected'),
    fake('webkit', 'skipped'),
    fake('webkit', 'skipped'),
    fake('chromium', 'unexpected'),
    fake('chromium', 'flaky'),
    fake('chromium', 'expected'),
    fake(undefined, 'expected'),
  ];
  assert.deepEqual(summarizeOutcomes(tests, { scope: 'vol-showcase', lane: 'quiet' }), [
    { key: 'vol-showcase/chromium/quiet', passed: 1, skipped: 0, failed: 1, flaky: 1 },
    { key: 'vol-showcase/default/quiet', passed: 1, skipped: 0, failed: 0, flaky: 0 },
    { key: 'vol-showcase/webkit/quiet', passed: 1, skipped: 2, failed: 0, flaky: 0 },
  ]);
  assert.equal(
    summarizeOutcomes([fake('webkit', 'expected')], { scope: 'vol-test' })[0].key,
    'vol-test/webkit',
  );
});
