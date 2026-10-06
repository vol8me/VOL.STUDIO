import { Icon, Text, type IconName } from '@volstudio/core/ui';

/** Grid için başlıklı demo kartı. İçerik .vol-showcase-card__body'e sarılır — flex çakışması olmaz. spanAll tam genişlik, span:2 iki sütun, span:3/4/6 yalnızca paletteGrid'de, center her iki eksende ortalar. */
export function card(
  title: string,
  content: HTMLElement,
  options: { spanAll?: boolean; span?: 2 | 3 | 4 | 6; center?: boolean } = {},
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'vol-showcase-card';
  if (options.spanAll) {
    wrapper.classList.add('vol-showcase-card--span-all');
  } else if (options.span) {
    wrapper.classList.add(`vol-showcase-card--span-${options.span}`);
  }

  const heading = new Text(title, { variant: 'muted', tag: 'span' });
  heading.element.classList.add('vol-showcase-card__title');
  wrapper.appendChild(heading.element);

  const body = document.createElement('div');
  body.className = 'vol-showcase-card__body';
  if (options.center) {
    body.classList.add('vol-showcase-card__body--center');
  }
  body.appendChild(content);
  wrapper.appendChild(body);

  return wrapper;
}

export function cardGrid(cards: HTMLElement[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'vol-showcase-card-grid';
  for (const c of cards) {
    grid.appendChild(c);
  }
  return grid;
}

/** 12 birimlik sabit sütunlu cardGrid — Palette sekmesi için. */
export function paletteGrid(cards: HTMLElement[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'vol-palette-grid';
  for (const c of cards) {
    grid.appendChild(c);
  }
  return grid;
}

/** 3 eşit sütunlu cardGrid — Workbench gibi az kartlı satırlar için. */
export function cardGrid3(cards: HTMLElement[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'vol-showcase-card-grid vol-showcase-card-grid--3';
  for (const c of cards) {
    grid.appendChild(c);
  }
  return grid;
}

/** Katalog ikonu (sprite simgesi); ikon adları `./icons`tedir. */
export function svgIcon(name: IconName, size?: number): SVGSVGElement {
  return new Icon({ name, size }).element;
}
