import { clamp01, lerp } from '@volstudio/core/math/interpolation';
import { SEASONS, type SeasonKind, type SeasonProfile } from '@/config/seasons';
import type { WeatherKind } from '@/config/weather';

export interface SeasonFrame extends SeasonProfile {
  readonly kind: SeasonKind;
  readonly progress: number;
  readonly elapsedMs: number;
}

export function parseSeasonOverride(value: string | null): SeasonKind | undefined {
  return SEASONS.order.includes(value as SeasonKind) ? (value as SeasonKind) : undefined;
}

export class SeasonCycle {
  private elapsedMs = 0;

  constructor(private readonly initial: SeasonKind = 'spring') {}

  get frame(): SeasonFrame {
    return this.frameAt(this.elapsedMs);
  }

  step(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs < 0 || !Number.isFinite(this.elapsedMs + dtMs))
      throw new RangeError('Mevsim adımı sonlu ve negatif olmayan bir sayı olmalı.');
    this.elapsedMs += dtMs;
  }

  frameAt(elapsedMs: number): SeasonFrame {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new RangeError('Mevsim saati sonlu ve negatif olmayan bir sayı olmalı.');
    const index =
      (Math.floor(elapsedMs / SEASONS.durationMs) + SEASONS.order.indexOf(this.initial)) %
      SEASONS.order.length;
    const kind = SEASONS.order[index];
    const next = SEASONS.order[(index + 1) % SEASONS.order.length];
    const progress = (elapsedMs % SEASONS.durationMs) / SEASONS.durationMs;
    const ratio = clamp01(
      (progress - (1 - SEASONS.transitionFraction)) / SEASONS.transitionFraction,
    );
    const blend = ratio * ratio * (3 - 2 * ratio);
    const from = SEASONS.profiles[kind];
    const to = SEASONS.profiles[next];
    const weather = {} as Record<WeatherKind, number>;
    for (const key of Object.keys(from.weather) as WeatherKind[])
      weather[key] = lerp(from.weather[key], to.weather[key], blend);
    return Object.freeze({
      kind,
      progress,
      elapsedMs,
      temperature: lerp(from.temperature, to.temperature, blend),
      daylight: lerp(from.daylight, to.daylight, blend),
      weather: Object.freeze(weather),
    });
  }
}
