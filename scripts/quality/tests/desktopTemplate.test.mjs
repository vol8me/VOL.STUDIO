import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

/*
 * Linux .desktop şablonları (Tauri `desktopTemplate`) anahtar=değer satırlarıdır. Bir biçimleyici satırları tek satıra
 * birleştirdiğinde linuxdeploy AppImage çıktısını reddeder; paketleyici de AppDir'ı HOST_GRAPHICS_LIBS temizliğinden önce
 * bırakır ve Deck'te WebKitWebProcess EGL_BAD_PARAMETER ile düşüp pencere boş kalır (UI-06.3 sonrası yaşandı).
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const templates = execFileSync('git', ['ls-files', '*.desktop.hbs'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

test('en az bir .desktop şablonu izlenir', () => {
  assert.ok(templates.length > 0);
});

for (const template of templates) {
  test(`${template}: XDG anahtar=değer satır biçimindedir`, () => {
    const text = readFileSync(resolve(ROOT, template), 'utf8');
    const lines = text.split('\n').filter((line) => line.length > 0);
    assert.equal(lines[0], '[Desktop Entry]', 'ilk satır yalnız [Desktop Entry] olmalı');
    for (const line of lines.slice(1)) {
      assert.match(
        line,
        /^[A-Za-z-]+(\[[^\]]+\])?=\S.*$/,
        `tek anahtar=değer satırı değil: ${line}`,
      );
      assert.doesNotMatch(line, /\s[A-Za-z-]+=/, `bir satırda birden çok anahtar: ${line}`);
    }
    for (const key of ['Exec', 'Icon', 'Name', 'Type', 'Terminal']) {
      assert.ok(
        lines.some((line) => line.startsWith(`${key}=`)),
        `${key}= satırı yok`,
      );
    }
    assert.ok(text.endsWith('\n'), 'dosya satır sonuyla bitmeli');
  });
}
