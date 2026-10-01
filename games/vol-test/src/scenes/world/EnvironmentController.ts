import type Phaser from 'phaser';
import type { SeasonKind } from '@/config/seasons';
import type { EffectProfile } from '@/config/quality';
import type { WeatherKind } from '@/config/weather';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { WeatherView } from '@/view/weather/WeatherView';
import type { WeatherRect } from '@/view/weather/WeatherParticles';
import type { WeatherVehicleFrame } from '@/view/weather/VehicleReflectionPool';
import { tankFrame } from './frames';

export class EnvironmentController {
  readonly model: WeatherSystem;
  private readonly view: WeatherView;
  private readonly frames: WeatherVehicleFrame[] = [];

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    seed: number,
    profile: EffectProfile,
    override?: WeatherKind,
    season?: SeasonKind,
  ) {
    this.model = new WeatherSystem(width, height, { seed, override, season });
    this.view = new WeatherView(scene, seed, profile);
  }

  get counts() {
    return this.view.counts;
  }
  get climate() {
    return this.model.frame;
  }

  applyProfile(profile: EffectProfile): void {
    this.view.applyProfile(profile);
  }

  render(vehicles: readonly Vehicle[], alpha: number, rect: WeatherRect): void {
    this.frames.length = 0;
    for (const vehicle of vehicles) {
      if (this.frames.length >= WEATHER_VIEW.vehicleCapacity) break;
      const frame = tankFrame(vehicle.tank, alpha);
      if (
        frame.x < rect.x ||
        frame.y < rect.y ||
        frame.x > rect.x + rect.width ||
        frame.y > rect.y + rect.height
      )
        continue;
      this.frames.push({ ...frame, id: vehicle.id });
    }
    this.view.update(this.model, rect, this.frames);
  }

  destroy(): void {
    this.view.destroy();
  }
}
