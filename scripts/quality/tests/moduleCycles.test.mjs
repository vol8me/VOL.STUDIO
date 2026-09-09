import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateModuleCycles } from '../moduleCycles.mjs';

/** Gerçek bir paket ağacı kurar; bekçi diskteki dosyaları AST'den okur. */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-cycles-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const manifest = '{"name":"x"}';

test('göreli import döngüsü reddedilir', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "import { two } from './two';\nexport const one = () => two();",
    'games/a/src/two.ts': "import { one } from './one';\nexport const two = () => one();",
  });

  const problems = validateModuleCycles(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /modül döngüsü/);
  assert.match(problems[0], /one\.ts/);
});

/*
 * Bu repoda paket içi import'ların çoğu `@/` alias'ıyla yazılır. Yalnız göreli
 * yolları izleyen bir bekçi, yakalaması gereken gerçek döngüyü kaçırırdı.
 */
test('ALIAS ile kurulan döngü de yakalanır', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } },
    }),
    'games/a/src/one.ts': "import { two } from '@/two';\nexport const one = () => two();",
    'games/a/src/two.ts': "import { one } from '@/one';\nexport const two = () => one();",
  });

  assert.equal(validateModuleCycles(root).length, 1);
});

/*
 * `import type` derlemede SİLİNİR; başlatma sırası diye bir sorun doğurmaz.
 * Bunu ihlal saymak, bekçiyi yanlış alarmla ölü hale getirirdi — ölçüldü,
 * repoda dört tane tip-only çift var ve hiçbiri hata değil.
 */
test('tip-only import döngü SAYILMAZ', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "import type { Two } from './two';\nexport type One = { t?: Two };",
    'games/a/src/two.ts': "import type { One } from './one';\nexport type Two = { o?: One };",
  });

  assert.deepEqual(validateModuleCycles(root), []);
});

test('tümü `type` olan adlandırılmış liste de silinmiş sayılır', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "import { type Two } from './two';\nexport type One = { t?: Two };",
    'games/a/src/two.ts': "import { type One } from './one';\nexport type Two = { o?: One };",
  });

  assert.deepEqual(validateModuleCycles(root), []);
});

/* Dinamik import döngüyü KIRAR — tembel ve asenkrondur, zaten olağan çözümdür. */
test('dinamik import ihlal sayılmaz', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "export const one = async () => (await import('./two')).two();",
    'games/a/src/two.ts': "import { one } from './one';\nexport const two = () => one;",
  });

  assert.deepEqual(validateModuleCycles(root), []);
});

test('yan etki importu çalışma zamanıdır ve sayılır', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "import './two';\nexport const one = 1;",
    'games/a/src/two.ts': "import './one';\nexport const two = 2;",
  });

  assert.equal(validateModuleCycles(root).length, 1);
});

/* Paket sınırını geçen kenarlar `layers.mjs`in işidir; burada elenir. */
test('paket DIŞINA çıkan alias hedefi görmezden gelinir', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@core/*': ['../../core/src/*'] } },
    }),
    'games/a/src/one.ts': "import { x } from '@core/x';\nexport const one = () => x;",
    'core/package.json': manifest,
    'core/src/x.ts': 'export const x = 1;',
  });

  assert.deepEqual(validateModuleCycles(root), []);
});

test('döngüsüz ağaçta sorun bildirilmez', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/src/one.ts': "import { two } from './two';\nexport const one = () => two();",
    'games/a/src/two.ts': 'export const two = () => 2;',
  });

  assert.deepEqual(validateModuleCycles(root), []);
});
