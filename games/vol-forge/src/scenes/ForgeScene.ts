import Phaser from 'phaser';
import { WorldCameraController } from '@volstudio/core/ui';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { host as defaultHost, type ForgeHost } from '@/app/host';
import type { ForgeController } from '@/app/ForgeController';
import { TapDetector } from '@/app/tap';
import { VIEW } from '@/config/game';
import { tileAt } from '@/view/geometry';
import { WorldView } from '@/view/WorldView';

export const FORGE_SCENE_KEY = 'forge';

/**
 * Dünya sahnesi. Bir denetleyici bağlanıp ilk anlık görüntüsü gelince kamera, dokunma algısı ve dünya
 * görünümünü kurar; denetleyici düşünce hepsini söker. Oyun mantığı denetleyicidedir, burada yalnız
 * girdi ve çizim köprüsü vardır.
 */
export class ForgeScene extends Phaser.Scene {
  private readonly host: ForgeHost;
  private bound: ForgeController | null = null;
  private view: WorldView | null = null;
  private cameraController: WorldCameraController | null = null;
  private scope: DisposableScope | null = null;
  /** Kamera sınırının kurulduğu dünya boyutu (tile); değişirse sahne yeniden kurulur. */
  private cameraWidth = 0;
  private cameraHeight = 0;

  constructor(host: ForgeHost = defaultHost) {
    super(FORGE_SCENE_KEY);
    this.host = host;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d1218');
    const onResize = (): void => this.cameraController?.refreshViewport();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.teardown();
    });
  }

  override update(_time: number, deltaMs: number): void {
    const controller = this.host.controller;
    if (controller !== this.bound) {
      this.teardown();
      this.bound = controller;
    }
    if (controller === null) return;
    controller.frame(deltaMs);
    if (this.view === null) {
      if (controller.sim === null) return;
      this.build(controller);
    }
    if (this.view === null) return;
    if (this.worldChanged(controller)) {
      // Dünya boyutu değişti (başka sunucu ya da dünya): kamera sınırı ve dokular yeniden kurulur.
      this.teardown();
      this.bound = controller;
      this.build(controller);
    }
    this.cameraController?.update(deltaMs);
    this.view?.update();
  }

  private worldChanged(controller: ForgeController): boolean {
    const sim = controller.sim;
    if (sim === null || this.cameraWidth === 0) return false;
    return sim.state.width !== this.cameraWidth || sim.state.height !== this.cameraHeight;
  }

  private build(controller: ForgeController): void {
    const sim = controller.sim!;
    const { width, height } = sim.state;
    this.cameraWidth = width;
    this.cameraHeight = height;
    const canvas = this.game.canvas;
    const bounds = { x: 0, y: 0, width: width * VIEW.tilePx, height: height * VIEW.tilePx };
    const camera = new WorldCameraController(canvas, this.cameras.main, {
      bounds,
      fit: 'cover',
      maxZoom: VIEW.maxZoom,
      initialZoomFactor: VIEW.initialZoomFactor,
      mousePanMomentumMs: 0,
      keyboard: true,
      label: i18next.t('volforge:scene.label'),
    });
    const view = new WorldView(this, controller);
    const scope = new DisposableScope();
    const taps = new TapDetector({
      slopPx: VIEW.tapSlopPx,
      maxMs: VIEW.tapMaxMs,
      longPressMs: VIEW.longPressMs,
    });
    const toTile = (event: PointerEvent): { x: number; y: number } | null => {
      const world = camera.screenToWorld(event.clientX, event.clientY);
      return tileAt(world.x, world.y, VIEW.tilePx, width, height);
    };
    scope.addListener(canvas, 'pointerdown', ((event: PointerEvent) => {
      taps.down(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        event.button,
        event.pointerType !== 'mouse',
      );
      if (event.pointerType !== 'mouse') view.hover = toTile(event);
    }) as EventListener);
    scope.addListener(canvas, 'pointermove', ((event: PointerEvent) => {
      taps.move(event.pointerId, event.clientX, event.clientY);
      if (event.pointerType === 'mouse') view.hover = toTile(event);
    }) as EventListener);
    scope.addListener(canvas, 'pointerleave', ((event: PointerEvent) => {
      if (event.pointerType === 'mouse') view.hover = null;
    }) as EventListener);
    scope.addListener(canvas, 'pointerup', ((event: PointerEvent) => {
      const tap = taps.up(event.pointerId, event.clientX, event.clientY, event.timeStamp);
      if (tap === null) return;
      const tile = toTile(event);
      if (tile === null) return;
      void controller.tap(tile.x, tile.y, tap.secondary);
    }) as EventListener);
    scope.addListener(canvas, 'pointercancel', ((event: PointerEvent) =>
      taps.cancel(event.pointerId)) as EventListener);
    this.cameraController = camera;
    this.view = view;
    this.scope = scope;
  }

  private teardown(): void {
    this.scope?.dispose();
    this.scope = null;
    this.cameraController?.destroy();
    this.cameraController = null;
    this.view?.destroy();
    this.view = null;
    this.bound = null;
    this.cameraWidth = 0;
    this.cameraHeight = 0;
  }
}
