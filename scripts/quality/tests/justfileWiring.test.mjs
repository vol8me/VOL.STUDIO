import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../../..');
const justfile = readFileSync(resolve(ROOT, 'justfile'), 'utf8');

/**
 * KABLOYU sına, modülü değil.
 *
 * Bu test bir gerçek hatayla yazıldı: bundle bütçesi bekçisi yazıldı, kendi
 * birim testleriyle 4/4 geçti ve elle çağrıldığında doğru çalıştı — ama
 * justfile tarifi dosyayı YANLIŞ YOLDAN çağırıyordu. Kapı, `high` koşana
 * kadar sessizce kırıktı.
 *
 * Bir bekçinin doğru çalışması, ONA ULAŞILDIĞI anlamına gelmez.
 */
test('justfile’ın çağırdığı her script gerçekten var', () => {
  const referenced = [...justfile.matchAll(/node\s+([A-Za-z0-9_/.-]+\.mjs)/g)].map((m) => m[1]);

  assert.ok(referenced.length > 0, 'justfile’da script çağrısı bulunamadı — tarama bozulmuş');

  const missing = referenced.filter((path) => !existsSync(resolve(ROOT, path)));
  assert.deepEqual(missing, [], `justfile var olmayan script çağırıyor: ${missing.join(', ')}`);
});

test('kapı aşamaları var olan tariflere işaret eder', () => {
  /*
   * `high: quick lint-css coverage build bundle e2e` gibi bir satırdaki her ad
   * tanımlı bir tarif olmalı. Yazım hatası, `just` çalıştırılana kadar
   * görünmez kalır ve o aşama sessizce hiç koşmaz.
   */
  const recipes = new Set(
    [...justfile.matchAll(/^([a-z][a-z0-9-]*)(?:\s+[^:\n]*)?:/gm)].map((m) => m[1]),
  );
  const gates = ['quick', 'fast', 'high', 'signoff'];

  const broken = [];
  for (const gate of gates) {
    const line = new RegExp(`^${gate}:([^\\n]*)$`, 'm').exec(justfile);
    if (line === null) {
      broken.push(`${gate}: tarif yok`);
      continue;
    }
    for (const stage of line[1].trim().split(/\s+/).filter(Boolean)) {
      if (!recipes.has(stage)) broken.push(`${gate} -> ${stage}: tanımsız tarif`);
    }
  }
  assert.deepEqual(broken, []);
});

test('test:e2e tanımlayan her paket e2e kapısında çağrılır', () => {
  /*
   * TERS yön. Yukarıdaki testler "justfile'ın çağırdığı şey var mı?" diye
   * sorar; bu test "var olan şey çağrılıyor mu?" diye sorar.
   *
   * `e2e` tarifi paket listesini ELLE tutuyor. Rust kapısı manifestleri
   * tarayarak keşfeder, e2e etmez: yeni bir oyun `test:e2e` tanımlayıp
   * justfile'a eklenmezse tarayıcı testleri `high` ve `signoff` dahil HİÇBİR
   * kapıda koşmaz ve bunu hiçbir şey bildirmez. Paket kendi testlerini
   * yazdığı için yeşil görünür.
   */
  const packages = JSON.parse(
    execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  ).filter((pkg) => pkg.path !== ROOT);

  const withE2e = packages.filter((pkg) => {
    const manifest = resolve(pkg.path, 'package.json');
    if (!existsSync(manifest)) return false;
    return Boolean(JSON.parse(readFileSync(manifest, 'utf8')).scripts?.['test:e2e']);
  });

  assert.ok(withE2e.length > 0, 'test:e2e tanımlayan paket bulunamadı — tarama bozulmuş');

  const e2eRecipe = /^e2e:\n((?:[ \t]+[^\n]*\n)+)/m.exec(justfile);
  assert.ok(e2eRecipe !== null, 'justfile’da `e2e` tarifi bulunamadı');

  const uncalled = withE2e.map((pkg) => pkg.name).filter((name) => !e2eRecipe[1].includes(name));

  assert.deepEqual(
    uncalled,
    [],
    `test:e2e tanımlı ama e2e kapısında çağrılmıyor: ${uncalled.join(', ')}`,
  );
});

test('just kapı aşamalarını gerçekten çözebiliyor', () => {
  /*
   * Son söz `just`ın kendisinde: ayrıştırıcısı tarifi çözemiyorsa kapı yoktur.
   *
   * `pnpm exec` ile çağrılır çünkü `just` global bir kurulum değil,
   * `just-install` devDependency'sinden gelir — repo'nun kapıları da onu
   * böyle çözer. Doğrudan `just` çağırmak, testi geliştiricinin global
   * kurulumuna bağlardı.
   */
  const output = execFileSync('pnpm', ['exec', 'just', '--summary'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  for (const gate of ['quick', 'high', 'signoff', 'bundle']) {
    assert.match(output, new RegExp(`\\b${gate}\\b`), `just '${gate}' tarifini görmüyor`);
  }
});
