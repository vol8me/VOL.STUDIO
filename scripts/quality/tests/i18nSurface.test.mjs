import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  DYNAMIC_FAMILIES,
  INDIRECT_KEYS,
  I18N_CATALOGS,
  TEXT_ALLOW,
  validateI18nSurface,
} from '../i18nSurface.mjs';

/**
 * Bekçi GERÇEK bir git ağacında sınanır: çalışma ağacını görür — henüz eklenmemiş
 * dosyalar dahil, `.gitignore` hariç — ve bu davranışın kendisi sözleşmenin parçasıdır.
 */
function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-i18n-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body));
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const CATALOGS = [{ ns: 'app', dir: 'pkg/src/i18n', uiDirs: ['pkg/src/ui'] }];

/** Tek katalog + tek UI dizini; testler yalnız ilgilendikleri girdiyi verir. */
function run(root, extra = {}) {
  return validateI18nSurface(root, {
    catalogs: CATALOGS,
    families: [],
    allow: [],
    indirect: [],
    ...extra,
  });
}

const fixture = (tr, en, code, more = {}) => ({
  'pkg/src/i18n/tr.json': tr,
  'pkg/src/i18n/en.json': en,
  'pkg/src/ui/view.ts': code,
  ...more,
});

const MENU = { menu: { play: 'Oyna' } };
const MENU_EN = { menu: { play: 'Play' } };

test('kullanılan anahtar temiz geçer, kullanılmayan adıyla yakalanır', (t) => {
  const root = repo(
    t,
    fixture(
      { menu: { play: 'Oyna', olu: 'Ölü' } },
      { menu: { play: 'Play', olu: 'Dead' } },
      `
      export const f = () => i18next.t('app:menu.play');
    `,
    ),
  );
  const problems = run(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /menu\.olu/);
  assert.doesNotMatch(problems[0], /menu\.play/);
});

test('anahtar adı yalnız YORUMDA ya da bir alt dizgenin içinde geçiyorsa kullanılmış sayılmaz', (t) => {
  const root = repo(
    t,
    fixture(
      MENU,
      MENU_EN,
      `
      // menu.play burada sadece anılıyor
      export const note = 'bkz menu.play sayfası';
    `,
    ),
  );
  assert.match(run(root).join('\n'), /menu\.play/);
});

test('yalnız testte geçen anahtar üründe ölüdür', (t) => {
  const root = repo(
    t,
    fixture(MENU, MENU_EN, 'export {};\n', {
      'pkg/tests/view.test.ts': "i18next.t('app:menu.play');\n",
    }),
  );
  assert.match(run(root).join('\n'), /menu\.play/);
});

test('henüz eklenmemiş kod dosyasındaki kullanım anahtarı ölü saydırmaz', (t) => {
  const root = repo(t, fixture(MENU, MENU_EN, 'export {};\n'));
  writeFileSync(join(root, 'pkg/src/ui/split.ts'), "export const k = 'app:menu.play';\n");
  assert.deepEqual(run(root), []);
});

