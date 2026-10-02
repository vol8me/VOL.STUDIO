import '@volstudio/core/ui/styles.css';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  createVolGame,
  i18n,
  i18next,
  showFatalStartupError,
  suppressNativeMenus,
} from '@volstudio/core';
import { GameServices } from '@/app/GameServices';
import { RenderMeasurements } from '@/app/RenderMeasurements';
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

  const scope = new DisposableScope();
  let game: Awaited<ReturnType<typeof createVolGame>> | undefined;
  try {
    const services = scope.add(await GameServices.create());
    game = await createVolGame({
      parent: 'game',
      backgroundColor: PALETTE.void,
      strategy: 'resize',
      maxDpr: GAME.maxDpr,
      scenes: [BootScene, new WorldScene(services)],
      diagnostics: services.diagnostics,
      audio: { noAudio: false, disableWebAudio: false },
    });
    if (services.measurements)
      scope.addDestroyable(
        new RenderMeasurements(game, {
          onCpuSample: (sample) => services.measurements!.renderCpu(sample),
          onGpuSample: (sample) => services.measurements!.renderGpu(sample),
        }),
      );
    scope.addSubscription(suppressNativeMenus(document));
    game.events.once('destroy', () => scope.dispose());
  } catch (error) {
    try {
      game?.destroy(true);
    } finally {
      scope.dispose();
    }
    throw error;
  }
}

boot().catch((error: unknown) => {
  console.error('[VOL.TEST] Açılış başarısız:', error);
  showFatalStartupError({ title: fatalTitle(), error });
});
