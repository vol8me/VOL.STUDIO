import { vi } from 'vitest';

/**
 * jsdom'un implemente etmediği tarayıcı yüzeyleri.
 *
 * Buradaki taklitler BİLEREK sığdır: canvas'ın gerçek çizim doğruluğu (cihaz
 * piksel oranı, kapalı yumuşatma, ızgara eşiği) jsdom'da doğrulanamaz ve
 * doğrulanıyormuş gibi yapmak yanıltıcı olur. O sözleşme Playwright altında,
 * gerçek tarayıcıda ölçülür; buradaki testler girdi yönlendirmesi ve belge
 * durumu gibi saf mantığı sınar.
 */
const noopContext2d = {
  canvas: null as unknown as HTMLCanvasElement,
  imageSmoothingEnabled: true,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  font: '',
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(
    (width: number, height: number) =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
  ),
  getImageData: vi.fn(
    (_x: number, _y: number, width: number, height: number) =>
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
  ),
} as unknown as CanvasRenderingContext2D;

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => noopContext2d,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    public readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  } as unknown as typeof PointerEvent;
}

if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(
      () => callback(performance.now()),
      0,
    ) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
}

for (const ctor of [HTMLElement, Element]) {
  const proto = ctor.prototype as unknown as Record<string, unknown>;
  if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = vi.fn();
  if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = vi.fn();
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = vi.fn(() => false);
}
