import type { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Button,
  PinchZoomController,
  Text,
  WorldCameraController,
  type WorldCamera,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';

/** Düğme başına zoom adımı: çekirdeğin klavye adımıyla (`PINCH_ZOOM.KEY_STEP`) aynıdır. */
const ZOOM_BUTTON_STEP = 0.25;

/** PinchZoomController demosu: küçük taktik harita. Masaüstünde tekerlek=zoom/sürükle=pan; dokunmatikte iki parmak=zoom/tek parmak=pan. */
export function buildPinchZoomDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const zoomLabel = new Text(i18next.t('volui:touch.zoomPercent', { n: 1 }), {
    variant: 'muted',
  });
  disposables.addDestroyables(zoomLabel);

  const map = document.createElement('div');
  map.className = 'vol-showcase-pinch-map';
  for (let i = 1; i <= 36; i++) {
    const cell = document.createElement('div');
    cell.className = 'vol-showcase-pinch-map__cell';
    cell.textContent = String(i);
    map.appendChild(cell);
  }

  const controller = new PinchZoomController({
    content: map,
    minZoom: 0.6,
    maxZoom: 2.5,
    onTransformChange: (zoom) => {
      zoomLabel.setContent(i18next.t('volui:touch.zoomPercent', { n: zoom }));
    },
  });
  disposables.addDestroyables(controller);
  controller.element.style.height = '260px';

  // HoldButton yerine Button: HoldButton etiketi aria-only, "Sıfırla" tek seferlik komut.
  const resetButton = new Button(i18next.t('volui:touch.reset'), {
    onClick: () => controller.reset(),
  });
  // Parmakla büyütme tek yol olamaz (UI-10.4): aynı zoom adımını düğmeler de verir; harita odaktayken `+`/`-`/oklar/`0` de.
  const zoomOutButton = new Button(i18next.t('volui:touch.zoomOut'), {
    onClick: () => controller.zoomBy(-ZOOM_BUTTON_STEP),
  });
  const zoomInButton = new Button(i18next.t('volui:touch.zoomIn'), {
    onClick: () => controller.zoomBy(ZOOM_BUTTON_STEP),
  });
  for (const button of [zoomOutButton, zoomInButton]) {
    button.element.classList.add('vol-showcase-zoom-button');
  }
  const keyboardHint = new Text(i18next.t('volui:touch.zoomKeyboardHint'), { variant: 'muted' });
  disposables.addDestroyables(resetButton, zoomOutButton, zoomInButton, keyboardHint);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  controls.append(zoomOutButton.element, zoomInButton.element, resetButton.element);
  controls.appendChild(zoomLabel.element);

  wrap.appendChild(controller.element);
  wrap.appendChild(controls);
  wrap.appendChild(keyboardHint.element);

  return wrap;
}

/** Düğme başına kamera zoom çarpanı (çekirdeğin klavye adımıyla aynı: 1,25). */
const WORLD_CAMERA_BUTTON_FACTOR = 1.25;
/** Bu kadar kare üst üste değişmeyen kamera yerleşmiş sayılır; demo döngüsü durur. */
const WORLD_CAMERA_QUIET_FRAMES = 20;

export function buildWorldCameraDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const canvas = document.createElement('canvas');
  canvas.className = 'vol-showcase-world-camera';
  canvas.width = 640;
  canvas.height = 360;
  canvas.setAttribute('aria-label', i18next.t('volui:touch.worldCameraLabel'));
  // CPU tuvali: gamescope'ta hızlandırılmış 2D tuval boş kalıyordu (bkz. CurveEditor).
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;

  const camera: WorldCamera = {
    width: canvas.width,
    height: canvas.height,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    setZoom(zoom) {
      camera.zoom = zoom;
      draw();
      return camera;
    },
    centerOn(x, y) {
      camera.scrollX = x - camera.width / (2 * camera.zoom);
      camera.scrollY = y - camera.height / (2 * camera.zoom);
      draw();
      return camera;
    },
  };
  const draw = (): void => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#090e18';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(
      camera.zoom,
      0,
      0,
      camera.zoom,
      -camera.scrollX * camera.zoom,
      -camera.scrollY * camera.zoom,
    );
    context.fillStyle = '#111827';
    context.fillRect(0, 0, 400, 400);
    context.fillStyle = '#d6c783';
    context.fillRect(80, 110, 70, 70);
    context.fillStyle = '#315c59';
    context.fillRect(245, 255, 95, 60);
    context.strokeStyle = '#365266';
    context.strokeRect(0, 0, 400, 400);
  };

  const controller = new WorldCameraController(canvas, camera, {
    bounds: { x: 0, y: 0, width: 400, height: 400 },
    keyboard: true,
    label: i18next.t('volui:touch.worldCameraLabel'),
  });
  disposables.addDestroyables(controller);

  // Tekerlek, klavye ve düğme zoom'u hedefi değiştirir; yumuşatma her karede `update` ister (oyunda sahne döngüsü verir).
  // Demo döngüsünü yalnız hareket sürerken çalıştırır, yerleşince durur: boşta kare maliyeti yoktur.
  let settling = false;
  const settle = (): void => {
    if (settling) return;
    settling = true;
    let last = performance.now();
    let quietFrames = 0;
    let previous = JSON.stringify(controller.getState());
    const frame = (timestamp: number): void => {
      // Saat ilerlemiyorsa (dondurulmuş test ortamı) kare süresi varsayılır; yoksa yumuşatma hiç yerleşmez.
      controller.update(timestamp > last ? timestamp - last : 16);
      last = timestamp;
      const current = JSON.stringify(controller.getState());
      quietFrames = current === previous ? quietFrames + 1 : 0;
      previous = current;
      if (quietFrames >= WORLD_CAMERA_QUIET_FRAMES) {
        settling = false;
        return;
      }
      disposables.addAnimationFrame(frame);
    };
    disposables.addAnimationFrame(frame);
  };
  disposables.addListener(canvas, 'wheel', settle, { passive: true });
  disposables.addListener(canvas, 'keydown', settle);

  // Parmakla/tekerlekle yakınlaştırma tek yol olamaz (UI-10.4): sahibi aynı kamerayı düğmelere de bağlar.
  const zoomOutButton = new Button(i18next.t('volui:touch.zoomOut'), {
    onClick: () => {
      controller.zoomBy(1 / WORLD_CAMERA_BUTTON_FACTOR);
      settle();
    },
  });
  const zoomInButton = new Button(i18next.t('volui:touch.zoomIn'), {
    onClick: () => {
      controller.zoomBy(WORLD_CAMERA_BUTTON_FACTOR);
      settle();
    },
  });
  const fitButton = new Button(i18next.t('volui:touch.reset'), {
    onClick: () => controller.fitWorld(),
  });
  for (const button of [zoomOutButton, zoomInButton]) {
    button.element.classList.add('vol-showcase-zoom-button');
  }
  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  controls.append(zoomOutButton.element, zoomInButton.element, fitButton.element);

  const hint = new Text(i18next.t('volui:touch.worldCameraHint'), { variant: 'muted' });
  disposables.addDestroyables(zoomOutButton, zoomInButton, fitButton, hint);
  wrap.append(canvas, controls, hint.element);
  return wrap;
}
