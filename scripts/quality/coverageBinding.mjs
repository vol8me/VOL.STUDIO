import { isDeepStrictEqual } from 'node:util';
import { loadConfigFromFile } from 'vite';

/**
 * Ölçülen kaynak kökleri. Çok oyunculu oyunun Node sunucusu (`server/`) çalıştırılabilir
 * kaynaktır ve src ile aynı eşiklere bağlıdır; başka bir seçim kaynağı kapsamdan saklayabilir.
 */
const ALLOWED_INCLUDES = [['src/**/*.ts'], ['src/**/*.ts', 'server/**/*.ts']];

/** Metinde bir anahtarın varlığı değil, Vitest'e verilen gerçek değer doğrulanır. */
export async function validateCoverageBinding(configPath, expected) {
  try {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, configPath);
    const config = /** @type {any} */ (loaded?.config);
    const coverage = config?.test?.coverage;
    const problems = [];
    if (!isDeepStrictEqual(coverage?.thresholds, expected)) {
      problems.push(
        `${configPath}: Vitest'in gerçek coverage.thresholds değeri quality.json ile aynı değil (gelen: ${JSON.stringify(
          coverage?.thresholds,
        )}).`,
      );
    }
    if (!ALLOWED_INCLUDES.some((allowed) => isDeepStrictEqual(coverage?.include, allowed))) {
      problems.push(
        `${configPath}: coverage.include yalnız src/**/*.ts (ve varsa server/**/*.ts) olmalı.`,
      );
    }
    const allowedExcludes = new Set(['src/**/index.ts', 'src/**/*.d.ts', 'src/vite-env.d.ts']);
    if (
      !Array.isArray(coverage?.exclude) ||
      coverage.exclude.some((entry) => !allowedExcludes.has(entry))
    ) {
      problems.push(
        `${configPath}: coverage.exclude yalnız barrel ve tip dosyalarını dışlayabilir.`,
      );
    }
    if (coverage?.enabled === false) {
      problems.push(`${configPath}: coverage.enabled=false ile eşik devre dışı bırakılamaz.`);
    }
    return problems;
  } catch (error) {
    return [`${configPath}: Vitest yapılandırması yüklenemedi: ${error.message}`];
  }
}