test('TR/EN parite: bir dilde eksik anahtar iki yönde de bildirilir', (t) => {
  const root = repo(
    t,
    fixture(
      { menu: { play: 'Oyna', only: 'Tek' } },
      { menu: { play: 'Play', extra: 'Ek' } },
      `
      export const a = ['app:menu.play', 'app:menu.only', 'app:menu.extra'];
    `,
    ),
  );
  const text = run(root).join('\n');
  assert.match(text, /menu\.only.*en\.json'da yok/);
  assert.match(text, /menu\.extra.*tr\.json'da yok/);
});

test('adlandırma: camelCase dışı parçalar bildirilir, dizi indeksleri bildirilmez', (t) => {
  const root = repo(
    t,
    fixture(
      { menu: { dir_up: 'Yukarı' }, names: ['a', 'b'] },
      { menu: { dir_up: 'Up' }, names: ['a', 'b'] },
      `
      export const a = ['app:menu.dir_up', 'app:names'];
    `,
    ),
  );
  const problems = run(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /menu\.dir_up.*camelCase/);
});

test('dizi kaynağı, dizi yolu sabitle okunuyorsa kullanılmış sayılır', (t) => {
  const root = repo(
    t,
    fixture(
      { names: ['a', 'b'] },
      { names: ['a', 'b'] },
      `
      export const names = () => i18next.t('app:names', { returnObjects: true });
    `,
    ),
  );
  assert.deepEqual(run(root), []);
});

test('şablonla kurulan anahtar ailesi: gerekçeli ve üreten şablon varsa muaf', (t) => {
  const root = repo(
    t,
    fixture(
      { dir: { up: 'Yukarı', down: 'Aşağı' } },
      { dir: { up: 'Up', down: 'Down' } },
      `
      export const f = (d: string) => i18next.t(\`app:dir.\${d}\`);
    `,
    ),
  );
  const families = [{ ns: 'app', prefix: 'dir.', suffix: '', reason: 'yön etiketi yönden türer' }];
  assert.deepEqual(run(root, { families }), []);
  assert.match(run(root).join('\n'), /dir\.up/, 'aile olmadan ölü sayılır');
});

test('dinamik aile: üreten şablon yoksa, gerekçe yoksa ya da anahtara denk gelmiyorsa reddedilir', (t) => {
  const root = repo(
    t,
    fixture(MENU, MENU_EN, "export const f = () => i18next.t('app:menu.play');\n"),
  );
  const reason = 'yeterince uzun gerekçe';
  const text = run(root, {
    families: [
      { ns: 'app', prefix: 'dir.', suffix: '', reason },
      { ns: 'app', prefix: 'menu.', suffix: '', reason: '' },
    ],
  }).join('\n');
  assert.match(text, /dir\.\$\{…\} bildirilmiş ama onu kuran bir şablon yok/);
  assert.match(text, /dir\.\$\{…\} hiçbir anahtara denk gelmiyor/);
  assert.match(text, /menu\.\$\{…\} gerekçesiz/);
});

test('doğrudan okunan anahtar kanıt dosyası varsa muaf, kanıt kaybolursa bayat', (t) => {
  const root = repo(
    t,
    fixture({ app: { fatal: 'Hata' } }, { app: { fatal: 'Error' } }, 'export {};\n', {
      'pkg/src/main.ts': 'export const title = tr.app.fatal;\n',
    }),
  );
  const entry = { ns: 'app', key: 'app.fatal', file: 'pkg/src/main.ts', reason: 'JSON doğrudan' };
  assert.deepEqual(run(root, { indirect: [entry] }), []);
  assert.match(
    run(root, { indirect: [{ ...entry, file: 'pkg/src/yok.ts' }] }).join('\n'),
    /kanıt dosyasında/,
  );
});

test('eksik çeviri anahtarı (ad:anahtar sabiti) görünür sorun üretir', (t) => {
  const root = repo(
    t,
    fixture(
      MENU,
      MENU_EN,
      `
      export const a = () => i18next.t('app:menu.play');
      export const b = () => i18next.t('app:menu.yok');
    `,
    ),
  );
  const problems = run(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /eksik çeviri anahtarı "app:menu\.yok"/);
});

test('modül düzeyinde çeviri çağrısı yakalanır; işlev/yöntem/kurucu içi yakalanmaz', (t) => {
  const root = repo(
    t,
    fixture(
      MENU,
      MENU_EN,
      `
      export const top = i18next.t('app:menu.play');
      export const inArrow = () => i18next.t('app:menu.play');
      export function inFn() { return i18next.t('app:menu.play'); }
      export class A {
        x = 1;
        constructor() { i18next.t('app:menu.play'); }
        m() { return i18next.t('app:menu.play'); }
      }
    `,
    ),
  );
  const problems = run(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /view\.ts:2: modül düzeyinde i18next\.t\(\)/);
});

test('kodlanmış görünen metin: yuvalar yakalanır; anahtar biçimli, harfsiz ve çevrilmiş olanlar yakalanmaz', (t) => {
  const root = repo(
    t,
    fixture(
      MENU,
      MENU_EN,
      `
      const el = document.createElement('div');
      el.textContent = 'Merhaba';
      el.setAttribute('aria-label', 'Kapat');
      el.setAttribute('data-x', 'serbest');
      el.title = \`Başlık \${n}\`;
      new Button('Tamam');
      const opts = { label: 'Gönder', placeholder: i18next.t('app:menu.play'), title: 'app:menu.play', hint: '12' };
      const fmt = { formatValue: (v: number) => \`Lv.\${v}\` };
      const withDefault = label ?? ((v: number) => \`Sv. \${v}\`);
      el.textContent = '×';
    `,
    ),
  );
  const text = run(root).join('\n');
  for (const found of ['Merhaba', 'Kapat', 'Başlık', 'Tamam', 'Gönder', 'Lv.', 'Sv.']) {
    assert.match(text, new RegExp(found.replace('.', '\\.')), `${found} yakalanmalı`);
  }
  for (const missed of ['serbest', '"12"', '"×"', 'app:menu.play"; ']) {
    assert.doesNotMatch(text, new RegExp(missed.replace('.', '\\.')));
  }
});

test('kodlanmış metin yalnız UI dizinlerinde aranır; istisna gerekçeli ve bayatlayınca reddedilir', (t) => {
  const root = repo(
    t,
    fixture(MENU, MENU_EN, "el.setAttribute('aria-label', 'Kapat');\n", {
      'pkg/src/other/tool.ts': "el.textContent = 'Araç';\n",
      'pkg/src/ui/also.ts': "export const k = 'app:menu.play';\n",
    }),
  );
  assert.doesNotMatch(run(root).join('\n'), /Araç/, 'UI dışı dizin taranmaz');
  const allow = [{ file: 'pkg/src/ui/view.ts', text: 'Kapat', reason: 'özel ad' }];
  assert.deepEqual(run(root, { allow }), []);
  const stale = run(root, {
    allow: [...allow, { file: 'pkg/src/ui/view.ts', text: 'Yok', reason: 'x' }],
  });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /bayat metin istisnası.*"Yok"/);
});

test('gerçek repoda yüzey temizdir ve her bildirim kanıtlıdır', () => {
  const problems = validateI18nSurface(process.cwd());
  assert.deepEqual(problems, [], `çeviri yüzeyi temiz olmalı:\n${problems.join('\n')}`);
  assert.ok(I18N_CATALOGS.length >= 3);
  assert.ok(DYNAMIC_FAMILIES.length > 0, 'aile listesi boşalmışsa tarama anlamsızdır');
  assert.ok(INDIRECT_KEYS.length > 0);
  assert.ok(
    TEXT_ALLOW.every((entry) => entry.reason.length >= 5),
    'her istisna gerekçeli',
  );
});
