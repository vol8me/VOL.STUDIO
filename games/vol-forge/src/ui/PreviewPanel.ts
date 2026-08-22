import { SegmentedControl, Slider, Checkbox } from '@volstudio/core';
import { measureSprite, type RenderResult } from '@volstudio/core/visual';
import type { EditorState, ChannelView } from '../state/editorState';
import type { PreviewFrame } from '../preview/PreviewRenderer';
import { ChildScope, el, t } from './dom';

const CHANNELS: ChannelView[] = [
  'final',
  'coverage',
  'height',
  'material',
  'shade',
  'normal',
  'outline',
];

/** Malzeme kimliklerini birbirinden ayıran sabit ayrım renkleri. */
const MATERIAL_HUES = [200, 30, 120, 280, 60, 340, 170, 15];

/**
 * Önizleme paneli — §8.9.
 *
 * Kanal görüntüleyici veri ÜRETMEZ, `RenderResult` içinde zaten olanı
 * gösterir. "Gölge neden yanlış?" sorusu ancak `height` görülünce cevaplanır;
 * hata ayıklamanın belkemiği budur.
 */
export class PreviewPanel {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly badges: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly scope = new ChildScope();
  private frame: PreviewFrame | null = null;

  constructor(private readonly state: EditorState) {
    this.element = el('div', 'vf-preview');

    const controls = el('div', 'vf-preview__controls');
    this.scope.add(
      new SegmentedControl({
        options: CHANNELS.map((channel) => ({
          value: channel,
          label: t(`channel.${channel}`),
        })),
        value: state.channel,
        onChange: (value) => state.setChannel(value as ChannelView),
      }),
    );
    const channelControl = this.scope.add(
      new SegmentedControl({
        options: [
          { value: 'single', label: t('preview.single') },
          { value: 'tile3x3', label: t('preview.tile') },
        ],
        value: state.layout,
        onChange: (value) => state.setLayout(value === 'tile3x3' ? 'tile3x3' : 'single'),
      }),
    );
    const zoom = this.scope.add(
      new Slider({
        min: 1,
        max: 12,
        step: 1,
        value: state.zoom,
        label: t('preview.zoom'),
        onChange: (value) => state.setZoom(value),
      }),
    );
    const preQuantize = this.scope.add(
      new Checkbox({
        label: t('preview.preQuantize'),
        checked: state.showPreQuantize,
        onChange: (checked) => state.setShowPreQuantize(checked),
      }),
    );

    controls.appendChild(channelControl.element);
    controls.appendChild(zoom.element);
    controls.appendChild(preQuantize.element);
    this.element.appendChild(controls);

    const stage = el('div', 'vf-preview__stage');
    this.canvas = el('canvas', 'vf-preview__canvas');
    this.context = this.canvas.getContext('2d');
    stage.appendChild(this.canvas);
    this.element.appendChild(stage);

    this.status = el('div', 'vf-preview__status');
    this.element.appendChild(this.status);
    this.badges = el('div', 'vf-preview__badges');
    this.element.appendChild(this.badges);
  }

  /** Kanal seçicisi ayrı tutulur: sekme sayısı yediye çıkınca satır taşıyor. */
  buildChannelBar(): HTMLElement {
    const bar = el('div', 'vf-preview__channels');
    for (const channel of CHANNELS) {
      const button = el('button', 'vf-preview__channel', t(`channel.${channel}`));
      button.type = 'button';
      button.dataset.channel = channel;
      button.addEventListener('click', () => this.state.setChannel(channel));
      bar.appendChild(button);
    }
    return bar;
  }

  setFrame(frame: PreviewFrame): void {
    this.frame = frame;
    this.render();
  }

