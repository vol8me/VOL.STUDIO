import type Phaser from 'phaser';
import type { SeasonKind } from '@/config/seasons';
import type { EffectProfile } from '@/config/quality';
import type { WeatherKind } from '@/config/weather';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { fertilityOf } from '@/sim/world/fertility';
import type { World } from '@/sim/world/World';
import { RockView } from '@/view/terrain/RockView';
import { iceThickness, LakeView } from '@/view/water/LakeView';
import { WaterTrails, type TrailSubject } from '@/view/water/WaterTrails';
import type { WreckWater } from './WreckDirector';
import { WeatherView } from '@/view/weather/WeatherView';
import type { WeatherRect } from '@/view/weather/WeatherParticles';
import type { WeatherVehicleFrame } from '@/view/weather/VehicleReflectionPool';
import { tankFrame } from './frames';

export class EnvironmentController {
  readonly model: WeatherSystem;
  private readonly view: WeatherView;
  private readonly lakes: LakeView | null;
  private readonly rocks: RockView | null;
  private readonly trails: WaterTrails | null;
  private readonly trailSubjects: TrailSubject[] = [];
  private quality = 1;
  private readonly sinkWater: WreckWater | null;
  private readonly frames: WeatherVehicleFrame[] = [];

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    seed: number,
    profile: EffectProfile,
    override?: WeatherKind,
    season?: SeasonKind,
    world?: World,
  ) {
    const lakes = world?.lakes;
    this.model = new WeatherSystem(width, height, {
      seed,
      override,
      season,
      fertility: world ? fertilityOf(world) : undefined,
    });
    this.view = new WeatherView(scene, seed, profile);
    this.rocks = world && !world.rocks.isEmpty ? new RockView(scene, world.rocks) : null;
    this.lakes = lakes && !lakes.isEmpty ? new LakeView(scene, lakes) : null;
    this.trails = lakes && !lakes.isEmpty ? new WaterTrails(scene, lakes) : null;
    this.sinkWater =
      lakes && this.trails
        ? {
            depthAt: (x, y) => lakes.depthAt(x, y),
            splash: (x, y, radius) => this.trails?.splash(x, y, radius),
          }
        : null;
    this.quality = profile.particles;
  }

  /** Son karede çizilen kaya sayısı (ölçüm). */
  get drawnRocks(): number {
    return this.rocks?.drawn ?? 0;
  }

  /** Son karede ekrana değen göl sayısı (ölçüm). */
  get visibleLakes(): number {
    return this.lakes?.visibleLakes ?? 0;
  }

  /** Batışın derinlik ve iz kaynağı; göl yoksa `null` (her ölüm patlar). */
  get water(): WreckWater | null {
    return this.sinkWater;
  }

  get counts() {
    return this.view.counts;
  }
  get climate() {
    return this.model.frame;
  }

  applyProfile(profile: EffectProfile): void {
    this.quality = profile.particles;
    this.view.applyProfile(profile);
  }

  /** `deltaMs` sunum süresidir: duraklatmada sıfırdır ve su izleri donar. */
  render(vehicles: readonly Vehicle[], alpha: number, rect: WeatherRect, deltaMs = 0): void {
    this.frames.length = 0;
    this.trailSubjects.length = 0;
    for (const vehicle of vehicles) {
      if (this.frames.length >= WEATHER_VIEW.vehicleCapacity) break;
      const frame = tankFrame(vehicle.chassis, alpha);
      if (
        frame.x < rect.x ||
        frame.y < rect.y ||
        frame.x > rect.x + rect.width ||
        frame.y > rect.y + rect.height
      )
        continue;
      this.frames.push({ ...frame, id: vehicle.id, spec: vehicle.spec });
      if (this.trails && vehicle.vitality.alive)
        this.trailSubjects.push({
          id: vehicle.id,
          kind: vehicle.spec.kind,
          x: frame.x,
          y: frame.y,
          hull: frame.hull,
          speed: frame.speed,
        });
    }
    this.view.update(this.model, rect, this.frames);
    this.lakes?.update(rect, this.model.frame, this.quality);
    this.rocks?.update(rect, this.model);
    this.trails?.update(this.trailSubjects, iceThickness(this.model.frame), deltaMs);
  }

  destroy(): void {
    this.trails?.destroy();
    this.rocks?.destroy();
    this.lakes?.destroy();
    this.view.destroy();
  }
}
