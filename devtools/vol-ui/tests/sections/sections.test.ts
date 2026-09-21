import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { missingTabModules, tabBuilders } from './tabBuilders';
import { buildCardsTab } from '../../src/sections/cardsTab';
import { buildHudTab } from '../../src/sections/hudTab';
import { buildPanelsTab } from '../../src/sections/panelsTab';
import { card, cardGrid, svgIcon, paletteGrid } from '../../src/sections/shared';
import { buildWorkbenchTab } from '../../src/sections/workbenchTab';

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

  const builders = tabBuilders(() => uiRoot);

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

  it('panels sekmesi Popover sözleşmesini gerçek tetikleyiciyle sürer', () => {
    const { element, destroy } = buildPanelsTab(uiRoot);
    uiRoot.appendChild(element);
    const trigger = element.querySelector<HTMLButtonElement>('[aria-controls^="vol-popover-"]');

    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    trigger?.click();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    const controlled = trigger?.getAttribute('aria-controls');
    expect(controlled ? document.getElementById(controlled)?.hidden : true).toBe(false);

    trigger?.click();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    destroy();
  });

  describe('HUD demo etkileşimleri', () => {
    /**
     * Kart üretimi iki dosyaya bölününce (`hudFeedbackCards`, `hudPanelCards`)
     * demo düğmelerinin İÇİ hiç sürülmediği ortaya çıktı: `?? 0` yedekleri ve
     * minimap zoom ternary'si hiçbir testte çalışmıyordu. "Sekme kuruldu mu"
     * testi bunları yakalamaz, çünkü kurulumda tıklanmıyorlar.
     *
     * Düğmeler ETİKETLE değil YAPIYLA bulunur: showcase metinleri i18n'den
     * gelir ve dil değişince test kırılırdı.
     */
    function demoControls(element: HTMLElement, demoSelector: string): HTMLButtonElement[] {
      const demo = [...element.querySelectorAll<HTMLElement>('.vol-showcase-panel-demo')].find(
        (node) => node.querySelector(demoSelector) !== null,
      );
      return [...(demo?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    }

    it('kaynak çubuğu topla/harca düğmeleri sayaçları güvenle değiştirir', () => {
      const { element, destroy } = buildHudTab();
      uiRoot.appendChild(element);

      const buttons = demoControls(element, '.vol-resource-bar');
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // `getResource(...) ?? 0` yedeği bilinmeyen anahtarda NaN üretmemeli.
      for (const button of buttons) button.click();
      expect(element.textContent).not.toContain('NaN');

      element.remove();
      destroy();
    });

    it('minimap zoom düğmesi iki kip arasında gider gelir', () => {
      const { element, destroy } = buildHudTab();
      uiRoot.appendChild(element);

      const buttons = demoControls(element, '.vol-minimap');
      expect(buttons.length).toBeGreaterThan(0);

      // `getZoom() > 1 ? 1 : 2` iki dalı da ancak iki tıklamada çalışır.
      for (const button of buttons) {
        button.click();
        button.click();
      }

      expect(element.querySelector('.vol-minimap')).not.toBeNull();
      element.remove();
      destroy();
    });
  });

  describe('paylaşılan yardımcılar', () => {
    it('card, içeriği başlık ve gövdeyle sarar', () => {
      const body = document.createElement('span');
      body.textContent = 'demo';
      const el = card('Title', body);
      expect(el.classList.contains('vol-showcase-card')).toBe(true);
      expect(el.textContent).toContain('Title');
      expect(el.textContent).toContain('demo');
    });

    it('card seçenekleri span ve center sınıflarını uygular', () => {
      const el = card('Span', document.createElement('span'), {
        span: 4,
        center: true,
      });
      expect(el.classList.contains('vol-showcase-card--span-4')).toBe(true);
      expect(el.querySelector('.vol-showcase-card__body--center')).not.toBeNull();

      const full = card('Full', document.createElement('span'), { spanAll: true });
      expect(full.classList.contains('vol-showcase-card--span-all')).toBe(true);
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
    it('LevelUp ve Shop demolarını tam döngüyle sürer', () => {
      const { element, destroy } = buildCardsTab(uiRoot);
      document.body.appendChild(element);

      const buttons = element.querySelectorAll<HTMLButtonElement>('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // 1. LevelUpPicker akışı: aç ve kart seç
      const openLevelUp = buttons[0];
      openLevelUp.click();
      const levelUpCard = uiRoot.querySelector<HTMLButtonElement>('.vol-card-picker .vol-card');
      expect(levelUpCard).not.toBeNull();
      levelUpCard?.click();

      // 2. ShopPicker akışı: aç, kilitle, satın al, sat, reroll, kapat
      const openShop = buttons[1];
      openShop.click();

      const shop = uiRoot.querySelector('.vol-card-picker--shop');
      expect(shop).not.toBeNull();

      const tileCount = uiRoot.querySelectorAll('.vol-card-picker--shop .vol-card').length;
      expect(tileCount).toBeGreaterThanOrEqual(1);

      // Kilit aç / kapa
      const lockBtn = uiRoot.querySelector<HTMLButtonElement>(
        '.vol-card-picker--shop .vol-card__secondary-action',
      );
      lockBtn?.click();
      lockBtn?.click();

      // Satın al
      const buyBtn = uiRoot.querySelector<HTMLButtonElement>(
        '.vol-card-picker--shop .vol-card__action',
      );
      buyBtn?.click();

      // Envanterden sat
      const sellBtn = uiRoot.querySelector<HTMLButtonElement>('.vol-card-shop__list button');
      sellBtn?.click();

      // Reroll
      const rerollButton = shop?.querySelector<HTMLButtonElement>('.vol-card-shop__reroll');
      rerollButton?.click();

      // Kapat
      const closeBtn = shop?.querySelector<HTMLButtonElement>('.vol-card-shop__close');
      closeBtn?.click();

      destroy();
      expect(uiRoot.querySelector('.vol-card-picker--shop')).toBeNull();
    });
  });

  describe('geniş demo kartları', () => {
    it('PANELS Sheet kartını ortak sağ çekmece sınıfıyla sunar', () => {
      const { destroy } = buildPanelsTab(uiRoot);
      const sheet = uiRoot.querySelector('.vol-showcase-sheet');

      expect(sheet?.classList.contains('vol-sheet')).toBe(true);
      expect(sheet?.querySelector('.vol-scroll-view')).not.toBeNull();
      destroy();
    });

    it('HUD StatsPanel kartını tam satıra yayar', () => {
      const { element, destroy } = buildHudTab();
      const cardElement = element
        .querySelector('.vol-stats-panel-modal')
        ?.closest<HTMLElement>('.vol-showcase-card');

      expect(cardElement?.classList.contains('vol-showcase-card--span-all')).toBe(true);
      destroy();
    });

    it('byte bütçeli komut geçmişini tam satıra yayar', () => {
      const { element, destroy } = buildWorkbenchTab();
      const cardElement = element
        .querySelector('.vol-showcase-workbench-history')
        ?.closest<HTMLElement>('.vol-showcase-card');

      expect(cardElement?.classList.contains('vol-showcase-card--span-all')).toBe(true);
      destroy();
    });
  });
});

describe('sekme kapsam bekçisi', () => {
  it('src/sections altındaki her *Tab.ts test listesinde yer alır', () => {
    // `workbench` sekmesi eklenirken iki test dosyasına da girmemişti ve
    // aylarca hiç sürülmedi. Yeni bir sekme listeye alınmadan bu kapı geçmez.
    expect(missingTabModules()).toEqual([]);
  });
});
