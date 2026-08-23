import type { CanvasViewportTransform } from '@volstudio/core/ui';
import { TILE_SIZE, type RasterSurface } from './RasterSurface';
import type { SpriteDocument } from './SpriteDocument';
import type { RasterBuffer } from './transform';

export interface PixelRendererOptions {
  canvas: HTMLCanvasElement;
  /** Şeffaflık damasının kare boyutu (CSS piksel). */
  checkerSize?: number;
}

/** Grid ancak bir belge pikseli bu kadar ekran pikseli kapladığında çizilir. */
const GRID_MIN_ZOOM = 8;
const DEFAULT_CHECKER = 8;

interface LayerCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  surface: RasterSurface;
  version: number;
}

/**
 * Belge rasterını tuvale çizer.
 *
 * Katmanlar ayrıdır ve overlay'ler belge rasterına YAZILMAZ: dama, grid ve
 * seçim çerçevesi yalnız ekranda yaşar, kaydedilen piksellere karışmaz.
 *
 * Ölçekleme `imageSmoothingEnabled = false` ile yapılır — pixel-art'ta
 * enterpolasyon her pikseli bulanıklaştırır ve kullanıcının gördüğü ile
 * kaydedilen ayrışır.
 */
export class PixelRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #checkerSize: number;
  #buffer: HTMLCanvasElement | null = null;
  #bufferContext: CanvasRenderingContext2D | null = null;
  #composite: HTMLCanvasElement | null = null;
  #compositeContext: CanvasRenderingContext2D | null = null;
  readonly #layers = new Map<string, LayerCanvas>();
  readonly #onionBuffers = new WeakMap<Uint8ClampedArray, HTMLCanvasElement>();
  #documentFrame = '';
  #devicePixelRatio = 1;

  public constructor(options: PixelRendererOptions) {
    this.#canvas = options.canvas;
    this.#checkerSize = options.checkerSize ?? DEFAULT_CHECKER;
    const context = options.canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('[PixelRenderer] 2D context alınamadı');
    this.#context = context;
  }

  /** Tuvali CSS ölçüsüne ve cihaz piksel oranına göre yeniden boyutlandırır. */
  public resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    this.#devicePixelRatio = ratio;
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    this.#canvas.style.width = `${cssWidth}px`;
    this.#canvas.style.height = `${cssHeight}px`;
  }

  /**
   * @param onionSkin Belge rasterının ALTINA çizilecek komşu kareler. Yalnız
   * ekranda yaşarlar; kayda ve export'a hiç girmezler.
   */
  public render(
    surface: RasterBuffer,
    transform: CanvasViewportTransform,
    onionSkin: readonly { buffer: RasterBuffer; opacity: number }[] = [],
  ): void {
    this.#drawScene(this.#syncBuffer(surface), surface.width, surface.height, transform, onionSkin);
  }

  public renderDocument(
    document: SpriteDocument,
    transform: CanvasViewportTransform,
    onionSkin: readonly { buffer: RasterBuffer; opacity: number }[] = [],
  ): void {
    const frame = document.frameAt(document.activeFrameIndex);
    const frameKey = `${document.id}:${frame?.id ?? 'none'}`;
    if (this.#documentFrame !== frameKey) {
      this.#documentFrame = frameKey;
      this.#layers.clear();
    }
    const composite = this.#ensureComposite(document.width, document.height);
    const context = this.#compositeContext;
    if (context === null) throw new Error('[PixelRenderer] bileşik tuval hazır değil');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, document.width, document.height);
    const liveLayers = new Set<string>();
    for (const meta of document.layers) {
      const surface = frame?.cels.get(meta.id);
      if (surface === undefined) continue;
      liveLayers.add(meta.id);
      const layer = this.#syncLayer(meta.id, surface);
      if (!meta.visible || meta.opacity <= 0) continue;
      context.globalAlpha = meta.opacity;
      context.globalCompositeOperation = blendOperation(meta.blendMode);
      context.drawImage(layer, 0, 0);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    for (const id of this.#layers.keys()) {
      if (!liveLayers.has(id)) this.#layers.delete(id);
    }
    this.#drawScene(composite, document.width, document.height, transform, onionSkin);
  }

  public destroy(): void {
    this.#buffer = null;
    this.#bufferContext = null;
    this.#composite = null;
    this.#compositeContext = null;
    this.#layers.clear();
  }

  /** Belge rasterını ara tuvale yazar; ölçekleme oradan yapılır. */
  #syncBuffer(surface: RasterBuffer): HTMLCanvasElement {
    if (
      this.#buffer === null ||
      this.#buffer.width !== surface.width ||
      this.#buffer.height !== surface.height
    ) {
      const buffer = document.createElement('canvas');
      buffer.width = surface.width;
      buffer.height = surface.height;
      const context = buffer.getContext('2d', { alpha: true });
      if (!context) throw new Error('[PixelRenderer] ara tuval context alınamadı');
      this.#buffer = buffer;
      this.#bufferContext = context;
    }
    const context = this.#bufferContext;
    if (context === null) throw new Error('[PixelRenderer] ara tuval hazır değil');
    const image = context.createImageData(surface.width, surface.height);
    image.data.set(surface.rgba);
    context.putImageData(image, 0, 0);
    return this.#buffer;
  }

  #drawScene(
    source: HTMLCanvasElement,
    surfaceWidth: number,
    surfaceHeight: number,
    transform: CanvasViewportTransform,
    onionSkin: readonly { buffer: RasterBuffer; opacity: number }[],
  ): void {
    const ratio = this.#devicePixelRatio;
    const context = this.#context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    context.scale(ratio, ratio);
    const width = this.#canvas.width / ratio;
    const height = this.#canvas.height / ratio;
    const documentWidth = surfaceWidth * transform.zoom;
    const documentHeight = surfaceHeight * transform.zoom;
    this.#drawWorkbench(context, width, height);
    this.#drawChecker(context, transform.offsetX, transform.offsetY, documentWidth, documentHeight);
    context.imageSmoothingEnabled = false;
    for (const layer of onionSkin) {
      context.globalAlpha = layer.opacity;
      context.drawImage(
        this.#onionCanvas(layer.buffer),
        transform.offsetX,
        transform.offsetY,
        documentWidth,
        documentHeight,
      );
    }
    context.globalAlpha = 1;
    context.drawImage(source, transform.offsetX, transform.offsetY, documentWidth, documentHeight);
    this.#drawGrid(context, { width: surfaceWidth, height: surfaceHeight }, transform);
    this.#drawBorder(context, transform.offsetX, transform.offsetY, documentWidth, documentHeight);
  }

  #ensureComposite(width: number, height: number): HTMLCanvasElement {
    if (
      this.#composite === null ||
      this.#composite.width !== width ||
      this.#composite.height !== height
    ) {
      this.#composite = document.createElement('canvas');
      this.#composite.width = width;
      this.#composite.height = height;
      this.#compositeContext = this.#composite.getContext('2d', { alpha: true });
      if (this.#compositeContext === null) {
        throw new Error('[PixelRenderer] bileşik tuval context alınamadı');
      }
      this.#layers.clear();
    }
    return this.#composite;
  }

  #syncLayer(id: string, surface: RasterSurface): HTMLCanvasElement {
    let layer = this.#layers.get(id);
    if (
      layer === undefined ||
      layer.surface !== surface ||
      layer.canvas.width !== surface.width ||
      layer.canvas.height !== surface.height
    ) {
      const canvas = document.createElement('canvas');
      canvas.width = surface.width;
      canvas.height = surface.height;
      const context = canvas.getContext('2d', { alpha: true });
      if (context === null) throw new Error('[PixelRenderer] katman tuvali context alınamadı');
      layer = { canvas, context, surface, version: -1 };
      this.#layers.set(id, layer);
    }
    for (const update of surface.tileUpdatesSince(layer.version)) {
      layer.context.clearRect(update.rect.x, update.rect.y, update.rect.width, update.rect.height);
      if (update.data === null) continue;
      const image = layer.context.createImageData(update.rect.width, update.rect.height);
      for (let row = 0; row < update.rect.height; row += 1) {
        const source = row * TILE_SIZE * 4;
        const target = row * update.rect.width * 4;
        image.data.set(update.data.subarray(source, source + update.rect.width * 4), target);
      }
      layer.context.putImageData(image, update.rect.x, update.rect.y);
    }
    layer.version = surface.version;
    return layer.canvas;
  }

  #onionCanvas(buffer: RasterBuffer): HTMLCanvasElement {
    const cached = this.#onionBuffers.get(buffer.rgba);
    if (cached !== undefined) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = buffer.width;
    canvas.height = buffer.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (context === null) throw new Error('[PixelRenderer] onion skin context alınamadı');
    const image = context.createImageData(buffer.width, buffer.height);
    image.data.set(buffer.rgba);
    context.putImageData(image, 0, 0);
    this.#onionBuffers.set(buffer.rgba, canvas);
    return canvas;
  }

  #drawWorkbench(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.fillStyle = '#12141a';
    context.fillRect(0, 0, width, height);
  }

  #drawChecker(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.fillStyle = '#2a2d36';
    context.fillRect(x, y, width, height);
    context.fillStyle = '#22252d';
    const size = this.#checkerSize;
    const viewportWidth = this.#canvas.width / this.#devicePixelRatio;
    const viewportHeight = this.#canvas.height / this.#devicePixelRatio;
    const firstColumn = Math.max(0, Math.floor((Math.max(0, x) - x) / size));
    const lastColumn = Math.min(Math.ceil(width / size), Math.ceil((viewportWidth - x) / size));
    const firstRow = Math.max(0, Math.floor((Math.max(0, y) - y) / size));
    const lastRow = Math.min(Math.ceil(height / size), Math.ceil((viewportHeight - y) / size));
    for (let row = firstRow; row < lastRow; row += 1) {
      let column = firstColumn;
      if (column % 2 !== row % 2) column += 1;
      for (; column < lastColumn; column += 2) {
        context.fillRect(x + column * size, y + row * size, size, size);
      }
    }
    context.restore();
  }

  /**
   * Piksel ızgarası.
   *
   * Yalnız bir belge pikseli en az `GRID_MIN_ZOOM` ekran pikseli kapladığında
   * çizilir; uzaklaşınca ızgara çizgileri görüntüyü tamamen kaplar ve belge
   * okunmaz olur.
   */
  #drawGrid(
    context: CanvasRenderingContext2D,
    surface: Pick<RasterBuffer, 'width' | 'height'>,
    transform: CanvasViewportTransform,
  ): void {
    if (transform.zoom < GRID_MIN_ZOOM) return;
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.lineWidth = 1 / this.#devicePixelRatio;
    context.beginPath();
    const viewportWidth = this.#canvas.width / this.#devicePixelRatio;
    const viewportHeight = this.#canvas.height / this.#devicePixelRatio;
    const startX = Math.max(0, Math.floor(-transform.offsetX / transform.zoom));
    const endX = Math.min(
      surface.width,
      Math.ceil((viewportWidth - transform.offsetX) / transform.zoom),
    );
    const startY = Math.max(0, Math.floor(-transform.offsetY / transform.zoom));
    const endY = Math.min(
      surface.height,
      Math.ceil((viewportHeight - transform.offsetY) / transform.zoom),
    );
    for (let x = startX; x <= endX; x += 1) {
      const screenX = Math.round(transform.offsetX + x * transform.zoom) + 0.5;
      context.moveTo(screenX, transform.offsetY + startY * transform.zoom);
      context.lineTo(screenX, transform.offsetY + endY * transform.zoom);
    }
    for (let y = startY; y <= endY; y += 1) {
      const screenY = Math.round(transform.offsetY + y * transform.zoom) + 0.5;
      context.moveTo(transform.offsetX + startX * transform.zoom, screenY);
      context.lineTo(transform.offsetX + endX * transform.zoom, screenY);
    }
    context.stroke();
    context.restore();
  }

  #drawBorder(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.strokeRect(
      Math.round(x) + 0.5,
      Math.round(y) + 0.5,
      Math.round(width),
      Math.round(height),
    );
    context.restore();
  }
}

function blendOperation(mode: string): GlobalCompositeOperation {
  if (mode === 'add') return 'lighter';
  if (mode === 'multiply' || mode === 'screen' || mode === 'overlay') return mode;
  return 'source-over';
}
