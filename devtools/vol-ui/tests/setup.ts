import { vi, beforeAll } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import trResources from '../src/i18n/tr.json';
import enResources from '../src/i18n/en.json';

i18n.addResources('tr', 'volui', trResources);
i18n.addResources('en', 'volui', enResources);

// jsdom, HTMLCanvasElement.getContext'i implemente etmez ('canvas' npm
// paketi kurulu değilse). Showcase artık Phaser taşımıyor; mock CORE'un
// kendi canvas yüzeyleri için duruyor: CanvasViewportController ölçüm için
// context ister, palet/HUD bölümleri 2D context üzerine çizer. Mock olmadan
// bu bileşenlere dokunan HERHANGİ bir test kurulum aşamasında çöker.
const noopCtx2d = {
  fillStyle: '',
  strokeStyle: '',
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
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

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    public readonly pointerId: number;
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

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
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

// jsdom, CSS Font Loading API'sini (FontFace, document.fonts) implemente
// etmez. FontManager `new FontFace(...)` ve `document.fonts.add/delete`
// kullanır — bu stub olmadan FontManager'a dokunan HERHANGİ bir test
// import/çalışma aşamasında çöker.
if (typeof globalThis.FontFace === 'undefined') {
  globalThis.FontFace = class FontFace {
    family: string;
    weight: string;
    style: string;
    status: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded';

    constructor(
      family: string,
      _source: string,
      descriptors: { weight?: string; style?: string } = {},
    ) {
      this.family = family;
      this.weight = descriptors.weight ?? 'normal';
      this.style = descriptors.style ?? 'normal';
    }

    load(): Promise<FontFace> {
      this.status = 'loaded';
      return Promise.resolve(this as unknown as FontFace);
    }
  } as unknown as typeof FontFace;
}

if (typeof document !== 'undefined') {
  const fontSet = new Set<FontFace>();
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    writable: true,
    value: {
      ready: Promise.resolve(undefined as unknown as FontFaceSet),
      check: () => true,
      add: (f: FontFace) => fontSet.add(f),
      delete: (f: FontFace) => fontSet.delete(f),
      [Symbol.iterator]: () => fontSet[Symbol.iterator](),
    },
  });
}

beforeAll(async () => {
  await i18n.init();
  await i18next.changeLanguage('tr');
});

for (const ctor of [HTMLElement, Element]) {
  const proto = ctor.prototype as unknown as {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
  };
  if (typeof proto.setPointerCapture !== 'function') {
    proto.setPointerCapture = vi.fn();
  }
  if (typeof proto.releasePointerCapture !== 'function') {
    proto.releasePointerCapture = vi.fn();
  }
  if (typeof proto.hasPointerCapture !== 'function') {
    proto.hasPointerCapture = vi.fn(() => false);
  }
}

if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
}
