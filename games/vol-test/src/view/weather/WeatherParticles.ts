import { createRandom } from '@volstudio/core/random';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { WeatherFrame } from '@/sim/weather/WeatherSystem';

export interface WeatherRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WeatherParticle {
  x: number;
  y: number;
  size: number;
  kind: 'rain' | 'snow' | 'dust';
}

const wrap = (value: number, extent: number): number => ((value % extent) + extent) % extent;

export class WeatherParticles {
  readonly points: readonly WeatherParticle[];
  private readonly phases: Float64Array;

  constructor(seed: number) {
    const random = createRandom(seed);
    this.phases = new Float64Array(WEATHER_VIEW.particles * 3);
    this.points = Array.from({ length: WEATHER_VIEW.particles }, () => ({
      x: 0,
      y: 0,
      size: 0,
      kind: 'rain' as const,
    }));
    for (let index = 0; index < this.phases.length; index++) this.phases[index] = random.next();
  }

  write(frame: WeatherFrame, rect: WeatherRect, quality: number): number {
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const budget = Math.floor(WEATHER_VIEW.particles * Math.max(0, Math.min(1, quality)));
    const seconds = frame.elapsedMs / 1000;
    let count = 0;
    for (const kind of ['rain', 'snow', 'dust'] as const) {
      const size = kind === 'rain' ? WEATHER_VIEW.rain.length : WEATHER_VIEW[kind].radius;
      const margin = Math.min(size, rect.width / 4, rect.height / 4);
      const width = rect.width - margin * 2;
      const height = rect.height - margin * 2;
      const slots =
        kind === 'dust'
          ? Math.round((budget * WEATHER_VIEW.dust.particles) / WEATHER_VIEW.particles)
          : budget;
      const limit = Math.min(budget, count + Math.round(frame[kind] * slots));
      for (; count < limit; count++) {
        const phase = count * 3;
        const point = this.points[count];
        const drift = kind === 'snow' ? Math.sin(seconds + this.phases[phase + 2] * 6.28) * 8 : 0;
        point.x =
          rect.x + margin + wrap(this.phases[phase] * width + frame.windTravelX + drift, width);
        point.y =
          rect.y +
          margin +
          wrap(
            this.phases[phase + 1] * height +
              seconds * WEATHER_VIEW[kind].speed +
              frame.windTravelY,
            height,
          );
        point.size = size * (0.6 + this.phases[phase + 2] * 0.4);
        point.kind = kind;
      }
    }
    return count;
  }
}
