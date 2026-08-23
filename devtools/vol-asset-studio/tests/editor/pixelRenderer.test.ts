import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixelRenderer } from '../../src/editor/PixelRenderer';
import { SpriteDocument } from '../../src/editor/SpriteDocument';
import type { RasterBuffer } from '../../src/editor/transform';

/** Saydam test tamponu. */
function buffer(width: number, height: number): RasterBuffer {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}

/**
 * Renderer'ın ÖLÇÜLEBİLİR mantığı.
 *
 * Çizimin görsel doğruluğu jsdom'da doğrulanamaz; o Playwright altında gerçek
 * tarayıcıda ölçülür. Burada sınananlar piksel değil karar: cihaz piksel
 * oranı matematiği, yumuşatmanın kapalı olması, ızgaranın hangi yakınlaşmada
 * çizileceği ve ara tuvalin yeniden kullanılması.
 */
interface RecordingContext {
  calls: { method: string; args: unknown[] }[];
  imageSmoothingEnabled: boolean;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/** Her teste özel, çağrıları kaydeden 2D context kurar. */
function installRecordingContext(): { contexts: RecordingContext[] } {
  const contexts: RecordingContext[] = [];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const state: RecordingContext = { calls: [], imageSmoothingEnabled: true };
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
      };
    const context = {
      get imageSmoothingEnabled() {
        return state.imageSmoothingEnabled;
      },
      set imageSmoothingEnabled(value: boolean) {
        state.imageSmoothingEnabled = value;
      },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      save: record('save'),
      restore: record('restore'),
      scale: record('scale'),
      setTransform: record('setTransform'),
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      strokeRect: record('strokeRect'),
      beginPath: record('beginPath'),
      rect: record('rect'),
      clip: record('clip'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
      fill: record('fill'),
      drawImage: record('drawImage'),
      putImageData: record('putImageData'),
      createImageData: (width: number, height: number) =>
        ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
    } as unknown as CanvasRenderingContext2D;
    contexts.push(state);
    return context;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return { contexts };
}

function makeRenderer(): {
  renderer: PixelRenderer;
  canvas: HTMLCanvasElement;
  main: RecordingContext;
} {
  const { contexts } = installRecordingContext();
  const canvas = document.createElement('canvas');
  const renderer = new PixelRenderer({ canvas });
  return { renderer, canvas, main: contexts[0] };
}

describe('PixelRenderer', () => {
  it('tuvali cihaz piksel oranıyla ölçekler, CSS boyutunu korur', () => {
    const { renderer, canvas } = makeRenderer();

    renderer.resize(300, 200, 2);

    // Geri tampon fiziksel piksel, stil ise CSS pikselidir; ikisi karışırsa
    // yüksek DPR ekranlarda görüntü ya bulanır ya yarım kalır.
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(canvas.style.width).toBe('300px');
    expect(canvas.style.height).toBe('200px');
  });

  it('geçersiz cihaz piksel oranını 1e düşürür', () => {
    const { renderer, canvas } = makeRenderer();

    renderer.resize(100, 100, Number.NaN);

    expect(canvas.width).toBe(100);
  });

  it('ölçeklemede yumuşatmayı kapatır', () => {
    const { renderer, main } = makeRenderer();
    renderer.resize(200, 200, 1);

    renderer.render(buffer(16, 16), { offsetX: 0, offsetY: 0, zoom: 4 });

    expect(main.imageSmoothingEnabled).toBe(false);
    expect(main.calls.some((call) => call.method === 'drawImage')).toBe(true);
  });

  it('uzak yakınlaşmada ızgara çizmez', () => {
    const { renderer, main } = makeRenderer();
    renderer.resize(200, 200, 1);

    renderer.render(buffer(64, 64), { offsetX: 0, offsetY: 0, zoom: 2 });

    // Izgara çizgileri görüntüyü tamamen kaplardı; eşik altında hiç çizilmez.
    expect(main.calls.some((call) => call.method === 'moveTo')).toBe(false);
  });

  it('yakın yakınlaşmada ızgara çizer', () => {
    const { renderer, main } = makeRenderer();
    renderer.resize(400, 400, 1);

    renderer.render(buffer(16, 16), { offsetX: 0, offsetY: 0, zoom: 16 });

    expect(main.calls.some((call) => call.method === 'moveTo')).toBe(true);
  });

  it('aynı boyuttaki belgede ara tuvali yeniden kullanır', () => {
    const { contexts } = installRecordingContext();
    const canvas = document.createElement('canvas');
    const renderer = new PixelRenderer({ canvas });
    renderer.resize(200, 200, 1);
    const surface = buffer(32, 32);

    renderer.render(surface, { offsetX: 0, offsetY: 0, zoom: 1 });
    const afterFirst = contexts.length;
    renderer.render(surface, { offsetX: 10, offsetY: 10, zoom: 1 });

    // Her karede yeni tuval ayırmak çöp toplayıcıyı sürekli tetiklerdi.
    expect(contexts.length).toBe(afterFirst);
  });

  it('belge boyutu değişince ara tuvali yeniler', () => {
    const { contexts } = installRecordingContext();
    const canvas = document.createElement('canvas');
    const renderer = new PixelRenderer({ canvas });
    renderer.resize(200, 200, 1);

    renderer.render(buffer(32, 32), { offsetX: 0, offsetY: 0, zoom: 1 });
    const afterFirst = contexts.length;
    renderer.render(buffer(64, 64), { offsetX: 0, offsetY: 0, zoom: 1 });

    expect(contexts.length).toBe(afterFirst + 1);
  });

  it('katman çiziminde yalnız değişen tile tamponunu günceller', () => {
    const { contexts } = installRecordingContext();
    const canvas = document.createElement('canvas');
    const renderer = new PixelRenderer({ canvas });
    renderer.resize(256, 256, 1);
    const documentModel = SpriteDocument.fromFlat(
      'sprite',
      128,
      128,
      new Uint8ClampedArray(128 * 128 * 4),
    );

    renderer.renderDocument(documentModel, { offsetX: 0, offsetY: 0, zoom: 1 });
    documentModel.celSurface(0, 'layer-1').setPixel(70, 70, { r: 255, g: 0, b: 0, a: 255 });
    renderer.renderDocument(documentModel, { offsetX: 0, offsetY: 0, zoom: 1 });

    const tileContext = contexts.find((context) =>
      context.calls.some((call) => call.method === 'putImageData'),
    );
    const update = tileContext?.calls.find((call) => call.method === 'putImageData');
    expect((update?.args[0] as ImageData).width).toBe(64);
    expect(update?.args.slice(1)).toEqual([64, 64]);
  });

  it('context alınamazsa açıkça hata verir', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    expect(() => new PixelRenderer({ canvas: document.createElement('canvas') })).toThrow(
      '2D context',
    );
  });

  it('destroy tampon referanslarını bırakır', () => {
    const { renderer } = makeRenderer();
    renderer.resize(100, 100, 1);
    renderer.render(buffer(8, 8), { offsetX: 0, offsetY: 0, zoom: 1 });

    expect(() => renderer.destroy()).not.toThrow();
  });
});
