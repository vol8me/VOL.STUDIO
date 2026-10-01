import type { WeatherKind } from './weather';

export type SeasonKind = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonProfile {
  readonly temperature: number;
  readonly daylight: number;
  readonly weather: Readonly<Record<WeatherKind, number>>;
}

export const SEASONS = {
  previewWarmupMs: 120_000,
  durationMs: 15 * 60_000,
  transitionFraction: 0.2,
  order: ['spring', 'summer', 'autumn', 'winter'] as readonly SeasonKind[],
  profiles: {
    spring: {
      temperature: 12,
      daylight: 0.7,
      weather: { clear: 0.6, dust: 0.08, rain: 0.3, snow: 0.02 },
    },
    summer: {
      temperature: 25,
      daylight: 0.95,
      weather: { clear: 0.62, dust: 0.28, rain: 0.1, snow: 0 },
    },
    autumn: {
      temperature: 8,
      daylight: 0.5,
      weather: { clear: 0.4, dust: 0.08, rain: 0.5, snow: 0.02 },
    },
    winter: {
      temperature: -5,
      daylight: 0.3,
      weather: { clear: 0.28, dust: 0.02, rain: 0.05, snow: 0.65 },
    },
  } satisfies Record<SeasonKind, SeasonProfile>,
} as const;
