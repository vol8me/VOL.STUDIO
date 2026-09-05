import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { measureBundle, validateBundleSizes } from '../bundleSize.mjs';

/** Gerçek bir `dist` ağacı kurar; bekçi diskteki dosyaları ölçer, sahteyi değil. */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-bundle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const assets = join(root, 'game', 'dist', 'assets');
  mkdirSync(assets, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(assets, name), content);
  }
  return root;
}

/** Sıkıştırılabilir metin: gzip'in ham bayttan farklı ölçtüğünü görünür kılar. */
const filler = (kb) => 'export const a = 1;\n'.repeat((kb * 1024) / 20);

test('vendor parçası app’tan AYRI ölçülür', (t) => {
  const root = fixture(t, {
    'phaser-abc123.js': filler(600),
    'index-def456.js': filler(60),
    'index-ghi789.css': '.a{color:red}'.repeat(400),
  });

  const measured = measureBundle(join(root, 'game', 'dist'));

  // Ayrım bu bekçinin asıl fikri: tek toplam rakam, ekibin yazdığı kodu
  // bir bağımlılığın gölgesinde saklardı.
  assert.ok(measured.vendorKb > 0, 'vendor ölçülmedi');
  assert.ok(measured.appKb > 0, 'app ölçülmedi');
  assert.ok(measured.vendorKb > measured.appKb, 'vendor app’a karışmış');
  assert.ok(measured.cssKb > 0, 'css ölçülmedi');
});

test('ölçü HAM bayt değil, gzip’lenmiş bayttır', (t) => {
  const root = fixture(t, { 'index-a.js': filler(500) });

  const measured = measureBundle(join(root, 'game', 'dist'));

  /*
   * Girdi 500 KB ham ve son derece sıkıştırılabilir. Ham bayt ölçülseydi
   * sonuç ~500 olurdu; telden geçen boyut bunun çok altındadır ve kullanıcının
   * beklediği süre onunla orantılıdır.
   */
  assert.ok(measured.appKb < 100, `gzip ölçülmüyor: ${measured.appKb} KB`);
});

test('dist YOKSA bütçe geçerli sayılmaz', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-bundle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const problems = validateBundleSizes(root, { game: { app: 10 } });

  /*
   * Sessizce yeşile dönmek, build'i unutulmuş bir kapı koşusunun bütçeyi hiç
   * denetlemeden geçmesi demekti — bekçi tam da en çok gerektiği anda kör olur.
   */
  assert.equal(problems.length, 1);
  assert.match(problems[0], /dist yok/);
});

test('bütçe aşımı reddedilir, sınır içindeki geçer', (t) => {
  const root = fixture(t, { 'index-a.js': filler(500) });
  const { appKb } = measureBundle(join(root, 'game', 'dist'));

  assert.deepEqual(validateBundleSizes(root, { game: { app: appKb + 1 } }), []);
  assert.match(validateBundleSizes(root, { game: { app: appKb - 1 } }).join('\n'), /bütçe/);
});
