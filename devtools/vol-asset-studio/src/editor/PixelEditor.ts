import { CanvasViewportController, type CanvasViewportTransform } from '@volstudio/core/ui';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type { DocumentSession } from './DocumentSession';
import { PixelRenderer } from './PixelRenderer';
import type { Rgba } from './RasterSurface';
import {
  EyedropperTool,
  FillTool,
  PencilTool,
  type PixelTool,
  type ToolContext,
  type ToolGesture,
  type ToolId,
  type ToolInput,
} from './tools';

export interface PixelEditorOptions {
  container: HTMLElement;
  session: DocumentSession;
  labels: Record<ToolId, string>;
  onColorChange?: (color: Rgba) => void;
}

/**
 * Tuval, kamera ve araçları tek girdi yönlendiricisinde birleştirir.
 *
 * Kamera ile araç KESİN olarak ayrılır: `CanvasViewportController` olayları
 * capture fazında dinler ve pan başlattığında yaymayı durdurur, bu yüzden orta
 * tuş / `Space` + sol sürükleme buraya hiç ulaşmaz. Normal sol sürükleme
 * daima araca gider — kullanıcı çizmek isterken belgenin kayması, kalem
 * araçlı editörlerin en sinir bozucu hatasıdır.
 */
export class PixelEditor {
  readonly element: HTMLDivElement;
  readonly #scope = new DisposableScope();
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: PixelRenderer;
  readonly #camera: CanvasViewportController;
  readonly #session: DocumentSession;
  readonly #tools: Map<ToolId, PixelTool>;
  readonly #onColorChange?: (color: Rgba) => void;
  #activeTool: ToolId = 'pencil';
  #gesture: ToolGesture | null = null;
  #gesturePointerId: number | null = null;
  #primaryColor: Rgba = { r: 255, g: 255, b: 255, a: 255 };
  #secondaryColor: Rgba = { r: 0, g: 0, b: 0, a: 255 };
  #brushSize = 1;
  #frame: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #destroyed = false;

  public constructor(options: PixelEditorOptions) {
    this.#session = options.session;
    if (options.onColorChange !== undefined) this.#onColorChange = options.onColorChange;

    this.element = document.createElement('div');
    this.element.className = 'pixel-editor';
    this.#canvas = document.createElement('canvas');
    this.#canvas.className = 'pixel-editor__canvas';
    this.element.appendChild(this.#canvas);
    options.container.appendChild(this.element);

    this.#renderer = new PixelRenderer({ canvas: this.#canvas });
    this.#camera = new CanvasViewportController(this.element, {
      documentWidth: this.#session.surface.width,
      documentHeight: this.#session.surface.height,
      onChange: () => this.requestRender(),
    });

