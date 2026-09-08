import { VOL_COLORS, createVolGame, i18n, i18next } from '@volstudio/core';
import { lifeGraphicsConfig } from '@/config/graphics';
import { LifeScene } from '@/runtime/scene/LifeScene';
import lifeTr from '@/i18n/tr.json';
import lifeEn from '@/i18n/en.json';
import '@/i18next-augment';
/*
 * CORE tema token'ları AÇIKÇA yüklenir. `UIRoot` da `theme.css`i çeker, ama o
 * transitif bir yan etkidir: HUD'u kullanmayan bir ekran eklendiğinde bütün
 * `--vol-*` değişkenleri sessizce tanımsız kalır ve bileşenler stilsiz düz
 * elemanlara düşer.
 */
import '@volstudio/core/ui/styles.css';
import '@/styles.css';

i18n.addResources('tr', 'life', lifeTr);
i18n.addResources('en', 'life', lifeEn);
await i18n.init();

function syncDocumentLocale(): void {
  const locale = i18n.getLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = i18n.dir(locale);
  document.title = i18next.t('life:app.title');
}

syncDocumentLocale();

const game = await createVolGame({
  backgroundColor: VOL_COLORS.uiBg,
  strategy: 'resize',
  renderScale: lifeGraphicsConfig.renderScale,
  renderer: lifeGraphicsConfig.renderer,
  scenes: [new LifeScene()],
});

i18next.on('languageChanged', syncDocumentLocale);
game.events.once('destroy', () => {
  i18next.off('languageChanged', syncDocumentLocale);
});
