import Phaser from 'phaser';
import { applyVolViewport, DisposableScope } from '@volstudio/core';
import type { GameServices } from '@/app/GameServices';
import { BACKDROP } from '@/config/backdrop';
import { CAMERA } from '@/config/camera';
import { EFFECT_LEVELS } from '@/config/quality';
import { FEEL } from '@/config/feel';
import { SEASONS } from '@/config/seasons';
import { WATER_VIEW } from '@/config/waterView';
import { WEATHER } from '@/config/weather';
import { BackdropParade } from '@/sim/backdrop/BackdropParade';
import type { SimEvent } from '@/sim/events';
import { World } from '@/sim/world/World';
import { WORLD } from '@/config/world';
import { ArenaView } from '@/view/ArenaView';
import { EffectsView } from '@/view/EffectsView';
import { MENU_AREA_KEY, type FreeArea } from '@/view/menuLayout';
import { VehicleViews } from '@/view/VehicleViews';
import { CameraRig, renderQualityOf } from './world/CameraRig';
import { climateChoice } from './world/climateChoice';
import { EnvironmentController } from './world/EnvironmentController';
import { tankFrame } from './world/frames';
import { routeSimEvents } from './world/SimEventRouter';
import { WreckDirector } from './world/WreckDirector';

/** Arka planda kamera sarsılmaz ve titreşim istenmez: tepkiler yalnız oyuncunun içindir. */
const STILL_CAMERA = { kick: () => undefined, addTrauma: () => undefined };

/** Dinleyici çok uzaktadır: patlama titreşimi ve sarsıntısı hiçbir olayda eşiğe girmez. */
const FAR_LISTENER = { x: -1e9, y: -1e9 };

/**
 * Menülerin arkasında yürüyen araç alayı: oyunun gerçek simülasyonu, görünümleri ve havasıyla, ama
 * savaşsız ve sessiz. Araçlar ekran dışından girip sahnenin içinden karşı yöne yürür, çıkınca sıradaki
 * model olarak yeniden başlar (`BackdropParade`): menü araçları sergiler. Menü sahneleri altında çalışır
 * (sahne sırası onları üstte tutar) ve kameraları saydam olduğu için görünür; dünya sahnesi açılırken
 * durur. Kamera sabittir; sahnenin merkezi, menü panelinin bıraktığı boş alana oturtulur
 * (`MENU_AREA_KEY`). Dünya düz karadır: göl ve kaya yoktur, yürüyüş hiçbir yerde takılmaz.
 */
export class BackdropScene extends Phaser.Scene {
  private scope = new DisposableScope();
  private parade!: BackdropParade;
  private rig!: CameraRig;
  private arena!: ArenaView;
  private vehicles!: VehicleViews;
  private effects!: EffectsView;
  private wrecks!: WreckDirector;
  private environment!: EnvironmentController;
  private dim!: Phaser.GameObjects.Rectangle;
  private readonly simEvents: SimEvent[] = [];
  private visibility = 0;
  private target = { x: 0, y: 0 };

  constructor(private readonly services: GameServices) {
    super('Backdrop');
  }

