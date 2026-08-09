import { Text, i18n } from '@volstudio/core';
import { card, paletteGrid } from './shared';

interface PaletteGroup {
  titleKey: string;
  tokens: string[];
  /** 12 birimlik vol-palette-grid'de kart genişliği. Her satırın span toplamı 12. */
  span: 3 | 4 | 6;
}

interface Destroyable {
  destroy(): void;
}

const GROUPS: PaletteGroup[] = [
  // Satır 1: nötr temel tonlar — 6 + 6 = 12.
  {
    titleKey: 'volui:palette.surface',
    tokens: [
      '--vol-ui-bg',
      '--vol-ui-bg-subtle',
      '--vol-ui-surface-1',
      '--vol-ui-surface-2',
      '--vol-ui-surface-3',
      '--vol-ui-border-soft',
      '--vol-ui-border-strong',
    ],
    span: 6,
  },
  {
    titleKey: 'volui:palette.text',
    tokens: [
      '--vol-ui-text',
      '--vol-ui-text-secondary',
      '--vol-ui-text-muted',
      '--vol-ui-text-disabled',
      '--vol-ui-icon',
    ],
    span: 6,
  },
  // Satır 2: marka/aksan renk aileleri, yan yana — 4 + 4 + 4 = 12.
  {
    titleKey: 'volui:palette.brand',
    tokens: [
      '--vol-ui-brand-solid',
      '--vol-ui-brand-hover',
      '--vol-ui-brand-pressed',
      '--vol-ui-brand-subtle',
      '--vol-ui-brand-border',
      '--vol-ui-on-brand',
    ],
    span: 4,
  },
  {
    titleKey: 'volui:palette.support',
    tokens: [
      '--vol-ui-support-solid',
      '--vol-ui-support-hover',
      '--vol-ui-support-pressed',
      '--vol-ui-support-subtle',
      '--vol-ui-support-border',
      '--vol-ui-on-support',
    ],
    span: 4,
  },
  {
    titleKey: 'volui:palette.accent',
    tokens: [
      '--vol-ui-accent-solid',
      '--vol-ui-accent-hover',
      '--vol-ui-accent-pressed',
      '--vol-ui-accent-subtle',
      '--vol-ui-accent-border',
      '--vol-ui-on-accent',
    ],
    span: 4,
  },
  // Satır 3: dört semantik durum — 3 + 3 + 3 + 3 = 12.
  {
    titleKey: 'volui:palette.semanticSuccess',
    tokens: [
      '--vol-ui-success-solid',
      '--vol-ui-success-subtle',
      '--vol-ui-success-border',
      '--vol-ui-on-success',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticWarning',
    tokens: [
      '--vol-ui-warning-solid',
      '--vol-ui-warning-subtle',
      '--vol-ui-warning-border',
      '--vol-ui-on-warning',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticDanger',
    tokens: [
      '--vol-ui-danger-solid',
      '--vol-ui-danger-subtle',
      '--vol-ui-danger-border',
      '--vol-ui-on-danger',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticInfo',
    tokens: [
      '--vol-ui-info-solid',
      '--vol-ui-info-subtle',
      '--vol-ui-info-border',
      '--vol-ui-on-info',
    ],
    span: 3,
  },
  // Satır 4: etkileşim durumları + overlay katmanları — 6 + 6 = 12.
  {
    titleKey: 'volui:palette.interaction',
    tokens: [
      '--vol-ui-hover-fill',
      '--vol-ui-pressed-fill',
      '--vol-ui-selected-fill',
      '--vol-ui-focus-ring',
      '--vol-ui-focus-halo',
      '--vol-ui-disabled-fill',
      '--vol-ui-disabled-border',
      '--vol-ui-disabled-text',
    ],
    span: 6,
  },
  {
    titleKey: 'volui:palette.overlay',
    tokens: [
      '--vol-ui-inverse-surface',
      '--vol-ui-inverse-text',
      '--vol-ui-overlay-panel',
      '--vol-ui-scrim',
      '--vol-ui-hairline-alpha',
      '--vol-ui-selection-glow',
    ],
    span: 6,
  },
];

function buildSwatch(
  token: string,
  rootStyle: CSSStyleDeclaration,
  disposables: Destroyable[],
): HTMLElement {
  const value = rootStyle.getPropertyValue(token).trim();

  const swatch = document.createElement('div');
  swatch.className = 'vol-palette-swatch';

  const chip = document.createElement('div');
  chip.className = 'vol-palette-swatch__chip';
  chip.style.background = value || 'transparent';
  swatch.appendChild(chip);

  const name = new Text(token.replace('--vol-ui-', ''), { variant: 'muted', tag: 'span' });
  name.element.classList.add('vol-palette-swatch__name');
  swatch.appendChild(name.element);

  const hex = new Text(value, { variant: 'muted', tag: 'span' });
  hex.element.classList.add('vol-palette-swatch__hex');
  swatch.appendChild(hex.element);

  disposables.push(name, hex);
  return swatch;
}

function buildGroupGrid(
  group: PaletteGroup,
  rootStyle: CSSStyleDeclaration,
  disposables: Destroyable[],
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'vol-palette-group__grid';
  for (const token of group.tokens) {
    grid.appendChild(buildSwatch(token, rootStyle, disposables));
  }
  return grid;
}

export function buildPaletteTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const rootStyle = getComputedStyle(document.documentElement);
  const cards = GROUPS.map((group) =>
    card(i18n.tDynamic(group.titleKey), buildGroupGrid(group, rootStyle, disposables), { span: group.span }),
  );

  container.appendChild(paletteGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
