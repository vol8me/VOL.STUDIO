import { Icon, IconButton, NumberStepper, Slider, Text } from '@volstudio/core/ui';
import { element, replaceChildren } from '../../ui/dom';
import type { RasterBuffer } from '../transform';
import type { Translate } from './LayerPanel';

export interface FramePanelOptions {
  t: Translate;
  onSelect: (index: number) => void;
  onAdd: (copyCurrent: boolean) => void;
  onRemove: (index: number) => void;
  onDuration: (index: number, durationMs: number) => void;
  onOnionSkin: (before: number, after: number) => void;
  onPlayToggle: (playing: boolean) => void;
}

interface Destroyable {
  destroy(): void;
}

const CELL_SIZE = 44;

/**
 * Kare şeridi, süre denetimi ve onion skin — CORE bileşenleriyle.
 *
 * Kareler numarayla değil KÜÇÜK ÖNİZLEMEYLE gösterilir; animasyonda hangi
 * karede olduğunu sayıdan takip etmek mümkün değildir.
 */
export class FramePanel {
  readonly element: HTMLElement;
  readonly #strip: HTMLDivElement;
  readonly #title: Text;
  readonly #playButton: IconButton;
  readonly #addButton: IconButton;
  readonly #copyButton: IconButton;
  readonly #removeButton: IconButton;
  readonly #duration: NumberStepper;
  readonly #onion: Slider;
  readonly #options: FramePanelOptions;
  #cellComponents: Destroyable[] = [];
  #t: Translate;
  #playing = false;
  #activeIndex = 0;

  public constructor(options: FramePanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = new Text(options.t('editor.frames'), { variant: 'muted', tag: 'h3' });
    this.#title.element.classList.add('frame-panel__title');
    this.#playButton = this.#action('play', 'framePlay', () => {
      this.#playing = !this.#playing;
      this.#syncPlayIcon();
      options.onPlayToggle(this.#playing);
    });
    this.#addButton = this.#action('layer-add', 'frameAdd', () => options.onAdd(false));
    this.#copyButton = this.#action('copy', 'frameCopy', () => options.onAdd(true));
    this.#removeButton = this.#action('trash', 'frameRemove', () =>
      options.onRemove(this.#activeIndex),
    );

    this.#strip = element('div', { className: 'frame-panel__strip', attrs: { role: 'list' } });

