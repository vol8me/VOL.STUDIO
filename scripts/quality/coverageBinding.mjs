import { isDeepStrictEqual } from 'node:util';
import { loadConfigFromFile } from 'vite';

/** Metinde bir anahtarın varlığı değil, Vitest'e verilen gerçek değer doğrulanır. */
export async function validateCoverageBinding(configPath, expected) {
  try {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, configPath);
    const config = loaded?.config;
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
