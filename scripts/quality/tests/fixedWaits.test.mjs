import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  compareFixedWaits,
  countFixedWaits,
  measureFixedWaits,
  validateFixedWaits,
} from '../fixedWaits.mjs';

test('yalnız yorum olmayan waitForTimeout çağrıları sayılır', () => {
  const text = [
    'await page.waitForTimeout(300);',
    '  // await page.waitForTimeout(500);',
    ' * örnek: page.waitForTimeout(100)',
    'await a.waitForTimeout(1); await b.waitForTimeout(2);',
    'await page.waitForFunction(() => true);',
    'const waitForTimeoutBudget = 3;',
  ].join('\n');
  assert.equal(countFixedWaits(text), 3);
  assert.equal(countFixedWaits(''), 0);
});

test('artış, bütçesiz dosya ve unutulmuş bütçe ayrı ayrı bildirilir', () => {
  const problems = compareFixedWaits(
    { 'a/tests/x.spec.ts': 3, 'a/tests/new.spec.ts': 1, 'a/tests/same.spec.ts': 2 },
    { 'a/tests/x.spec.ts': 2, 'a/tests/same.spec.ts': 2, 'a/tests/gone.spec.ts': 4 },
  );
  assert.equal(problems.length, 3);
  assert.match(problems[0], /^a\/tests\/gone\.spec\.ts: 0 sabit bekleme kaldı, bütçe 4/);
  assert.match(
    problems[1],
    /^a\/tests\/new\.spec\.ts: 1 sabit bekleme \(waitForTimeout\), bütçe 0/,
  );
  assert.match(problems[2], /^a\/tests\/x\.spec\.ts: 3 sabit bekleme \(waitForTimeout\), bütçe 2/);
});

test('bütçe ölçümle eşitse sorun yoktur', () => {
  assert.deepEqual(compareFixedWaits({ a: 2 }, { a: 2 }), []);
  assert.deepEqual(compareFixedWaits({}, {}), []);
});

function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-waits-'));
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

test('yalnız tests dizinindeki izlenen ve izlenmeyen .ts dosyaları ölçülür', (t) => {
  const root = repo(t, {
    'pkg/tests/e2e/a.spec.ts': 'await page.waitForTimeout(100);\nawait page.waitForTimeout(200);\n',
    'pkg/src/ui.ts': 'await page.waitForTimeout(100);\n',
    'pkg/tests/e2e/clean.spec.ts': 'await page.waitForFunction(() => true);\n',
  });
  mkdirSync(join(root, 'pkg/tests/device'), { recursive: true });
  writeFileSync(join(root, 'pkg/tests/device/new.spec.ts'), 'await page.waitForTimeout(5);\n');
  assert.deepEqual(measureFixedWaits(root, noFrozen), {
    'pkg/tests/device/new.spec.ts': 1,
    'pkg/tests/e2e/a.spec.ts': 2,
  });
});

test('bütçe tanımsızsa denetim yoktur; tanımlıysa yeni bekleme düşer', (t) => {
  const root = repo(t, { 'pkg/tests/a.spec.ts': 'await page.waitForTimeout(100);\n' });
  assert.deepEqual(validateFixedWaits(root, undefined, noFrozen), []);
  assert.deepEqual(validateFixedWaits(root, { 'pkg/tests/a.spec.ts': 1 }, noFrozen), []);
  const problems = validateFixedWaits(root, {}, noFrozen);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^pkg\/tests\/a\.spec\.ts: 1 sabit bekleme/);
});
