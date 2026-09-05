import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Yokluk sözleşmesi (`core/docs/primitives.md`) yüzeyde tutarlı kalsın.
 *
 * `undefined` yokluktur (arama boşa düştü, kap boş, seçim yok); `null`
 * HESAPLANMIŞ yokluktur (işlem koştu ve sonucun olmadığını kanıtladı). Bu
 * ayrım bir tüketicinin ezberleyeceği tek kuraldır ve kayması SESSİZDİR:
 * `?.`/`??` yanlış boş değerde farklı davranır, tip sistemi ikisini de kabul
 * eder ve test yeşil kalır.
 *
 * Kural otomatik ÇIKARILAMAZ — "hesap ısmarlandı mı?" sorusu anlamsaldır.
 * Bu yüzden `null` dönen public üyeler SAYILI tutulur: yeni bir ad eklemek
 * bilinçli bir düzenleme gerektirir, tıpkı `EXPECTED_EXPORT_COUNT` gibi.
 */
const ROOT = resolve(import.meta.dirname, '../..');

/** `null` dönmesi GEREKÇELİ olan public üyeler — her biri hesaplanmış yokluk. */
const COMPUTED_ABSENCE = new Set([
  'grid/findPath.ts::find', // yol aranır, bulunamayabilir
  'spatial/SpatialIndex.ts::findNearest', // yarıçap taranır, boş çıkabilir
  'grid/FlowField.ts::getNext', // akış çözülür, hedef ulaşılamaz olabilir
]);

function publicNullReturners(): string[] {
  const files = execFileSync('git', ['ls-files', 'src/**/*.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  const found: string[] = [];
  for (const file of files) {
    const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
    lines.forEach((line) => {
      if (/^\s*(private|#)/.test(line)) return;
      // `ad(...): T | null {` ya da `get ad(): T | null {`
      const match =
        /^\s+(?:public\s+)?(?:get\s+)?([a-zA-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*:\s*[^;{]*\|\s*null\b/.exec(
          line,
        );
      if (match) found.push(`${file.replace(/^src\//, '')}::${match[1]}`);
    });
  }
  return [...new Set(found)].sort();
}

describe('yokluk sözleşmesi', () => {
  it('`null` dönen public üye yalnız listedekilerdir', () => {
    const actual = publicNullReturners();
    const unexpected = actual.filter((entry) => !COMPUTED_ABSENCE.has(entry));

    expect(
      unexpected,
      'Yeni bir `null` dönüşü: yokluk mu (→ `undefined`) yoksa hesaplanmış yokluk mu ' +
        '(→ listeye ekle ve gerekçesini yaz)? bkz. core/docs/primitives.md',
    ).toEqual([]);
  });

  it('listedeki her giriş GERÇEKTEN var — ölü muafiyet birikmez', () => {
    const actual = new Set(publicNullReturners());
    const stale = [...COMPUTED_ABSENCE].filter((entry) => !actual.has(entry));

    expect(stale, 'listede olup artık `null` dönmeyen üye: girdiyi kaldır').toEqual([]);
  });

  it('tarama gerçekten çalışıyor — sıfır bulgu tarama bozukluğudur', () => {
    expect(publicNullReturners().length).toBeGreaterThan(0);
  });
});
