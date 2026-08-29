import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { missingTabModules, tabBuilders } from './tabBuilders';
import { buildCardsTab } from '../../src/sections/cardsTab';
import { buildHudTab } from '../../src/sections/hudTab';
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

  describe('geniş demo kartları', () => {
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
