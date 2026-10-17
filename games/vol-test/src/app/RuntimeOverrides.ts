import { EFFECT_LEVELS, type EffectLevel } from '@/config/quality';
import type { ScenarioId } from '@/config/scenarios';
import { SEASONS, type SeasonKind } from '@/config/seasons';
import { WEATHER, type WeatherKind } from '@/config/weather';

export interface RuntimeOverrides {
  readonly scenario?: ScenarioId;
  readonly seed?: number;
  readonly weather?: WeatherKind;
  readonly season?: SeasonKind;
  readonly quality?: EffectLevel;
}

const SCENARIO_CODES: Readonly<Record<string, ScenarioId>> = {
  '0': 'empty',
  '10': 'slalom',
  '20': 'targets',
  '30': 'sandbox',
  '40': 'multitank',
};

function member<T extends object>(value: string | undefined, values: T): keyof T | undefined {
  return value !== undefined && Object.hasOwn(values, value) ? (value as keyof T) : undefined;
}

export function parseRuntimeOverrides(env: Readonly<Record<string, string>>): RuntimeOverrides {
  if (env.VOL_DECK_MEASURE !== '1') return {};
  const code = member(env.VOL_DECK_SCENARIO, SCENARIO_CODES);
  const seed =
    /^\d{1,10}$/.test(env.VOL_DECK_SEED ?? '') && Number(env.VOL_DECK_SEED) <= 0xffffffff
      ? Number(env.VOL_DECK_SEED)
      : undefined;
  const weather = member(env.VOL_DECK_WEATHER, WEATHER.profiles);
  const season = member(env.VOL_DECK_SEASON, SEASONS.profiles);
  const quality = member(env.VOL_DECK_QUALITY, EFFECT_LEVELS);
  return {
    ...(code !== undefined ? { scenario: SCENARIO_CODES[code] } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(weather !== undefined ? { weather } : {}),
    ...(season !== undefined ? { season } : {}),
    ...(quality !== undefined ? { quality } : {}),
  };
}
