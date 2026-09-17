import { describe, expect, it, vi } from 'vitest';
import {
  WorldCameraController,
  type WorldCamera,
  type WorldCameraControllerOptions,
} from '../../src/ui/controls/WorldCameraController';
import {
  classifyPointer,
  classifyWheel,
  defaultPointerProfiles,
  resistTowardBound,
} from '../../src/ui/controls/camera/pointerProfiles';
import { CameraTrace } from '../../src/ui/controls/camera/cameraTrace';

/*
 * D1: modalite ayrımı, sınır direnci ve DEV iz kaydedici. Bugünkü kod
 * `pointerType` okumuyordu ve fare ile dokunma aynı momentumu kullanıyordu.
 */
function harness(options: Partial<WorldCameraControllerOptions> = {}) {
  const element = document.createElement('canvas');
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(element);
  const state = { centerX: 0, centerY: 0 };
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
    bounds: { x: 0, y: 0, width: 4000, height: 4000 },
    ...options,
  });
  /*
   * Birden fazla yakınlaştırma: tek adımda görünür alan sınıra yakın kalıyor ve
   * kamera ortada kısıtlanıyor; o hâlde iki modalitenin kayması aynı sınır
   * payına dayanıp eşit çıkıyordu (ölçüldü: ikisi de 294,78).
   */
  for (let step = 0; step < 3; step++) {
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 600, clientY: 400, deltaY: -300 }));
    controller.update(1000);
  }
  return { element, controller, camera, state };
}

function drag(
  target: ReturnType<typeof harness>,
  pointerType: string,
  samples: readonly (readonly [number, number])[],
): void {
  const make = (type: string, x: number, time: number): PointerEvent => {
    const event = new PointerEvent(type, { pointerId: 1, clientX: x, clientY: 400, pointerType });
    Object.defineProperty(event, 'timeStamp', { value: time });
    return event;
  };
  target.element.dispatchEvent(make('pointerdown', samples[0][0], samples[0][1]));
  for (const [x, time] of samples.slice(1)) {
    target.element.dispatchEvent(make('pointermove', x, time));
    target.controller.update(16);
  }
  const last = samples[samples.length - 1];
  target.element.dispatchEvent(make('pointerup', last[0], last[1]));
}

describe('D1 — modalite profilleri', () => {
  it('pointerType okunur: dokunma ve fare farklı sınıflanır', () => {
    expect(classifyPointer('touch')).toBe('touch');
    expect(classifyPointer('pen')).toBe('pen');
    expect(classifyPointer('mouse')).toBe('mouse');
    expect(classifyPointer(undefined)).toBe('mouse');
  });

  it('profiller modaliteye göre ayrıdır', () => {
    expect(defaultPointerProfiles.touch.momentumMs).not.toBe(
      defaultPointerProfiles.mouse.momentumMs,
    );
    expect(defaultPointerProfiles.touch.resistanceBandRatio).toBeGreaterThan(
      defaultPointerProfiles.mouse.resistanceBandRatio,
    );
  });

  /*
   * Aynı jest, farklı profil → farklı kayma mesafesi.
   *
   * ORTAM KISITI: jsdom'un `PointerEvent`i `pointerType` taşımıyor (ölçüldü:
   * `undefined`), bu yüzden modalite DOM üzerinden sürülemiyor. Sınanan şey
   * aynı bağlantıdır — profil → momentum süresi — ve profil enjekte edilerek
   * sürülüyor; `classifyPointer` ayrıca birim testinde.
   */
  it('daha uzun momentum profili daha uzun kaydırır', () => {
    const samples = [
      [700, 0],
      [660, 16],
      [620, 32],
      [580, 48],
    ] as const;
    const coast = (momentumMs: number): number => {
      const target = harness({
        pointerProfiles: {
          ...defaultPointerProfiles,
          mouse: { momentumMs, resistanceBandRatio: 0.08 },
        },
      });
      drag(target, 'mouse', samples);
      const released = target.controller.getState().centerX;
      for (let frame = 0; frame < 20; frame++) target.controller.update(16);
      return Math.abs(target.controller.getState().centerX - released);
    };

    expect(coast(defaultPointerProfiles.touch.momentumMs)).toBeGreaterThan(
      coast(defaultPointerProfiles.mouse.momentumMs),
    );
  });
});

