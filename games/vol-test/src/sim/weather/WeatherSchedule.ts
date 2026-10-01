import { clamp01, lerp } from '@volstudio/core/math/interpolation';
import { createRandom } from '@volstudio/core/random';
import { WEATHER, type WeatherKind } from '@/config/weather';
import type { SeasonKind } from '@/config/seasons';
import { SeasonCycle } from '../seasons/SeasonCycle';
import type { WeatherState } from './types';

export interface WeatherEvent {
  readonly kind: WeatherKind;
  readonly startMs: number;
  readonly endMs: number;
}

interface OverrideTransition {
  readonly startMs: number;
  readonly from: WeatherState;
  readonly kind: WeatherKind | undefined;
}

const KINDS = Object.keys(WEATHER.profiles) as WeatherKind[];
type Atmosphere = Pick<WeatherState, 'dust' | 'rain' | 'snow' | 'windX' | 'windY' | 'airDrag'>;

function transition(elapsedMs: number, startMs: number): number {
  const ratio = clamp01((elapsedMs - startMs) / WEATHER.transitionMs);
  return ratio * ratio * (3 - 2 * ratio);
}

function mix(from: Atmosphere, to: Atmosphere, amount: number): Atmosphere {
  return {
    dust: lerp(from.dust, to.dust, amount),
    rain: lerp(from.rain, to.rain, amount),
    snow: lerp(from.snow, to.snow, amount),
    windX: lerp(from.windX, to.windX, amount),
    windY: lerp(from.windY, to.windY, amount),
    airDrag: lerp(from.airDrag, to.airDrag, amount),
  };
}

export class WeatherSchedule {
  private readonly gustPhase: number;
  private override: OverrideTransition | undefined;
  private readonly seasons: SeasonCycle;

  constructor(
    private readonly seed: number,
    kind?: WeatherKind,
    initialSeason?: SeasonKind,
  ) {
    this.seasons = new SeasonCycle(initialSeason);
    this.gustPhase = createRandom(seed).next() * Math.PI * 2;
    if (kind) this.override = { startMs: -WEATHER.transitionMs, from: this.frameAt(0), kind };
  }

  setOverride(kind: WeatherKind | undefined, elapsedMs: number): void {
    const from = this.frameAt(elapsedMs);
    const gust = this.gustAt(elapsedMs);
    this.override = {
      startMs: elapsedMs,
      from: { ...from, windX: from.windX / gust, windY: from.windY / gust },
      kind,
    };
  }

  eventAt(elapsedMs: number): WeatherEvent {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new RangeError('Hava saati sonlu ve negatif olmayan bir sayı olmalı.');
    const block = Math.floor(elapsedMs / WEATHER.events.maxMs);
    const random = createRandom(this.seed ^ Math.imul(block + 1, 0x9e3779b1));
    const end = (block + 1) * WEATHER.events.maxMs;
    let start = block * WEATHER.events.maxMs;
    while (start < end) {
      const slots = Math.floor(random.next() * (WEATHER.events.maxMs / WEATHER.events.minMs)) + 1;
      const eventEnd = Math.min(end, start + slots * WEATHER.events.minMs);
      const weights = this.seasons.frameAt(start).weather;
      let choice = random.next();
      let kind: WeatherKind = 'clear';
      for (const candidate of KINDS) {
        choice -= weights[candidate];
        if (choice <= 0) {
          kind = candidate;
          break;
        }
      }
      if (start === 0) kind = 'clear';
      if (elapsedMs < eventEnd) return { kind, startMs: start, endMs: eventEnd };
      start = eventEnd;
    }
    throw new Error('Hava olayı bulunamadı.');
  }

  frameAt(elapsedMs: number): WeatherState {
    const season = this.seasons.frameAt(elapsedMs);
    const event = this.eventAt(elapsedMs);
    const override =
      this.override &&
      (this.override.kind !== undefined || elapsedMs < this.override.startMs + WEATHER.transitionMs)
        ? this.override
        : undefined;
    const targetKind = override?.kind ?? event.kind;
    const previous = event.startMs > 0 ? this.eventAt(event.startMs - 1).kind : 'clear';
    const natural = mix(
      WEATHER.profiles[previous],
      WEATHER.profiles[event.kind],
      transition(elapsedMs, event.startMs),
    );
    const atmosphere = override
      ? mix(
          override.from,
          override.kind ? WEATHER.profiles[override.kind] : natural,
          transition(elapsedMs, override.startMs),
        )
      : natural;
    const { snow, rain } = atmosphere;
    const gust = this.gustAt(elapsedMs);
    let temperature = lerp(
      season.temperature,
      Math.min(season.temperature, WEATHER.temperature.snowMaximum),
      snow,
    );
    temperature = lerp(temperature, Math.max(temperature, WEATHER.temperature.rainMinimum), rain);
    return Object.freeze({
      kind: targetKind,
      season: season.kind,
      seasonProgress: season.progress,
      daylight: season.daylight,
      elapsedMs,
      dust: atmosphere.dust,
      rain,
      snow,
      windX: atmosphere.windX * gust,
      windY: atmosphere.windY * gust,
      temperature,
      airDrag: atmosphere.airDrag,
    });
  }

  private gustAt(elapsedMs: number): number {
    return (
      1 +
      WEATHER.wind.gustAmount *
        Math.sin(this.gustPhase + (elapsedMs / WEATHER.wind.periodMs) * Math.PI * 2)
    );
  }
}
