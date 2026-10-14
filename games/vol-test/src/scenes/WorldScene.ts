import Phaser from 'phaser';
import {
  applyVolViewport,
  DisposableScope,
  shouldUseTouchControls,
  type SimulationClockFrame,
} from '@volstudio/core';
import { AimGuide } from '@/view/effects/AimGuide';
import { AimPresence } from '@/view/effects/AimPresence';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { createSceneAudio } from '@/audio/sceneAudio';
import { AgentLab, installAgentLab } from '@/app/AgentLab';
import type { GameAudio } from '@/audio/GameAudio';
import type { GameServices } from '@/app/GameServices';
import { CAMERA } from '@/config/camera';
import { FEEL } from '@/config/feel';
import { FX } from '@/config/fx';
import { GAME } from '@/config/game';
import { WATER_VIEW } from '@/config/waterView';
import {
  EFFECT_LEVELS,
  initialEffectLevel,
  type EffectLevel,
  type EffectProfile,
} from '@/config/quality';
import { WORLD } from '@/config/world';
import { Hud } from '@/hud/Hud';
import { bakeLakeMap } from '@/hud/lakeMap';
import type { SimEvent } from '@/sim/events';
import { pivotPose, type MuzzlePose } from '@/sim/muzzle';
import { SCENARIO } from '@/config/scenarios';
import type { Simulation } from '@/sim/Simulation';
import { aimAligned } from '@/sim/vehicleStep';
import { createBattleWorld } from '@/sim/world/battleWorld';
import { ArenaView } from '@/view/ArenaView';
import { EffectsView } from '@/view/EffectsView';
import { VehicleViews } from '@/view/VehicleViews';
import { ZonesView } from '@/view/ZonesView';
import { CameraRig } from './world/CameraRig';
import { hudFrame, hudVehicles, tankFrame } from './world/frames';
import { OfflineDriver } from './world/OfflineDriver';
import { PauseController } from './world/PauseController';
import { EnvironmentController } from './world/EnvironmentController';
import { SEASONS } from '@/config/seasons';
import { parseSeasonOverride } from '@/sim/seasons/SeasonCycle';
import { parseWeatherOverride } from '@/sim/weather/WeatherSystem';
import { PlayerControls } from './world/PlayerControls';
import { feelBlast, routeSimEvents } from './world/SimEventRouter';
import { WreckDirector } from './world/WreckDirector';
import type { WorldDriver, WorldStartData } from './world/WorldDriver';

/**
 * Oyun sahnesi: katmanları kurar, her karede sırayla sürer ve kapanışta
 * söker. Simülasyon sabit adımla ilerler; görüntü önceki ve güncel adım
 * arasında ara değerle çizilir. Girdi, kamera ve HUD sunum zamanında
 * (gerçek kare süresiyle) çalışır; girdi niyeti sabit tickte ilerler.
 */
export class WorldScene extends Phaser.Scene {
  private audio: GameAudio | null = null;
  private driver!: WorldDriver;
  private clockFrame: SimulationClockFrame | undefined;
  private controls!: PlayerControls;
  private pause!: PauseController;
  private camera!: CameraRig;
  private arena!: ArenaView;
  private vehicles!: VehicleViews;
  private wrecks!: WreckDirector;
  private effects!: EffectsView;
  private zones!: ZonesView;
  private aimGuide!: AimGuide;
  private readonly aimPresence = new AimPresence(FX.aimGuide.fadeInMs, FX.aimGuide.fadeOutMs);
  private environment!: EnvironmentController;
  private hud!: Hud;
  /** `?lab=1` ile açılan ajan laboratuvarı; yoksa hiçbir şey kurulmaz. */
  private lab: AgentLab | null = null;
  private quality!: GraphicsQuality<EffectLevel, EffectProfile>;
  private readonly simEvents: SimEvent[] = [];
  /** Oyuncunun önceki karede atılışta olup olmadığı: kamera tekmesi yalnız yükselen kenarda verilir. */
  private playerDashing = false;
  /** Son çizilen karedeki taret mili: fare nişanı ekranda görünen noktadan hesaplanır. */
  private readonly aimOrigin: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private scope = new DisposableScope();

  constructor(private readonly services?: GameServices) {
    super('World');
  }

  get lastClockFrame(): SimulationClockFrame | undefined {
    return this.clockFrame;
  }

