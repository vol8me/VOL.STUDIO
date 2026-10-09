import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { writeNodeCommand } from './runCommand.mjs';
import { COMPOSITE_GATES, classify, stagesFor } from '../report.mjs';
import { gateStages, parseJustRecipes } from '../justfile.mjs';

/**
 * `report.mjs` kapı çıktısını sınıflandırır. Üçüncü parti araçların (tsc,
 * eslint, vitest, stylelint, cargo, prettier) İNSAN çıktısını ayrıştırdığı
 * için kalıplar bir sürüm yükseltmesinde eşleşmeyi bırakabilir.
 *
 * Bu KAPIYI bozmaz — geçer/kalır kararı çıkış kodundan gelir. Bozulan şey
 * teşhistir ve sessizce bozulur: rapor `unknown` demeye başlar, kimse fark
 * etmez. Bu testler kalıpları GERÇEK çıktı örnekleriyle kilitler.
 *
 * Örnekler araçların bugünkü sürümlerinden alınmıştır; bir yükseltmeden sonra
 * bu testler düşerse doğru tepki testi gevşetmek değil, kalıbı yeni biçime
 * uydurmaktır.
 */
describe('kalite raporu sınıflandırması', () => {
  it('gerçek node TAP ve CLI JSON hata sebebini, yolu, başlığı ve exit kodunu korur', () => {
    const root = mkdtempSync(join(tmpdir(), 'vol-report-'));
    try {
      const source = join(root, 'uiDocs.test.mjs');
      writeFileSync(
        source,
        "import { test } from 'node:test';\n" +
          "test('@volstudio/audio-synth API', () => {});\n" +
          "test('UI belgeleri örneklerle eşleşir', () => { throw new Error('docs/ui/CATALOG.md: eksik örnek\\nikinci açıklama'); });\n",
      );
      const childEnv = { ...process.env };
      delete childEnv.NODE_TEST_CONTEXT;
      const tap = spawnSync(process.execPath, ['--test', '--test-reporter=tap', source], {
        encoding: 'utf8',
        env: childEnv,
      });
      assert.equal(tap.status, 1);
      const classified = classify('contract', tap.stdout);
      assert.equal(classified.package, null);
      assert.equal(classified.reason, 'docs/ui/CATALOG.md: eksik örnek\nikinci açıklama');
      assert.equal(classified.title, 'UI belgeleri örneklerle eşleşir');
      assert.ok(classified.path.includes('uiDocs.test.mjs'));
      writeFileSync(join(root, 'justfile'), 'contract:\nquick: contract\n');
      writeNodeCommand(
        root,
        'pnpm',
        `process.stdout.write(${JSON.stringify(tap.stdout)}); process.exit(7);`,
      );
      const env = { ...process.env };
      const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
      env[pathKey] = `${root}${delimiter}${env[pathKey]}`;
      const cli = resolve(import.meta.dirname, '../report.mjs');
      const json = spawnSync(process.execPath, [cli, 'quick', '--json'], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      assert.equal(json.status, 7, json.stderr);
      assert.deepEqual(JSON.parse(json.stdout).failure, {
        stage: 'contract',
        kind: classified.kind,
        package: classified.package,
        reason: classified.reason,
        exitCode: 7,
        title: classified.title,
        path: classified.path,
      });
      const human = spawnSync(process.execPath, [cli, 'quick'], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      assert.equal(human.status, 7);
      assert.ok(human.stdout.includes(tap.stdout));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('başka paketin PASS satırı TAP hatasına atfedilmez; başlık, sebep ve yol korunur', () => {
    const output = [
      '# Subtest: @volstudio/audio-synth API',
      'ok 1 - @volstudio/audio-synth API',
      '# Subtest: UI belgeleri örneklerle eşleşir',
      'not ok 2 - UI belgeleri örneklerle eşleşir',
      '  ---',
      "  location: 'C:\\Dev\\VOL.STUDIO\\scripts\\quality\\tests\\uiDocs.test.mjs:42:1'",
      "  failureType: 'testCodeFailure'",
      "  error: 'docs/ui/CATALOG.md: eksik örnek'",
      "  code: 'ERR_ASSERTION'",
      '  ...',
    ].join('\n');
    assert.deepEqual(classify('contract', output), {
      package: null,
      kind: 'test',
      reason: 'docs/ui/CATALOG.md: eksik örnek',
      title: 'UI belgeleri örneklerle eşleşir',
      path: 'C:\\Dev\\VOL.STUDIO\\scripts\\quality\\tests\\uiDocs.test.mjs:42:1',
    });
  });

  it('TAP hata bloğu içindeki paket failure context olarak kullanılır', () => {
    const result = classify(
      'test',
      "ok 1 - @volstudio/core\nnot ok 2 - @volstudio/vol-showcase API\n  ---\n  error: 'eksik export'\n  ...",
    );
    assert.equal(result.package, '@volstudio/vol-showcase');
    assert.equal(result.reason, 'eksik export');
  });

  it('kendi betiğimizin yapılandırılmış işareti önce okunur', () => {
    // workspace-contract.mjs kendi çıktısını serbest metin olarak değil
    // ##quality:{...} işaretiyle bildirir — biçimi biz kontrol ediyoruz.
    const output = [
      '##quality:{"kind":"contract","count":3}',
      '',
      '[workspace-contract] Kapı kapsamı ihlali:',
      '  ✗ @volstudio/yeni-paket: "test" script\'i yok.',
    ].join('\n');

    const result = classify('contract', output);
    assert.equal(result.kind, 'contract');
    assert.ok(result.reason.includes('3'));
  });

  it('bozuk işaret sınıflandırmayı çökertmez, kalıplara düşer', () => {
    const output = '##quality:{bozuk json\nCode style issues found in 2 files';
    assert.equal(classify('format-check', output).kind, 'format');
  });

  it('tsc hatası dosya ve kod ile sınıflandırılır', () => {
    const output = "src/foo.ts(42,17): error TS2345: Argument of type 'string' is not assignable.";
    const result = classify('typecheck', output);

    assert.equal(result.kind, 'typecheck');
    assert.ok(result.reason.includes('TS2345'));
    assert.ok(result.reason.includes('src/foo.ts:42'));
  });

  it('vitest kapsam eşiği ihlali eşik değeriyle sınıflandırılır', () => {
    const output =
      'ERROR: Coverage for lines (68.42%) does not meet global threshold (70%)\n' +
      ' ELIFECYCLE  Command failed with exit code 1.';
    const result = classify('coverage', output);

    assert.equal(result.kind, 'coverage-threshold');
    assert.ok(result.reason.includes('68.42'));
    assert.ok(result.reason.includes('70'));
  });

  it('düşen test sayısı ve paket birlikte çıkarılır', () => {
    const output =
      'games/sample-game test: @volstudio/sample-game@0.1.0 test\n' +
      '      Tests  2 failed | 444 passed (446)';
    const result = classify('test', output);

    assert.equal(result.kind, 'test');
    assert.ok(result.reason.includes('2'));
    assert.equal(result.package, '@volstudio/sample-game');
  });

  it('eslint hata sayısı sınıflandırılır', () => {
    const result = classify('lint', '✖ 7 problems (7 errors, 0 warnings)');
    assert.equal(result.kind, 'lint');
    assert.ok(result.reason.includes('7'));
  });

  it('stylelint, eslint ile AYNI simgeyi kullansa da aşamayla ayrılır', () => {
    // Regresyon riski: stylelint de "✖ N problems" yazıyor. Aşama adı
    // ayırt etmeseydi bir CSS hatası 'lint' diye raporlanır ve yanlış
    // pakete/araca yönlendirirdi.
    const output =
      'core/src/ui/theme.css\n 12:3  ✖  Expected indentation of 2 spaces\n\n✖ 1 problem';
    const result = classify('lint-css', output);

    assert.equal(result.kind, 'lint-css');
    assert.ok(result.reason.includes('1'));
  });

  it('cargo hatası rust aşamasında sınıflandırılır', () => {
    const output = 'error[E0425]: cannot find value `foo` in this scope\n --> src/lib.rs:10:5';
    const result = classify('rust', output);

    assert.equal(result.kind, 'rust');
    assert.ok(result.reason.includes('E0425'));
  });

  it('JS ve Rust advisory kapıları güvenlik aşaması olarak sınıflandırılır', () => {
    assert.equal(classify('security-js', '3 vulnerabilities found').kind, 'security-js');
    assert.equal(classify('security-rust', 'Crate: vulnerable 0.1.0').kind, 'security-rust');
  });

  it('prettier uyumsuzluğu format olarak sınıflandırılır', () => {
    const result = classify('format-check', 'Code style issues found in 3 files. Run Prettier.');
    assert.equal(result.kind, 'format');
  });

  it('sınıflandırılamayan hata KÖR bırakmaz — son satırlar rapora girer', () => {
    // Araç biçim değiştirdiğinde olan tam olarak budur. `unknown` demek
    // yetmez; okuyucunun elinde eyleme geçirilebilir bir şey kalmalı.
    const output = ['bir sey oldu', '', 'anlasilmayan bir arac ciktisi', 'son satir'].join('\n');
    const result = classify('build', output);

    assert.equal(result.kind, 'unknown');
    assert.deepEqual(result.tail, ['bir sey oldu', 'anlasilmayan bir arac ciktisi', 'son satir']);
  });

  it('paket adı çıktının herhangi bir yerinden yakalanır', () => {
    const result = classify('typecheck', 'core typecheck: @volstudio/core@0.1.0 tsc --noEmit');
    assert.equal(result.package, '@volstudio/core');
  });
});

describe('kapı aşamaları justfile’dan türer', () => {
  it('iç içe kapılar sırayla ve tekrarsız açılır', () => {
    const recipes = parseJustRecipes('a:\nb:\nc:\nquick: a b\nhigh: quick c a\n');
    assert.deepEqual(gateStages(recipes, 'high'), ['a', 'b', 'c']);
    assert.throws(() => gateStages(recipes, 'yok'), /tarifi yok/);
  });

  it('gerçek justfile’daki her birleşik kapı yalnız tekil tariflere açılır', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const recipes = parseJustRecipes(readFileSync(resolve(root, 'justfile'), 'utf8'));
    for (const gate of COMPOSITE_GATES) {
      const stages = stagesFor(root, gate);
      assert.ok(stages.length > 0, gate);
      for (const stage of stages) assert.deepEqual(recipes.get(stage), [], `${gate} → ${stage}`);
    }
    assert.ok(stagesFor(root, 'high').includes('audio-test'));
  });
});
