import { createVolGame, VOL_COLORS, i18n, isDiagnosticsEnabled } from '@volstudio/core';
import { initServices, loadPersistedState, saveManager } from '@/app/services';
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
function showFatalError(error: unknown): void {
  console.error('[bootstrap] Oyun başlatılamadı:', error);
  const message = error instanceof Error ? error.message : String(error);

  const overlay = document.createElement('div');
  overlay.className = 'vol-fatal-error';
  overlay.setAttribute('role', 'alert');
  overlay.textContent = `Oyun başlatılamadı: ${message}`;
  document.body.appendChild(overlay);
}

// Tüm açılış zinciri tek bir korumada: servis kurulumu, i18n, depo okuması ve
// Phaser başlatması. Bunlardan biri patlarsa kullanıcı beyaz ekran yerine
// nedeni görür.
try {
  initServices();

  i18n.addResources('tr', 'volhell', volhellTr);
  i18n.addResources('en', 'volhell', volhellEn);

  // Dil tercihi oyun ayarlarıyla aynı depoya yazılır — servislerin kurduğu
  // SaveManager paylaşılır, ikinci bir adapter örneği yaratılmaz.
  await i18n.init({ saveManager });
  await loadPersistedState();

  document.title = gameConfig.title;

  await createVolGame({
    backgroundColor: VOL_COLORS.uiBg,
    strategy: gameConfig.viewport.strategy,
    maxDpr: gameConfig.viewport.maxDpr,
    scenes: [MainMenuScene, GameScene, SettingsScene],
    gameId: 'vol-hell',
    debug: isDiagnosticsEnabled(),
  });
} catch (error: unknown) {
  showFatalError(error);
}
