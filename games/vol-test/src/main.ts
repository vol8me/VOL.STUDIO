import '@volstudio/core/ui/styles.css';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  createVolGame,
  i18n,
  i18next,
  installEditMenu,
  showFatalStartupError,
  suppressNativeMenus,
} from '@volstudio/core';
import { AdaptiveResolution } from '@/app/AdaptiveResolution';
import { BootLoading } from '@/app/bootLoading';
import { GameServices } from '@/app/GameServices';
import { applyLanguage } from '@/app/language';
import { RenderMeasurements } from '@/app/RenderMeasurements';
import { GAME } from '@/config/game';
import { PALETTE } from '@/config/palette';
import en from '@/i18n/en.json';
import tr from '@/i18n/tr.json';
import '@/i18n/i18next-augment';
import { BackdropScene } from '@/scenes/BackdropScene';
import { BootScene } from '@/scenes/BootScene';
import { GarageScene } from '@/scenes/GarageScene';
import { MenuScene } from '@/scenes/MenuScene';
import { DevScene } from '@/scenes/DevScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { BOOT_EVENT } from '@/scenes/bootEvents';
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
  const loading = new BootLoading();
  try {
    const services = scope.add(await GameServices.create());
    const resolution = new AdaptiveResolution(() => services.isPaused);
    await applyLanguage(services.settings.get().language);
    loading.servicesReady();
    game = await createVolGame({
      parent: 'game',
      backgroundColor: PALETTE.void,
      strategy: 'resize',
      maxDpr: GAME.maxDpr,
      maxPixels: GAME.maxPixels,
      renderScale: () => resolution.scale,
      // Hibrit GPU'lu dizüstünde tarayıcı varsayılanı tümleşik GPU'dur; oyun ayrık GPU'yu ister.
      render: { powerPreference: 'high-performance' },
      scenes: [
        new BootScene(services),
        // Menü sahnelerinin altında çizilsin diye onlardan önce kaydedilir (Phaser sahneleri liste sırasıyla çizer).
        new BackdropScene(services),
        new MenuScene(services),
        new GarageScene(services),
        new SettingsScene(services),
        new DevScene(services),
        new WorldScene(services),
      ],
      diagnostics: services.diagnostics,
      audio: { noAudio: false, disableWebAudio: false },
    });
    game.events.on(BOOT_EVENT.progress, (ratio: number) => loading.assets(ratio));
    game.events.once(BOOT_EVENT.ready, () => loading.worldReady());
    if (services.measurements)
      scope.addDestroyable(
        new RenderMeasurements(game, {
          onCpuSample: (sample) => services.measurements!.renderCpu(sample),
          onGpuSample: (sample) => services.measurements!.renderGpu(sample),
        }),
      );
    if (!services.measurements) scope.addSubscription(resolution.attach(game));
    scope.addSubscription(suppressNativeMenus(document));
    // Yerel menü kapalıyken düzenlenebilir alanlar (senaryo paneli) kendi Kes/Kopyala/Yapıştır menüsünü alır.
    scope.addSubscription(installEditMenu(document));
    game.events.once('destroy', () => scope.dispose());
  } catch (error) {
    loading.abort();
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
  showFatalStartupError({ title: fatalTitle(), error, autoFocus: true });
});
