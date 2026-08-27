import { FontManager, VOL_FONTS } from '@volstudio/core/fonts';
import { i18n, i18next } from '@volstudio/core/i18n';
import '@volstudio/core/ui/styles.css';
import { AssetStudioClient } from './api/AssetStudioClient';
import { AssetStudioApp } from './app/AssetStudioApp';
import trResources from './i18n/tr.json';
import enResources from './i18n/en.json';
import './i18next-augment';
import './styles.css';

i18n.addResources('tr', 'assetstudio', trResources);
i18n.addResources('en', 'assetstudio', enResources);
await i18n.init();

if (typeof FontFace !== 'undefined' && document.fonts) {
  await new FontManager({ fonts: [VOL_FONTS.Jura, VOL_FONTS['Exo 2']] }).load();
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('[AssetStudio] #app kökü bulunamadı.');

const translate = (key: string, options?: Record<string, unknown>): string =>
  (i18next.t as (dynamicKey: string, dynamicOptions?: Record<string, unknown>) => string)(key, {
    ns: 'assetstudio',
    ...options,
  });

const app = new AssetStudioApp({
  root,
  client: new AssetStudioClient(),
  t: translate,
  locale: () => i18n.getLocale(),
  onToggleLanguage: () => i18n.changeLanguage(i18n.getLocale() === 'tr' ? 'en' : 'tr'),
});

const handleLanguageChanged = (): void => {
  document.documentElement.lang = i18n.getLocale();
  app.setTranslator(translate);
};
i18n.on('languageChanged', handleLanguageChanged);
let disposed = false;
const handlePageExit = (): void => {
  if (disposed) return;
  disposed = true;
  window.removeEventListener('pagehide', handlePageExit);
  window.removeEventListener('beforeunload', handlePageExit);
  i18n.off('languageChanged', handleLanguageChanged);
  app.destroy();
};
window.addEventListener('pagehide', handlePageExit, { once: true });
window.addEventListener('beforeunload', handlePageExit, { once: true });

await app.start();
