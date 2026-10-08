import Phaser from 'phaser';
import {
  applyVolViewport,
  clampSimulationStep,
  DisposableScope,
  shouldUseTouchControls,
  SimulationClock,
  type SimulationClockFrame,
} from '@volstudio/core';
import { angleDelta } from '@volstudio/core/math';
import { AimGuide } from '@/view/effects/AimGuide';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { createSceneAudio } from '@/audio/sceneAudio';
import type { GameAudio } from '@/audio/GameAudio';
import type { GameServices } from '@/app/GameServices';
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
import { ScenarioRunner } from '@/sim/scenarios/ScenarioRunner';
import { SCENARIO } from '@/config/scenarios';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import { ArenaView } from '@/view/ArenaView';
import { EffectsView } from '@/view/EffectsView';
import { VehicleViews } from '@/view/VehicleViews';
import { CameraRig } from './world/CameraRig';
import { hudFrame, hudVehicles, tankFrame } from './world/frames';
import { PauseController } from './world/PauseController';
import { EnvironmentController } from './world/EnvironmentController';
import { SEASONS } from '@/config/seasons';
import { parseSeasonOverride } from '@/sim/seasons/SeasonCycle';
import { parseWeatherOverride } from '@/sim/weather/WeatherSystem';
import { PlayerControls } from './world/PlayerControls';
import { routeSimEvents } from './world/SimEventRouter';

/**
 * Oyun sahnesi: katmanları kurar, her karede sırayla sürer ve kapanışta
 * söker. Simülasyon sabit adımla ilerler; görüntü önceki ve güncel adım
 * arasında ara değerle çizilir. Girdi, kamera ve HUD sunum zamanında
 * (gerçek kare süresiyle) çalışır; girdi niyeti sabit tickte ilerler.
 */
export class WorldScene extends Phaser.Scene {
  private audio: GameAudio | null = null;
  private sim!: Simulation;
  private scenarios!: ScenarioRunner;
  private clock!: SimulationClock;
  private clockFrame: SimulationClockFrame | undefined;
  private controls!: PlayerControls;
  private pause!: PauseController;
  private camera!: CameraRig;
  private arena!: ArenaView;
  private vehicles!: VehicleViews;
  private effects!: EffectsView;
  private aimGuide!: AimGuide;
  private environment!: EnvironmentController;
  private hud!: Hud;
  private quality!: GraphicsQuality<EffectLevel, EffectProfile>;
  private readonly simEvents: SimEvent[] = [];
  private scope = new DisposableScope();

  constructor(private readonly services?: GameServices) {
    super('World');
  }

  get lastClockFrame(): SimulationClockFrame | undefined {
    return this.clockFrame;
  }

  create(): void {
    this.clockFrame = undefined;
    this.scope = new DisposableScope();
    applyVolViewport(this);
    this.audio = createSceneAudio(this);
    if (this.audio) {
      this.scope.add(this.audio);
      this.scope.addListener<PageTransitionEvent>(window, 'pagehide', (event) => {
        if (!event.persisted) this.audio?.dispose();
      });
      void this.audio.load();
    }
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep);
    const preferences = this.services?.settings.get();
    const overrides = this.services?.overrides;
    const seed = overrides?.seed ?? preferences?.seed ?? SCENARIO.defaultSeed;

