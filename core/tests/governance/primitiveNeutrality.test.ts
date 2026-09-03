import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Katman 1 primitifleri hiçbir türe (genre) bağlanmamalı — ne kodunda ne de
 * dokümanında.
 *
 * Doğru davranış 'birden fazla tür örneği vermek' değil, hiç tür örneği
 * vermemektir. Bir primitif yaptığı işle anlatılır; nerede kullanılacağı
 * tüketicinin kararıdır.
 *
 * publicApi.test.ts export adlarını tarar; bu bekçi prosa'yı tarar.
 * Kapsam bilinçli olarak dar: yalnızca katman 1 modülleri; ui bileşenlerinin
 * tür çağrıştıran adları meşrudur — onlar bir katalog kalemi, altyapı değil.
 */
const PRIMITIVE_ROOTS = [
  'time',
  'state',
  'economy',
  'pool',
  'spatial',
  'lifecycle',
  'random',
  'stats',
  // `rig` ve `math` bu listeye SONRADAN girdi. İkisi de ilk tüketicisi tek bir
  // yaratık olan alanlar: yürüyüş döngüsü, bakış sürücüsü ve ters kinematik
  // "örümcek" kelimesini hiç bilmemeli, ama tek tüketicinin sözlüğüne kaymak
  // için en kolay yer tam olarak burasıdır.
  'rig',
  'math',
];

/**
 * Bir TÜRÜ işaret eden terimler. Jenerik oyun terimleri (`entity`, `çarpışma`,
 * `hedef`) BİLİNÇLİ olarak listede yok: onlar altyapının kendi kelimeleri.
 */
const GENRE_TERMS = [
  // Yaratık/varlık adları da bir sözlüktür: bir primitif, ilk tüketicisinin
  // kim olduğunu bilmemeli.
  'örümcek',
  'spider',
  'arachnid',
  'tower defense',
  'tower-defense',
  'roguelite',
  'roguelike',
  'metroidvania',
  'kule',
  'tower',
  'dalga',
  'düşman',
  'poker',
  'minecraft',
  'rts',
  'moba',
];

/**
 * Terimi kelime sınırında arar; düz `includes` yanlış pozitif üretir
 * (örn. `dalgayla`–`dalga`). Bir bekçinin yanlış pozitifi, koruduğu şeyden
 * hızlı devre dışı bırakılır.
 */
function containsTerm(source: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Türkçe ekler kelimeye bitişik gelir; sınır olarak harf-olmayan aranır.
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(source);
}

function collectFiles(root: string, dir: string, out: Array<[string, string]>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(root, full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    out.push([relative(root, full), readFileSync(full, 'utf-8')]);
  }
}

describe('Katman 1 primitifleri türden bağımsız kalmalı', () => {
  it('primitif kaynaklarında tür adı geçmez (yorumlar dahil)', () => {
    const srcRoot = join(import.meta.dirname, '../../src');
    const files: Array<[string, string]> = [];
    for (const sub of PRIMITIVE_ROOTS) {
      collectFiles(srcRoot, join(srcRoot, sub), files);
    }
    // Geometri math/ altında yaşıyor ama katman 1'e aittir.
    files.push(['math/geometry.ts', readFileSync(join(srcRoot, 'math/geometry.ts'), 'utf-8')]);

    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const [path, source] of files) {
      for (const term of GENRE_TERMS) {
        if (containsTerm(source, term)) violations.push(`${path}: "${term}"`);
      }
    }

    expect(
      violations,
      'Katman 1 bir türe bağlanamaz. Örnek gerekiyorsa BİRDEN FAZLA türden ver ' +
        'ya da tamamen nötr bir sözlük kullan.',
    ).toEqual([]);
  });

  /**
   * Bir primitif kökünün DOKÜMANI da taranır.
   *
   * Kodu nötr olup dokümanı bir türe demirleyen bir modülde kod nötr sayılsa
   * da repo değildir: okuyucu belgeyi okur, kaynağı değil. Bu hata bir kez
   * yapıldı (bkz. TODO.md "Tür sızıntısı" turu) ve bekçi o yüzden dokümanı
   * da kapsar.
   */
  it.each(['primitives.md'])('%s tek bir türü örnek olarak dayatmaz', (name) => {
    const doc = readFileSync(join(import.meta.dirname, '../../docs', name), 'utf-8');

    // Kural cümlesinin kendisi yasaklı terimleri SAYAR; onu hariç tut.
    const prose = doc
      .split('\n')
      .filter((line) => !line.includes('taşımamalı'))
      .join('\n')
      .toLowerCase();

    const violations = GENRE_TERMS.filter((term) => containsTerm(prose, term));
    expect(violations).toEqual([]);
  });
});
