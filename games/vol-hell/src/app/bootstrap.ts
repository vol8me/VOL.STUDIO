import { createVolGame, VOL_COLORS, i18n } from '@volstudio/core';
import { createSaveManager } from '@/app/storage';
import { AudioSettings } from '@/app/AudioSettings';
import { MainMenuScene } from '@/runtime/scene/MainMenuScene';
import { GameScene } from '@/runtime/scene/GameScene';
import { SettingsScene } from '@/runtime/scene/SettingsScene';
import { gameConfig } from '@/config/game';
import volhellTr from '@/i18n/tr.json';
import volhellEn from '@/i18n/en.json';
import '@/i18next-augment';
import '@/styles.css';

const saveManager = createSaveManager();

export const audioSettings = new AudioSettings(saveManager);

i18n.addResources('tr', 'volhell', volhellTr);
i18n.addResources('en', 'volhell', volhellEn);

await i18n.init({ saveManager });
await audioSettings.load();

document.title = gameConfig.title;

createVolGame({
  backgroundColor: VOL_COLORS.uiBg,
  strategy: gameConfig.viewport.strategy,
  scenes: [MainMenuScene, GameScene, SettingsScene],
}).catch((error: unknown) => {
  console.error('[bootstrap] Oyun başlatılamadı:', error);
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:${VOL_COLORS.uiBg};color:${VOL_COLORS.dangerSolid};font-family:monospace;font-size:14px;padding:32px;text-align:center;z-index:9999`;
  div.textContent = `Oyun başlatılamadı: ${error instanceof Error ? error.message : String(error)}`;
  document.body.appendChild(div);
});
