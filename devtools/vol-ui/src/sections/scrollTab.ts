import { Carousel, ScrollView, Text, VirtualList } from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

function buildVerticalTextDemo(disposables: Destroyable[]): HTMLElement {
  const loreParagraphs = [
    i18next.t('volui:scroll.lore1'),
    i18next.t('volui:scroll.lore2'),
    i18next.t('volui:scroll.lore3'),
    i18next.t('volui:scroll.lore4'),
    i18next.t('volui:scroll.lore5'),
    i18next.t('volui:scroll.lore6'),
    i18next.t('volui:scroll.lore7'),
  ];

  const scroll = new ScrollView({ direction: 'vertical', size: 220 });
  disposables.push(scroll);
  for (const paragraph of loreParagraphs) {
    const text = new Text(paragraph, { variant: 'body' });
    disposables.push(text);
    scroll.add(text);
  }
  return scroll.element;
}

function buildHorizontalCardsDemo(disposables: Destroyable[]): HTMLElement {
  const scroll = new ScrollView({ direction: 'horizontal' });
  scroll.element.classList.add('vol-showcase-scroll-cards');
  disposables.push(scroll);

  const cards = [
    i18next.t('volui:scroll.pistol'),
    i18next.t('volui:scroll.rifle'),
    i18next.t('volui:scroll.rocketLauncher'),
    i18next.t('volui:scroll.laser'),
    i18next.t('volui:scroll.plasmaCannon'),
    i18next.t('volui:scroll.novaBomb'),
  ];
  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'vol-showcase-scroll-card';
    const text = new Text(card, { variant: 'body', tag: 'span' });
    disposables.push(text);
    el.appendChild(text.element);
    scroll.add({ element: el });
  }

  return scroll.element;
}

interface LootRow {
  id: number;
  name: string;
  rarity: 'common' | 'rare' | 'legendary';
}

const RARITY_KEY: Record<LootRow['rarity'], string> = {
  common: 'volui:scroll.common',
  rare: 'volui:scroll.rare',
  legendary: 'volui:scroll.legendary',
};

const RARITY_COLOR: Record<LootRow['rarity'], string> = {
  common: 'var(--vol-ui-text-muted)',
  rare: 'var(--vol-ui-info-border)',
  legendary: 'var(--vol-ui-warning-border)',
};

/** VirtualList demosu: 5000 satır, DOM'da yalnızca ~12-15 görünür. */
function buildVirtualListDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const rarities: LootRow['rarity'][] = ['common', 'rare', 'legendary'];
  const items: LootRow[] = Array.from({ length: 5000 }, (_, i) => ({
    id: i + 1,
    name: i18next.t('volui:scroll.inventoryItemN', { n: i + 1 }),
    rarity: rarities[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0],
  }));

  const info = new Text(i18next.t('volui:scroll.virtualListInfo', { n: items.length }), {
    variant: 'muted',
  });
  disposables.push(info);

  const list = new VirtualList<LootRow>({
    items,
    itemHeight: 36,
    height: 260,
    overscan: 6,
    renderItem: (item) => {
      const row = document.createElement('div');
      row.className = 'vol-showcase-virtual-row';

      const name = document.createElement('span');
      name.textContent = item.name;
      row.appendChild(name);

      const rarity = document.createElement('span');
      rarity.textContent = i18n.tDynamic(RARITY_KEY[item.rarity]);
      rarity.style.color = RARITY_COLOR[item.rarity];
      rarity.style.fontWeight = '600';
      row.appendChild(rarity);

      return row;
    },
  });
  disposables.push(list);

  wrap.appendChild(info.element);
  wrap.appendChild(list.element);

  return wrap;
}

/** Carousel demosu: 4 sayfalık karakter seçimi. autoPlayIntervalMs yok — beklenmedik geçişler rahatsız eder. */
function buildCarouselDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const characters = [
    { name: i18next.t('volui:scroll.aldric'), desc: i18next.t('volui:scroll.aldricDesc') },
    { name: i18next.t('volui:scroll.meriel'), desc: i18next.t('volui:scroll.merielDesc') },
    { name: i18next.t('volui:scroll.toren'), desc: i18next.t('volui:scroll.torenDesc') },
    { name: i18next.t('volui:scroll.draven'), desc: i18next.t('volui:scroll.dravenDesc') },
  ];

  const resultText = new Text(
    i18next.t('volui:scroll.selectedChar', { name: characters[0].name }),
    { variant: 'body' },
  );
  disposables.push(resultText);

  const slides = characters.map((c) => {
    const slide = document.createElement('div');
    slide.className = 'vol-showcase-carousel-slide';
    const name = new Text(c.name, { variant: 'body' });
    const desc = new Text(c.desc, { variant: 'muted' });
    disposables.push(name, desc);
    slide.appendChild(name.element);
    slide.appendChild(desc.element);
    return { id: c.name, element: slide };
  });

  const carousel = new Carousel({
    slides,
    onSlideChange: (index) => {
      resultText.setContent(
        i18next.t('volui:scroll.selectedChar', { name: characters[index].name }),
      );
    },
  });
  disposables.push(carousel);

  wrap.appendChild(carousel.element);
  wrap.appendChild(resultText.element);

  return wrap;
}

export function buildScrollTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    // Carousel span:2 — dar kartta sıkışıp boşluk bırakmasın.
    card(i18next.t('volui:scroll.verticalText'), buildVerticalTextDemo(disposables)),
    card(i18next.t('volui:scroll.horizontalCards'), buildHorizontalCardsDemo(disposables)),
    card(i18next.t('volui:scroll.carousel'), buildCarouselDemo(disposables), { span: 2 }),
    card(i18next.t('volui:scroll.virtualList'), buildVirtualListDemo(disposables), {
      spanAll: true,
    }),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