    const quality = this.scope.addDestroyable(
      new GraphicsQuality<EffectLevel, EffectProfile>({
        levels: EFFECT_LEVELS,
        initial:
          overrides?.quality ?? preferences?.quality ?? initialEffectLevel(navigator.userAgent),
      }),
    );
    this.quality = quality;
    if (this.services) {
      const services = this.services;
      this.audio?.setVolume(services.settings.get().volume);
      this.scope.addSubscription(
        services.settings.subscribe((value) => {
          quality.setLevel(overrides?.quality ?? value.quality);
          this.audio?.setVolume(value.volume);
        }),
      );
      this.scope.addSubscription(
        quality.onChange((level) => {
          if (!overrides?.quality) void services.settings.update({ quality: level });
        }),
      );
    }
    this.arena = this.scope.addDestroyable(new ArenaView(this, world));
    const query = new URLSearchParams(location.search);
    const previewSeason = parseSeasonOverride(query.get('season')) ?? overrides?.season;
    this.environment = this.scope.addDestroyable(
      new EnvironmentController(
        this,
        world.width,
        world.height,
        seed,
        quality.getProfile(),
        parseWeatherOverride(query.get('weather')) ?? overrides?.weather,
        previewSeason,
      ),
    );
    if (previewSeason) this.environment.model.step(SEASONS.previewWarmupMs);
    this.sim = new Simulation({
      world,
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
      weather: this.environment.model,
    });
    this.scenarios = this.scope.addDestroyable(new ScenarioRunner(this.sim));
    this.scenarios.select(overrides?.scenario ?? preferences?.scenario ?? 'empty', seed);
    if (this.services)
      this.scope.addSubscription(
        this.services.settings.subscribe((value) => {
          this.scenarios.select(
            overrides?.scenario ?? value.scenario,
            overrides?.seed ?? value.seed,
          );
        }),
      );
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });

    this.effects = this.scope.addDestroyable(new EffectsView(this, quality.getProfile()));
    this.aimGuide = this.scope.addDestroyable(new AimGuide(this));
    this.scope.addSubscription(
      quality.onChange((_level, profile) => {
        this.effects.applyProfile(profile);
        this.environment.applyProfile(profile);
      }),
    );
    this.vehicles = this.scope.addDestroyable(new VehicleViews(this));
    this.camera = new CameraRig(this, CAMERA, world.width, world.height);
    const start = this.sim.player.tank;
    this.camera.model.snapTo(start.x, start.y);
    const touch = shouldUseTouchControls();
    this.controls = this.scope.addDestroyable(
      new PlayerControls(
        this,
        ['gamescope', 'bigpicture'].includes(this.services?.session ?? '')
          ? 'gamepad'
          : touch
            ? 'touch'
            : undefined,
      ),
    );

    this.hud = this.scope.addDestroyable(
      new Hud({
        parent: this.game.canvas.parentElement ?? document.body,
        metre: WORLD.metre,
        worldWidth: world.width,
        worldHeight: world.height,
        mapGridStep: WORLD.gridStep,
        mapGridMajorEvery: WORLD.gridMajorEvery,
        actionSource: this.controls.actionSource,
        stickSource: this.controls.stickSource,
        touch,
        fullscreen: this.services ? this.services.platform === 'web' : true,
        services: this.services,
        readInputState: () => this.controls.presentationState(),
        onResume: () => this.pause.resume(),
        quality,
      }),
    );
    this.audio?.attachUi(this.hud.intents, this.hud.rootElement);
    this.pause = this.scope.addDestroyable(
      new PauseController({
        surface: this.hud,
        onChange: (paused) => {
          this.audio?.setPaused(paused);
          void this.services?.setPaused(paused);
          if (!paused) this.services?.diagnostics?.markResume();
        },
        releaseInput: () => this.controls.release(),
        suppressPauseInput: () => this.controls.suppress('pause'),
      }),
    );

    if (this.services) {
      this.scope.addSubscription(this.services.onPause(() => this.pause.pause()));
      this.scope.addSubscription(
        this.services.onResume(() => this.audio?.resumeAfterWake() ?? Promise.resolve()),
      );
    }
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
    const diagnostics = this.services?.diagnostics;
    const measurements = this.services?.measurements;
    measurements?.beginFrame();
    diagnostics?.beginFrame();
    diagnostics?.setScene('World');
    diagnostics?.setInput(this.controls.snapshot());
    const player = this.sim.player;
    const command = this.controls.read(player.tank.x, player.tank.y, delta);
    if (this.controls.pressed('pause')) this.pause.toggle();

    const paused = this.pause.paused;
    measurements?.mark('input');
    if (!paused) {
      if (this.controls.pressed('zoomIn')) this.camera.model.zoomBy(1);
      if (this.controls.pressed('zoomOut')) this.camera.model.zoomBy(-1);
      if (this.controls.pressed('grid')) this.arena.setGridVisible(!this.arena.gridVisible);
    }
    this.clockFrame = this.clock.advance(
      delta,
      (stepMs) => {
        const command = this.controls.step(stepMs);
        const { x, y } = player.tank;
        this.sim.step((vehicle) => this.scenarios.commandFor(vehicle, command), stepMs);
        this.services?.progress.travel(
          Math.hypot(player.tank.x - x, player.tank.y - y) / WORLD.metre,
        );
      },
      { acceptedDeltaMs: clampSimulationStep(delta), paused },
    );

    measurements?.mark('simulation');

    for (const removed of this.vehicles.sync(this.sim.vehicles.map((vehicle) => vehicle.id))) {
      this.effects.removeVehicle(removed);
    }
    this.simEvents.length = 0;
    const events = this.sim.drainEvents(this.simEvents);
    for (const event of events)
      if (event.kind === 'fired' && event.source === player.id) this.services?.progress.fired();
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
    measurements?.mark('eventsAudio');

    const alpha = this.clock.getInterpolationAlpha();
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
    measurements?.mark('vehicles');
    this.arena.update(presentMs);
    this.effects.update(this.sim.projectiles, alpha, presentMs);
    measurements?.mark('effects');

    const aiming = !paused && this.controls.aiming;
    if (aiming) {
      const tank = player.tank;
      const preview = this.sim.previewAim(player, GAME.simulationStepMs);
      this.aimGuide.draw(
        {
          x: tank.x + Math.cos(tank.turret) * WEAPON.muzzleOffset,
          y: tank.y + Math.sin(tank.turret) * WEAPON.muzzleOffset,
          endX: preview.x,
          endY: preview.y,
          aligned:
            (command.aimX === 0 && command.aimY === 0) ||
            Math.abs(angleDelta(tank.turret, Math.atan2(command.aimY, command.aimX))) <=
              WEAPON.aimTolerance,
        },
        time,
      );
    } else this.aimGuide.draw(null, time);
    measurements?.mark('aim');

    const view = tankFrame(player.tank, alpha);
    this.camera.update(view.x, view.y, delta, paused);
    const rect = this.camera.model.visibleRect();
    this.environment.render(this.sim.vehicles, alpha, rect);
    measurements?.mark('environmentCamera');
    this.hud.update(
      hudFrame(
        player.tank,
        view,
        TANK.boostCapacity,
        rect,
        player.gun.getProgress(),
        this.environment.climate,
        () => hudVehicles(this.sim.vehicles, player.id),
      ),
      time,
    );
    diagnostics?.setCount('vehicles', this.sim.vehicles.length);
    diagnostics?.setCount('projectiles', this.sim.projectiles.count);
    diagnostics?.setCount('weatherParticles', this.environment.counts.particles);
    diagnostics?.setCount('weatherSurfaceCells', this.environment.counts.surfaceCells);
    diagnostics?.endFrame();
    measurements?.mark('hudDiagnostics');
    measurements?.frame(
      performance.now(),
      paused,
      this.quality.getLevel(),
      this.sim.projectiles.count,
      {
        scenario: this.scenarios.scenario,
        seed: this.scenarios.currentSeed,
        weather: this.environment.climate.kind,
        season: this.environment.climate.season,
      },
      {
        vehicles: this.sim.vehicles.length,
        weatherParticles: this.environment.counts.particles,
        weatherSurfaceCells: this.environment.counts.surfaceCells,
        'simulation.rawDeltaMs': this.clockFrame.rawDeltaMs,
        'simulation.acceptedDeltaMs': this.clockFrame.acceptedDeltaMs,
        'simulation.simulatedMs': this.clockFrame.simulatedMs,
        'simulation.accumulatorMs': this.clockFrame.accumulatorMs,
        'simulation.droppedMs': this.clockFrame.droppedMs,
        'simulation.fixedSteps': this.clockFrame.fixedSteps,
        'simulation.tickStart': this.clockFrame.tickStart,
        'simulation.tickEnd': this.clockFrame.tickEnd,
      },
    );
  }
}
