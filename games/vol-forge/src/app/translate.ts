import { i18next } from '@volstudio/core/i18n';

/**
 * `volforge` ad alanında çalışma zamanında kurulan anahtarın çevirisi (`result.*`, `tools.<id>` gibi).
 * Anahtarların varlığı `keyParity` testiyle iki dilde de sınanır; yazım denetimi bu tek yerde gevşetilir.
 */
export function translate(key: string, options?: Record<string, unknown>): string {
  return String(i18next.t(`volforge:${key}` as 'volforge:app.title', options));
}
