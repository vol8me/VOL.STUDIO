import type { CanvasViewportTransform } from '@volstudio/core/ui';
import type { RasterSurface } from './RasterSurface';

export interface PixelRendererOptions {
  canvas: HTMLCanvasElement;
  /** Şeffaflık damasının kare boyutu (CSS piksel). */
  checkerSize?: number;
}

/** Grid ancak bir belge pikseli bu kadar ekran pikseli kapladığında çizilir. */
const GRID_MIN_ZOOM = 8;
const DEFAULT_CHECKER = 8;

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

  public render(surface: RasterSurface, transform: CanvasViewportTransform): void {
    const ratio = this.#devicePixelRatio;
    const context = this.#context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    context.scale(ratio, ratio);

    const width = this.#canvas.width / ratio;
    const height = this.#canvas.height / ratio;
    const documentWidth = surface.width * transform.zoom;
    const documentHeight = surface.height * transform.zoom;

    this.#drawWorkbench(context, width, height);
    this.#drawChecker(context, transform.offsetX, transform.offsetY, documentWidth, documentHeight);

    const buffer = this.#syncBuffer(surface);
    context.imageSmoothingEnabled = false;
    context.drawImage(buffer, transform.offsetX, transform.offsetY, documentWidth, documentHeight);

    this.#drawGrid(context, surface, transform);
    this.#drawBorder(context, transform.offsetX, transform.offsetY, documentWidth, documentHeight);
  }

  public destroy(): void {
    this.#buffer = null;
    this.#bufferContext = null;
  }

  /** Belge rasterını ara tuvale yazar; ölçekleme oradan yapılır. */
  #syncBuffer(surface: RasterSurface): HTMLCanvasElement {
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
    image.data.set(surface.toRgba());
    context.putImageData(image, 0, 0);
    return this.#buffer;
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
    const columns = Math.ceil(width / size);
    const rows = Math.ceil(height / size);
    for (let row = 0; row < rows; row += 1) {
      for (let column = row % 2; column < columns; column += 2) {
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
    surface: RasterSurface,
    transform: CanvasViewportTransform,
  ): void {
    if (transform.zoom < GRID_MIN_ZOOM) return;
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.lineWidth = 1 / this.#devicePixelRatio;
    context.beginPath();
    for (let x = 0; x <= surface.width; x += 1) {
      const screenX = Math.round(transform.offsetX + x * transform.zoom) + 0.5;
      context.moveTo(screenX, transform.offsetY);
      context.lineTo(screenX, transform.offsetY + surface.height * transform.zoom);
    }
    for (let y = 0; y <= surface.height; y += 1) {
      const screenY = Math.round(transform.offsetY + y * transform.zoom) + 0.5;
      context.moveTo(transform.offsetX, screenY);
      context.lineTo(transform.offsetX + surface.width * transform.zoom, screenY);
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
