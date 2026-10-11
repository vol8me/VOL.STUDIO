import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  checkScriptCoverage,
  evaluateScriptCoverage,
  isGateScript,
  parseLcov,
  scriptCoverageFile,
} from '../scriptCoverage.mjs';

const ROOT = join(tmpdir(), 'vol-lcov-root');

const record = (lf, lh, brf = 0, brh = 0, fnf = 0, fnh = 0) => ({
  lines: { found: lf, hit: lh },
  branches: { found: brf, hit: brh },
  functions: { found: fnf, hit: fnh },
});

function lcov(entries) {
  return entries
    .map(([file, lf, lh, brf, brh, fnf, fnh]) =>
      [
        'TN:',
        `SF:${join(ROOT, file)}`,
        `FNF:${fnf}`,
        `FNH:${fnh}`,
        `BRF:${brf}`,
        `BRH:${brh}`,
        `LF:${lf}`,
        `LH:${lh}`,
        'end_of_record',
      ].join('\n'),
    )
    .join('\n');
}

test('LCOV kayıtları kökten göreli, ileri eğik çizgili yola çevrilir', () => {
  const records = parseLcov(
    lcov([
      ['scripts/quality/a.mjs', 10, 9, 4, 3, 2, 2],
      ['scripts/b.mjs', 5, 0, 0, 0, 1, 0],
    ]),
    ROOT,
  );
  assert.deepEqual([...records.keys()], ['scripts/quality/a.mjs', 'scripts/b.mjs']);
  assert.deepEqual(records.get('scripts/quality/a.mjs'), record(10, 9, 4, 3, 2, 2));
  assert.deepEqual(records.get('scripts/b.mjs').lines, { found: 5, hit: 0 });
});

test('kapı betiği tanımı test, tests dizini ve scripts dışını almaz', () => {
  assert.equal(isGateScript('scripts/quality/a.mjs'), true);
  assert.equal(isGateScript('scripts/quality/tests/a.test.mjs'), false);
  assert.equal(isGateScript('scripts/android/tests/helper.mjs'), false);
  assert.equal(isGateScript('devtools/deck/x.mjs'), false);
  assert.equal(isGateScript('scripts/quality/a.d.mts'), false);
});

const config = (extra = {}) => ({
  lines: 90,
  branches: 80,
  functions: 90,
  floorPct: 50,
  minLines: 50,
  acknowledged: {},
  ...extra,
});

function evaluate(entries, tracked, cfg) {
  const records = parseLcov(lcov(entries), ROOT);
  return evaluateScriptCoverage({ records, tracked, config: cfg });
}

test('eşiklerin üstünde ve her betik ölçülüyorsa sorun yoktur', () => {
  const { problems, totals } = evaluate(
    [
      ['scripts/a.mjs', 100, 95, 10, 9, 10, 10],
      ['scripts/b.mjs', 100, 90, 10, 9, 10, 9],
    ],
    ['scripts/a.mjs', 'scripts/b.mjs'],
    config(),
  );
  assert.deepEqual(problems, []);
  assert.equal(totals.lines, 92.5);
});

test('toplam eşik altı metrik adı, değeri ve eşiğiyle bildirilir', () => {
  const { problems } = evaluate(
    [['scripts/a.mjs', 100, 60, 10, 5, 10, 5]],
    ['scripts/a.mjs'],
    config({ floorPct: 0 }),
  );
  assert.equal(problems.length, 3);
  assert.match(problems[0], /^scripts kapsamı lines %60\.00, eşik %90/);
  assert.match(problems[1], /branches %50\.00, eşik %80/);
  assert.match(problems[2], /functions %50\.00, eşik %90/);
});

test('hiç yüklenmeyen betik gerekçesiz kalırsa düşer, gerekçeliyse geçer', () => {
  const entries = [['scripts/a.mjs', 100, 100, 0, 0, 1, 1]];
  const tracked = ['scripts/a.mjs', 'scripts/cli.mjs'];
  const bare = evaluate(entries, tracked, config());
  assert.equal(bare.problems.length, 1);
  assert.match(bare.problems[0], /^scripts\/cli\.mjs: hiçbir sınamada yüklenmiyor/);

  const excused = evaluate(
    entries,
    tracked,
    config({ acknowledged: { 'scripts/cli.mjs': 'Tarifle çalışır.' } }),
  );
  assert.deepEqual(excused.problems, []);
});

