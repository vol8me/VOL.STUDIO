import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/*
 * Boyut/subset kararı (UI-07.3): yazı tipleri alt kümelenmez ve WOFF2'ye çevrilmez. Ölçüm (fonttools, Latin+Latin-Ext+Türkçe
 * alt kümesi): TTF 865 KB → WOFF2 295 KB (−%66) → alt kümeli WOFF2 144 KB (−%83); ama hedefler (Tauri Windows/Linux, Android)
 * varlığı yerel ve sıkıştırılmış paketler, alt küme Kiril/Yunan/Vietnam kapsamını sessizce düşürür. Bütçe bu kararı tutar:
 * yeni veya büyüyen yazı tipi eşiği aşarsa karar yeniden açılır (docs/ui/VERIFICATION.md "Yazı tipi boyutu ve yedek").
 */
test('yazı tipi dosyaları boyut bütçesi içindedir (toplam ≤ 900 KB, dosya başına ≤ 320 KB)', () => {
  let total = 0;
  for (const name of FONT_FILES) {
    const size = statSync(resolve(ROOT, 'core/public/assets/fonts', name)).size;
    assert.ok(size <= 320_000, `${name}: ${size} bayt > 320 KB`);
    total += size;
  }
  assert.ok(total <= 900_000, `toplam ${total} bayt > 900 KB`);
});

test('alt kümeleme kararı kapsamı korur: Exo 2 Kiril, Jura Yunan harfi taşır', () => {
  const exo = glyphSet(resolve(ROOT, 'core/public/assets/fonts', 'Exo2[wght].ttf'));
  const jura = glyphSet(resolve(ROOT, 'core/public/assets/fonts', 'Jura[wght].ttf'));
  assert.ok(exo.has('Ж'.codePointAt(0)), 'Exo 2: Kiril yok');
  assert.ok(jura.has('Σ'.codePointAt(0)), 'Jura: Yunan yok');
});
