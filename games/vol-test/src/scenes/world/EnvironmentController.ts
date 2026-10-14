import type Phaser from 'phaser';
import type { SeasonKind } from '@/config/seasons';
import type { EffectProfile } from '@/config/quality';
import type { WeatherKind } from '@/config/weather';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import type { LakeField } from '@/sim/world/LakeField';
import { LakeView } from '@/view/water/LakeView';
import { WeatherView } from '@/view/weather/WeatherView';
import type { WeatherRect } from '@/view/weather/WeatherParticles';
import type { WeatherVehicleFrame } from '@/view/weather/VehicleReflectionPool';
import { tankFrame } from './frames';

export class EnvironmentController {
  readonly model: WeatherSystem;
  private readonly view: WeatherView;
  private readonly lakes: LakeView | null;
  private quality = 1;
  private readonly frames: WeatherVehicleFrame[] = [];

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    seed: number,
    profile: EffectProfile,
    override?: WeatherKind,
    season?: SeasonKind,
    lakes?: LakeField,
  ) {
    this.model = new WeatherSystem(width, height, { seed, override, season });
    this.view = new WeatherView(scene, seed, profile);
    this.lakes = lakes && !lakes.isEmpty ? new LakeView(scene, lakes) : null;
    this.quality = profile.particles;
  }

  /** Son karede ekrana değen göl sayısı (ölçüm). */
  get visibleLakes(): number {
    return this.lakes?.visibleLakes ?? 0;
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

  render(vehicles: readonly Vehicle[], alpha: number, rect: WeatherRect): void {
    this.frames.length = 0;
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
    }
    this.view.update(this.model, rect, this.frames);
    this.lakes?.update(rect, this.model.frame, this.quality);
  }

  destroy(): void {
    this.lakes?.destroy();
    this.view.destroy();
  }
}
