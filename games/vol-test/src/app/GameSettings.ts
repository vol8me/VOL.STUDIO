import { PersistedObservableState, type ScopedSaveManager } from '@volstudio/core';
import { isScenario, validSeed, SCENARIO, type ScenarioId } from '@/config/scenarios';
import { initialEffectLevel, type EffectLevel } from '@/config/quality';

export interface GamePreferences {
  quality: EffectLevel;
  volume: number;
  haptics: boolean;
  display: 'windowed' | 'fullscreen';
  scenario: ScenarioId;
  seed: number;
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
        a.seed === b.seed,
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