test('büyük ve yarıdan az kapsanan betik düşer; küçük olan ya da gerekçelisi düşmez', () => {
  const entries = [
    ['scripts/big.mjs', 100, 30, 0, 0, 1, 1],
    ['scripts/small.mjs', 20, 1, 0, 0, 1, 1],
    ['scripts/ok.mjs', 400, 400, 0, 0, 1, 1],
  ];
  const tracked = ['scripts/big.mjs', 'scripts/small.mjs', 'scripts/ok.mjs'];
  const result = evaluate(entries, tracked, config({ lines: 0 }));
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /^scripts\/big\.mjs: 100 satırın %30\.0'i/);

  const excused = evaluate(
    entries,
    tracked,
    config({ lines: 0, acknowledged: { 'scripts/big.mjs': 'Tarayıcı ister.' } }),
  );
  assert.deepEqual(excused.problems, []);
});

test('bayat gerekçe: dosya silinmiş, gerekçe boş ya da dosya artık kapsanıyor', () => {
  const entries = [['scripts/a.mjs', 100, 100, 0, 0, 1, 1]];
  const result = evaluate(entries, ['scripts/a.mjs'], {
    ...config(),
    acknowledged: {
      'scripts/gone.mjs': 'Eski betik.',
      'scripts/a.mjs': 'Artık sınanıyor.',
    },
  });
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /gone\.mjs.*dosya yok; bayat kayıt/);
  assert.match(result.problems[1], /a\.mjs.*artık %100\.0 kapsanıyor; bayat muafiyet/);

  const blank = evaluate(entries, ['scripts/a.mjs', 'scripts/b.mjs'], {
    ...config(),
    acknowledged: { 'scripts/b.mjs': '  ' },
  });
  assert.ok(blank.problems.some((problem) => problem.includes('gerekçe boş olamaz')));
});

function repo(t, { lcovText, quality, files }) {
  const root = mkdtempSync(join(tmpdir(), 'vol-script-cov-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  writeFileSync(join(root, 'quality.json'), JSON.stringify(quality));
  if (lcovText !== null) {
    mkdirSync(dirname(scriptCoverageFile(root)), { recursive: true });
    writeFileSync(
      scriptCoverageFile(root),
      typeof lcovText === 'function' ? lcovText(root) : lcovText,
    );
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const QUALITY = {
  floor: { lines: 50, statements: 50, branches: 50, functions: 40 },
  packages: { a: { lines: 80, statements: 80, branches: 70, functions: 75 } },
};

test('uçtan uca: izlenen betikler LCOV ile eşleşir ve kapı sorunu listeler', (t) => {
  const covered = (root) =>
    [
      'TN:',
      `SF:${join(root, 'scripts/a.mjs')}`,
      'FNF:1',
      'FNH:1',
      'BRF:0',
      'BRH:0',
      'LF:10',
      'LH:10',
      'end_of_record',
    ].join('\n');
  const dir = repo(t, {
    lcovText: covered,
    quality: { ...QUALITY, scriptCoverage: { lines: 90, branches: 0, functions: 0 } },
    files: { 'scripts/a.mjs': 'export {};\n', 'scripts/cli.mjs': 'export {};\n' },
  });
  const problems = checkScriptCoverage(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^scripts\/cli\.mjs: hiçbir sınamada yüklenmiyor/);
});

test('LCOV dosyası yoksa kapsam sınanamadı diye düşer; bölüm tanımsızsa denetim yoktur', (t) => {
  const missing = repo(t, {
    lcovText: null,
    quality: { ...QUALITY, scriptCoverage: { lines: 90 } },
    files: { 'scripts/a.mjs': 'export {};\n' },
  });
  const problems = checkScriptCoverage(missing);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /LCOV çıktısı yok/);

  const undefinedSection = repo(t, {
    lcovText: null,
    quality: QUALITY,
    files: { 'scripts/a.mjs': 'export {};\n' },
  });
  assert.deepEqual(checkScriptCoverage(undefinedSection), []);
});