  render(): void {
    const frame = this.frame;
    if (!frame) return;

    if (frame.error !== null || !frame.result) {
      this.status.textContent = t('preview.error');
      this.badges.textContent = '';
      return;
    }

    const result = frame.result;
    const pixels = this.channelPixels(result);
    this.paint(result.width, result.height, pixels);
    this.updateStatus(frame, result);
    this.updateBadges(result);
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  /* ── kanal → piksel ──────────────────────────────────────────────────── */

  private channelPixels(result: RenderResult): Uint8ClampedArray {
    const count = result.width * result.height;
    if (this.state.channel === 'final' && !this.state.showPreQuantize) return result.rgba;

    const out = new Uint8ClampedArray(count * 4);
    const gray = (index: number, value: number, alpha = 255): void => {
      const byte = Math.round(Math.max(0, Math.min(1, value)) * 255);
      out[index * 4] = byte;
      out[index * 4 + 1] = byte;
      out[index * 4 + 2] = byte;
      out[index * 4 + 3] = alpha;
    };

    for (let i = 0; i < count; i++) {
      switch (this.state.channel) {
        case 'coverage':
          gray(i, result.channels.coverage[i]);
          break;
        case 'height':
          gray(i, result.channels.height[i]);
          break;
        case 'shade':
        case 'final':
          // `final` + nicemleme öncesi: ham gölge, palete oturmadan önceki hâl.
          gray(i, result.shade[i], result.channels.coverage[i] > 0 ? 255 : 0);
          break;
        case 'material': {
          const hue = MATERIAL_HUES[result.channels.material[i] % MATERIAL_HUES.length];
          const [r, g, b] = hueToRgb(hue);
          out[i * 4] = r;
          out[i * 4 + 1] = g;
          out[i * 4 + 2] = b;
          out[i * 4 + 3] = result.channels.coverage[i] > 0 ? 255 : 0;
          break;
        }
        case 'normal': {
          const normal = result.normal;
          if (!normal) {
            gray(i, 0.5);
            break;
          }
          out[i * 4] = Math.round((normal.x[i] * 0.5 + 0.5) * 255);
          out[i * 4 + 1] = Math.round((normal.y[i] * 0.5 + 0.5) * 255);
          out[i * 4 + 2] = Math.round((normal.z[i] * 0.5 + 0.5) * 255);
          out[i * 4 + 3] = 255;
          break;
        }
        case 'outline':
          gray(i, result.outline?.[i] === 1 ? 1 : 0);
          break;
        default:
          break;
      }
    }
    return out;
  }

  private paint(width: number, height: number, pixels: Uint8ClampedArray): void {
    const tiles = this.state.layout === 'tile3x3' ? 3 : 1;
    this.canvas.width = width * tiles;
    this.canvas.height = height * tiles;
    this.canvas.style.width = `${width * tiles * this.state.zoom}px`;
    this.canvas.style.height = `${height * tiles * this.state.zoom}px`;

    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const image = context.createImageData(width, height);
    image.data.set(pixels);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        context.putImageData(image, tx * width, ty * height);
      }
    }
  }

  private updateStatus(frame: PreviewFrame, result: RenderResult): void {
    // Çıktı boyu KARE'den okunur, `result.doc`tan değil: ikincisi ezmeler
    // uygulandıktan sonraki belgedir ve önizleme boyunu taşır.
    this.status.textContent = t('preview.status', {
      previewW: result.width,
      previewH: result.height,
      outputW: frame.outputSize[0],
      outputH: frame.outputSize[1],
      ms: frame.elapsedMs.toFixed(1),
      exact: frame.full ? t('preview.exact') : t('preview.approx'),
    });
  }

  private updateBadges(result: RenderResult): void {
    this.badges.textContent = '';
    const report = measureSprite(result);
    for (const metric of report.metrics) {
      const badge = el(
        'span',
        `vf-badge ${metric.pass ? 'vf-badge--ok' : 'vf-badge--fail'}`,
        `${metric.label}: ${metric.value}`,
      );
      badge.title = metric.detail;
      this.badges.appendChild(badge);
    }
    if (this.state.hiddenCount > 0) {
      this.badges.appendChild(
        el(
          'span',
          'vf-badge vf-badge--warn',
          t('preview.hiddenLayers', { count: this.state.hiddenCount }),
        ),
      );
    }
  }
}

/** Doygun bir tondan RGB — malzeme kimliklerini ayırt etmek için yeterli. */
function hueToRgb(hue: number): [number, number, number] {
  const sector = hue / 60;
  const x = 1 - Math.abs((sector % 2) - 1);
  const table: Array<[number, number, number]> = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ];
  const [r, g, b] = table[Math.floor(sector) % 6];
  return [Math.round(r * 220), Math.round(g * 220), Math.round(b * 220)];
}
