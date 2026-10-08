import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { FONT_FILES, glyphSet, missingGlyphs } from '../fontCoverage.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');

test('gönderilen yazı tipleri Türkçe harfleri, rakamları ve para birimlerini taşır', () => {
  for (const name of FONT_FILES) {
    const set = glyphSet(resolve(ROOT, 'core/public/assets/fonts', name));
    for (const character of 'ÇĞİıÖŞÜçğöşü0123456789₺€$') {
      assert.ok(set.has(character.codePointAt(0)), `${name}: ${character} yok`);
    }
  }
});

test('ok ve üçgen glifleri yazı tiplerinde yoktur (bu yüzden metinde kullanılamaz)', () => {
  const set = glyphSet(resolve(ROOT, 'core/public/assets/fonts', FONT_FILES[0]));
  for (const character of '→←↑↓▸▾▲▼') assert.equal(set.has(character.codePointAt(0)), false);
});

test('yerel metinlerdeki her karakter gönderilen bir yazı tipinde vardır (sistem yedeğine düşmez)', () => {
  assert.deepEqual(missingGlyphs(ROOT), {});
});

test('eksik glif denetimi sahte yerel dosyada bulgu verir', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vol-font-coverage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'x.json'), JSON.stringify({ a: 'Sağ → ▾ düğme' }));
  assert.deepEqual(missingGlyphs(dir, FONT_FILES, ['x.json'], ROOT), { 'x.json': ['→', '▾'] });
});
