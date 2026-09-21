import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  diffTypeSurfaces,
  loadCoreTypeSurfaceSnapshot,
  validateCoreTypeSurface,
} from '../publicTypeSurface.mjs';

const root = resolve(import.meta.dirname, '../../..');

test('CORE runtime ve type-only export isimleri exact type yüzeyinde kalır', () => {
  assert.deepEqual(validateCoreTypeSurface(root), []);
});

test('type yüzeyi hash sapması sessizce geçmez ve teşhis diffi sağlar', () => {
  const problems = validateCoreTypeSurface(root, 'yanlış');
  assert.match(problems[0], /type-level public yüzeyi değişti/);
});

test('diffTypeSurfaces eklenen ve kaldırılan sembolleri tam teşhis eder', () => {
  const expected = ['Alpha', 'Beta', 'Gamma'];
  const actual = ['Beta', 'Delta', 'Epsilon'];
  const diff = diffTypeSurfaces(expected, actual);
  assert.deepEqual(diff.added, ['Delta', 'Epsilon']);
  assert.deepEqual(diff.removed, ['Alpha', 'Gamma']);
});

test('loadCoreTypeSurfaceSnapshot geçerli ve sıralı sembol listesi döndürür', () => {
  const list = loadCoreTypeSurfaceSnapshot(root);
  assert.equal(Array.isArray(list), true);
  assert.ok(list.length > 500);
  const sorted = [...list].sort();
  assert.deepEqual(list, sorted);
});
