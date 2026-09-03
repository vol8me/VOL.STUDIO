/**
 * Headless bir DOM kurar — Phaser'ı import eden HER ŞEYDEN ÖNCE.
 *
 * Phaser modül seviyesinde bir prob canvas açar ve 2D bağlam üzerinde okuma
 * yazma yapar; `document` yokken `import Phaser` daha ilk satırda çöker. Bu
 * yüzden benchmark, Phaser'a dokunan her modülü DİNAMİK import eder ve önce
 * burayı çalıştırır.
 *
 * Ölçülen şey render değil, simülasyon ve dönüşüm matematiğidir; bağlam bu
 * yüzden gerçek bir canvas değil, Phaser'ın init sırasında dokunduğu yüzeyi
 * karşılayan bir no-op'tur (aynı politika: `tests/setup.ts`).
 */
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';

/**
 * Node'a `.css`i BOŞ bir modül olarak okumayı öğretir.
 *
 * CORE'un barrel'ı UI temasını (`ui/theme.css`) import eder; bir bundler bunu
 * çözer, Node çözemez ve `ERR_UNKNOWN_FILE_EXTENSION` ile durur. Bu, ölçüm
 * aracına ait bir ayrıntıdır: benchmark stil YÜKLEMEZ, yalnız aynı modül
 * grafiğini kurabilmek ister.
 *
 * Alternatifi oyunun çalışma zamanı import'larını derin alt yollara çevirmekti;
 * bir ölçüm aracı uğruna üretim kodunun okunabilirliğini bozmak yanlış takas
 * olurdu.
 */
function registerStyleStub(): void {
  registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith('.css')) {
        return { format: 'module', shortCircuit: true, source: 'export default undefined;' };
      }
      return nextLoad(url, context);
    },
  });
}

export function installHeadlessDom(): void {
  registerStyleStub();
  if (typeof globalThis.document !== 'undefined') return;

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const view = dom.window as unknown as Window & typeof globalThis;

  const noopContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    measureText: () => ({ width: 0 }),
  };
  view.HTMLCanvasElement.prototype.getContext = (() =>
    noopContext) as unknown as typeof view.HTMLCanvasElement.prototype.getContext;

  /*
   * `defineProperty` ile yazılır, atama ile değil: Node 22'de `navigator`
   * globalThis üzerinde YALNIZ GETTER'lı bir özelliktir ve düz atama
   * `TypeError` fırlatır. Yapılandırılabilir olduğu için yeniden tanımlanabilir.
   */
  const define = (name: string, value: unknown): void => {
    try {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    } catch {
      // Yeniden tanımlanamayan bir global zaten doğru değeri taşıyordur.
    }
  };

  // Önce ÇEKİRDEK yüzey: aşağıdaki toplu kopya "zaten tanımlı" olanı atlar ve
  // jsdom'un kendi `window` referansı bunları kilitleyebilir.
  define('window', view);
  define('document', view.document);
  define('navigator', view.navigator);
  define(
    'requestAnimationFrame',
    (callback: FrameRequestCallback): number =>
      setTimeout(() => callback(Date.now()), 16) as unknown as number,
  );
  define('cancelAnimationFrame', (handle: number): void => clearTimeout(handle));

  /*
   * Kalan pencere yüzeyi TOPLUCA taşınır, tek tek seçilmez.
   *
   * Phaser modül seviyesinde `Element`, `Image`, `HTMLCanvasElement` gibi
   * onlarca yüzeye dokunur; eksik olanı bulmak teker teker çökerek ilerlemek
   * demektir. Zaten TANIMLI olanlar (Node'un kendi `URL`i, `fetch`i…) korunur —
   * jsdom karşılıkları onları ezerse Node tarafı bozulur.
   */
  for (const key of Object.getOwnPropertyNames(view)) {
    if (key in globalThis) continue;
    const descriptor = Object.getOwnPropertyDescriptor(view, key);
    if (!descriptor) continue;
    try {
      Object.defineProperty(globalThis, key, descriptor);
    } catch {
      // Bazı jsdom özellikleri yeniden tanımlanamaz; Phaser onlara dokunmuyor.
    }
  }
}
