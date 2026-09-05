import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CORE alt-yol alias'larının TEK doğruluk kaynağı.
 *
 * Bir dönem her `vite.config.ts` alias listesini elle yazıyor, `vitest.config.ts`
 * ise tek bir `'@volstudio/core' -> core/src` prefix alias'ı kullanıyordu. Vite
 * (rollup) string alias'ı prefix olarak eşler; bu yüzden vitest tarafında
 * `@volstudio/core/ui/styles.css` sessizce `core/src/ui/styles.css` oluyordu —
 * gerçek dosya `theme.css` olduğu için testler build'in çözdüğü grafiği
 * çözemiyordu. Test ile build'in farklı modül grafiği görmesi, ikisinin de
 * birbirini doğrulayamaması demekti.
 *
 * Liste artık `core/package.json` `exports` haritasından türetiliyor: CORE yeni
 * bir alt yol yayınladığında araçlar onu elle eklenmeyi beklemez, kaldırdığında
 * da ölü alias geride kalmaz.
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
