import { FontManager, UIRoot, VOL_FONTS, i18n } from '@volstudio/core';
import { createVisualPreset } from '@volstudio/core/visual';
import trResources from './i18n/tr.json';
import enResources from './i18n/en.json';
import './i18next-augment';
import './styles.css';
import { Editor } from './Editor';

i18n.addResources('tr', 'volforge', trResources);
i18n.addResources('en', 'volforge', enResources);

await i18n.init();

// Oyun paketlerinde bu işi `createVolGame` yapar; Forge Phaser kullanmadığı
// için aynı font sözleşmesini açıkça yükler. Sistem fontuna sessizce düşmek
// tasarım sistemiyle aynı görünmek değildir.
await new FontManager({ fonts: [VOL_FONTS.Jura, VOL_FONTS['Exo 2']] }).load();

const root = new UIRoot(document.body);
const editor = new Editor(createVisualPreset('softGlow', { size: 256 }), 'effect');
root.mount(editor.element);
editor.start();
