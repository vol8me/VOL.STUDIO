import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// tests/e2e/support → tests/e2e → tests → vol-ui → devtools → repo kökü.
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const CORE_UI_CSS = resolve(REPO_ROOT, 'core/src/ui');

/**
 * Dokunma hedefi politikasının KAPSADIĞI seçiciler — kaynağı CSS'in kendisi.
 *
 * Liste elle yazılsaydı, politikaya yeni bir bileşen katıldığında burada
 * unutulur ve kapı onu hiç ölçmezdi. Token'ı tüketen kuralı okumak, kapının
 * konusunu politikayla otomatik eşitler: `hitTargetSync.test.ts` kuralın VAR
 * olduğunu, buradaki ölçüm ise kuralın GERÇEKTEN piksel ürettiğini doğrular.
 * O test kendi başında şunu yazar: jsdom yerleşim hesaplamadığı için
 * doğrulama metin tabanlıdır. Kapanmayan boşluk tam olarak budur.
 */
export function hitTargetSelectors(): string[] {
  const found = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.css')) continue;
      for (const rule of readFileSync(path, 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[2].includes('vol-hit-target-min')) continue;
        const selector = rule[1]
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim()
          .split('\n')
          .pop()!
          .trim();
        // Sözde eleman ölçülemez (`getBoundingClientRect` yok); `:root` ve
        // `@import` blokları da bir bileşen hedefi değildir.
        if (!selector.startsWith('.') || selector.includes('::')) continue;
        found.add(selector);
      }
    }
  };

  walk(CORE_UI_CSS);
  return [...found].sort();
}
