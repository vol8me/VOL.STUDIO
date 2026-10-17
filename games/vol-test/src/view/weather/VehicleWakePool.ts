import type Phaser from 'phaser';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherRect } from './WeatherParticles';
import type { WeatherSource } from './SurfaceLayer';
import type { WeatherVehicleFrame } from './VehicleReflectionPool';

interface Wake {
  x: number;
  y: number;
  angle: number;
  strength: number;
  createdMs: number;
  active: boolean;
}

interface Track {
  id: number;
  x: number;
  y: number;
  wet: boolean;
  seen: number;
}

export class VehicleWakePool {
  private readonly wakes: Wake[] = Array.from({ length: WEATHER_VIEW.wakeCapacity }, () => ({
    x: 0,
    y: 0,
    angle: 0,
    strength: 0,
    createdMs: 0,
    active: false,
  }));
  private readonly tracks: Track[] = Array.from({ length: WEATHER_VIEW.vehicleCapacity }, () => ({
    id: -1,
    x: 0,
    y: 0,
    wet: false,
    seen: -1,
  }));
  private cursor = 0;
  private frame = 0;
  private lastMs = -1;

  constructor(private readonly graphics: Phaser.GameObjects.Graphics) {}

  update(
    weather: WeatherSource,
    rect: WeatherRect,
    vehicles: readonly WeatherVehicleFrame[],
  ): number {
    const now = weather.frame.elapsedMs;
    this.graphics.clear();
    if (now !== this.lastMs) {
      this.frame++;
      for (const track of this.tracks) {
        if (!vehicles.some((vehicle) => vehicle.id === track.id)) {
          track.id = -1;
          track.wet = false;
        }
      }
      for (const vehicle of vehicles) {
        const existing = this.tracks.find((track) => track.id === vehicle.id);
        const track = existing ?? this.tracks.find((candidate) => candidate.id === -1);
        if (!track) continue;
        const wet =
          weather.sample(vehicle.x, vehicle.y).puddleDepth >= WEATHER_VIEW.wake.minPuddleDepth;
        const distance = existing ? Math.hypot(vehicle.x - track.x, vehicle.y - track.y) : 0;
        if (
          wet &&
          Math.abs(vehicle.speed) >= WEATHER_VIEW.wake.minSpeed &&
          (!track.wet || distance >= WEATHER_VIEW.wake.spacing)
        ) {
          const wake = this.wakes[this.cursor];
          wake.x = vehicle.x;
          wake.y = vehicle.y;
          wake.angle = vehicle.hull;
          wake.strength = Math.min(1, Math.abs(vehicle.speed) / 150);
          wake.createdMs = now;
          wake.active = true;
          this.cursor = (this.cursor + 1) % this.wakes.length;
          track.x = vehicle.x;
          track.y = vehicle.y;
        } else if (!wet || !existing) {
          track.x = vehicle.x;
          track.y = vehicle.y;
        }
        track.id = vehicle.id;
        track.wet = wet;
        track.seen = this.frame;
      }
      for (const track of this.tracks) {
        if (track.seen !== this.frame) {
          track.id = -1;
          track.wet = false;
        }
      }
      this.lastMs = now;
    }
    let count = 0;
    const config = WEATHER_VIEW.wake;
    for (const wake of this.wakes) {
      if (!wake.active) continue;
      const progress = (now - wake.createdMs) / config.durationMs;
      if (progress >= 1 || progress < 0) {
        wake.active = false;
        continue;
      }
      count++;
      const radius = config.maxRadius * (0.2 + 0.8 * progress);
      if (
        wake.x - radius < rect.x ||
        wake.y - radius < rect.y ||
        wake.x + radius > rect.x + rect.width ||
        wake.y + radius > rect.y + rect.height
      )
        continue;
      const alpha = config.alpha * (1 - progress) * (0.4 + 0.6 * wake.strength);
      this.graphics.lineStyle(1.2, config.color, alpha);
      this.graphics.strokeEllipse(wake.x, wake.y, radius * 2, radius);
      this.graphics.fillStyle(config.color, alpha);
      const spread = radius * 0.6;
      const dx = Math.sin(wake.angle) * spread;
      const dy = Math.cos(wake.angle) * spread;
      this.graphics.fillCircle(wake.x + dx, wake.y - dy, 1.3 * (1 - progress));
      this.graphics.fillCircle(wake.x - dx, wake.y + dy, 1.3 * (1 - progress));
    }
    return count;
  }
}
