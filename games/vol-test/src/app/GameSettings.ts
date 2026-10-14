import { PersistedObservableState, type ScopedSaveManager } from '@volstudio/core';
import { sanitizeName } from '@volstudio/network/protocol';
import { isScenario, validSeed, SCENARIO, type ScenarioId } from '@/config/scenarios';
import { initialEffectLevel, type EffectLevel } from '@/config/quality';
import { isVehicleId, STRIKER, type VehicleId } from '@/config/vehicles';
import { WAR } from '@/config/war';

/** Arayüz dili tercihi; `auto` cihaz dilini izler. */
export const LANGUAGES = ['auto', 'tr', 'en'] as const;
export type LanguagePreference = (typeof LANGUAGES)[number];

/** Cephe tercihinde "dengeye göre sunucu seçsin" değeri. */
export const FACTION_AUTO = -1;

export interface GamePreferences {
  quality: EffectLevel;
  volume: number;
  haptics: boolean;
  display: 'windowed' | 'fullscreen';
  scenario: ScenarioId;
  seed: number;
  /** Çevrimiçi maçlarda görünen ad; boşsa sunucu ad atar. */
  playerName: string;
  /** Oyuncunun sürdüğü araç; çevrimdışı sandbox ve çevrimiçi katılım bunu kullanır. */
  vehicle: VehicleId;
  /** Savaşta istenen cephe (`FACTION_AUTO`: sunucu dengeye göre seçer). */
  faction: number;
  language: LanguagePreference;
}

const KEY = 'device.voltest.preferences';

function parsePreferences(value: unknown, fallback: GamePreferences): GamePreferences {
  const input = value && typeof value === 'object' ? (value as Partial<GamePreferences>) : {};
  return {
    scenario: isScenario(input.scenario) ? input.scenario : fallback.scenario,
    seed: validSeed(input.seed) ? input.seed : fallback.seed,
    quality: input.quality === 'high' || input.quality === 'low' ? input.quality : fallback.quality,
    volume:
      typeof input.volume === 'number' && Number.isFinite(input.volume)
        ? Math.max(0, Math.min(1, input.volume))
        : fallback.volume,
    haptics: typeof input.haptics === 'boolean' ? input.haptics : fallback.haptics,
    playerName: sanitizeName(input.playerName) ?? fallback.playerName,
    vehicle: isVehicleId(input.vehicle) ? input.vehicle : fallback.vehicle,
    faction:
      Number.isInteger(input.faction) &&
      (input.faction as number) >= FACTION_AUTO &&
      (input.faction as number) < WAR.factions
        ? (input.faction as number)
        : fallback.faction,
    language: LANGUAGES.includes(input.language as LanguagePreference)
      ? (input.language as LanguagePreference)
      : fallback.language,
    display:
      input.display === 'fullscreen' || input.display === 'windowed'
        ? input.display
        : fallback.display,
  };
}

export class GameSettings {
  private readonly state: PersistedObservableState<GamePreferences>;

  constructor(store: ScopedSaveManager, userAgent: string) {
    const initial: GamePreferences = {
      quality: initialEffectLevel(userAgent),
      volume: 1,
      haptics: true,
      display: 'windowed',
      scenario: 'empty',
      seed: SCENARIO.defaultSeed,
      playerName: '',
      vehicle: STRIKER.id,
      faction: FACTION_AUTO,
      language: 'auto',
    };
    this.state = new PersistedObservableState({
      key: KEY,
      initial,
      parse: (value) => parsePreferences(value, initial),
      clone: (value) => ({ ...value }),
      equals: (a, b) =>
        a.quality === b.quality &&
        a.volume === b.volume &&
        a.haptics === b.haptics &&
        a.display === b.display &&
        a.scenario === b.scenario &&
        a.seed === b.seed &&
        a.playerName === b.playerName &&
        a.vehicle === b.vehicle &&
        a.faction === b.faction &&
        a.language === b.language,
      store: {
        load: (_key, fallback) => store.load(KEY, fallback),
        save: (_key, value) => store.save(KEY, value),
      },
    });
  }

  load(): Promise<GamePreferences> {
    return this.state.load();
  }
  get(): GamePreferences {
    return this.state.get();
  }
  update(value: Partial<GamePreferences>): Promise<void> {
    return this.state.update((current) => parsePreferences({ ...current, ...value }, current));
  }
  subscribe(listener: (value: GamePreferences) => void): () => void {
    return this.state.subscribe(listener);
  }
  flush(): Promise<void> {
    return this.state.flush();
  }
  dispose(): void {
    this.state.dispose();
  }
}
