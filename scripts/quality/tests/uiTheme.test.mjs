import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  contrastFailures,
  contrastRatio,
  rawDurationCount,
  readExportedConstant,
  validateContrastKnown,
  validateRawDurations,
  validateRepoUiTheme,
} from '../uiTheme.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('ham süre sayacı: değişken, sıfır, yorum ve motion dışı özellikler sayılmaz', () => {
  assert.equal(rawDurationCount('.a { transition: opacity 0.2s ease; }'), 1);
  assert.equal(rawDurationCount('.a { transition: opacity 200ms ease, transform .3s ease; }'), 2);
  assert.equal(rawDurationCount('.a { animation: spin 1.2s linear infinite; }'), 1);
  assert.equal(rawDurationCount('.a { transition-delay: 40ms; animation-duration: 300ms; }'), 2);
  // Sayılmayanlar:
  assert.equal(
    rawDurationCount('.a { transition: opacity var(--vol-motion-duration-base) ease; }'),
    0,
  );
  assert.equal(
    rawDurationCount('.a { transition: none; animation-duration: 0s; transition-delay: 0ms; }'),
    0,
  );
  assert.equal(rawDurationCount('/* transition: opacity 0.2s */ .a { color: red; }'), 0);
  assert.equal(rawDurationCount(':root { --vol-transition-fast: 0.12s ease; }'), 0);
  assert.equal(rawDurationCount('.a { padding: 8px; width: 200ms-foo; }'), 0);
  // var() içindeki yedek değer sayılmaz; yanındaki ham süre sayılır.
  assert.equal(rawDurationCount('.a { transition: opacity var(--x, 0.2s) 0.1s; }'), 1);
});