    this.#tools = new Map<ToolId, PixelTool>([
      ['pencil', new PencilTool({ id: 'pencil', label: options.labels.pencil })],
      ['eraser', new PencilTool({ id: 'eraser', label: options.labels.eraser, erase: true })],
      ['fill', new FillTool({ label: options.labels.fill })],
      ['eyedropper', new EyedropperTool()],
    ]);

    this.#scope.addListener(this.#canvas, 'pointerdown', (event) =>
      this.#onPointerDown(event as PointerEvent),
    );
    this.#scope.addListener(this.#canvas, 'pointermove', (event) =>
      this.#onPointerMove(event as PointerEvent),
    );
    this.#scope.addListener(this.#canvas, 'pointerup', (event) =>
      this.#onPointerEnd(event as PointerEvent, false),
    );
    this.#scope.addListener(this.#canvas, 'pointercancel', (event) =>
      this.#onPointerEnd(event as PointerEvent, true),
    );
    // Sağ tuş ikincil renktir; tarayıcı menüsü onun önüne geçmemeli.
    this.#scope.addListener(this.#canvas, 'contextmenu', (event) => event.preventDefault());

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#syncSize());
      this.#resizeObserver.observe(this.element);
    }
    this.#syncSize();
    this.#camera.fit();
  }

  public get activeTool(): ToolId {
    return this.#activeTool;
  }

  public setActiveTool(id: ToolId): void {
    if (!this.#tools.has(id)) return;
    this.#cancelGesture();
    this.#activeTool = id;
    this.element.dataset.tool = id;
  }

  public getPrimaryColor(): Rgba {
    return { ...this.#primaryColor };
  }

  public setPrimaryColor(color: Rgba): void {
    this.#primaryColor = { ...color };
    this.#onColorChange?.(this.getPrimaryColor());
  }

  public setSecondaryColor(color: Rgba): void {
    this.#secondaryColor = { ...color };
  }

  public setBrushSize(size: number): void {
    this.#brushSize = Math.max(1, Math.min(64, Math.trunc(size)));
  }

  public fit(): void {
    this.#camera.fit();
  }

  public actualSize(): void {
    this.#camera.actualSize();
  }

  public getTransform(): CanvasViewportTransform {
    return this.#camera.getTransform();
  }

  public requestRender(): void {
    if (this.#destroyed || this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      if (this.#destroyed) return;
      this.#renderer.render(this.#session.surface, this.#camera.getTransform());
    });
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#cancelGesture();
    this.#resizeObserver?.disconnect();
    this.#camera.destroy();
    this.#renderer.destroy();
    this.#scope.dispose();
    this.element.remove();
  }

  #syncSize(): void {
    const rect = this.element.getBoundingClientRect();
    const width = rect.width || this.element.clientWidth || 1;
    const height = rect.height || this.element.clientHeight || 1;
    this.#renderer.resize(width, height, window.devicePixelRatio || 1);
    this.requestRender();
  }

  #toolContext(): ToolContext {
    return {
      surface: this.#session.surface,
      primaryColor: this.#primaryColor,
      secondaryColor: this.#secondaryColor,
      brushSize: this.#brushSize,
      setPrimaryColor: (color) => this.setPrimaryColor(color),
      isEditable: (x, y) => this.#session.surface.contains(x, y),
    };
  }

  /** Ekran koordinatını TAM SAYI belge pikseline indirger. */
  #toolInput(event: PointerEvent): ToolInput {
    const point = this.#camera.screenToDocument({ x: event.clientX, y: event.clientY });
    return {
      x: Math.floor(point.x),
      y: Math.floor(point.y),
      button: event.button,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
  }

  #onPointerDown(event: PointerEvent): void {
    if (this.#gesture !== null) return;
    const tool = this.#tools.get(this.#activeTool);
    if (tool === undefined) return;
    const gesture = tool.begin(this.#toolContext(), this.#toolInput(event));
    if (gesture === null) return;
    this.#gesture = gesture;
    this.#gesturePointerId = event.pointerId;
    this.#canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    this.requestRender();
  }

  #onPointerMove(event: PointerEvent): void {
    if (this.#gesture === null || event.pointerId !== this.#gesturePointerId) return;
    // Hızlı harekette tarayıcı ara olayları biriktirir; hepsi işlenmezse
    // çizgi kesikli kalır.
    const events =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const step of events.length > 0 ? events : [event]) {
      this.#gesture.update(this.#toolInput(step));
    }
    event.preventDefault();
    this.requestRender();
  }

  #onPointerEnd(event: PointerEvent, cancelled: boolean): void {
    if (this.#gesture === null || event.pointerId !== this.#gesturePointerId) return;
    const gesture = this.#gesture;
    this.#releasePointer();
    if (cancelled) {
      gesture.cancel();
    } else {
      const command = gesture.commit();
      if (command !== null) this.#session.record(command);
    }
    this.requestRender();
  }

  #cancelGesture(): void {
    if (this.#gesture === null) return;
    const gesture = this.#gesture;
    this.#releasePointer();
    gesture.cancel();
    this.requestRender();
  }

  #releasePointer(): void {
    if (this.#gesturePointerId !== null && this.#canvas.hasPointerCapture(this.#gesturePointerId)) {
      this.#canvas.releasePointerCapture(this.#gesturePointerId);
    }
    this.#gesture = null;
    this.#gesturePointerId = null;
  }
}
