import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validateCoverageShape } from '../coverageShape.mjs';

/**
 * Bekçi yalnız fixture'larla sınanır: gerçek repodaki lcov bir önceki koşunun
 * ARTIĞIDIR ve temiz klonda yoktur. Gerçek repo doğrulaması `just coverage`
 * sonrasında `coverage-shape` tarifinde koşar.
 */
function fixture(t, packages, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vol-cov-shape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [dir, files] of Object.entries(packages)) {
    let lcov = '';
    for (const [file, { total, covered }] of Object.entries(files)) {
      lcov += `SF:${file}\n`;
      for (let i = 1; i <= total; i++) lcov += `DA:${i},${i <= covered ? 1 : 0}\n`;
      lcov += 'end_of_record\n';
    }
    mkdirSync(join(root, dir, 'coverage'), { recursive: true });
    writeFileSync(join(root, dir, 'coverage', 'lcov.info'), lcov);
  }
  for (const [path, content] of Object.entries(extra)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const stamp = (dirs, patch = {}) => ({
  run: 'coverage',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  packages: dirs.map((dir) => ({ name: `@t/${dir.split('/').pop()}`, dir })),
  ...patch,
});

const LOW = { 'src/Scene.ts': { total: 120, covered: 20 } };
const config = (acknowledged = {}) => ({ minLines: 100, floorPct: 50, acknowledged });
const evidence = (path) => ({ reason: 'Phaser sahnesi; gerçek tarayıcıda sınanır.', evidence: [path] });

test('büyük ve düşük kapsamlı dosya gerekçesizse kapı düşer', (t) => {
  const root = fixture(t, { 'games/a': LOW });
  const problems = validateCoverageShape(root, config(), stamp(['games/a']));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /games\/a\/src\/Scene\.ts/);
  assert.match(problems[0], /taban %50/);
});

test('kanıtı modülü anan test dosyası olan gerekçe geçer', (t) => {
  const root = fixture(t, { 'games/a': LOW }, { 'games/a/tests/e2e/run.spec.ts': "test.describe('Scene')" });
  const problems = validateCoverageShape(
    root,
    config({ 'games/a/src/Scene.ts': evidence('games/a/tests/e2e/run.spec.ts') }),
    stamp(['games/a']),
  );
  assert.deepEqual(problems, []);
});

test('modülü anmayan kanıt gerekçeyi taşıyamaz', (t) => {
  const root = fixture(t, { 'games/a': LOW }, { 'games/a/tests/e2e/run.spec.ts': "test('menü')" });
  const problems = validateCoverageShape(
    root,
    config({ 'games/a/src/Scene.ts': evidence('games/a/tests/e2e/run.spec.ts') }),
    stamp(['games/a']),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /hiç anmıyor/);
});

test('var olmayan ya da test olmayan kanıt reddedilir', (t) => {
  const root = fixture(t, { 'games/a': LOW }, { 'games/a/README.md': 'Scene' });
  for (const path of ['games/a/tests/yok.spec.ts', 'games/a/README.md']) {
    const problems = validateCoverageShape(
      root,
      config({ 'games/a/src/Scene.ts': evidence(path) }),
      stamp(['games/a']),
    );
    assert.match(problems.join('\n'), /test dosyası değil ya da yok/);
  }
});

test('tabanın üstüne çıkan dosyanın gerekçesi ölü sayılır', (t) => {
  const root = fixture(t, { 'games/a': { 'src/Scene.ts': { total: 120, covered: 90 } } });
  const problems = validateCoverageShape(
    root,
    config({ 'games/a/src/Scene.ts': evidence('games/a/tests/x.spec.ts') }),
    stamp(['games/a']),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ölü gerekçe/);
});

test('kısa dosya eşik dışıdır', (t) => {
  const root = fixture(t, { 'games/a': { 'src/small.ts': { total: 40, covered: 0 } } });
  assert.deepEqual(validateCoverageShape(root, config(), stamp(['games/a'])), []);
});

test('koşu kaydı yoksa ya da tamamlanmamışsa kapı değerlendirmez', (t) => {
  const root = fixture(t, { 'games/a': LOW });
  assert.match(validateCoverageShape(root, config(), null)[0], /kaydı yok/);
  assert.match(
    validateCoverageShape(root, config(), stamp(['games/a'], { finishedAt: undefined }))[0],
    /tamamlanmamış/,
  );
});

test('koşunun ölçtüğü paketin lcov’u yoksa sessiz geçmez', (t) => {
  const root = fixture(t, { 'games/a': LOW });
  const problems = validateCoverageShape(root, config(), stamp(['games/a', 'games/b']));
  assert.match(problems.join('\n'), /@t\/b: bu koşuda ölçüldü ama games\/b\/coverage\/lcov\.info yok/);
});

test('koşudan ESKİ lcov değerlendirilmez', (t) => {
  const root = fixture(t, { 'games/a': LOW });
  const past = new Date(Date.now() - 3_600_000);
  utimesSync(join(root, 'games/a/coverage/lcov.info'), past, past);

  const problems = validateCoverageShape(root, config(), stamp(['games/a'], { startedAt: Date.now() - 1_000 }));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /ESKİ/);
});

test('koşuya girmeyen paket ne değerlendirilir ne de gerekçesi ölü sayılır', (t) => {
  const root = fixture(t, { 'games/a': { 'src/ok.ts': { total: 120, covered: 120 } }, 'devtools/b': LOW });
  const problems = validateCoverageShape(
    root,
    config({ 'devtools/b/src/Scene.ts': evidence('devtools/b/tests/x.test.ts') }),
    stamp(['games/a']),
  );
  assert.deepEqual(problems, []);
});

test('mutlak SF yolları repo köküne göre anahtarlanır', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-cov-shape-abs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const absolute = join(root, 'games/a/src/Scene.ts');
  let lcov = `SF:${absolute}\n`;
  for (let i = 1; i <= 120; i++) lcov += `DA:${i},${i <= 10 ? 1 : 0}\n`;
  mkdirSync(join(root, 'games/a/coverage'), { recursive: true });
  writeFileSync(join(root, 'games/a/coverage/lcov.info'), `${lcov}end_of_record\n`);

  assert.match(validateCoverageShape(root, config(), stamp(['games/a']))[0], /^games\/a\/src\/Scene\.ts:/);
});
