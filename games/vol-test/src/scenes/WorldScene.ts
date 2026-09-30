import Phaser from 'phaser';
import {
  applyVolViewport,
  clampSimulationStep,
  DisposableScope,
  shouldUseTouchControls,
  SimulationClock,
} from '@volstudio/core';
import { isTauri } from '@/app/runtime';
import { CAMERA } from '@/config/camera';
import { FEEL } from '@/config/feel';
import { GAME } from '@/config/game';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { WORLD } from '@/config/world';
import { Hud } from '@/hud/Hud';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import { ArenaView } from '@/view/ArenaView';
import { EffectsView } from '@/view/EffectsView';
import { TankView } from '@/view/TankView';
import { CameraRig } from './world/CameraRig';
import { hudFrame, tankFrame } from './world/frames';
import { PauseController } from './world/PauseController';
import { PlayerControls } from './world/PlayerControls';
import { routeSimEvents } from './world/SimEventRouter';

/**
 * Oyun sahnesi: katmanları kurar, her karede sırayla sürer ve kapanışta
 * söker. Simülasyon sabit adımla ilerler; görüntü önceki ve güncel adım
 * arasında ara değerle çizilir. Girdi, kamera ve HUD sunum zamanında
 * (gerçek kare süresiyle) çalışır.
 */
export class WorldScene extends Phaser.Scene {
  private sim!: Simulation;
  private clock!: SimulationClock;
  private controls!: PlayerControls;
  private pause!: PauseController;
  private camera!: CameraRig;
  private arena!: ArenaView;
  private tankView!: TankView;
  private effects!: EffectsView;
  private hud!: Hud;
  private readonly simEvents: SimEvent[] = [];
  private scope = new DisposableScope();

  constructor() {
    super('World');
  }

  create(): void {
    this.scope = new DisposableScope();
    applyVolViewport(this);
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep);
    this.sim = new Simulation({ world, tank: TANK, suspension: SUSPENSION, weapon: WEAPON });
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });

    this.arena = this.scope.addDestroyable(new ArenaView(this, world));
    this.effects = this.scope.addDestroyable(new EffectsView(this));
    this.tankView = this.scope.addDestroyable(new TankView(this));
    this.camera = new CameraRig(this, CAMERA, world.width, world.height);
    this.camera.model.snapTo(this.sim.tank.x, this.sim.tank.y);
    this.controls = this.scope.addDestroyable(new PlayerControls(this));

    this.hud = this.scope.addDestroyable(
      new Hud({
        parent: this.game.canvas.parentElement ?? document.body,
        metre: WORLD.metre,
        worldWidth: world.width,
        worldHeight: world.height,
        actionSource: this.controls.actionSource,
        touch: shouldUseTouchControls(),
        fullscreen: !isTauri(),
        onResume: () => this.pause.resume(),
      }),
    );
    this.pause = this.scope.addDestroyable(
      new PauseController({
        surface: this.hud,
        releaseInput: () => this.controls.release(),
        suppressPauseInput: () => this.controls.suppress('pause'),
      }),
    );

    const onWheel = (_pointer: unknown, _objects: unknown, _dx: number, dy: number): void => {
      if (!this.pause.paused && dy !== 0) this.camera.model.zoomBy(-Math.sign(dy));
    };
    this.input.on('wheel', onWheel);
    this.scope.addSubscription(() => this.input.off('wheel', onWheel));
    this.scale.on('resize', this.camera.syncViewport, this.camera);
    this.scope.addSubscription(() =>
      this.scale.off('resize', this.camera.syncViewport, this.camera),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scope.dispose());
  }

  override update(time: number, delta: number): void {
    const tank = this.sim.tank;
    const command = this.controls.read(tank.x, tank.y, delta);
    if (this.controls.pressed('pause')) this.pause.toggle();

    const paused = this.pause.paused;
    if (!paused) {
      if (this.controls.pressed('zoomIn')) this.camera.model.zoomBy(1);
      if (this.controls.pressed('zoomOut')) this.camera.model.zoomBy(-1);
      if (this.controls.pressed('grid')) this.arena.setGridVisible(!this.arena.gridVisible);
      this.clock.advance(clampSimulationStep(delta), (stepMs) => this.sim.step(command, stepMs));
    }

    this.simEvents.length = 0;
    routeSimEvents(this.sim.drainEvents(this.simEvents), {
      tank: this.tankView,
      effects: this.effects,
      arena: this.arena,
      camera: this.camera.model,
    });

    const alpha = paused ? 1 : this.clock.getInterpolationAlpha();
    const presentMs = paused ? 0 : delta;
    const frame = tankFrame(tank, alpha);
    this.tankView.update(frame, presentMs);
    this.arena.update(presentMs);
    this.effects.update(this.sim.projectiles, alpha, presentMs);
    this.effects.updateEmitters(
      frame.x,
      frame.y,
      frame.hull,
      frame.speed,
      frame.boosting && !paused,
      !paused && tank.slip > FEEL.slipSpeed,
    );
    this.effects.updateTreadMarks(
      frame.x,
      frame.y,
      frame.hull,
      tank.groundLeft,
      tank.groundRight,
      TANK.trackOffset,
    );
    this.camera.update(frame.x, frame.y, delta, paused);
    this.hud.update(
      hudFrame(tank, frame, TANK.boostCapacity, this.camera.model.visibleRect()),
      time,
    );
  }
}