  create(): void {
    this.scope.dispose();
    this.scope = new DisposableScope();
    this.visibility = 0;
    applyVolViewport(this);
    const { settings } = this.services;
    const preferences = settings.get();
    const world = new World(WORLD.width, WORLD.height, WORLD.gridStep);
    const profile = EFFECT_LEVELS[preferences.quality];
    const choice = climateChoice(
      preferences,
      new URLSearchParams(location.search),
      this.services.overrides,
    );

    this.arena = this.scope.addDestroyable(new ArenaView(this, world));
    this.arena.setGridVisible(false);
    this.environment = this.scope.addDestroyable(
      new EnvironmentController(
        this,
        world.width,
        world.height,
        WEATHER.seed,
        profile,
        choice.weather,
        choice.season,
        world,
      ),
    );
    if (choice.season) this.environment.model.step(SEASONS.previewWarmupMs);
    this.parade = new BackdropParade({
      world,
      weather: this.environment.model,
      seed: BACKDROP.seed,
      units: preferences.backdropDensity,
    });
    this.effects = this.scope.addDestroyable(new EffectsView(this, profile, world));
    this.vehicles = this.scope.addDestroyable(
      new VehicleViews(this, (x, y, angle, scale, width) => {
        // Suya basan ayak iz bırakmaz: suyun yüzeyine kalıcı iz basılmaz.
        const water = this.environment.water;
        if (!water || water.depthAt(x, y) < WATER_VIEW.trails.minDepth)
          this.effects.footprint(x, y, angle, scale, width);
      }),
    );
    this.wrecks = new WreckDirector(this.effects, undefined, this.environment.water ?? undefined);
    this.rig = new CameraRig(
      this,
      { ...CAMERA, followMs: BACKDROP.camera.followMs },
      world.width,
      world.height,
    );
    this.dim = this.add
      .rectangle(0, 0, 1, 1, 0x000000, BACKDROP.dim.alpha)
      .setOrigin(0, 0)
      .setDepth(10_000);

    // Açılışta kamera görünmez; alay ilk karede doludur, sonra yavaşça belirir.
    this.cameras.main.setAlpha(0);
    this.vehicles.sync(this.parade.vehicles);
    this.place(true);

    // Ayar değişimi yalnız ilgili parçayı yeniler: ses ya da araç seçimi havayı ve kamerayı etkilemez.
    let applied = { ...choice, quality: preferences.quality, density: preferences.backdropDensity };
    this.scope.addSubscription(
      settings.subscribe((value) => {
        const next = climateChoice(
          value,
          new URLSearchParams(location.search),
          this.services.overrides,
        );
        if (next.season !== applied.season && next.season)
          this.environment.model.setSeason(next.season, SEASONS.previewWarmupMs);
        if (next.weather !== applied.weather) this.environment.model.setOverride(next.weather);
        if (value.quality !== applied.quality) {
          const level = EFFECT_LEVELS[value.quality];
          this.effects.applyProfile(level);
          this.environment.applyProfile(level);
        }
        // Alay büyüklüğü kurulurken belirlenir: değişince alay baştan kurulur.
        const restart = value.backdropDensity !== applied.density;
        applied = { ...next, quality: value.quality, density: value.backdropDensity };
        if (restart) this.scene.restart();
      }),
    );
    this.scale.on('resize', this.rig.syncViewport, this.rig);
    this.scope.addSubscription(() => this.scale.off('resize', this.rig.syncViewport, this.rig));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scope.dispose());
  }

  override update(_time: number, delta: number): void {
    if (this.scene.isActive('World')) {
      this.scene.stop();
      return;
    }
    this.parade.advance(delta);
    this.present(delta);
    if (this.visibility < 1) {
      this.visibility = Math.min(1, this.visibility + delta / BACKDROP.fadeInMs);
      this.cameras.main.setAlpha(this.visibility);
    }
  }

  /** Kareyi çizer: görünümler, olaylar, etkiler, kamera, hava ve karartma. */
  private present(delta: number): void {
    const sim = this.parade.sim;
    const alpha = this.parade.alpha;
    for (const removed of this.vehicles.sync(sim.vehicles)) {
      this.effects.removeVehicle(removed);
      this.wrecks.forget(removed);
    }
    this.simEvents.length = 0;
    const events = this.parade.drainEvents(this.simEvents);
    routeSimEvents(events, {
      player: -1,
      tank: (id) => this.vehicles.get(id),
      spec: (id) => sim.vehicle(id)?.spec,
      position: (id) => sim.vehicle(id)?.chassis,
      effects: this.effects,
      arena: this.arena,
      camera: STILL_CAMERA,
      listener: FAR_LISTENER,
    });

    const sight = this.rig.model.visibleRect();
    this.effects.setViewport(sight.x, sight.y, sight.width, sight.height);
    const lakes = sim.world.lakes;
    for (const vehicle of sim.vehicles) {
      const tank = vehicle.chassis;
      const frame = tankFrame(tank, alpha);
      const view = this.vehicles.get(vehicle.id);
      if (!this.wrecks.track(vehicle, view, frame, delta)) continue;
      const floats = tank.kind === 'hover' || tank.airborne;
      view?.submerge?.(floats || lakes.isEmpty ? 0 : lakes.depthAt(frame.x, frame.y));
      view?.update(frame, delta);
      this.effects.updateVehicle(vehicle.id, {
        x: frame.x,
        y: frame.y,
        hull: frame.hull,
        speed: frame.speed,
        boosting: frame.boosting,
        slipping: tank.slip > FEEL.slipSpeed,
        groundLeft: tank.groundLeft,
        groundRight: tank.groundRight,
        slideLeft: tank.slideLeft,
        slideRight: tank.slideRight,
        trackOffset: tank.trackOffset,
        tracked: vehicle.spec.kind === 'tank',
      });
    }
    this.arena.update(delta);
    this.effects.update(sim.projectiles, alpha, delta);

    // Menü ekranı değişince boş alan değişir: hedef her kare okunur, kamera oraya süzülür.
    this.place(false);
    this.rig.update(this.target.x, this.target.y, delta, false);

    const rect = this.rig.model.visibleRect();
    this.environment.render(sim.vehicles, alpha, rect, delta);
    const margin = Math.max(rect.width, rect.height) * 0.05;
    this.dim
      .setPosition(rect.x - margin, rect.y - margin)
      .setSize(rect.width + margin * 2, rect.height + margin * 2);
  }

  /**
   * Sahnenin merkezini menü panelinin bıraktığı boş alana oturtur: alay panelin yanında görünsün diye
   * kamera hedefi merkezden kaydırılır. `snap`: kamera hedefe atlar (açılış), yoksa süzülür.
   */
  private place(snap: boolean): void {
    const model = this.rig.model;
    model.setZoom(BACKDROP.camera.zoom);
    const quality = renderQualityOf(this);
    const width = this.cameras.main.width / quality;
    const height = this.cameras.main.height / quality;
    const area = (this.game.registry.get(MENU_AREA_KEY) as FreeArea | undefined) ?? {
      x: 0,
      y: 0,
      width,
      height,
    };
    const focusX = area.x + area.width / 2;
    const focusY = area.y + area.height * BACKDROP.camera.focusHeight;
    const center = this.parade.sim.world.center;
    this.target = {
      x: center.x - (focusX - width / 2) / model.zoom,
      y: center.y - (focusY - height / 2) / model.zoom,
    };
    if (snap) model.snapTo(this.target.x, this.target.y);
  }
}
