import { describe, it, expect } from 'vitest';
import { classify } from '../../../scripts/quality/report.mjs';

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
    expect(result.kind).toBe('contract');
    expect(result.reason).toContain('3');
  });

  it('bozuk işaret sınıflandırmayı çökertmez, kalıplara düşer', () => {
    const output = '##quality:{bozuk json\nCode style issues found in 2 files';
    expect(classify('format-check', output).kind).toBe('format');
  });

  it('tsc hatası dosya ve kod ile sınıflandırılır', () => {
    const output = "src/foo.ts(42,17): error TS2345: Argument of type 'string' is not assignable.";
    const result = classify('typecheck', output);

    expect(result.kind).toBe('typecheck');
    expect(result.reason).toContain('TS2345');
    expect(result.reason).toContain('src/foo.ts:42');
  });

  it('vitest kapsam eşiği ihlali eşik değeriyle sınıflandırılır', () => {
    const output =
      'ERROR: Coverage for lines (68.42%) does not meet global threshold (70%)\n' +
      ' ELIFECYCLE  Command failed with exit code 1.';
    const result = classify('coverage', output);

    expect(result.kind).toBe('coverage-threshold');
    expect(result.reason).toContain('68.42');
    expect(result.reason).toContain('70');
  });

  it('düşen test sayısı ve paket birlikte çıkarılır', () => {
    const output =
      'games/vol-hell test: @volstudio/vol-hell@0.1.0 test\n' +
      '      Tests  2 failed | 444 passed (446)';
    const result = classify('test', output);

    expect(result.kind).toBe('test');
    expect(result.reason).toContain('2');
    expect(result.package).toBe('@volstudio/vol-hell');
  });

  it('eslint hata sayısı sınıflandırılır', () => {
    const result = classify('lint', '✖ 7 problems (7 errors, 0 warnings)');
    expect(result.kind).toBe('lint');
    expect(result.reason).toContain('7');
  });

  it('stylelint, eslint ile AYNI simgeyi kullansa da aşamayla ayrılır', () => {
    // Regresyon riski: stylelint de "✖ N problems" yazıyor. Aşama adı
    // ayırt etmeseydi bir CSS hatası 'lint' diye raporlanır ve yanlış
    // pakete/araca yönlendirirdi.
    const output =
      'core/src/ui/theme.css\n 12:3  ✖  Expected indentation of 2 spaces\n\n✖ 1 problem';
    const result = classify('lint-css', output);

    expect(result.kind).toBe('lint-css');
    expect(result.reason).toContain('1');
  });

  it('cargo hatası rust aşamasında sınıflandırılır', () => {
    const output = 'error[E0425]: cannot find value `foo` in this scope\n --> src/lib.rs:10:5';
    const result = classify('rust', output);

    expect(result.kind).toBe('rust');
    expect(result.reason).toContain('E0425');
  });

  it('prettier uyumsuzluğu format olarak sınıflandırılır', () => {
    const result = classify('format-check', 'Code style issues found in 3 files. Run Prettier.');
    expect(result.kind).toBe('format');
  });

  it('sınıflandırılamayan hata KÖR bırakmaz — son satırlar rapora girer', () => {
    // Araç biçim değiştirdiğinde olan tam olarak budur. `unknown` demek
    // yetmez; okuyucunun elinde eyleme geçirilebilir bir şey kalmalı.
    const output = ['bir sey oldu', '', 'anlasilmayan bir arac ciktisi', 'son satir'].join('\n');
    const result = classify('build', output);

    expect(result.kind).toBe('unknown');
    expect(result.tail).toEqual(['bir sey oldu', 'anlasilmayan bir arac ciktisi', 'son satir']);
  });

  it('paket adı çıktının herhangi bir yerinden yakalanır', () => {
    const result = classify('typecheck', 'core typecheck: @volstudio/core@0.1.0 tsc --noEmit');
    expect(result.package).toBe('@volstudio/core');
  });
});
