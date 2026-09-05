import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CORE alt-yol alias'larının TEK doğruluk kaynağı.
 *
 * Liste `core/package.json` `exports` haritasından TÜRETİLİR; hiçbir araç
 * kendi kopyasını tutmaz. CORE yeni bir alt yol yayınladığında araçlar onu
 * elle eklenmeyi beklemez, kaldırdığında da ölü alias geride kalmaz.
 *
 * Elle yazılan tek bir önek girdisi (`'@volstudio/core' -> core/src`) bu işi
 * GÖREMEZ: Vite (rollup) string alias'ı önek olarak eşler, yani haritada hiç
 * olmayan bir yol da çözülür. Böyle bir kurulumda test ile build farklı modül
 * grafiği görür ve ikisi birbirini doğrulayamaz.
 */

const CORE_PACKAGE_NAME = '@volstudio/core';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Bir `exports` girdisinin çözüleceği dosya yolunu döner. */
function exportTarget(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    // Araçlar daima ESM/kaynak koşulunu kullanır; `types` yalnız yedek.
    return entry.import ?? entry.types ?? undefined;
  }
  return undefined;
}

/**
 * CORE alt yollarını gerçek dosyalara bağlayan Vite alias dizisini üretir.
 *
 * Girdiler uzundan kısaya sıralanır: rollup ilk eşleşmeyi aldığı için
 * `@volstudio/core` girdisi listenin başında olsaydı `@volstudio/core/ui` gibi
 * her alt yolu da yutardı.
 *
 * @returns {{ find: string; replacement: string }[]}
 */
export function coreAliases() {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'core/package.json'), 'utf8'));
  const exports = manifest.exports ?? {};

  return Object.entries(exports)
    .flatMap(([subpath, entry]) => {
      const target = exportTarget(entry);
      if (target === undefined) return [];
      const find = subpath === '.' ? CORE_PACKAGE_NAME : `${CORE_PACKAGE_NAME}/${subpath.slice(2)}`;
      return [{ find, replacement: resolve(repoRoot, 'core', target) }];
    })
    .sort((a, b) => b.find.length - a.find.length);
}
