import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/**
 * Tarayıcı testlerindeki sabit beklemeler (`waitForTimeout`) dosya başına bütçelidir (F11.9).
 *
 * Sabit bekleme yük altında hem gereksiz yavaş hem kırılgandır: beklediği koşul 300 ms'de
 * oluşmuyorsa test yanlış sonuçla düşer ya da (daha kötüsü) koşul hiç denetlenmeden geçer. Mevcut
 * beklemeler tek tek koşula çevrilirken yenisinin eklenmesini bu bekçi engeller: bütçe ölçülen
 * sayıya eşittir; artış düşer, azalış da bütçenin düşürülmesini ister (ratchet).
 */

/** Test dosyalarında yorum satırı olmayan `waitForTimeout(` çağrı sayısı. */
export function countFixedWaits(text) {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    count += (line.match(/\.waitForTimeout\s*\(/g) ?? []).length;
  }
  return count;
}

/**
 * @param {Record<string, number>} actual dosya → sayı (yalnız sıfırdan büyükler)
 * @param {Record<string, number>} budget quality.json → fixedWaitBudget
 * @returns {string[]} sorun listesi
 */
export function compareFixedWaits(actual, budget) {
  const problems = [];
  const files = new Set([...Object.keys(actual), ...Object.keys(budget)]);
  for (const file of [...files].sort()) {
    const found = actual[file] ?? 0;
    const allowed = budget[file] ?? 0;
    if (found > allowed) {
      problems.push(
        `${file}: ${found} sabit bekleme (waitForTimeout), bütçe ${allowed}. ` +
          'Olay ya da koşul bekleyen ifade kullanın (expect.poll, toPass, waitForFunction).',
      );
    } else if (found < allowed) {
      problems.push(
        `${file}: ${found} sabit bekleme kaldı, bütçe ${allowed}. ` +
          'Bütçeyi quality.json → fixedWaitBudget içinde düşürün (ratchet).',
      );
    }
  }
  return problems;
}

/** Yaşam döngüsü donmuş ağaçları ve test olmayan dosyaları dışarıda bırakır. */
export function measureFixedWaits(root, lifecycle = loadRepoLifecycle(root)) {
  const files = excludingFrozenPaths(workingTreeFiles(root, ['*.ts']), lifecycle).filter((file) =>
    /(^|\/)tests\//.test(file),
  );
  /** @type {Record<string, number>} */
  const actual = {};
  for (const file of files) {
    const count = countFixedWaits(readFileSync(join(root, file), 'utf8'));
    if (count > 0) actual[file] = count;
  }
  return actual;
}

export function validateFixedWaits(root, budget, lifecycle) {
  if (!budget) return [];
  return compareFixedWaits(measureFixedWaits(root, lifecycle), budget);
}
