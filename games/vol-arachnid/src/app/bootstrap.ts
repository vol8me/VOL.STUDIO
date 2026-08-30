import { createVolGame, i18n, i18next, VOL_COLORS } from '@volstudio/core';
import { GameScene } from '@/runtime/scene/GameScene';
import arachnidTr from '@/i18n/tr.json';
import arachnidEn from '@/i18n/en.json';
import '@/i18next-augment';
import '@/styles.css';

i18n.addResources('tr', 'arachnid', arachnidTr);
i18n.addResources('en', 'arachnid', arachnidEn);
await i18n.init();

function syncDocumentLocale(): void {
  const locale = i18n.getLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = i18n.dir(locale);
  document.title = i18next.t('arachnid:app.title');
}

syncDocumentLocale();

const game = await createVolGame({
  backgroundColor: VOL_COLORS.uiBg,
  strategy: 'resize',
  scenes: [GameScene],
});

i18next.on('languageChanged', syncDocumentLocale);
game.events.once('destroy', () => i18next.off('languageChanged', syncDocumentLocale));
