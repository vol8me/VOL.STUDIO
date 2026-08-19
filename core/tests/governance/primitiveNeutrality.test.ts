import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Katman 1 primitifleri hiçbir TÜRE (genre) bağlanmamalı — ne kodunda ne de
 * DOKÜMANINDA.
 *
 * Doğru davranış "birden fazla tür örneği vermek" DEĞİL, **hiç tür örneği
 * vermemektir.** Bir primitif yaptığı işle anlatılır; nerede kullanılacağı
 * tüketicinin kararıdır. Bir dönem belge tek bir türe (tower defense)
 * bağlanmıştı; düzeltirken dört türe bağlandı — aynı hatanın daha genişi,
 * çünkü tür seçmek de bir editoryal karardır ve CORE onu vermez.
 *
 * Bu bekçi gerçek bir hatadan doğdu: primitifler koddan oyun kelimelerinden
 * arındırıldı, ama JSDoc'lara ve `core/docs/primitives.md`'ye "tower defense"
 * çivilendi. Kod nötrdü, REPO değildi — bir kart ya da otomasyon oyunu yazacak
 * kişi CORE'u bir TD framework'ü sanacaktı.
 *
 * `publicApi.test.ts` export ADLARINI tarar; bu bekçi PROSA'yı tarar. İkisi
 * farklı sızıntı biçimleri.
 *
 * Kapsam bilinçli olarak DAR: yalnızca katman 1 modülleri. `core/src/ui/`
 * altındaki bileşenlerin (`WaveCounter`, `CardTile`) tür çağrıştıran adları
 * meşrudur — onlar bir katalog kalemi, altyapı değil.
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
];

/**
 * Bir TÜRÜ işaret eden terimler. Jenerik oyun terimleri (`entity`, `çarpışma`,
 * `hedef`) BİLİNÇLİ olarak listede yok: onlar altyapının kendi kelimeleri.
 */
const GENRE_TERMS = [
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
 * Terimi KELİME olarak arar, ham substring olarak değil.
 *
 * Düz `includes` bekçinin kendi yanlış pozitifini üretiyordu: `dalgayla`
 * (sinüs dalgası) `dalga` ile eşleşiyordu. Bir bekçinin yanlış pozitifi,
 * koruduğu şeyden daha hızlı devre dışı bırakılır.
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

  it('primitives.md tek bir türü örnek olarak dayatmaz', () => {
    // Belge bir tür seçerse okuyucu CORE'u o türün framework'ü sanır.
    const doc = readFileSync(join(import.meta.dirname, '../../docs/primitives.md'), 'utf-8');

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