test('ham süre ratchet: artış, indirilmemiş azalış, yeni dosya ve kayıp dosya düşer; eşitlik geçer', () => {
  assert.deepEqual(validateRawDurations({ 'a.css': 3 }, { 'a.css': 3 }), []);
  assert.match(
    validateRawDurations({ 'a.css': 4 }, { 'a.css': 3 })[0],
    /a\.css ham süre 4 \(kayıt 3\)/,
  );
  assert.match(validateRawDurations({ 'a.css': 2 }, { 'a.css': 3 })[0], /kaydı 2'e indir/);
  assert.match(validateRawDurations({ 'new.css': 1 }, {})[0], /new\.css ham süre 1 \(kayıt 0\)/);
  assert.match(validateRawDurations({}, { 'gone.css': 2 })[0], /kayıtlı dosya yok/);
});

test('kontrast son renk üzerinden ölçülür: alfalı ön renk ve alfalı zemin birleştirilir', () => {
  const black = [0, 0, 0];
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000', black) - 21) < 1e-9);
  assert.ok(Math.abs(contrastRatio('#000000', '#000000', black) - 1) < 1e-9);
  // %50 beyaz siyah üstünde ≈ #808080 → 5.32:1 (yalnız hex çifti 21 verirdi).
  assert.ok(Math.abs(contrastRatio('#ffffff80', '#000000', black) - 5.32) < 0.02);
  // Alfalı zemin: %50 beyaz zemin siyah taban üstünde #808080 olur; beyaz metin onda 3.95:1'dir
  // (alfa yok sayılsaydı 1:1 çıkardı).
  assert.ok(Math.abs(contrastRatio('#ffffff', '#ffffff80', black) - 3.95) < 0.02);
});

test('mevcut tema kusurları kayıtlı olanlarla birebir: default 7, aurum 0', () => {
  const colors = readExportedConstant('colors.ts', read('core/src/ui/colors.ts'), 'VOL_COLORS');
  const semantic = readExportedConstant(
    's.ts',
    read('core/src/ui/themes/semanticColors.ts'),
    'VOL_SEMANTIC_COLORS',
  );
  const aurum = readExportedConstant(
    'e.ts',
    read('core/src/ui/themes/aurum.ts'),
    'VOL_AURUM_OVERRIDES',
  );
  const base = { ...colors, ...semantic };
  const failures = contrastFailures({ default: base, aurum: { ...base, ...aurum } });
  assert.equal(failures.filter((f) => f.theme === 'aurum').length, 0);
  assert.equal(failures.filter((f) => f.theme === 'default').length, 7);
  // Kasıtlı kötü bir token yeni kusur üretir.
  const worse = contrastFailures({ default: { ...base, uiText: '#202830' } });
  assert.ok(worse.some((f) => f.fg === 'uiText' && f.bg === 'uiSurface1'));
});

test('kontrast kaydı: kayıtsız yeni kusur, bayat kayıt, kapanmış sahip ve boş gerekçe düşer', () => {
  const tasks = new Set(['UI-03.1']);
  const failure = { theme: 'default', fg: 'onBrand', bg: 'brandHover', ratio: 3.07, min: 4.5 };
  const record = {
    theme: 'default',
    fg: 'onBrand',
    bg: 'brandHover',
    owner: 'UI-03.1',
    reason: 'düşük',
  };
  assert.deepEqual(validateContrastKnown([record], [failure], tasks), []);
  assert.match(
    validateContrastKnown([], [failure], tasks)[0],
    /kayıtsız kusur default: onBrand \/ brandHover = 3\.07/,
  );
  assert.match(validateContrastKnown([record], [], tasks)[0], /bayat kayıt/);
  assert.match(
    validateContrastKnown([{ ...record, owner: 'UI-99.9' }], [failure], tasks)[0],
    /sahip görev açık bir UI görevi olmalı \(UI-99\.9\)/,
  );
  assert.match(
    validateContrastKnown([{ ...record, reason: ' ' }], [failure], tasks)[0],
    /gerekçe boş/,
  );
  assert.match(validateContrastKnown([record, record], [failure], tasks)[0], /yinelenen kayıt/);
});

test('AST okuyucu: iç içe sabitler, negatif sayı, as const; desteklenmeyen ifade ve eksik ad hata verir', () => {
  const text = "export const A = { x: 1, y: { z: -2, s: 'm' }, l: [1, 2] } as const;";
  assert.deepEqual(readExportedConstant('a.ts', text, 'A'), {
    x: 1,
    y: { z: -2, s: 'm' },
    l: [1, 2],
  });
  assert.throws(
    () => readExportedConstant('a.ts', 'export const B = { x: f() };', 'B'),
    /desteklenmeyen sabit ifade/,
  );
  assert.throws(
    () => readExportedConstant('a.ts', 'export const B = { [k]: 1 };', 'B'),
    /hesaplanan property/,
  );
  assert.throws(() => readExportedConstant('a.ts', text, 'YOK'), /YOK bulunamadı/);
});

test('depo UI tema kapısı yeşildir', () => {
  assert.deepEqual(validateRepoUiTheme(ROOT), []);
});

/** Gerçek dosyaların küçük bir kopyasında kapıyı bilerek bozar. */
function tamper(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'vol-ui-theme-'));
  try {
    for (const path of ['core/src/ui', 'scripts/quality/uiThemeKnown.json', 'docs/ui/TODO.md']) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(ROOT, path), join(root, path), { recursive: true });
    }
    mutate(root);
    return validateRepoUiTheme(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('kapı: theme.css sapması, eksik/fazla varlık, ham süre ve yeni kontrast kusuru ayrı ayrı yakalanır', () => {
  assert.deepEqual(
    tamper(() => {}),
    [],
  );

  assert.ok(
    tamper((root) => {
      const css = join(root, 'core/src/ui/theme.css');
      writeFileSync(
        css,
        readFileSync(css, 'utf8').replace('--vol-ui-bg: #0d1115;', '--vol-ui-bg: #0d1116;'),
      );
    }).some((p) => /theme\.css kaynaktan sapmış/.test(p)),
  );

  // Yeni bileşen ham süreyle: kayıtta olmayan yeni dosya düşer.
  assert.ok(
    tamper((root) =>
      writeFileSync(
        join(root, 'core/src/ui/yeni.css'),
        '.vol-yeni { transition: opacity 0.2s ease; }',
      ),
    ).some((p) => /yeni\.css ham süre 1 \(kayıt 0\)/.test(p)),
  );
  // Mevcut dosyada artış da düşer.
  assert.ok(
    tamper((root) => {
      const file = join(root, 'core/src/ui/buttons/buttons.css');
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n.vol-x { animation: pulse 0.5s; }\n`);
    }).some((p) => /buttons\.css ham süre 2 \(kayıt 1\)/.test(p)),
  );

  // Aurum'a kötü bir kontrast sokmak kayıtsız kusur olarak düşer.
  assert.ok(
    tamper((root) => {
      const file = join(root, 'core/src/ui/themes/aurum.ts');
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace("uiText: '#f5efe3'", "uiText: '#3a2a21'"),
      );
    }).some((p) => /kayıtsız kusur aurum: uiText/.test(p)),
  );
});
