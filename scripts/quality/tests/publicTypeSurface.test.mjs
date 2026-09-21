import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { validateCoreTypeSurface } from '../publicTypeSurface.mjs';

const root = resolve(import.meta.dirname, '../../..');

test('CORE runtime ve type-only export isimleri exact type yüzeyinde kalır', () => {
  assert.deepEqual(validateCoreTypeSurface(root), []);
});

test('type yüzeyi hash sapması sessizce geçmez', () => {
  assert.match(validateCoreTypeSurface(root, 'yanlış')[0], /type-level public yüzeyi değişti/);
});
