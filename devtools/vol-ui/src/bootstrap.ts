import { FontManager, VOL_FONTS } from '@volstudio/core/fonts';
import { i18n } from '@volstudio/core/i18n';
import trResources from './i18n/tr.json';
import enResources from './i18n/en.json';
import './i18next-augment';
import { ShowcaseApp } from './ShowcaseApp';

export interface ShowcaseSession {
  readonly app: ShowcaseApp;
  destroy(): void;
}

/** i18n, font ve DOM yaşam döngüsünü tek, kapatılabilir oturumda başlatır. */
export async function bootShowcase(
  root: HTMLElement | null = document.querySelector<HTMLElement>('#app'),
): Promise<ShowcaseSession> {
  if (!root) throw new Error('[VOL.UI] #app kökü bulunamadı.');

  i18n.addResources('tr', 'volui', trResources);
  i18n.addResources('en', 'volui', enResources);
  await i18n.init();

  if (typeof FontFace !== 'undefined' && document.fonts) {
    await new FontManager({ fonts: [VOL_FONTS.Jura, VOL_FONTS['Exo 2']] }).load();
  }

  const app = new ShowcaseApp(root);
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('beforeunload', destroy);
    app.destroy();
  };
  window.addEventListener('beforeunload', destroy, { once: true });

  return { app, destroy };
}
