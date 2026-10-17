import { CLIMATE_AUTO, type GamePreferences } from '@/app/GameSettings';
import type { RuntimeOverrides } from '@/app/RuntimeOverrides';
import type { SeasonKind } from '@/config/seasons';
import type { WeatherKind } from '@/config/weather';
import { parseSeasonOverride } from '@/sim/seasons/SeasonCycle';
import { parseWeatherOverride } from '@/sim/weather/WeatherSystem';

/** Yerel dünyada zorlanan mevsim ve hava; `undefined` takvimin ve havanın kendi akışı demektir. */
export interface ClimateChoice {
  readonly season: SeasonKind | undefined;
  readonly weather: WeatherKind | undefined;
}

/**
 * Hangi mevsim ve havanın zorlanacağını söyler. Öncelik: bağlantı parametresi (`?season=`, `?weather=`),
 * ölçüm koşusunun ortam geçersiz kılması, geliştirici ekranındaki ayar. Menü arka planı ve alıştırma
 * dünyası aynı kuralı kullanır, bu yüzden geliştirici ekranında seçilen mevsim ikisinde de aynı görünür.
 */
export function climateChoice(
  preferences: Pick<GamePreferences, 'season' | 'weather'> | undefined,
  query: URLSearchParams,
  overrides?: Pick<RuntimeOverrides, 'season' | 'weather'>,
): ClimateChoice {
  const season = preferences?.season;
  const weather = preferences?.weather;
  return {
    season:
      parseSeasonOverride(query.get('season')) ??
      overrides?.season ??
      (season && season !== CLIMATE_AUTO ? season : undefined),
    weather:
      parseWeatherOverride(query.get('weather')) ??
      overrides?.weather ??
      (weather && weather !== CLIMATE_AUTO ? weather : undefined),
  };
}
