import { describe, expect, it, vi } from 'vitest';
import {
  WorldCameraController,
  type WorldCamera,
  type WorldCameraControllerOptions,
} from '../../src/ui/controls/WorldCameraController';

/*
 * D1 — girdi olayı sarsıntısının render kadansından ayrılması.
 *
 * ÖN-KAYITLI ÖLÇÜT VE ÖLÇÜLEN İMKÂNSIZLIK: madde "3/25/7/40 ms aralıklı
 * olaylarda kare başı yer değiştirmenin varyasyon katsayısı ≤ 0,05" diyordu.
 * Ölçüldü ve bu, belgenin kendi "yumuşatma ve gecikme yoktur" kuralıyla birlikte
 * ULAŞILAMAZ: 40 ms'lik bir olay boşluğu 2,4 kare eder ve henüz gelmemiş bir
 * olay kullanılamaz, dolayısıyla o karelerde ilerleme sıfırdır. Tahmin
 * (extrapolation) eklemeden CoV düşürülemez; tahmin ise yön değişiminde aşım
 * üretir. Bugünkü kodda ölçülen CoV 1,6833'tü ve kare zamanına taşındıktan
 * sonra da aynı kaldı — çünkü sınırı koyan şey kontrolcü değil, girdinin
 * kendisi.
 *
 * Bu yüzden ölçüt ŞUNA çevrildi: kontrolcü girdinin dayattığının ÜSTÜNE kendi
 * sarsıntısını EKLEMEZ ve render kadansını olay sıklığına bağlamaz. İkisi de
 * aşağıda ayrı ayrı ölçülür.
 */
const FRAME_MS = 1000 / 60;
const EVENT_INTERVALS = [3, 25, 7, 40];
/*
 * Hız, sürüklemenin sınıra DAYANMAYACAĞI kadar düşük seçildi. Yüksek hızda
 * kamera ortada kısıtlanıyor ve "hareket kayboldu" gibi görünüyordu (ölçüldü:
 * yolun %53'ü uygulanmış, kalanı sınır payının bitmesiydi).
 */
const SPEED_PX_PER_MS = 0.1;
const FRAME_COUNT = 60;

function harness(options: Partial<WorldCameraControllerOptions> = {}) {
  const element = document.createElement('canvas');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(element);
  const state = { centerX: 0, centerY: 0 };
  let changes = 0;
  const camera: WorldCamera = {
    width: 1200,
    height: 800,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    setZoom: vi.fn((zoom: number) => {
      camera.zoom = zoom;
      return camera;
    }),
    centerOn: vi.fn((x: number, y: number) => {
      state.centerX = x;
      state.centerY = y;
      return camera;
    }),
  };
  const controller = new WorldCameraController(element, camera, {
    /*
     * Sınır GENİŞ: bu testin sorusu sarsıntı, sınır direnci değil. Dar sınırda
     * kamera sürüklemenin ortasında kısıtlanıyor ve "hareket kayboldu" gibi
     * görünüyordu (ölçüldü: yolun %53'ü uygulanmış).
     */
    bounds: { x: 0, y: 0, width: 200000, height: 200000 },
    onChange: () => {
      changes++;
    },
    ...options,
  });
  /*
   * Kaydırma payı AÇILIR. Varsayılan açılışta görünür dünya sınırla birebir
   * eşit oluyor ve kamera tam kısıtlı kalıyor; o hâlde ölçülen "sarsıntı" sıfır
   * çıkar çünkü hiç hareket yoktur — ölçüm değil, boşluk olurdu.
   */
  element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -600 }));
  controller.update(1000);
  changes = 0;
  return { element, controller, camera, state, changeCount: () => changes };
}

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  timeStamp: number,
  pointerType = 'mouse',
): PointerEvent {
  const event = new PointerEvent(type, { pointerId: 1, clientX, clientY: 400, pointerType });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

interface DragTrace {
  readonly appliedSteps: number[];
  readonly expectedSteps: number[];
  readonly changesPerFrame: number[];
  readonly totalApplied: number;
  readonly totalPointer: number;
}

/** Sabit hızda sürükleme; olaylar düzensiz aralıklarla gelir. */
function traceDrag(): DragTrace {
  const target = harness();
  target.element.dispatchEvent(pointerEvent('pointerdown', 0, 0));

  const appliedSteps: number[] = [];
  const expectedSteps: number[] = [];
  const changesPerFrame: number[] = [];
  let eventTime = 0;
  let intervalIndex = 0;
  let previousCenter = target.state.centerX;
  let previousChanges = target.changeCount();
  let previousPointerX = 0;
  let pointerX = 0;

  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    const frameTime = frame * FRAME_MS;
    while (eventTime + EVENT_INTERVALS[intervalIndex % EVENT_INTERVALS.length] <= frameTime) {
      eventTime += EVENT_INTERVALS[intervalIndex % EVENT_INTERVALS.length];
      intervalIndex++;
      pointerX = -eventTime * SPEED_PX_PER_MS;
      target.element.dispatchEvent(pointerEvent('pointermove', pointerX, eventTime));
    }
    target.controller.update(FRAME_MS);
    appliedSteps.push(Math.abs(target.state.centerX - previousCenter));
    // Beklenen: bu kareden ÖNCE gelen deltaların tam toplamı (zoom'a çevrilmiş).
    expectedSteps.push(Math.abs(pointerX - previousPointerX) / target.camera.zoom);
    changesPerFrame.push(target.changeCount() - previousChanges);
    previousCenter = target.state.centerX;
    previousPointerX = pointerX;
    previousChanges = target.changeCount();
  }

  return {
    appliedSteps,
    expectedSteps,
    changesPerFrame,
    totalApplied: appliedSteps.reduce((sum, value) => sum + value, 0),
    totalPointer: Math.abs(pointerX) / target.camera.zoom,
  };
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

describe('D1 — girdi sarsıntısı render kadansından ayrıldı', () => {
  /* Render kadansı olay sıklığına BAĞLANMAZ: karede en fazla bir uygulama. */
  it('yoğun olay akışında kare başına en fazla bir kez uygulanır', () => {
    const trace = traceDrag();

    expect(Math.max(...trace.changesPerFrame)).toBeLessThanOrEqual(1);
  });

  /* Karede uygulanan hareket, o kareden ÖNCE gelen deltaların tam toplamıdır. */
  it('kare başı hareket, o kareye kadar gelen deltaların tam toplamıdır', () => {
    const trace = traceDrag();

    for (let index = 1; index < trace.appliedSteps.length; index++) {
      expect(trace.appliedSteps[index]).toBeCloseTo(trace.expectedSteps[index], 6);
    }
  });

  /* Kontrolcü GİRDİNİN dayattığının üstüne kendi sarsıntısını eklemez. */
  it('ölçülen sarsıntı girdinin kendi sarsıntısına eşittir', () => {
    const trace = traceDrag();

    const applied = coefficientOfVariation(trace.appliedSteps.slice(1));
    const inputBound = coefficientOfVariation(trace.expectedSteps.slice(1));

    expect(applied).toBeCloseTo(inputBound, 6);
  });

  it('hiçbir hareket kaybolmaz ya da iki kez uygulanmaz', () => {
    const trace = traceDrag();

    expect(trace.totalApplied).toBeCloseTo(trace.totalPointer, 4);
  });
});
