import { Icon, IconButton, Select, Slider, Text } from '@volstudio/core/ui';
import type { BlendMode, SpriteLayerMeta } from '../../../shared/index';
import { element, replaceChildren } from '../../ui/dom';
import { BLEND_MODES } from '../blend';
import type { RasterBuffer } from '../transform';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface LayerPanelOptions {
  t: Translate;
  onSelect: (layerId: string) => void;
  onToggleVisible: (layerId: string, visible: boolean) => void;
  onOpacity: (layerId: string, opacity: number) => void;
  onBlendMode: (layerId: string, mode: BlendMode) => void;
  onAdd: () => void;
  onRemove: (layerId: string) => void;
  onMove: (layerId: string, direction: -1 | 1) => void;
  onMergeDown: (layerId: string) => void;
}

interface Destroyable {
  destroy(): void;
}

const THUMBNAIL_SIZE = 28;

/**
 * Katman listesi — CORE bileşenleriyle.
 *
 * Liste ÜSTTEN ALTA gösterilir çünkü kullanıcı en üstteki katmanı listenin
 * başında bekler; model ise alttan üste sıralıdır. Dönüşüm yalnız burada
 * yapılır ki blend matematiği tek yönde kalsın.
 *
 * Satırlar her durum değişiminde yeniden kurulur; bu yüzden her kurulumda
 * önceki bileşenler `destroy()` edilir — aksi halde her fırça darbesi yeni bir
 * Slider ve Select yığar ve dinleyiciler birikir.
 */
export class LayerPanel {
  readonly element: HTMLElement;
  readonly #list: HTMLDivElement;
  readonly #title: Text;
  readonly #addButton: IconButton;
  readonly #options: LayerPanelOptions;
  #rowComponents: Destroyable[] = [];
  #t: Translate;

