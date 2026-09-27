import { isTauri } from '@tauri-apps/api/core';
import { createVolGame, showFatalStartupError, VOL_COLORS, i18n } from '@volstudio/core';
import {
  TauriWindowAdapter,
  getSessionKind,
  onSteamOverlay,
  registerLinuxHaptics,
} from '@volstudio/tauri-v2';
import { hasNativeWindow, setSessionKind } from '@/app/platform';
import { startDeckMeasure } from '@/app/deckMeasure';
import { notifyGamepadOverlayOpen, startGamepadNavigation } from '@/app/gamepadNav';
import { migrateLegacySave } from '@/app/storage';
import {
  diagnostics,
  gameAudio,
  initServices,
  loadPersistedState,
  saveManager,
  videoSettings,
} from '@/app/services';
import { VideoSettingsController } from '@/app/VideoSettingsController';
import { MainMenuScene } from '@/runtime/scene/MainMenuScene';
import { GameScene } from '@/runtime/scene/GameScene';
import { SettingsScene } from '@/runtime/scene/SettingsScene';
import { gameConfig } from '@/config/game';
import volhellTr from '@/i18n/tr.json';
import volhellEn from '@/i18n/en.json';
import '@/i18next-augment';
import '@/styles.css';

/**
 * Uygulama giriş noktası. Servisler `@/app/services` içinde yaşar — sahneler
 * oradan import eder, bu modülden değil. Böylece bootstrap ile sahneler
 * arasında dairesel bağımlılık oluşmaz.
 */
/**
 * Fatal hata ekranı — i18n init başarısız olabileceği için i18n'ye BAĞLI DEĞİL.
 * Dil tercihini `i18n` hazır değilse `navigator.language`'ten düşürür;
 * key çevirileri bu modülün own sözlüğünde durur (tr.json/en.json ile ayrışabilir
 * — bu ekran i18n'den önce gösterilir).
 */
const FATAL_STRINGS = {
  tr: { title: 'Oyun başlatılamadı' },
  en: { title: 'Failed to start game' },
} as const;

function detectLocale(): 'tr' | 'en' {
  // i18n hazır olabilir (init sonrası hata); değilse tarayıcı diline düş.
  const lang = (i18n.getLocale?.() ?? navigator.language ?? 'tr').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'tr';
}

function showFatalError(error: unknown): void {
  console.error('[bootstrap] Oyun başlatılamadı:', error);
  const locale = detectLocale();
  showFatalStartupError({ title: FATAL_STRINGS[locale].title, error });
}

// Tüm açılış zinciri tek bir korumada: servis kurulumu, i18n, depo okuması ve
// Phaser başlatması. Bunlardan biri patlarsa kullanıcı beyaz ekran yerine
// nedeni görür.
try {
  initServices();

  i18n.addResources('tr', 'volhell', volhellTr);
  i18n.addResources('en', 'volhell', volhellEn);

  // Oturum sınıfı kabuk bildirimidir (web/desktop/gamescope); görüntü
  // yetenekleri ve başlangıç girdi kipi buna bağlanır. Oyun ömrünce sabit.
  setSessionKind(await getSessionKind());

  // Kol gezinmesi uygulama ömürlüdür: sahneler değişse de FocusNavController'ın
  // dinleyicileri ve kol yoklaması sabit kalır; sahne niyetleri delege
  // kaydıyla yönlenir (bkz. app/gamepadNav).
  startGamepadNavigation();

  if (isTauri()) {
    // hidraw öncelikli native titreşim sürücüsü; aygıt yoksa kayıt sessizdir.
    void registerLinuxHaptics();
    // Steam overlay açılınca aktif sahnenin delegesi oyunu duraklatır.
    void onSteamOverlay((active) => {
      if (active) notifyGamepadOverlayOpen();
    });
    // VOL_DECK_MEASURE=1 olmadan hiçbir şey kurulmaz (bkz. app/deckMeasure).
    void startDeckMeasure();
  }

  // Tek dosyalı eski kayıt, hiçbir tüketici okumadan önce kapsamlı
  // store'lara taşınır — i18n dil tercihini de bu dosyadan okur.
  const migration = await migrateLegacySave(saveManager);
  if (migration.moved.length > 0 || migration.unknownLeftBehind) {
    console.info('[bootstrap] Kayıt taşıması:', migration);
  }

  // Dil tercihi `device` kapsamındadır: cihazın yerel tercihidir ve Steam
  // Cloud'a yazılmaz (aynı sözleşme ayarların tamamında geçerlidir).
  await i18n.init({ saveManager, saveKey: 'device.vol-locale' });
  await loadPersistedState();
  document.title = gameConfig.title;

  const game = await createVolGame({
    backgroundColor: VOL_COLORS.uiBg,
    strategy: gameConfig.viewport.strategy,
    maxDpr: () => videoSettings.getMaxDpr(),
    // Rasterleme çözünürlüğü: dünya boyutunu DEĞİŞTİRMEZ, yalnız işlenen
    // piksel sayısını düşürür (kamera aynı çarpanla yakınlaştırılır).
    renderScale: () => videoSettings.getRenderScale(),
    scenes: [MainMenuScene, GameScene, SettingsScene],
    diagnostics: diagnostics ?? undefined,
  });

  // Mobil Tauri penceresinde masaüstü çözünürlük API'leri anlamlı değildir.
  // Masaüstünde ise tek controller F11, native fullscreen ve Phaser DPR'ını
  // uygulama ömrü boyunca senkron tutar.
  const videoController = new VideoSettingsController(videoSettings, {
    target: game.canvas.parentElement ?? document.documentElement,
    windowAdapter: new TauriWindowAdapter({ enabled: hasNativeWindow() }),
  });
  await videoController.start();
  game.events.once('destroy', () => videoController.destroy());

  // Native WebView'larda GStreamer/codec kurulumu yavaş veya kısmi olabilir.
  // SFX ön-yüklemesi oyun yüzeyinin açılmasını asla bloke etmez; SfxBank zaten
  // her dosyayı bağımsız yükler ve ilk kullanımda eksik sesi güvenle atlar.
  void gameAudio.loadAllSfx().catch((error: unknown) => {
    console.warn('[bootstrap] SFX ön-yüklemesi tamamlanamadı:', error);
  });
} catch (error: unknown) {
  showFatalError(error);
}
