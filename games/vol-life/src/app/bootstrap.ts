import {
  VOL_COLORS,
  createVolGame,
  i18n,
  i18next,
  setHapticsDriver,
  setHapticsEnabled,
} from '@volstudio/core';
import {
  DisplayModeController,
  TauriHapticsDriver,
  androidScreenOrientation,
  getRuntimePlatform,
} from '@volstudio/tauri-v2';
import { LifePreferences } from '@/app/LifePreferences';
import { showFatalError } from '@/app/fatalError';
import { OrientationPreference } from '@/app/OrientationPreference';
import { createSaveManager } from '@/app/storage';
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

function syncDocumentLocale(): void {
  const locale = i18n.getLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = i18n.dir(locale);
  document.title = i18next.t('life:app.title');
}

let game: Awaited<ReturnType<typeof createVolGame>> | null = null;

/*
 * Açılış zincirinin TAMAMI tek korumadadır: i18n, tercih okuması, Phaser ve
 * native pencere. Biri kırılırsa ekran boş kalmaz, neden görünür; korumasız
 * zincirde WebGL kurulamayınca ekran boştu ve hata yalnız konsoldaydı.
 */
try {
  i18n.addResources('tr', 'life', lifeTr);
  i18n.addResources('en', 'life', lifeEn);
  const saveManager = createSaveManager();
  await i18n.init({ saveManager, saveKey: 'vol-life:locale' });
  syncDocumentLocale();

  const platform = getRuntimePlatform();
  setHapticsDriver(platform === 'android' ? new TauriHapticsDriver() : null);
  const preferences = new LifePreferences(saveManager);
  await preferences.load();
  setHapticsEnabled(preferences.get().hapticsEnabled);
  const orientation = new OrientationPreference(
    platform === 'android' ? androidScreenOrientation : null,
  );
  await orientation.load();

  game = await createVolGame({
    backgroundColor: VOL_COLORS.uiBg,
    strategy: 'resize',
    renderScale: lifeGraphicsConfig.renderScale,
    renderer: lifeGraphicsConfig.renderer,
    scenes: [new LifeScene({ platform, preferences, orientation })],
  });

  i18next.on('languageChanged', syncDocumentLocale);
  game.events.once('destroy', () => {
    i18next.off('languageChanged', syncDocumentLocale);
    setHapticsDriver(null);
  });

  // Pencere kipi uygulama ömrüne bağlıdır: sahne yeniden kurulsa da F11
  // dinleyicisi ve native pencere izlemesi tek kalır.
  if (platform === 'desktop') {
    const controller = new DisplayModeController({
      getMode: () => preferences.getDisplayMode(),
      setMode: (mode) => preferences.setDisplayMode(mode),
      subscribe: (listener) => preferences.subscribe(() => listener()),
      target: game.canvas.parentElement ?? document.documentElement,
    });
    game.events.once('destroy', () => controller.destroy());
    await controller.start();
  }
} catch (error) {
  game?.destroy(true);
  setHapticsDriver(null);
  showFatalError(error);
}
