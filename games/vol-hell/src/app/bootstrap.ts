import { isTauri } from '@tauri-apps/api/core';
import {
  createVolGame,
  showFatalStartupError,
  VOL_COLORS,
  i18n,
  setTextEntryProvider,
} from '@volstudio/core';
import {
  TauriWindowAdapter,
  getSessionKind,
  onSteamOverlay,
  observeLinuxHaptics,
  getDiagnosticsEnv,
  isDeckMeasureRequested,
  registerShutdownFlush,
  createSteamworksTextEntryProvider,
  steamworksStatus,
  activateSteamActionSet,
  reportDiagnostics,
} from '@volstudio/tauri-v2';
import { getSessionKindValue, hasNativeWindow, setSessionKind } from '@/app/platform';
import { startDeckMeasure } from '@/app/deckMeasure';
import { DeckFrameSource } from '@/app/DeckFrameSource';
import { launchDeckScenario, parseDeckScenario } from '@/app/DeckScenario';
import { SteamInputActionSets } from '@/app/steamInputActionSets';
import { startControlGlyphs } from '@/app/controlGlyph';
import { notifyGamepadOverlayOpen, startGamepadNavigation } from '@/app/gamepadNav';
import { migrateLegacySave } from '@/app/storage';
import {
  diagnostics,
  gameAudio,
  initServices,
  loadPersistedState,
  saveManager,
  videoSettings,
  controlSettings,
  audioSettings,
  enableDeckDiagnostics,
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
  const stopGamepadNavigation = startGamepadNavigation();
  const stopControlGlyphs = startControlGlyphs();
  const stopHaptics = isTauri() ? observeLinuxHaptics() : () => undefined;

  if (isTauri()) {
    setTextEntryProvider(createSteamworksTextEntryProvider());
    // hidraw öncelikli native titreşim sürücüsü; aygıt yoksa kayıt sessizdir.
    // Steam overlay açılınca aktif sahnenin delegesi oyunu duraklatır.
    void onSteamOverlay((active) => {
      if (active) notifyGamepadOverlayOpen();
    });
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

  const diagnosticsEnv = await getDiagnosticsEnv();
  const measureRequested = isDeckMeasureRequested(diagnosticsEnv);
  const deckScenario = parseDeckScenario(diagnosticsEnv);
  let frameSource: DeckFrameSource | undefined;
  if (measureRequested)
    enableDeckDiagnostics((snapshot) => frameSource?.captureStages(snapshot.stages));

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

  if (isTauri()) {
    const actionSets = new SteamInputActionSets({
      status: steamworksStatus,
      activate: activateSteamActionSet,
    });
    const updateActionSet = (): void => {
      const scene = game.scene.getScene('Game') as GameScene;
      const context =
        scene?.sys.isActive() || scene?.sys.isPaused() ? scene.getSteamInputContext() : 'Menu';
      actionSets.tick(context, performance.now());
    };
    game.events.on('postrender', updateActionSet);
    const onPadChange = (): void => actionSets.invalidate();
    window.addEventListener('gamepadconnected', onPadChange);
    window.addEventListener('gamepaddisconnected', onPadChange);
    game.events.once('destroy', () => {
      game.events.off('postrender', updateActionSet);
      window.removeEventListener('gamepadconnected', onPadChange);
      window.removeEventListener('gamepaddisconnected', onPadChange);
      actionSets.dispose();
    });
    updateActionSet();
  }

  // Mobil Tauri penceresinde masaüstü çözünürlük API'leri anlamlı değildir.
  // Masaüstünde ise tek controller F11, native fullscreen ve Phaser DPR'ını
  // uygulama ömrü boyunca senkron tutar.
  const videoController = new VideoSettingsController(videoSettings, {
    target: game.canvas.parentElement ?? document.documentElement,
    windowAdapter: new TauriWindowAdapter({ enabled: hasNativeWindow() }),
    managedBySession: getSessionKindValue() === 'gamescope',
  });
  await videoController.start();
  game.events.once('destroy', () => videoController.destroy());
  game.events.once('destroy', () => controlSettings.dispose());
  game.events.once('destroy', stopGamepadNavigation);
  game.events.once('destroy', stopControlGlyphs);
  game.events.once('destroy', stopHaptics);
  game.events.once('destroy', () => setTextEntryProvider(null));
  const stopFlush = registerShutdownFlush(async () => {
    await Promise.all([audioSettings.flush(), videoSettings.flush(), controlSettings.flush()]);
  });
  game.events.once('destroy', stopFlush);

  if (measureRequested) {
    frameSource = new DeckFrameSource({
      events: game.events,
      canvas: game.canvas,
      readScene: () => {
        const scene = game.scene.getScene('Game') as GameScene;
        if (scene?.sys.isActive() || scene?.sys.isPaused()) return scene.getMeasurementState();
        return { phase: game.scene.isActive('Settings') ? 'settings' : 'menu', metrics: {} };
      },
      readAudio: () => gameAudio.context.state,
      onShortcut: (shortcut) => {
        void reportDiagnostics({ type: 'deck-shortcut', ...shortcut });
      },
    });
    const source = frameSource;
    game.events.once('destroy', () => source.destroy());
    await startDeckMeasure({ readState: () => source.read() });
  }

  if (deckScenario) launchDeckScenario(game.scene, deckScenario);

  // Native WebView'larda GStreamer/codec kurulumu yavaş veya kısmi olabilir.
  // SFX ön-yüklemesi oyun yüzeyinin açılmasını asla bloke etmez; SfxBank zaten
  // her dosyayı bağımsız yükler ve ilk kullanımda eksik sesi güvenle atlar.
  void gameAudio.loadAllSfx().catch((error: unknown) => {
    console.warn('[bootstrap] SFX ön-yüklemesi tamamlanamadı:', error);
  });
} catch (error: unknown) {
  showFatalError(error);
}
