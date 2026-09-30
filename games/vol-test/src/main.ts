import '@volstudio/core/ui/styles.css';
import {
  createVolGame,
  i18n,
  i18next,
  setHapticsEnabled,
  showFatalStartupError,
  suppressNativeMenus,
} from '@volstudio/core';
import { GAME } from '@/config/game';
import { PALETTE } from '@/config/palette';
import en from '@/i18n/en.json';
import tr from '@/i18n/tr.json';
import '@/i18n/i18next-augment';
import { BootScene } from '@/scenes/BootScene';
import { WorldScene } from '@/scenes/WorldScene';

/** i18n hazır olmadan da okunabilen hata başlığı. */
function fatalTitle(): string {
  const language = (navigator.language ?? 'tr').toLowerCase();
  return language.startsWith('en') ? en.app.fatal : tr.app.fatal;
}

async function boot(): Promise<void> {
  i18n.addResources('tr', 'voltest', tr);
  i18n.addResources('en', 'voltest', en);
  await i18n.init();
  document.title = i18next.t('voltest:app.title');

  // CORE titreşimi varsayılan olarak kapatır; test oyununda his sınanır,
  // bu yüzden açıktır. Kalıcı ayar kabuk servisleriyle gelir.
  setHapticsEnabled(true);

  const game = await createVolGame({
    parent: 'game',
    backgroundColor: PALETTE.void,
    strategy: 'resize',
    maxDpr: GAME.maxDpr,
    scenes: [BootScene, WorldScene],
    audio: { noAudio: false, disableWebAudio: false },
  });
  const stopMenus = suppressNativeMenus(document);
  game.events.once('destroy', stopMenus);
}

boot().catch((error: unknown) => {
  console.error('[VOL.TEST] Açılış başarısız:', error);
  showFatalStartupError({ title: fatalTitle(), error });
});
