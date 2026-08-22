import { Button, IconButton, PinchZoomController } from '@volstudio/core';
import type { RenderResult } from '@volstudio/core/visual';
import type { PreviewFrame } from '../preview/PreviewRenderer';
import { ChildScope, el, t } from './dom';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 24;
const ZOOM_RATIO = 1.25;

/** Tek üretim yüzeyinin canlı, kaydırılabilir sonuç kamerası. */
export class PreviewPanel {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly artboard: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly zoomText: HTMLSpanElement;
  private readonly camera: PinchZoomController;
  private readonly resizeObserver: ResizeObserver;
  private readonly scope = new ChildScope();
  private frame: PreviewFrame | null = null;
  private paintedSize: readonly [number, number] | null = null;
  private fitMode = true;
  private fitFrame: number | null = null;

  constructor() {
    this.element = el('div', 'vf-preview');

    const toolbar = el('div', 'vf-preview__toolbar');
    toolbar.appendChild(el('div', 'vf-preview__title', t('preview.title')));
    const cameraTools = el('div', 'vf-preview__camera-tools');
    cameraTools.appendChild(
      this.scope.add(
        new IconButton('−', {
          size: 'sm',
          label: t('preview.zoomOut'),
          onClick: () => this.zoomBy(1 / ZOOM_RATIO),
        }),
      ).element,
    );
    this.zoomText = el('span', 'vf-preview__zoom', '100%');
    cameraTools.appendChild(this.zoomText);
    cameraTools.appendChild(
      this.scope.add(
        new IconButton('+', {
          size: 'sm',
          label: t('preview.zoomIn'),
          onClick: () => this.zoomBy(ZOOM_RATIO),
        }),
      ).element,
    );
    const fit = this.scope.add(
      new Button(t('preview.fit'), {
        size: 'sm',
        fullWidth: false,
        onClick: () => this.fitView(true),
      }),
    );
    fit.element.classList.add('vf-preview__fit');
    cameraTools.appendChild(fit.element);
    toolbar.appendChild(cameraTools);
    this.element.appendChild(toolbar);

    this.stage = el('div', 'vf-preview__stage');
    this.stage.setAttribute('aria-label', t('preview.cameraLabel'));
    this.canvas = el('canvas', 'vf-preview__canvas');
    this.context = this.canvas.getContext('2d');
    this.artboard = el('div', 'vf-preview__artboard');
    this.artboard.appendChild(this.canvas);
    this.camera = new PinchZoomController({
      content: this.artboard,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      onTransformChange: (zoom) => {
        this.zoomText.textContent = `${Math.round(zoom * 100)}%`;
      },
    });
    this.camera.element.classList.add('vf-preview__camera');
    this.stage.appendChild(this.camera.element);
    this.element.appendChild(this.stage);

    this.status = el('div', 'vf-preview__status');
    this.status.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.status);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitMode) this.scheduleFit();
    });
    this.resizeObserver.observe(this.stage);
  }

  setFrame(frame: PreviewFrame): void {
    this.frame = frame;
    this.render();
  }

  render(): void {
    const frame = this.frame;
    if (!frame) return;

    if (frame.error !== null || !frame.result) {
      this.status.dataset.tone = 'error';
      this.status.textContent = t('preview.error');
      return;
    }

    this.status.dataset.tone = 'ready';
    const result = frame.result;
    const sizeChanged =
      this.paintedSize?.[0] !== result.width || this.paintedSize?.[1] !== result.height;
    this.canvas.classList.toggle('vf-preview__canvas--smooth', result.doc.antialias === true);
    this.paint(result);
    this.status.textContent = t('preview.status', {
      previewW: result.width,
      previewH: result.height,
      outputW: frame.outputSize[0],
      outputH: frame.outputSize[1],
      exact: frame.full ? t('preview.exact') : t('preview.adaptive'),
    });
    if (sizeChanged) {
      this.paintedSize = [result.width, result.height];
      this.fitMode = true;
      this.scheduleFit();
    }
  }

  destroy(): void {
    if (this.fitFrame !== null) window.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = null;
    this.resizeObserver.disconnect();
    this.camera.destroy();
    this.scope.clear();
    this.element.remove();
  }

  private paint(result: RenderResult): void {
    this.canvas.width = result.width;
    this.canvas.height = result.height;
    this.canvas.style.width = `${result.width}px`;
    this.canvas.style.height = `${result.height}px`;
    this.artboard.style.width = `${result.width}px`;
    this.artboard.style.height = `${result.height}px`;

    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, result.width, result.height);
    const image = context.createImageData(result.width, result.height);
    image.data.set(result.rgba);
    context.putImageData(image, 0, 0);
  }

  private zoomBy(ratio: number): void {
    this.fitMode = false;
    const [panX, panY] = this.camera.getPan();
    this.camera.setTransform(this.camera.getZoom() * ratio, panX, panY, false);
  }

  private scheduleFit(): void {
    if (this.fitFrame !== null) window.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = window.requestAnimationFrame(() => {
      this.fitFrame = null;
      this.fitView(false);
    });
  }

  private fitView(animate: boolean): void {
    if (!this.paintedSize) return;
    this.fitMode = true;
    const availableWidth = Math.max(1, this.stage.clientWidth - 72);
    const availableHeight = Math.max(1, this.stage.clientHeight - 72);
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(availableWidth / this.paintedSize[0], availableHeight / this.paintedSize[1]),
      ),
    );
    this.camera.setTransform(zoom, 0, 0, animate);
  }
}
