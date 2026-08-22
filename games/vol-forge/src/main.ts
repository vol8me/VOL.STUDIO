import { UIRoot, i18n } from '@volstudio/core';
import type { SpriteDoc } from '@volstudio/core/visual';
import trResources from './i18n/tr.json';
import enResources from './i18n/en.json';
import trParams from './i18n/params.tr.json';
import enParams from './i18n/params.en.json';
import './i18next-augment';
import './styles.css';
import { Editor } from './Editor';

// Şema metinleri ÜRETİLİR (`pnpm --filter @volstudio/vol-forge gen:params`);
// elle iki kopya taşımak yerine tek kaynaktan türetilir (§8.13).
i18n.addResources('tr', 'volforge', { ...trResources, node: trParams });
i18n.addResources('en', 'volforge', { ...enResources, node: enParams });

/** Boş sayfa yerine çalışan bir belge: editör "sıfırdan kurma"ya da açık (§8). */
const STARTER: SpriteDoc = {
  schemaVersion: 1,
  size: [64, 64],
  seed: 1337,
  palette: {
    generate: [{ base: '#6b5570', steps: 5, hueShift: -18, satCurve: 'arch' }],
  },
  layers: [
    {
      id: 'govde',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 },
      height: { kind: 'gradient.radial', center: [-0.2, -0.2], radius: 1.1 },
      material: 0,
    },
  ],
} as SpriteDoc;

await i18n.init();

const root = new UIRoot(document.body);
const editor = new Editor(STARTER);
root.mount(editor.element);
editor.start();
