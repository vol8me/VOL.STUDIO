import { i18n } from '@volstudio/core/i18n';
import type { LanguagePreference } from './GameSettings';

/** Dil tercihini çalışan i18n'e uygular; `auto` cihaz dilini izler. */
export async function applyLanguage(preference: LanguagePreference): Promise<void> {
  const locale = preference === 'auto' ? i18n.detectLocale() : preference;
  if (i18n.getLocale() !== locale) await i18n.changeLanguage(locale);
}
