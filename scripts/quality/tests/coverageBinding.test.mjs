import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateCoverageBinding } from '../coverageBinding.mjs';

test('eşik kaldırma, yanlış paket ve dolaylı override gerçek yüklemede reddedilir', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-coverage-binding-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = { lines: 89, statements: 89, branches: 84, functions: 91 };
  const configs = [
    [
      'valid',
      `const thresholds = ${JSON.stringify(
        expected,
      )}; export default { test: { coverage: { thresholds, include: ['src/**/*.ts'], exclude: [] } } };`,
      true,
    ],
    ['missing', 'export default { test: { coverage: {} } };', false],
    [
      'wrong',
      'const thresholds = {lines: 1}; export default { test: { coverage: { thresholds } } };',
      false,
    ],
    [
      'override',
      `const thresholds = ${JSON.stringify(
        expected,
      )}; export default { test: { coverage: { thresholds, ...{thresholds: undefined} } } };`,
      false,
    ],
    ['invalid', 'export default {', false],
  ];
  for (const [name, content, valid] of configs) {
    const path = join(root, `${name}.mts`);
    writeFileSync(path, content);
    const problems = await validateCoverageBinding(path, expected);
    assert.equal(problems.length === 0, valid, `${name}: ${problems}`);
  }
});

test('çalıştırılabilir kaynağı kapsamdan saklayan seçim reddedilir', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-coverage-selection-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = { lines: 80 };
  const path = join(root, 'hidden.mts');
  writeFileSync(
    path,
    `export default { test: { coverage: { thresholds: { lines: 80 }, include: ['src/**/*.ts'], exclude: ['src/runtime/**'] } } };`,
  );
  assert.match((await validateCoverageBinding(path, expected)).join('\n'), /coverage.exclude/);
  writeFileSync(
    path,
    `export default { test: { coverage: { thresholds: { lines: 80 }, include: ['tests/**/*.ts'], exclude: [] } } };`,
  );
  assert.match((await validateCoverageBinding(path, expected)).join('\n'), /coverage.include/);
});