describe('D1 — sınır direnci', () => {
  it('sert sınır aşılmaz ve bant içinde asimptotik yaklaşır', () => {
    const band = 100;
    expect(resistTowardBound(500, 0, 1000, band)).toBe(500);
    // Sınırın 200 birim ötesi istendiğinde bile sınır AŞILMAZ.
    expect(resistTowardBound(1200, 0, 1000, band)).toBeLessThan(1000);
    expect(resistTowardBound(-200, 0, 1000, band)).toBeGreaterThan(0);
    // Daha fazla zorlamak daha fazla ilerletir ama hep sınırın altında kalır.
    expect(resistTowardBound(1200, 0, 1000, band)).toBeGreaterThan(
      resistTowardBound(1050, 0, 1000, band),
    );
  });

  it('direnç monotondur: geri sekme üretmez', () => {
    const band = 100;
    let previous = -Infinity;
    for (let requested = 850; requested <= 1400; requested += 25) {
      const resisted = resistTowardBound(requested, 0, 1000, band);
      expect(resisted).toBeGreaterThanOrEqual(previous);
      previous = resisted;
    }
  });

  it('sınırın 200 px ötesine sürüklemek sert sınırı aşmaz', () => {
    const target = harness();
    drag(target, 'touch', [
      [100, 0],
      [400, 16],
      [800, 32],
      [1200, 48],
      [1600, 64],
    ]);
    target.controller.update(16);

    const half = target.camera.width / (2 * target.camera.zoom);
    expect(target.controller.getState().centerX).toBeGreaterThanOrEqual(half - 1e-6);
    expect(target.controller.getState().centerX).toBeLessThanOrEqual(4000 - half + 1e-6);
  });
});

describe('D1 — wheel niyeti sınıflanır', () => {
  it('ctrlKey pinch, satır modu tekerlek, küçük piksel adımı trackpad', () => {
    expect(classifyWheel({ ctrlKey: true, deltaMode: 0, deltaY: -10 })).toBe('pinch');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 1, deltaY: -3 })).toBe('wheel-zoom');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaY: -8 })).toBe('trackpad-pan');
    expect(classifyWheel({ ctrlKey: false, deltaMode: 0, deltaY: -120 })).toBe('wheel-zoom');
  });
});

describe('D1 — DEV iz kaydedici', () => {
  it('kapalıyken yazmaz', () => {
    const trace = new CameraTrace(4);

    trace.record({ kind: 'event', timeMs: 1, label: 'a', x: 0, y: 0, zoom: 1 });

    expect(trace.snapshot()).toEqual([]);
    expect(trace.isEnabled).toBe(false);
  });

  it('halka tampon kapasiteyi aşmaz ve sırayı korur', () => {
    const trace = new CameraTrace(3);
    trace.setEnabled(true);
    for (const label of ['a', 'b', 'c', 'd', 'e']) {
      trace.record({ kind: 'event', timeMs: 0, label, x: 0, y: 0, zoom: 1 });
    }

    expect(trace.snapshot().map((entry) => entry.label)).toEqual(['c', 'd', 'e']);
    expect(JSON.parse(trace.toJson())).toHaveLength(3);
  });

  it('kontrolcü açıkken olay ve kare kaydeder, kapalıyken kaydetmez', () => {
    const quiet = harness();
    drag(quiet, 'mouse', [
      [700, 0],
      [660, 16],
    ]);
    expect(quiet.controller.trace.snapshot()).toEqual([]);

    const loud = harness();
    loud.controller.trace.setEnabled(true);
    drag(loud, 'mouse', [
      [700, 0],
      [660, 16],
    ]);

    const kinds = new Set(loud.controller.trace.snapshot().map((entry) => entry.kind));
    expect(kinds.has('event')).toBe(true);
    expect(kinds.has('frame')).toBe(true);
  });
});
