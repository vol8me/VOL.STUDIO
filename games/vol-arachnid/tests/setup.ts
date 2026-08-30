import { vi } from 'vitest';

// Phaser modül yüklenirken bir prob canvas üzerinde 2D context sorgular;
// jsdom bunu yerel `canvas` paketi olmadan sağlamaz.
const noopCtx2d = {
  fillStyle: '',
  strokeStyle: '',
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  translate: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
} as unknown as CanvasRenderingContext2D;

HTMLCanvasElement.prototype.getContext = vi.fn(
  () => noopCtx2d,
) as unknown as typeof HTMLCanvasElement.prototype.getContext;

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, eventInitDict?: PointerEventInit) {
      super(type, eventInitDict);
      this.pointerId = eventInitDict?.pointerId ?? 0;
    }
  } as unknown as typeof PointerEvent;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof matchMedia;
}

for (const ctor of [HTMLElement, Element]) {
  const proto = ctor.prototype as unknown as {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
  };
  proto.setPointerCapture ??= vi.fn();
  proto.releasePointerCapture ??= vi.fn();
  proto.hasPointerCapture ??= vi.fn(() => false);
}