  public constructor(options: LayerPanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = new Text(options.t('editor.layers'), { variant: 'muted', tag: 'h3' });
    this.#title.element.classList.add('layer-panel__title');
    this.#addButton = new IconButton(new Icon({ name: 'layer-add' }).element, {
      label: options.t('editor.layerAdd'),
      size: 'sm',
      onClick: () => options.onAdd(),
    });
    this.#addButton.element.classList.add('layer-panel__add');
    this.#list = element('div', { className: 'layer-panel__list', attrs: { role: 'list' } });

    this.element = element('section', {
      className: 'layer-panel',
      children: [
        element('header', {
          className: 'panel-section__header',
          children: [this.#title.element, this.#addButton.element],
        }),
        this.#list,
      ],
    });
  }

  public setTranslator(next: Translate): void {
    this.#t = next;
    this.#title.setContent(next('editor.layers'));
    this.#addButton.setLabel(next('editor.layerAdd'));
  }

  /**
   * @param thumbnailFor Katmanın aktif karedeki içeriğini döner; küçük önizleme
   * kullanıcının hangi katmanda çalıştığını isimden değil GÖRÜNTÜDEN anlamasını
   * sağlar.
   */
  public setLayers(
    layers: readonly SpriteLayerMeta[],
    activeId: string,
    thumbnailFor: (layerId: string) => RasterBuffer | null,
  ): void {
    this.#disposeRows();
    const rows = [...layers]
      .map((layer, index) => ({ layer, index }))
      .reverse()
      .map(({ layer, index }) =>
        this.#buildRow(layer, index, layers.length, activeId, thumbnailFor(layer.id)),
      );
    replaceChildren(this.#list, ...rows);
  }

  public destroy(): void {
    this.#disposeRows();
    this.#title.destroy();
    this.#addButton.destroy();
    this.element.remove();
  }

  #disposeRows(): void {
    for (const component of this.#rowComponents.splice(0)) component.destroy();
  }

  #buildRow(
    layer: SpriteLayerMeta,
    index: number,
    total: number,
    activeId: string,
    thumbnail: RasterBuffer | null,
  ): HTMLElement {
    const visible = new IconButton(
      new Icon({ name: layer.visible ? 'visible' : 'hidden' }).element,
      {
        label: this.#t('editor.layerVisible'),
        size: 'sm',
        onClick: () => this.#options.onToggleVisible(layer.id, !layer.visible),
      },
    );
    visible.element.classList.add('layer-row__visible');
    visible.element.setAttribute('aria-pressed', String(layer.visible));
    const name = new Text(layer.name, { variant: 'body' });
    const opacity = new Slider({
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(layer.opacity * 100),
      // Görünür etiket YOK: satır zaten dar ve slider yüzdeyi kendisi
      // gösteriyor. Erişilebilir ad aşağıda attribute olarak verilir.
      formatValue: (value) => `${Math.round(value)}%`,
      // Sürükleme boyunca canlı önizleme, bırakınca TEK undo adımı.
      onCommit: (value) => this.#options.onOpacity(layer.id, value / 100),
    });
    opacity.element.classList.add('layer-row__opacity-control');
    opacity.element.querySelector<HTMLInputElement>('input')?.classList.add('layer-row__opacity');
    opacity.element.setAttribute('aria-label', this.#t('editor.layerOpacity'));
    const blend = new Select({
      options: BLEND_MODES.map((mode) => ({
        value: mode,
        label: this.#t(`editor.blend.${mode}`),
      })),
      value: layer.blendMode,
      onCommit: (value) => this.#options.onBlendMode(layer.id, value as BlendMode),
    });
    blend.element.classList.add('layer-row__blend');

    const up = this.#action('move-up', 'layerUp', index === total - 1, () =>
      this.#options.onMove(layer.id, 1),
    );
    const down = this.#action('move-down', 'layerDown', index === 0, () =>
      this.#options.onMove(layer.id, -1),
    );
    const merge = this.#action('merge-down', 'layerMerge', index === 0, () =>
      this.#options.onMergeDown(layer.id),
    );
    // Son katman silinemez: yüzeysiz belgede araçların yazacağı hedef kalmaz.
    const remove = this.#action('trash', 'layerRemove', total === 1, () =>
      this.#options.onRemove(layer.id),
    );

    this.#rowComponents.push(visible, name, opacity, blend, up, down, merge, remove);

    const row = element('div', {
      className: `layer-row${layer.id === activeId ? ' layer-row--active' : ''}`,
      attrs: { role: 'listitem', 'data-layer': layer.id },
      children: [
        element('div', {
          className: 'layer-row__top',
          children: [
            visible.element,
            this.#thumbnail(thumbnail),
            element('div', { className: 'layer-row__name', children: [name.element] }),
          ],
        }),
        element('div', {
          className: 'layer-row__controls',
          children: [opacity.element, blend.element],
        }),
        element('div', {
          className: 'layer-row__actions',
          children: [up.element, down.element, merge.element, remove.element],
        }),
      ],
    });
    const select = (event: Event): void => {
      // İçteki kontroller kendi işlerini yapar; satır seçimi yalnız boş alana
      // tıklandığında tetiklenir.
      if ((event.target as HTMLElement).closest('button, input, .vol-select')) return;
      this.#options.onSelect(layer.id);
    };
    row.addEventListener('click', select);
    this.#rowComponents.push({ destroy: () => row.removeEventListener('click', select) });
    return row;
  }

  /** Katmanın aktif karedeki küçük önizlemesi. */
  #thumbnail(buffer: RasterBuffer | null): HTMLElement {
    const canvas = element('canvas', { className: 'layer-row__thumb' });
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
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
        context.drawImage(source, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
      }
    }
    return canvas;
  }

  #action(
    iconName: 'move-up' | 'move-down' | 'merge-down' | 'trash',
    key: string,
    disabled: boolean,
    run: () => void,
  ): IconButton {
    return new IconButton(new Icon({ name: iconName }).element, {
      label: this.#t(`editor.${key}`),
      size: 'sm',
      ...(iconName === 'trash' ? { variant: 'danger' as const } : {}),
      disabled,
      onClick: run,
    });
  }
}
