import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validateProductIcons } from '../productIcons.mjs';

const LAUNCHER = 'src-tauri/gen/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png';

function fixture(t, games) {
  const root = mkdtempSync(join(tmpdir(), 'vol-product-icons-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [game, { icon = ['icons/32x32.png'], files }] of Object.entries(games)) {
    const base = join(root, 'games', game);
    mkdirSync(join(base, 'src-tauri'), { recursive: true });
    writeFileSync(join(base, 'src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { icon } }));
    for (const [path, bytes] of Object.entries(files)) {
      mkdirSync(join(base, dirname(path)), { recursive: true });
      writeFileSync(join(base, path), bytes);
    }
  }
  return root;
}

const own = (tag) => ({ 'src-tauri/icons/32x32.png': `desktop-${tag}`, [LAUNCHER]: `launcher-${tag}` });

test('her oyun kendi ikonunu taşıyorsa geçer', (t) => {
  const root = fixture(t, { a: { files: own('a') }, b: { files: own('b') } });
  assert.deepEqual(validateProductIcons(root, new Set()), []);
});

test('iki oyun aynı ikon dosyasını taşırsa kapı düşer', (t) => {
  const root = fixture(t, {
    a: { files: { ...own('a'), [LAUNCHER]: 'launcher-shared' } },
    b: { files: { ...own('b'), [LAUNCHER]: 'launcher-shared' } },
  });
  const problems = validateProductIcons(root, new Set());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^a, b: aynı ikon/);
});

test('oyunun src-tauri’si dışındaki ikon ürün kimliği sayılmaz', (t) => {
  const root = fixture(t, {
    a: { icon: ['../../../shared/icon.png'], files: own('a') },
  });
  assert.match(validateProductIcons(root, new Set()).join('\n'), /kendi src-tauri'si dışında/);
});

test('bildirilen ikon yoksa ya da liste boşsa kapı düşer', (t) => {
  const root = fixture(t, {
    a: { icon: ['icons/yok.png'], files: own('a') },
    b: { icon: [], files: own('b') },
  });
  const problems = validateProductIcons(root, new Set()).join('\n');
  assert.match(problems, /icons\/yok\.png" yok/);
  assert.match(problems, /games\/b: bundle\.icon boş/);
});

test('Tauri şablon ikonu geri gelirse yakalanır', (t) => {
  const root = fixture(t, { a: { files: own('a') } });
  const template = createHash('sha256').update('launcher-a').digest('hex');
  assert.match(validateProductIcons(root, new Set([template])).join('\n'), /varsayılan ikonu/);
});
