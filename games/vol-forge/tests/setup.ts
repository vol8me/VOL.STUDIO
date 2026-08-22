import { vi, beforeAll } from 'vitest';
import { i18n, i18next } from '../../../core/src/systems/I18n';
import trResources from '../src/i18n/tr.json';
import enResources from '../src/i18n/en.json';

i18n.addResources('tr', 'volforge', trResources);
i18n.addResources('en', 'volforge', enResources);

// jsdom `getContext` uygulamaz; önizleme tuvali ve CurveEditor çizimi test
// ortamında sessizce atlanmalı. Kanal dönüşümü ve durum matematiği tuvale
// bağlı değildir, o yüzden no-op bir bağlam yeterli.
const noopCtx2d = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  createImageData: vi.fn((w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  })),
  putImageData: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
} as unknown as CanvasRenderingContext2D;

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => noopCtx2d,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  } as unknown as typeof globalThis.PointerEvent;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

const capturedPointers = new WeakMap<Element, Set<number>>();
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = function (pointerId: number): void {
    const captured = capturedPointers.get(this) ?? new Set<number>();
    captured.add(pointerId);
    capturedPointers.set(this, captured);
  };
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = function (pointerId: number): void {
    capturedPointers.get(this)?.delete(pointerId);
  };
}
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = function (pointerId: number): boolean {
    return capturedPointers.get(this)?.has(pointerId) ?? false;
  };
}

beforeAll(async () => {
  await i18n.init();
  await i18next.changeLanguage('tr');
});
