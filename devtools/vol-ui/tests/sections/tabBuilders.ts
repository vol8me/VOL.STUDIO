import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAdvancedTab } from '../../src/sections/advancedTab';
import { buildButtonsTab } from '../../src/sections/buttonsTab';
import { buildCardsTab } from '../../src/sections/cardsTab';
import { buildFormsTab } from '../../src/sections/formsTab';
import { buildHudTab } from '../../src/sections/hudTab';
import { buildInputTab } from '../../src/sections/inputTab';
import { buildLoadingTab } from '../../src/sections/loadingTab';
import { buildPaletteTab } from '../../src/sections/paletteTab';
import { buildPanelsTab } from '../../src/sections/panelsTab';
import { buildScrollTab } from '../../src/sections/scrollTab';
import { buildTextTab } from '../../src/sections/textTab';
import { buildTouchTab } from '../../src/sections/touchTab';
import { buildWorkbenchTab } from '../../src/sections/workbenchTab';

export interface TabBuild {
  element: HTMLElement;
  /**
   * Zorunlu: her sekme builder'ı kendi temizliğini döndürür. Opsiyonel
   * yazılırsa testlerdeki `destroy()` çağrıları tipten düşer ve gerçekte var
   * olan sözleşme zayıflatılmış olur.
   */
  destroy: () => void;
}

export interface TabBuilder {
  name: string;
  build: () => TabBuild;
}

/**
 * Showcase sekmelerinin TEK listesi.
 *
 * Kurulum (`sections.test.ts`) ve etkileşim (`interaction.test.ts`) testleri
 * bir dönem kendi listelerini tutuyordu. Yeni eklenen `workbench` sekmesi
 * ikisine de girmedi: sekme aylarca hiç sürülmeden kaldı, içindeki Toolbar
 * hatası testlerden görünmez geçti. `assertEveryTabCovered` bu sınıfın geri
 * dönmesini engeller.
 */
/**
 * @param getRoot Overlay kökünü ÇAĞRI ANINDA veren fonksiyon. Kök `beforeEach`
 * içinde kurulduğu için doğrudan eleman almak, describe gövdesindeki
 * `undefined` değeri yakalardı.
 */
export function tabBuilders(getRoot: () => HTMLElement): TabBuilder[] {
  const root = (): HTMLElement => getRoot();
  return [
    { name: 'buttons', build: () => buildButtonsTab(root()) },
    { name: 'text', build: () => buildTextTab() },
    { name: 'panels', build: () => buildPanelsTab(root()) },
    { name: 'hud', build: () => buildHudTab() },
    { name: 'cards', build: () => buildCardsTab(root()) },
    { name: 'forms', build: () => buildFormsTab(root()) },
    { name: 'workbench', build: () => buildWorkbenchTab(root()) },
    { name: 'palette', build: () => buildPaletteTab() },
    { name: 'advanced', build: () => buildAdvancedTab(root()) },
    { name: 'scroll', build: () => buildScrollTab() },
    { name: 'touch', build: () => buildTouchTab() },
    { name: 'input', build: () => buildInputTab(root()) },
    { name: 'loading', build: () => buildLoadingTab() },
  ];
}

/** `src/sections` altındaki her `*Tab.ts` dosyasının listede olduğunu doğrular. */
export function missingTabModules(): string[] {
  const directory = resolve(import.meta.dirname, '../../src/sections');
  const covered = new Set(tabBuilders(() => document.createElement('div')).map((tab) => tab.name));
  return readdirSync(directory)
    .filter((file) => file.endsWith('Tab.ts'))
    .map((file) => file.replace(/Tab\.ts$/, ''))
    .filter((name) => !covered.has(name));
}
