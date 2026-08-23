import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Checkbox, Text } from '@volstudio/core/ui';
import { element, replaceChildren } from '../../ui/dom';
import { extractPalette, type PaletteEntry } from '../Palette';
import type { RasterBuffer } from '../transform';
import type { Translate } from './LayerPanel';

export interface PalettePanelOptions {
  t: Translate;
  onPick: (hex: string) => void;
  onReplace: (from: string, to: string) => void;
  onQuantize: (palette: string[], dither: boolean) => void;
}

const MAX_SWATCHES = 64;

/**
 * Belgeden çıkarılan palet — CORE bileşenleriyle.
 *
 * Renkler kullanım sayısına göre sıralanır; en çok kullanılan renk başta olur
 * ve kullanıcı gövde rengini aramak zorunda kalmaz. Sağ tuş seçili rengi
 * tıklanan renkle değiştirir.
 */
export class PalettePanel {
  readonly element: HTMLElement;
  readonly #scope = new DisposableScope();
  readonly #grid: HTMLDivElement;
  readonly #title: Text;
  readonly #count: Text;
  readonly #dither: Checkbox;
  readonly #quantize: Button;
  readonly #options: PalettePanelOptions;
  #t: Translate;
  #entries: PaletteEntry[] = [];
  #selected: string | null = null;

  public constructor(options: PalettePanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = new Text(options.t('editor.palette'), { variant: 'muted', tag: 'h3' });
    this.#title.element.classList.add('palette-panel__title');
    this.#count = new Text('', { variant: 'muted' });
    this.#count.element.classList.add('palette-panel__count');
    this.#grid = element('div', { className: 'palette-panel__grid', attrs: { role: 'list' } });
    this.#scope.addListener(this.#grid, 'click', (event) => this.#handlePick(event));
    this.#scope.addListener(this.#grid, 'contextmenu', (event) => this.#handleReplace(event));
    this.#dither = new Checkbox({ label: options.t('editor.dither') });
    this.#quantize = new Button(options.t('editor.quantize'), {
      size: 'sm',
      onClick: () =>
        options.onQuantize(
          this.#entries.map((entry) => entry.hex),
          this.#dither.isChecked(),
        ),
    });
    this.#quantize.element.classList.add('palette-panel__quantize');

    this.element = element('section', {
      className: 'palette-panel',
      children: [
        element('header', {
          className: 'panel-section__header',
          children: [this.#title.element, this.#count.element],
        }),
        this.#grid,
        element('div', {
          className: 'panel-section__actions panel-section__actions--spread',
          children: [this.#dither.element, this.#quantize.element],
        }),
      ],
    });
  }

  public setTranslator(next: Translate): void {
    this.#t = next;
    this.#title.setContent(next('editor.palette'));
    this.#quantize.setLabel(next('editor.quantize'));
    this.#count.setContent(next('editor.paletteCount', { count: this.#entries.length }));
  }

  /** Belgeden paleti yeniden çıkarır. */
  public update(buffer: RasterBuffer): void {
    this.#entries = extractPalette(buffer, MAX_SWATCHES);
    this.#count.setContent(this.#t('editor.paletteCount', { count: this.#entries.length }));
    replaceChildren(this.#grid, ...this.#entries.map((entry) => this.#swatch(entry)));
  }

  public destroy(): void {
    for (const component of [this.#title, this.#count, this.#dither, this.#quantize]) {
      component.destroy();
    }
    this.#scope.dispose();
    this.element.remove();
  }

  #refreshSelection(): void {
    for (const node of this.#grid.querySelectorAll<HTMLElement>('.palette-swatch')) {
      node.classList.toggle('palette-swatch--selected', node.dataset.color === this.#selected);
      node.setAttribute('aria-pressed', String(node.dataset.color === this.#selected));
    }
  }

  #swatch(entry: PaletteEntry): HTMLElement {
    const label = this.#t('editor.paletteSwatch', { hex: entry.hex, count: entry.count });
    const button = element('button', {
      className: `palette-swatch${entry.hex === this.#selected ? ' palette-swatch--selected' : ''}`,
      attrs: {
        type: 'button',
        role: 'listitem',
        'data-color': entry.hex,
        'aria-pressed': String(entry.hex === this.#selected),
        title: label,
        'aria-label': label,
      },
    });
    button.style.setProperty('--swatch-color', entry.hex);
    return button;
  }

  #handlePick(event: Event): void {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLElement>('.palette-swatch') : null;
    const color = button?.dataset.color;
    if (color === undefined) return;
    this.#selected = color;
    this.#options.onPick(color);
    // Yalnız seçim vurgusu tazelenir; `update()` çağırmak paleti belgeden
    // yeniden çıkarır ve tıklamayı gereksiz bir tam taramaya çevirirdi.
    this.#refreshSelection();
  }

  #handleReplace(event: Event): void {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLElement>('.palette-swatch') : null;
    const color = button?.dataset.color;
    if (color === undefined) return;
    event.preventDefault();
    if (this.#selected !== null && this.#selected !== color) {
      this.#options.onReplace(this.#selected, color);
    }
  }
}