  /** Dünyayı sürenin benzetimi; çevrimiçi kipte yalnız sunumdur. */
  private get sim(): Simulation {
    return this.driver.sim;
  }

  create(data?: WorldStartData): void {
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
    const world = createBattleWorld();
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
    this.zones = this.scope.addDestroyable(new ZonesView(this));
    const query = new URLSearchParams(location.search);
    const previewSeason = parseSeasonOverride(query.get('season')) ?? overrides?.season;
    this.environment = this.scope.addDestroyable(
      new EnvironmentController(
        this,
        world.width,
        world.height,
        seed,
        quality.getProfile(),
        data?.weather ?? parseWeatherOverride(query.get('weather')) ?? overrides?.weather,
        previewSeason,
        world.lakes,
      ),
    );
    if (previewSeason) this.environment.model.step(SEASONS.previewWarmupMs);
    const touch = shouldUseTouchControls();
    this.controls = this.scope.addDestroyable(
      new PlayerControls(
        this,
        ['gamescope', 'bigpicture'].includes(this.services?.session ?? '')
          ? 'gamepad'
          : touch
            ? 'touch'
            : 'pc',
      ),
    );
    this.driver = (data?.createDriver ?? ((context) => new OfflineDriver(context)))({
      scene: this,
      world,
      weather: this.environment.model,
      controls: this.controls,
      services: this.services,
      seed,
      scope: this.scope,
      // Phaser boş veriyi yok sayıp ÖNCEKİ sahne verisini korur: `{}` olmadan "Ayrıl" eski çevrimiçi
      // sürücü fabrikasını ölü oturumla yeniden kurardı.
      restart: (next) => this.scene.restart(next ?? {}),
      toMenu: () => this.scene.start('Menu', {}),
    });

    this.effects = this.scope.addDestroyable(new EffectsView(this, quality.getProfile(), world));
    this.aimGuide = this.scope.addDestroyable(new AimGuide(this));
    this.aimPresence.reset();
    this.scope.addSubscription(
      quality.onChange((_level, profile) => {
        this.effects.applyProfile(profile);
        this.environment.applyProfile(profile);
      }),
    );
    this.vehicles = this.scope.addDestroyable(
      new VehicleViews(this, (x, y, angle, scale) => {
        // Suya basan ayak iz bırakmaz: suyun yüzeyine kalıcı iz basılmaz (iz `WaterTrails`ta).
        if (!this.inWater(x, y)) this.effects.footprint(x, y, angle, scale);
      }),
    );
    this.wrecks = new WreckDirector(
      this.effects,
      (x, y) =>
        feelBlast({ camera: this.camera.model, listener: this.driver.player.chassis }, x, y),
      this.environment.water ?? undefined,
    );
    this.camera = new CameraRig(this, CAMERA, world.width, world.height);
    const start = this.driver.player.chassis;
    this.camera.model.snapTo(start.x, start.y);
    pivotPose(
      start.readPose({ x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 }),
      this.driver.player.armament,
      this.aimOrigin,
    );

    this.hud = this.scope.addDestroyable(
      new Hud({
        parent: this.game.canvas.parentElement ?? document.body,
        metre: WORLD.metre,
        worldWidth: world.width,
        worldHeight: world.height,
        mapGridStep: WORLD.mapGridStep,
        mapGridMajorEvery: WORLD.mapGridMajorEvery,
        mapZoom: WORLD.mapZoom,
        mapMaxZoom: WORLD.mapMaxZoom,
        mapTerrain: bakeLakeMap(world.lakes, world.width, world.height),
        actionSource: this.controls.actionSource,
        stickSource: this.controls.stickSource,
        touch,
        fullscreen: this.services ? this.services.platform === 'web' : true,
        services: this.services,
        readInputState: () => this.controls.presentationState(),
        onResume: () => this.pause.resume(),
        live: this.driver.live === true,
        quality,
      }),
    );
    this.audio?.attachUi(this.hud.intents, this.hud.rootElement);
    this.lab = query.get('lab') === '1' ? this.createLab() : null;
    this.driver.attachHud?.(this.hud);
    if (data?.notice) this.hud.notify(data.notice, 'warning');
    this.pause = this.scope.addDestroyable(
      new PauseController({
        surface: this.hud,
        onChange: (paused) => {
          // Canlı dünyada sahne ve ses sürer; yalnız girdi kesilir.
          if (!this.driver.live) this.audio?.setPaused(paused);
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

  /** Laboratuvarı kurar ve pencereye bağlar; sahne kapanınca kaldırılır. */
  private createLab(): AgentLab {
    const lab = new AgentLab({
      state: () => {
        const player = this.driver.player;
        const chassis = player.chassis;
        const context = this.driver.measurement;
        return {
          scenario: context.scenario,
          seed: context.seed,
          online: this.driver.live === true,
          vehicle: player.spec.id,
          kind: player.spec.kind,
          x: chassis.x,
          y: chassis.y,
          hull: chassis.hull,
          speed: chassis.speed,
          health: player.vitality.health,
          alive: player.vitality.alive,
          vehicles: this.sim.vehicles.length,
          projectiles: this.sim.projectiles.count,
          paused: this.pause.paused,
          extra: this.driver.metrics?.() ?? {},
        };
      },
      setInput: (patch) => this.controls.setLabInput(patch),
      teleport: (x, y, hull) => {
        if (this.driver.live === true)
          throw new RangeError('Işınlama çevrimiçi oturumda kullanılamaz');
        const chassis = this.driver.player.chassis;
        chassis.place(x, y, hull ?? chassis.hull);
        this.camera.model.snapTo(x, y);
      },
    });
    this.scope.addSubscription(installAgentLab(window, lab));
    this.scope.addSubscription(() => this.controls.setLabInput(null));
    return lab;
  }

  /** Nokta suyun içinde mi (iz ve ayak izi basılmaz); göl yoksa her zaman kuru. */
  private inWater(x: number, y: number): boolean {
    const water = this.environment.water;
    return water !== null && water.depthAt(x, y) >= WATER_VIEW.trails.minDepth;
  }

  override update(time: number, delta: number): void {
    const diagnostics = this.services?.diagnostics;
    const measurements = this.services?.measurements;
    measurements?.beginFrame();
    diagnostics?.beginFrame();
    diagnostics?.setScene('World');
    diagnostics?.setInput(this.controls.snapshot());
    const player = this.driver.player;
    const command = this.controls.read(this.aimOrigin.x, this.aimOrigin.y, delta);
    if (this.controls.pressed('pause')) this.pause.toggle();

    const paused = this.pause.paused;
    measurements?.mark('input');
    if (!paused) {
      if (this.controls.pressed('zoomIn')) this.camera.model.zoomBy(1);
      if (this.controls.pressed('zoomOut')) this.camera.model.zoomBy(-1);
      if (this.controls.pressed('grid')) this.arena.setGridVisible(!this.arena.gridVisible);
    }
    const stepped = this.driver.advance(time, delta, paused);
    this.clockFrame = stepped.clock;

    measurements?.mark('simulation');

    for (const removed of this.vehicles.sync(this.sim.vehicles)) {
      this.effects.removeVehicle(removed);
      this.wrecks.forget(removed);
    }
    this.simEvents.length = 0;
    const events = this.driver.drainEvents(this.simEvents);
    for (const event of events)
      if (event.kind === 'fired' && event.source === player.id) this.services?.progress.fired();
    if (this.lab) {
      this.lab.sample(time);
      for (const event of events) this.lab.record(event.kind, { ...event });
    }
    const dashing = player.chassis.kind !== 'tank' && player.chassis.boosting;
    if (dashing && !this.playerDashing && !paused) {
      const { vx, vy } = player.chassis;
      this.camera.model.kick(Math.atan2(vy, vx), FEEL.dash.cameraKick);
    }
    this.playerDashing = dashing;
    this.audio?.route(events, player.chassis);
    void this.audio?.sync(this.sim.vehicles, player.chassis);
    routeSimEvents(events, {
      player: player.id,
      tank: (id) => this.vehicles.get(id),
      spec: (id) => this.sim.vehicle(id)?.spec,
      effects: this.effects,
      arena: this.arena,
      camera: this.camera.model,
      listener: player.chassis,
    });
    measurements?.mark('eventsAudio');

    const alpha = stepped.alpha;
    const frozen = paused && !this.driver.live;
    const sight = this.camera.model.visibleRect();
    this.effects.setViewport(sight.x, sight.y, sight.width, sight.height);
    const presentMs = frozen ? 0 : delta;
    for (const vehicle of this.sim.vehicles) {
      const tank = vehicle.chassis;
      const frame = tankFrame(tank, alpha);
      const view = this.vehicles.get(vehicle.id);
      // Ölen araç patlar ve görünümden kalkar; yeniden doğana kadar çizilmez.
      if (!this.wrecks.track(vehicle, view, frame, presentMs)) continue;
      // Kaos tempoyla akan araç adımları görünümde de aynı hızda akar: bacak ve palet döngüsü yetişir.
      view?.update(frame, presentMs * this.sim.pace);
      this.effects.updateVehicle(vehicle.id, {
        x: frame.x,
        y: frame.y,
        hull: frame.hull,
        speed: frame.speed,
        boosting: frame.boosting && !frozen,
        slipping: !frozen && tank.slip > FEEL.slipSpeed,
        groundLeft: tank.groundLeft,
        groundRight: tank.groundRight,
        slideLeft: tank.slideLeft,
        slideRight: tank.slideRight,
        trackOffset: tank.trackOffset,
        tracked: vehicle.spec.kind === 'tank' && !this.inWater(frame.x, frame.y),
      });
    }
    measurements?.mark('vehicles');
    this.arena.update(presentMs);
    this.effects.update(this.sim.projectiles, alpha, presentMs);
    measurements?.mark('effects');

    // Nişan, kamera ve HUD ekranda çizilen aynı ara değerli kareyi okur: namlu, lazer ve fare
    // nişanı arasında kare kaymaları kalmaz.
    const view = tankFrame(player.chassis, alpha);
    pivotPose(view, player.armament, this.aimOrigin);
    const aiming = !paused && player.vitality.alive && this.controls.aiming;
    const presence = this.aimPresence.update(aiming, delta);
    if (presence > 0 && player.vitality.alive) {
      const preview = this.sim.previewAim(player, GAME.simulationStepMs, view);
      this.aimGuide.draw(
        {
          path: preview.path,
          length: preview.pathLength,
          aligned: aimAligned(player, command),
        },
        time,
        presence,
      );
    } else this.aimGuide.draw(null, time);
    measurements?.mark('aim');

    this.camera.update(view.x, view.y, delta, frozen);
    const rect = this.camera.model.visibleRect();
    this.environment.render(this.sim.vehicles, alpha, rect, presentMs);
    measurements?.mark('environmentCamera');
    const front = this.driver.front?.();
    if (front) this.zones.update(front, rect, time);
    this.hud.update(
      hudFrame(
        player.chassis,
        view,
        player.chassis.boostCapacity,
        rect,
        player.gun.getProgress(),
        this.environment.climate,
        () =>
          hudVehicles(this.sim.vehicles, player.id, alpha, this.driver.isBot?.bind(this.driver)),
        player.vitality,
        front,
      ),
      time,
    );
    diagnostics?.setCount('vehicles', this.sim.vehicles.length);
    diagnostics?.setCount('projectiles', this.sim.projectiles.count);
    diagnostics?.setCount('weatherParticles', this.environment.counts.particles);
    diagnostics?.setCount('weatherSurfaceCells', this.environment.counts.surfaceCells);
    this.driver.present?.(time);
    diagnostics?.endFrame();
    measurements?.mark('hudDiagnostics');
    const clock = stepped.clock;
    const context = this.driver.measurement;
    measurements?.frame(
      performance.now(),
      paused,
      this.quality.getLevel(),
      this.sim.projectiles.count,
      {
        scenario: context.scenario,
        seed: context.seed,
        weather: this.environment.climate.kind,
        season: this.environment.climate.season,
      },
      {
        vehicles: this.sim.vehicles.length,
        weatherParticles: this.environment.counts.particles,
        weatherSurfaceCells: this.environment.counts.surfaceCells,
        ...this.driver.metrics?.(),
        ...(clock && {
          'simulation.rawDeltaMs': clock.rawDeltaMs,
          'simulation.acceptedDeltaMs': clock.acceptedDeltaMs,
          'simulation.simulatedMs': clock.simulatedMs,
          'simulation.accumulatorMs': clock.accumulatorMs,
          'simulation.droppedMs': clock.droppedMs,
          'simulation.fixedSteps': clock.fixedSteps,
          'simulation.tickStart': clock.tickStart,
          'simulation.tickEnd': clock.tickEnd,
        }),
      },
    );
  }
}