    this.#duration = new NumberStepper({
      min: 10,
      max: 5000,
      step: 10,
      value: 100,
      label: options.t('editor.frameDuration'),
      onCommit: (value) => options.onDuration(this.#activeIndex, value),
    });
    this.#onion = new Slider({
      min: 0,
      max: 3,
      step: 1,
      value: 0,
      label: options.t('editor.onionSkin'),
      formatValue: (value) => String(Math.round(value)),
      // Onion skin salt görsel bir yardımdır; canlı `onInput` doğru sözleşme.
      onInput: (value) => options.onOnionSkin(Math.round(value), Math.round(value)),
    });

    this.element = element('section', {
      className: 'frame-panel',
      children: [
        element('header', {
          className: 'panel-section__header',
          children: [
            this.#title.element,
            element('div', {
              className: 'panel-section__actions',
              children: [
                this.#playButton.element,
                this.#addButton.element,
                this.#copyButton.element,
                this.#removeButton.element,
              ],
            }),
          ],
        }),
        this.#strip,
        // Etiketler bileşenlerin KENDİ `label` seçeneğinden gelir; ayrıca
        // `Text` koymak ekranda "Süre (ms)" yazısını iki kez gösteriyordu.
        element('div', {
          className: 'frame-panel__controls',
          children: [
            element('div', {
              className: 'panel-section__field',
              children: [this.#duration.element],
            }),
            element('div', {
              className: 'panel-section__field',
              children: [this.#onion.element],
            }),
          ],
        }),
      ],
    });
    this.#syncPlayIcon();
  }

  public setTranslator(next: Translate): void {
    this.#t = next;
    this.#title.setContent(next('editor.frames'));
    this.#playButton.setLabel(next(this.#playing ? 'editor.framePause' : 'editor.framePlay'));
    this.#addButton.setLabel(next('editor.frameAdd'));
    this.#copyButton.setLabel(next('editor.frameCopy'));
    this.#removeButton.setLabel(next('editor.frameRemove'));
  }

  /** @param thumbnailFor Kare bileşiğini döner; şerit görüntüyle okunur. */
  public setFrames(
    count: number,
    activeIndex: number,
    durationMs: number,
    thumbnailFor: (index: number) => RasterBuffer | null,
  ): void {
    this.#activeIndex = activeIndex;
    this.#duration.setValue(durationMs);
    // Tek kare kalınca silme kapatılır; karesiz belge render edilemez.
    this.#removeButton.setDisabled(count === 1);
    this.#disposeCells();

    const cells = Array.from({ length: count }, (_, index) => {
      const cell = element('button', {
        className: `frame-cell${index === activeIndex ? ' frame-cell--active' : ''}`,
        attrs: {
          type: 'button',
          role: 'listitem',
          'data-frame': String(index),
          'aria-current': String(index === activeIndex),
          'aria-label': this.#t('editor.frameNumber', { index: index + 1 }),
          title: this.#t('editor.frameNumber', { index: index + 1 }),
        },
        children: [
          this.#thumbnail(thumbnailFor(index)),
          element('span', { className: 'frame-cell__index', children: [String(index + 1)] }),
        ],
      });
      const select = (): void => this.#options.onSelect(index);
      cell.addEventListener('click', select);
      this.#cellComponents.push({ destroy: () => cell.removeEventListener('click', select) });
      return cell;
    });
    replaceChildren(this.#strip, ...cells);
  }

  public get isPlaying(): boolean {
    return this.#playing;
  }

  public stopPlayback(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#syncPlayIcon();
    this.#options.onPlayToggle(false);
  }

  public destroy(): void {
    this.#disposeCells();
    for (const component of [
      this.#title,
      this.#playButton,
      this.#addButton,
      this.#copyButton,
      this.#removeButton,
      this.#duration,
      this.#onion,
    ]) {
      component.destroy();
    }
    this.element.remove();
  }

  #disposeCells(): void {
    for (const component of this.#cellComponents.splice(0)) component.destroy();
  }

  #syncPlayIcon(): void {
    this.#playButton.setIcon(new Icon({ name: this.#playing ? 'pause' : 'play' }).element);
    this.#playButton.setLabel(this.#t(this.#playing ? 'editor.framePause' : 'editor.framePlay'));
  }

  #thumbnail(buffer: RasterBuffer | null): HTMLElement {
    const canvas = element('canvas', { className: 'frame-cell__thumb' });
    canvas.width = CELL_SIZE;
    canvas.height = CELL_SIZE;
    const context = canvas.getContext('2d');
    if (context !== null && buffer !== null && buffer.width > 0) {
      const source = document.createElement('canvas');
      source.width = buffer.width;
      source.height = buffer.height;
      const sourceContext = source.getContext('2d');
      if (sourceContext !== null) {
        const image = sourceContext.createImageData(buffer.width, buffer.height);
        image.data.set(buffer.rgba);
        sourceContext.putImageData(image, 0, 0);
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0, CELL_SIZE, CELL_SIZE);
      }
    }
    return canvas;
  }

  #action(
    iconName: 'play' | 'pause' | 'layer-add' | 'copy' | 'trash',
    key: string,
    run: () => void,
  ): IconButton {
    const button = new IconButton(new Icon({ name: iconName }).element, {
      label: this.#t(`editor.${key}`),
      size: 'sm',
      ...(iconName === 'trash' ? { variant: 'danger' as const } : {}),
      onClick: run,
    });
    button.element.classList.add(`frame-panel__${key}`);
    return button;
  }
}
