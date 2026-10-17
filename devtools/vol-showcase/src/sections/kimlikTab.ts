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
import { buildCursorSection } from './kimlikCursors';
import { buildMaterialSection } from './kimlikMaterial';
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
 * Kimlik sekmesi: skin'in görünür parçaları. İkon galerisi ve imleç bölümü (galeriler, RTS ve
 * nişangâh test alanları) ve malzeme bölümü (yüzeyler, çerçeve, bar, düğme) burada.
 */
export function buildKimlikTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();

  // Sprite'lar ilk gösterimde yüklenir; galeri hepsini kullanır.
  void loadIconSprite('chrome');
  void loadIconSprite('game');

  let size: number = SIZES[2];
  let category: (typeof CATEGORY_ORDER)[number] = CATEGORY_ORDER[0];
  let cells: Icon[] = [];
  const gallery = document.createElement('div');
  gallery.className = 'vol-showcase-icon-gallery';
  const grid = document.createElement('div');
  grid.className = 'vol-showcase-icon-grid';

  // Yalnız seçili kategorinin ikonları DOM'dadır: 191 ikonu birden boyamak sekme geçişini yavaşlatıyordu.
  const renderGrid = (): void => {
    for (const icon of cells) icon.destroy();
    cells = [];
    grid.dataset.kimlikCategory = category;
    const names: readonly CatalogIconName[] = ICON_CATEGORIES[category];
    grid.replaceChildren(
      ...names.map((name) => {
        const cell = document.createElement('div');
        cell.className = 'vol-showcase-icon-cell';
        const icon = new Icon({ name, size, label: name });
        cells.push(icon);
        const label = document.createElement('span');
        label.className = 'vol-showcase-icon-cell__name';
        label.textContent = name;
        cell.append(icon.element, label);
        return cell;
      }),
    );
  };

  const sizePicker = new SegmentedControl({
    options: SIZES.map((value) => ({ value: String(value), label: `${value}` })),
    value: String(size),
    ariaLabel: i18next.t('volui:kimlik.iconSize'),
    onInput: (value) => {
      size = Number(value);
      for (const icon of cells) icon.setSize(size);
    },
  });
  const categoryPicker = new SegmentedControl({
    options: CATEGORY_ORDER.map((value) => ({
      value,
      label: i18next.t(`volui:kimlik.categories.${value}`),
    })),
    value: category,
    ariaLabel: i18next.t('volui:kimlik.iconCategory'),
    onInput: (value) => {
      category = value as (typeof CATEGORY_ORDER)[number];
      renderGrid();
    },
  });
  disposables.addDestroyables(sizePicker, categoryPicker);
  const hint = new Text(i18next.t('volui:kimlik.iconHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  const toolbar = document.createElement('div');
  toolbar.className = 'vol-showcase-ses__row';
  toolbar.append(sizePicker.element);
  renderGrid();

  const cards = [
    card(
      i18next.t('volui:kimlik.iconGallery'),
      (() => {
        const body = document.createElement('div');
        body.className = 'vol-showcase-panel-demo';
        body.append(hint.element, toolbar, categoryPicker.element, grid);
        return body;
      })(),
      { spanAll: true },
    ),
  ];

  const cursors = buildCursorSection();
  cards.push(...cursors.cards);
  const material = buildMaterialSection();
  cards.unshift(...material.cards);
  gallery.appendChild(paletteGrid(cards));
  container.appendChild(gallery);

  return {
    element: container,
    destroy: () => {
      cursors.destroy();
      material.destroy();
      for (const icon of cells) icon.destroy();
      cells = [];
      disposables.dispose();
    },
  };
}
