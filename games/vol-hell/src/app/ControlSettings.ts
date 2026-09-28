import { PersistedObservableState, type ScopedSaveManager } from '@volstudio/core';
import { reportPersistenceFailure } from './settingsPersistence';

export interface ControlSettingsData {
  autoAim: boolean;
}

const STORAGE_KEY = 'device.vol-hell:control-settings' as const;

function parse(stored: unknown): ControlSettingsData {
  const raw = stored as Partial<ControlSettingsData> | null;
  return { autoAim: typeof raw?.autoAim === 'boolean' ? raw.autoAim : false };
}

export class ControlSettings {
  private readonly persisted: PersistedObservableState<ControlSettingsData>;

  constructor(store: ScopedSaveManager) {
    this.persisted = new PersistedObservableState<ControlSettingsData>({
      store,
      key: STORAGE_KEY,
      initial: parse(null),
      parse,
      clone: (data) => ({ ...data }),
      equals: (left, right) => left.autoAim === right.autoAim,
      onError: (error, operation) => {
        if (operation === 'save') reportPersistenceFailure(STORAGE_KEY, error);
      },
    });
  }

  async load(): Promise<void> {
    await this.persisted.load();
  }

  flush(): Promise<void> {
    return this.persisted.flush();
  }

  isAutoAimEnabled(): boolean {
    return this.persisted.get().autoAim;
  }

  setAutoAimEnabled(autoAim: boolean): Promise<void> {
    return this.persisted.update(() => ({ autoAim }));
  }

  onChange(listener: (data: ControlSettingsData) => void): () => void {
    return this.persisted.subscribe(listener);
  }

  dispose(): void {
    this.persisted.dispose();
  }
}
