import '@volstudio/core/ui/styles.css';
import {
  createVolGame,
  i18n,
  i18next,
  showFatalStartupError,
  suppressNativeMenus,
} from '@volstudio/core';
import { GameServices } from '@/app/GameServices';
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

  const services = await GameServices.create();
  const game = await createVolGame({
    parent: 'game',
    backgroundColor: PALETTE.void,
    strategy: 'resize',
    maxDpr: GAME.maxDpr,
    scenes: [BootScene, new WorldScene(services)],
    diagnostics: services.diagnostics,
    audio: { noAudio: false, disableWebAudio: false },
  });
  const stopMenus = suppressNativeMenus(document);
  game.events.once('destroy', () => {
    stopMenus();
    services.dispose();
  });
}

boot().catch((error: unknown) => {
  console.error('[VOL.TEST] Açılış başarısız:', error);
  showFatalStartupError({ title: fatalTitle(), error });
});
