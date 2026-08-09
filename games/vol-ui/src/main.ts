import { createVolGame, VOL_COLORS, i18n } from '@volstudio/core';
import { ShowcaseScene } from './scenes/ShowcaseScene';
import trResources from './i18n/tr.json';
import enResources from './i18n/en.json';
import './i18next-augment';
import './styles.css';

i18n.addResources('tr', 'volui', trResources);
i18n.addResources('en', 'volui', enResources);

await i18n.init();

createVolGame({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: VOL_COLORS.uiBg,
  strategy: 'resize',
  scenes: [ShowcaseScene],
}).catch((error: unknown) => {
  console.error('[main] VOL.UI başlatılamadı:', error);
});
