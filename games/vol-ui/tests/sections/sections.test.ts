import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildButtonsTab } from '../../src/sections/buttonsTab';
import { buildTextTab } from '../../src/sections/textTab';
import { buildPanelsTab } from '../../src/sections/panelsTab';
import { buildHudTab } from '../../src/sections/hudTab';
import { buildCardsTab } from '../../src/sections/cardsTab';
import { buildFormsTab } from '../../src/sections/formsTab';
import { buildPaletteTab } from '../../src/sections/paletteTab';
import { buildAdvancedTab } from '../../src/sections/advancedTab';
import { buildScrollTab } from '../../src/sections/scrollTab';
import { buildTouchTab } from '../../src/sections/touchTab';
import { buildLoadingTab } from '../../src/sections/loadingTab';
import { card, cardGrid, svgIcon, paletteGrid } from '../../src/sections/shared';

describe('vol-ui sekme builderları', () => {
  let uiRoot: HTMLDivElement;

  beforeEach(() => {
    uiRoot = document.createElement('div');
    document.body.appendChild(uiRoot);
  });

  // Sekmeler overlay'lerini `uiRoot`a ya da doğrudan `document.body`'ye
  // asabiliyor; testler arası sızıntı bir sonraki testin sorgusunu
  // kirletmesin diye DOM her testten sonra sıfırlanır.
  afterEach(() => {
    document.body.replaceChildren();
  });

  const builders = [
    { name: 'buttons', build: () => buildButtonsTab(uiRoot) },
    { name: 'text', build: () => buildTextTab() },
    { name: 'panels', build: () => buildPanelsTab(uiRoot) },
    { name: 'hud', build: () => buildHudTab() },
    { name: 'cards', build: () => buildCardsTab(uiRoot) },
    { name: 'forms', build: () => buildFormsTab(uiRoot) },
    { name: 'palette', build: () => buildPaletteTab() },
    { name: 'advanced', build: () => buildAdvancedTab(uiRoot) },
    { name: 'scroll', build: () => buildScrollTab() },
    { name: 'touch', build: () => buildTouchTab() },
    { name: 'loading', build: () => buildLoadingTab() },
  ] as const;

  for (const { name, build } of builders) {
    it(`${name} sekmesi element döndürür ve destroy overlay bırakmaz`, () => {
      const { element, destroy } = build();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('vol-showcase-section')).toBe(true);
      expect(element.children.length).toBeGreaterThan(0);

      destroy();

      // `destroy()` sekmenin kendi `element`ini DOM'dan kaldırmaz — bu sahne
      // sorumluluğu. Sorumluluğu olan şey, sekmenin `uiRoot`a astığı
      // overlay'leri geri toplamaktır. `panels`/`cards`/`advanced` kurulumda
      // gerçekten 2-4 düğüm asar; kalan sekmeler için sayaç zaten sıfırdır.
      expect(uiRoot.children.length).toBe(0);

      // Sahne yeniden kurulurken ikinci `destroy()` gerçekten oluşuyor;
      // patlamamalı.
      expect(() => destroy()).not.toThrow();
    });
  }

  describe('paylaşılan yardımcılar', () => {
    it('card, içeriği başlık ve gövdeyle sarar', () => {
      const body = document.createElement('span');
      body.textContent = 'demo';
      const el = card('Title', body);
      expect(el.classList.contains('vol-showcase-card')).toBe(true);
      expect(el.textContent).toContain('Title');
      expect(el.textContent).toContain('demo');
    });

    it('cardGrid kartları toplar', () => {
      const grid = cardGrid([
        card('A', document.createElement('span')),
        card('B', document.createElement('span')),
      ]);
      expect(grid.classList.contains('vol-showcase-card-grid')).toBe(true);
      expect(grid.children.length).toBe(2);
    });

    it('paletteGrid kartları toplar', () => {
      const grid = paletteGrid([card('A', document.createElement('span'))]);
      expect(grid.classList.contains('vol-palette-grid')).toBe(true);
      expect(grid.children.length).toBe(1);
    });

    it('svgIcon bir SVG üretir', () => {
      const icon = svgIcon('M0 0');
      expect(icon.tagName.toLowerCase()).toBe('svg');
      expect(icon.querySelector('path')).not.toBeNull();
    });
  });

  describe('cards sekmesi etkileşimi', () => {
    it('butona tıklayınca dükkân açılır ve reroll teklifleri yeniler', () => {
      const { element, destroy } = buildCardsTab(uiRoot);

      const openShop = element.querySelector<HTMLButtonElement>('button');
      expect(openShop).not.toBeNull();

      openShop?.click();

      const shop = document.querySelector('.vol-card-picker--shop');
      expect(shop).not.toBeNull();

      const tileCount = document.querySelectorAll('.vol-card-picker--shop .vol-card').length;
      expect(tileCount).toBeGreaterThanOrEqual(1);

      const rerollButton = shop?.querySelector<HTMLButtonElement>('.vol-card-shop__reroll');
      expect(rerollButton).not.toBeNull();

      // Reroll teklifleri *değiştirir*, listeyi boşaltmaz. Çekilen kartlar
      // rastgele olduğu için kimlik değil sayı sabitliği doğrulanır; regresyonda
      // asıl kırılan şey listenin boşalması ya da katlanarak büyümesi olur.
      rerollButton?.click();
      expect(document.querySelectorAll('.vol-card-picker--shop .vol-card')).toHaveLength(tileCount);

      destroy();
      expect(document.querySelector('.vol-card-picker--shop')).toBeNull();
    });
  });
});
