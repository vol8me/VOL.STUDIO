const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'apps'
  | 'audio'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'close'
  | 'collapse'
  | 'expand'
  | 'file'
  | 'font'
  | 'fullscreen'
  | 'grid'
  | 'image'
  | 'list'
  | 'modified'
  | 'more'
  | 'copy'
  | 'eraser'
  | 'eyedropper'
  | 'fill'
  | 'pencil'
  | 'redo'
  | 'refresh'
  | 'reset'
  | 'save'
  | 'search'
  | 'undo'
  | 'warning';

export interface IconDefinition {
  /** SVG viewBox; bütün yerleşik ikonlarda 24×24 koordinat sistemi kullanılır. */
  viewBox: string;
  /** `fill="none"` ve `currentColor` stroke ile çizilecek SVG path'leri. */
  paths: readonly string[];
}

/**
 * Ürünlerin birbirinden kopuk emoji/metin ikonları üretmesini engelleyen küçük,
 * birinci taraf ikon kaydı. Path verisi inert SVG attribute'larına yazılır;
 * `innerHTML` kullanılmaz.
 */
export const VOL_ICONS: Readonly<Record<IconName, IconDefinition>> = {
  apps: {
    viewBox: '0 0 24 24',
    paths: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  },
  audio: {
    viewBox: '0 0 24 24',
    paths: [
      'M9 18V5l10-2v13',
      'M9 9l10-2',
      'M6 20a3 2 0 1 0 0-4 3 2 0 0 0 0 4Z',
      'M16 18a3 2 0 1 0 0-4 3 2 0 0 0 0 4Z',
    ],
  },
  'chevron-down': { viewBox: '0 0 24 24', paths: ['m6 9 6 6 6-6'] },
  'chevron-left': { viewBox: '0 0 24 24', paths: ['m15 18-6-6 6-6'] },
  'chevron-right': { viewBox: '0 0 24 24', paths: ['m9 18 6-6-6-6'] },
  'chevron-up': { viewBox: '0 0 24 24', paths: ['m6 15 6-6 6 6'] },
  close: { viewBox: '0 0 24 24', paths: ['M6 6l12 12', 'M18 6 6 18'] },
  collapse: { viewBox: '0 0 24 24', paths: ['M8 4v16', 'm16 8-4 4 4 4'] },
  expand: { viewBox: '0 0 24 24', paths: ['M8 4v16', 'm12 8-4 4 4 4'] },
  file: { viewBox: '0 0 24 24', paths: ['M6 3h8l4 4v14H6z', 'M14 3v5h5'] },
  font: { viewBox: '0 0 24 24', paths: ['M5 20 12 4l7 16', 'M8 14h8'] },
  fullscreen: {
    viewBox: '0 0 24 24',
    paths: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
  },
  grid: {
    viewBox: '0 0 24 24',
    paths: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  },
  image: { viewBox: '0 0 24 24', paths: ['M4 5h16v14H4z', 'm4 10 3-3 5 5 2-2 4 4', 'M15 9h.01'] },
  list: {
    viewBox: '0 0 24 24',
    paths: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  },
  modified: { viewBox: '0 0 24 24', paths: ['m4 16-1 5 5-1L19 9l-4-4Z', 'm13 7 4 4'] },
  more: { viewBox: '0 0 24 24', paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'] },
  copy: { viewBox: '0 0 24 24', paths: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'] },
  // Piksel editörü araç ikonları. Ürüne değil ROLE bağlıdır: kalem, silgi,
  // kova ve damlalık her raster editöründe aynı anlamı taşır.
  pencil: { viewBox: '0 0 24 24', paths: ['m4 20 1.5-4.5L16 5l3 3L8.5 18.5Z', 'm14 7 3 3'] },
  eraser: {
    viewBox: '0 0 24 24',
    paths: ['M8 20 3 15l9-9 5 5-9 9Z', 'M8 20h11', 'm10 8 5 5'],
  },
  fill: {
    viewBox: '0 0 24 24',
    paths: ['M5 11 12 4l7 7-7 7Z', 'm5 11 7 7', 'M19 15c1.5 2 1.5 4 0 4s-1.5-2 0-4Z'],
  },
  eyedropper: {
    viewBox: '0 0 24 24',
    paths: ['m4 20 1-4 8-8 3 3-8 8Z', 'm14 5 5 5', 'm12 7 5 5'],
  },
  redo: { viewBox: '0 0 24 24', paths: ['m15 7 4 4-4 4', 'M19 11h-8a6 6 0 0 0-6 6'] },
  refresh: {
    viewBox: '0 0 24 24',
    paths: ['M20 6v5h-5', 'M4 18v-5h5', 'M18 9a7 7 0 0 0-12-2', 'M6 15a7 7 0 0 0 12 2'],
  },
  reset: { viewBox: '0 0 24 24', paths: ['M4 12a8 8 0 1 0 2-5.3', 'M4 4v6h6'] },
  save: { viewBox: '0 0 24 24', paths: ['M5 4h12l2 2v14H5z', 'M8 4v6h8V4', 'M8 20v-6h8v6'] },
  search: { viewBox: '0 0 24 24', paths: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z', 'm16 16 4 4'] },
  undo: { viewBox: '0 0 24 24', paths: ['m9 7-4 4 4 4', 'M5 11h8a6 6 0 0 1 6 6'] },
  warning: { viewBox: '0 0 24 24', paths: ['M12 3 2 21h20Z', 'M12 9v5', 'M12 18h.01'] },
};

export interface IconOptions {
  name: IconName;
  /** Verilmezse ikon dekoratiftir ve erişilebilirlik ağacından çıkarılır. */
  label?: string;
  size?: number;
  className?: string;
}

export class Icon {
  readonly element: SVGSVGElement;

  constructor(options: IconOptions) {
    const definition = VOL_ICONS[options.name];
    this.element = document.createElementNS(SVG_NAMESPACE, 'svg');
    this.element.classList.add('vol-icon');
    if (options.className) this.element.classList.add(options.className);
    this.element.setAttribute('viewBox', definition.viewBox);
    this.element.setAttribute('fill', 'none');
    this.element.setAttribute('stroke', 'currentColor');
    this.element.setAttribute('stroke-width', '1.75');
    this.element.setAttribute('stroke-linecap', 'round');
    this.element.setAttribute('stroke-linejoin', 'round');
    this.element.setAttribute('focusable', 'false');
    if (options.size !== undefined) {
      this.element.setAttribute('width', String(options.size));
      this.element.setAttribute('height', String(options.size));
    }

    if (options.label) {
      this.element.setAttribute('role', 'img');
      this.element.setAttribute('aria-label', options.label);
    } else {
      this.element.setAttribute('aria-hidden', 'true');
    }

    for (const pathData of definition.paths) {
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      path.setAttribute('d', pathData);
      this.element.appendChild(path);
    }
  }

  setName(name: IconName): void {
    const definition = VOL_ICONS[name];
    this.element.setAttribute('viewBox', definition.viewBox);
    this.element.replaceChildren();
    for (const pathData of definition.paths) {
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      path.setAttribute('d', pathData);
      this.element.appendChild(path);
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
