import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

/** Metinde bir anahtarın varlığı değil, Vitest'e verilen gerçek değer doğrulanır. */
export async function validateCoverageBinding(configPath, expected) {
  try {
    const loaded = await tsImport(pathToFileURL(configPath).href, import.meta.url);
    const config =
      typeof loaded.default === 'function'
        ? await loaded.default({ command: 'serve', mode: 'test' })
        : await loaded.default;
    const actual = config?.test?.coverage?.thresholds;
    return isDeepStrictEqual(actual, expected)
      ? []
      : [
          `${configPath}: Vitest'in gerçek coverage.thresholds değeri quality.json ile aynı değil (gelen: ${JSON.stringify(
            actual,
          )}).`,
        ];
  } catch (error) {
    return [`${configPath}: Vitest yapılandırması yüklenemedi: ${error.message}`];
  }
}
