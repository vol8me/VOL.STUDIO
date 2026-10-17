import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { rootEntriesOf, validateRepoRootEntries, validateRootEntries } from '../rootEntries.mjs';

test('kök girdileri dosya yollarının ilk parçasından türer', () => {
  assert.deepEqual(rootEntriesOf(['a/b.ts', 'a/c.ts', 'README.md', 'd/e/f']), [
    'README.md',
    'a',
    'd',
  ]);
});

test('gerekçesiz girdi ve ölü kayıt reddedilir; isteğe bağlı girdi yok olabilir', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-root-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'README.md'), '');
  const allowed = {
    'README.md': 'giriş',
    gone: 'silinmiş',
    games: { reason: 'ürünler', optional: true },
  };
  const problems = validateRootEntries(['README.md', 'stray.txt'], root, allowed);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /stray.txt: kökte gerekçesiz/);
  assert.match(problems[1], /gone: .*ölü kayıt/);
});

test('gerçek depo kökü kilitli listeye uyar', () => {
  assert.deepEqual(validateRepoRootEntries(resolve(import.meta.dirname, '../../..')), []);
});
