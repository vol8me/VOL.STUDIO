import { VOL_COLORS, createVolGame, i18n, i18next, setHapticsEnabled } from '@volstudio/core';
import { createArachnidAudio } from '@/app/ArachnidAudio';
import { arachnidGraphicsConfig } from '@/config/graphics';
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

const audio = createArachnidAudio();
// Bu oyunda ayar ekranı yoktur; çok kısa anlamlandırılmış desenler varsayılan
// açıktır ve desteklenmeyen platformlarda CORE tarafından sessizce atlanır.
setHapticsEnabled(true);

let game: Awaited<ReturnType<typeof createVolGame>>;
try {
  game = await createVolGame({
    backgroundColor: VOL_COLORS.uiBg,
    strategy: 'resize',
    renderScale: arachnidGraphicsConfig.renderScale,
    render: arachnidGraphicsConfig.renderer,
    scenes: [new GameScene(audio)],
  });
} catch (error) {
  // Oyun kurulumu yarıda kalırsa giriş/visibility abonelikleri ile WebAudio
  // context'i sızmamalı; hata üst katmanın mevcut fatal akışına bırakılır.
  setHapticsEnabled(false);
  audio?.destroy();
  throw error;
}

i18next.on('languageChanged', syncDocumentLocale);
game.events.once('destroy', () => {
  i18next.off('languageChanged', syncDocumentLocale);
  setHapticsEnabled(false);
  audio?.destroy();
});
