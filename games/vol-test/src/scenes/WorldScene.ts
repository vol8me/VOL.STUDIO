import Phaser from 'phaser';
import {
  applyVolViewport,
  clampSimulationStep,
  DisposableScope,
  shouldUseTouchControls,
  SimulationClock,
} from '@volstudio/core';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { createSceneAudio } from '@/audio/sceneAudio';
import type { GameAudio } from '@/audio/GameAudio';
import { isTauri } from '@/app/runtime';
import { CAMERA } from '@/config/camera';
import { FEEL } from '@/config/feel';
import { GAME } from '@/config/game';
import {
  EFFECT_LEVELS,
  initialEffectLevel,
  type EffectLevel,
  type EffectProfile,
} from '@/config/quality';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { WORLD } from '@/config/world';
import { Hud } from '@/hud/Hud';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import { ArenaView } from '@/view/ArenaView';
import { EffectsView } from '@/view/EffectsView';
import { VehicleViews } from '@/view/VehicleViews';
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
  private audio: GameAudio | null = null;
  private sim!: Simulation;
  private clock!: SimulationClock;
  private controls!: PlayerControls;
  private pause!: PauseController;
  private camera!: CameraRig;
  private arena!: ArenaView;
  private vehicles!: VehicleViews;
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
    this.audio = createSceneAudio(this);
    if (this.audio) {
      this.scope.add(this.audio);
      void this.audio.load();
    }
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep);
    this.sim = new Simulation({ world, tank: TANK, suspension: SUSPENSION, weapon: WEAPON });
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });

    const quality = this.scope.addDestroyable(
      new GraphicsQuality<EffectLevel, EffectProfile>({
        levels: EFFECT_LEVELS,
        initial: initialEffectLevel(navigator.userAgent),
      }),
    );
    this.arena = this.scope.addDestroyable(new ArenaView(this, world));
    this.effects = this.scope.addDestroyable(new EffectsView(this, quality.getProfile()));
    this.scope.addSubscription(
      quality.onChange((_level, profile) => this.effects.applyProfile(profile)),
    );
    this.vehicles = this.scope.addDestroyable(new VehicleViews(this));
    this.camera = new CameraRig(this, CAMERA, world.width, world.height);
    const start = this.sim.player.tank;
    this.camera.model.snapTo(start.x, start.y);
    this.controls = this.scope.addDestroyable(new PlayerControls(this));

    this.hud = this.scope.addDestroyable(
      new Hud({
        parent: this.game.canvas.parentElement ?? document.body,
        metre: WORLD.metre,
        worldWidth: world.width,
        worldHeight: world.height,
        mapGridStep: WORLD.gridStep * WORLD.gridMajorEvery,
        actionSource: this.controls.actionSource,
        stickSource: this.controls.stickSource,
        touch: shouldUseTouchControls(),
        fullscreen: !isTauri(),
        onResume: () => this.pause.resume(),
        quality,
      }),
    );
    this.pause = this.scope.addDestroyable(
      new PauseController({
        surface: this.hud,
        onChange: (paused) => this.audio?.setPaused(paused),
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
    const player = this.sim.player;
    const command = this.controls.read(player.tank.x, player.tank.y, delta);
    if (this.controls.pressed('pause')) this.pause.toggle();

    const paused = this.pause.paused;
    if (!paused) {
      if (this.controls.pressed('zoomIn')) this.camera.model.zoomBy(1);
      if (this.controls.pressed('zoomOut')) this.camera.model.zoomBy(-1);
      if (this.controls.pressed('grid')) this.arena.setGridVisible(!this.arena.gridVisible);
      this.clock.advance(clampSimulationStep(delta), (stepMs) => this.sim.step(command, stepMs));
    }

    for (const removed of this.vehicles.sync(this.sim.vehicles.map((vehicle) => vehicle.id))) {
      this.effects.removeVehicle(removed);
    }
    this.simEvents.length = 0;
    const events = this.sim.drainEvents(this.simEvents);
    this.audio?.route(events, player.tank);
    void this.audio?.sync(this.sim.vehicles, player.tank);
    routeSimEvents(events, {
      player: player.id,
      tank: (id) => this.vehicles.get(id),
      effects: this.effects,
      arena: this.arena,
      camera: this.camera.model,
      listener: player.tank,
    });

    const alpha = paused ? 1 : this.clock.getInterpolationAlpha();
    const presentMs = paused ? 0 : delta;
    for (const vehicle of this.sim.vehicles) {
      const tank = vehicle.tank;
      const frame = tankFrame(tank, alpha);
      this.vehicles.get(vehicle.id)?.update(frame, presentMs);
      this.effects.updateVehicle(vehicle.id, {
        x: frame.x,
        y: frame.y,
        hull: frame.hull,
        speed: frame.speed,
        boosting: frame.boosting && !paused,
        slipping: !paused && tank.slip > FEEL.slipSpeed,
        groundLeft: tank.groundLeft,
        groundRight: tank.groundRight,
        slideLeft: tank.slideLeft,
        slideRight: tank.slideRight,
        trackOffset: TANK.trackOffset,
      });
    }
    this.arena.update(presentMs);
    this.effects.update(this.sim.projectiles, alpha, presentMs);

    const view = tankFrame(player.tank, alpha);
    this.camera.update(view.x, view.y, delta, paused);
    this.hud.update(
      hudFrame(player.tank, view, TANK.boostCapacity, this.camera.model.visibleRect()),
      time,
    );
  }
}
