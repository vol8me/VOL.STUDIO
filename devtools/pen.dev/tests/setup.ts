import { vi } from 'vitest';

// jsdom, HTMLCanvasElement.getContext'i implemente etmez ('canvas' npm
// paketi kurulu değilse). Phaser modülü import edilir edilmez module-level
// init sırasında bir prob canvas oluşturup 2D context üzerinde okuma/yazma
// yapar — bu mock olmadan `import Phaser from 'phaser'` içeren HERHANGİ bir
// test dosyası import aşamasında çöker. (bkz. games/vol-hell/tests/setup.ts)
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

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => noopCtx2d,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
