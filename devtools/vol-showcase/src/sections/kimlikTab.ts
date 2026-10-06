import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  ICON_CATEGORIES,
  Icon,
  SegmentedControl,
  Text,
  loadIconSprite,
  type CatalogIconName,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, paletteGrid } from './shared';

const SIZES = [24, 32, 48] as const;
const CATEGORY_ORDER = [
  'command',
  'building',
  'unit',
  'resource',
  'projectile',
  'status',
  'item',
  'meta',
  'chrome',
] as const;

/**
 * Kimlik sekmesi: skin'in görünür parçaları. Bu sürümde ikon galerisi vardır; malzeme ve
 * imleç bölümleri aynı sekmeye kendi işlerinde (UI-01.7, UI-01.9) eklenir.
 */
export function buildKimlikTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();

  // Sprite'lar ilk gösterimde yüklenir; galeri hepsini kullanır.
  void loadIconSprite('chrome');
  void loadIconSprite('game');

  let size: number = SIZES[2];
  const cells: Icon[] = [];
  const gallery = document.createElement('div');
  gallery.className = 'vol-showcase-icon-gallery';

  const renderSize = (): void => {
    for (const icon of cells) icon.setSize(size);
  };

  const sizePicker = new SegmentedControl({
    options: SIZES.map((value) => ({ value: String(value), label: `${value}` })),
    value: String(size),
    ariaLabel: i18next.t('volui:kimlik.iconSize'),
    onInput: (value) => {
      size = Number(value);
      renderSize();
    },
  });
  disposables.addDestroyables(sizePicker);
  const hint = new Text(i18next.t('volui:kimlik.iconHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  const toolbar = document.createElement('div');
  toolbar.className = 'vol-showcase-ses__row';
  toolbar.append(sizePicker.element);

  const cards = [
    card(
      i18next.t('volui:kimlik.iconSize'),
      (() => {
        const body = document.createElement('div');
        body.className = 'vol-showcase-panel-demo';
        body.append(hint.element, toolbar);
        return body;
      })(),
      { span: 6 },
    ),
  ];

  for (const category of CATEGORY_ORDER) {
    const names: readonly CatalogIconName[] = ICON_CATEGORIES[category];
    const grid = document.createElement('div');
    grid.className = 'vol-showcase-icon-grid';
    grid.dataset.kimlikCategory = category;
    for (const name of names) {
      const cell = document.createElement('div');
      cell.className = 'vol-showcase-icon-cell';
      const icon = new Icon({ name, size, label: name });
      cells.push(icon);
      const label = document.createElement('span');
      label.className = 'vol-showcase-icon-cell__name';
      label.textContent = name;
      cell.append(icon.element, label);
      grid.appendChild(cell);
    }
    cards.push(
      card(i18next.t(`volui:kimlik.categories.${category}`), grid, {
        span: 6,
      }),
    );
  }
  gallery.appendChild(paletteGrid(cards));
  container.appendChild(gallery);

  return {
    element: container,
    destroy: () => {
      for (const icon of cells) icon.destroy();
      cells.length = 0;
      disposables.dispose();
    },
  };
}
