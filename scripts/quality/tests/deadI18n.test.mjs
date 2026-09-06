import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { validateI18nKeys, DYNAMIC_KEYS } from '../deadI18n.mjs';

/**
 * Bekçi GERÇEK bir git ağacında sınanır: `git ls-files` kullandığı için
 * sahnelenmemiş dosyaları görmez, ve bu davranışın kendisi sözleşmenin
 * parçasıdır.
 */
function repo(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-i18n-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('kullanılan anahtar temiz geçer, kullanılmayan yakalanır', (t) => {
  const root = repo(t, {
    'pkg/src/i18n/tr.json': JSON.stringify({ menu: { play: 'Oyna', olu: 'Ölü' } }),
    'pkg/src/app.ts': "i18next.t('menu.play');\n",
  });

  const problems = validateI18nKeys(root, []);
  assert.equal(problems.length, 1, 'tek dosyada tek sorun beklenir');
  assert.match(problems[0], /olu/, 'ölü anahtar adıyla bildirilmeli');
  assert.doesNotMatch(problems[0], /play/, 'kullanılan anahtar suçlanmamalı');
});

test('ÇALIŞMA ZAMANINDA kurulan anahtar ölü sayılmaz', (t) => {
  /*
   * Bu testin varlık sebebi gerçek bir yanlış alarm: `touch.dir_up` statik
   * aramada hiç geçmiyordu ama `` t(`volui:touch.dir_${direction}`) `` ile
   * kuruluyordu. Ölü sayıp silmek çalışan arayüzü bozardı.
   */
  const root = repo(t, {
    'pkg/src/i18n/tr.json': JSON.stringify({ touch: { dir_up: 'Yukarı', dir_down: 'Aşağı' } }),
    'pkg/src/app.ts': 'const key = `touch.dir_${direction}`;\n',
  });

  assert.deepEqual(
    validateI18nKeys(root, [
      { key: 'touch.dir_up', prefix: 'touch.dir_' },
      { key: 'touch.dir_down', prefix: 'touch.dir_' },
    ]),
    [],
    'dinamik önek muaf olmalı',
  );
});

test('dinamik önek beyanı, onu KURAN kod yoksa reddedilir', (t) => {
  const root = repo(t, {
    'pkg/src/i18n/tr.json': JSON.stringify({ menu: { play: 'Oyna' } }),
    'pkg/src/app.ts': "i18next.t('menu.play');\n", // hiçbir template literal yok
  });

  const problems = validateI18nKeys(root, [
    { key: 'touch.dir_up', prefix: 'touch.dir_' },
    { key: 'touch.dir_down', prefix: 'touch.dir_' },
  ]);
  assert.ok(problems.length > 0, 'ölü muafiyet bildirilmeli');
  assert.match(problems.join('\n'), /muafiyeti kaldır/);
});

test('beyan edilen her önek gerçek repoda KURULUYOR', () => {
  /* Muafiyet listesi çöplüğe dönmesin: liste bu repoda da doğrulanır. */
  const problems = validateI18nKeys(process.cwd());
  assert.deepEqual(problems, [], `i18n yüzeyi temiz olmalı:\n${problems.join('\n')}`);
  assert.ok(DYNAMIC_KEYS.length > 0, 'muafiyet listesi boşalmışsa tarama anlamsızdır');
});
