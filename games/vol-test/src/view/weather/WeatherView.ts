import type Phaser from 'phaser';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type { EffectProfile } from '@/config/quality';
import { WEATHER_VIEW } from '@/config/weatherView';
import { TerrainField } from './TerrainField';
import { SeasonGround } from './SeasonGround';
import { SurfaceLayer, type WeatherSource } from './SurfaceLayer';
import { VehicleReflectionPool, type WeatherVehicleFrame } from './VehicleReflectionPool';
import { VegetationLayer } from './VegetationLayer';
import { PhaserVegetationHost } from './VegetationHost';
import { VehicleWakePool } from './VehicleWakePool';
import { WeatherParticles, type WeatherRect } from './WeatherParticles';

export interface WeatherViewCounts {
  particles: number;
  surfaceCells: number;
  reflections: number;
  wakes: number;
}

export class WeatherView {
  readonly counts: WeatherViewCounts = { particles: 0, surfaceCells: 0, reflections: 0, wakes: 0 };
  private readonly scope = new DisposableScope();
  private readonly surface: SurfaceLayer;
  private readonly season: SeasonGround;
  private readonly field: TerrainField;
  private readonly vegetation: VegetationLayer;
  private readonly reflections: VehicleReflectionPool;
  private readonly wakes: VehicleWakePool;
  private readonly particles: WeatherParticles;
  private readonly precipitation: Phaser.GameObjects.Graphics;
  private quality = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    seed: number,
    profile: EffectProfile,
  ) {
    this.field = new TerrainField(seed);
    const season = this.scope.addDestroyable(
      scene.add.graphics().setDepth(WEATHER_VIEW.seasonDepth),
    );
    this.season = new SeasonGround(season, seed, this.field);
    const surface = this.scope.addDestroyable(
      scene.add.graphics().setDepth(WEATHER_VIEW.surfaceDepth),
    );
    const wakes = this.scope.addDestroyable(scene.add.graphics().setDepth(WEATHER_VIEW.wakeDepth));
    this.precipitation = this.scope.addDestroyable(
      scene.add.graphics().setDepth(WEATHER_VIEW.precipitationDepth),
    );
    const host = this.scope.add(
      new PhaserVegetationHost(
        scene,
        WEATHER_VIEW.vegetation.depth,
        WEATHER_VIEW.vegetation.tipDepth,
      ),
    );
    this.vegetation = new VegetationLayer(host);
    this.scope.addSubscription(() => this.vegetation.destroy());
    this.surface = new SurfaceLayer(surface, this.field);
    this.wakes = new VehicleWakePool(wakes);
    this.reflections = this.scope.addDestroyable(new VehicleReflectionPool(scene));
    this.particles = new WeatherParticles(seed);
    this.applyProfile(profile);
  }

  applyProfile(profile: EffectProfile): void {
    this.quality = Math.max(0, Math.min(1, profile.particles));
  }

  update(
    weather: WeatherSource,
    rect: WeatherRect,
    vehicles: readonly WeatherVehicleFrame[],
  ): void {
    if (this.scope.isDisposed()) return;
    this.field.prepare(weather, rect);
    this.season.draw(weather, rect, true);
    this.vegetation.draw(this.field, weather, rect, this.quality, this.pixelsPerUnit(rect));
    this.counts.wakes = this.wakes.update(weather, rect, vehicles);
    this.counts.surfaceCells = this.surface.draw(
      weather,
      rect,
      WEATHER_VIEW.wakeCapacity - this.counts.wakes,
      true,
    );
    this.counts.reflections = this.reflections.update(weather, rect, vehicles);
    const count = this.particles.write(weather.frame, rect, this.quality);
    this.counts.particles = count;
    this.precipitation.clear();
    for (let index = 0; index < count; index++) {
      const particle = this.particles.points[index];
      const style = WEATHER_VIEW[particle.kind];
      if (particle.kind === 'rain') {
        const drift = Math.max(
          -particle.size / 2,
          Math.min(particle.size / 2, weather.frame.windX * 0.015),
        );
        this.precipitation.lineStyle(1, style.color, style.alpha);
        this.precipitation.lineBetween(
          particle.x,
          particle.y,
          particle.x - drift,
          particle.y - particle.size,
        );
      } else if (particle.kind === 'dust') {
        this.precipitation.fillStyle(style.color, style.alpha * 0.35);
        this.precipitation.fillEllipse(
          particle.x,
          particle.y,
          particle.size * 2,
          particle.size * 0.85,
        );
        this.precipitation.fillStyle(style.color, style.alpha);
        this.precipitation.fillEllipse(
          particle.x,
          particle.y,
          particle.size * 1.35,
          particle.size * 0.45,
        );
      } else {
        this.precipitation.fillStyle(style.color, style.alpha);
        this.precipitation.fillCircle(particle.x, particle.y, particle.size);
      }
    }
  }

  /** Ekranda birim başına aygıt pikseli (kamera yakınlığı × çözünürlük); çayır doku yoğunluğunu seçer. */
  private pixelsPerUnit(rect: WeatherRect): number {
    const canvas = (this.scene as { sys?: { game?: { canvas?: { width: number } } } }).sys?.game
      ?.canvas;
    return canvas && rect.width > 0 ? canvas.width / rect.width : 1;
  }

  destroy(): void {
    this.scope.dispose();
  }
}
