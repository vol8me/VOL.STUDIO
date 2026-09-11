import type { SaveManager } from '@volstudio/core';
import type { DisplayMode } from '@volstudio/tauri-v2';
import { displayConfig } from '@/config/display';

const STORAGE_KEY = 'vol-life:preferences';

export interface LifePreferenceState {
  readonly displayMode: DisplayMode;
  readonly showFps: boolean;
  readonly hapticsEnabled: boolean;
}

export const DEFAULT_LIFE_PREFERENCES: LifePreferenceState = {
  displayMode: displayConfig.defaultDisplayMode,
  showFps: false,
  hapticsEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'windowed' || value === 'fullscreen';
}

/** VOL.LIFE kullanıcı seçeneklerinin tek kalıcı ve gözlemlenebilir deposu. */
export class LifePreferences {
  private state: LifePreferenceState = DEFAULT_LIFE_PREFERENCES;
  private readonly listeners = new Set<(state: LifePreferenceState) => void>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly saveManager: SaveManager) {}

  async load(): Promise<void> {
    try {
      const stored = await this.saveManager.load<unknown>(STORAGE_KEY, undefined);
      this.state = this.parse(stored);
    } catch (error) {
      this.state = DEFAULT_LIFE_PREFERENCES;
      console.warn('[VOL.LIFE] Tercihler okunamadı, varsayılanlar kullanılıyor:', error);
    }
  }

  get(): LifePreferenceState {
    return { ...this.state };
  }

  getDisplayMode(): DisplayMode {
    return this.state.displayMode;
  }

  setDisplayMode(displayMode: DisplayMode): Promise<void> {
    return this.update({ displayMode });
  }

  setShowFps(showFps: boolean): Promise<void> {
    return this.update({ showFps });
  }

  setHapticsEnabled(hapticsEnabled: boolean): Promise<void> {
    return this.update({ hapticsEnabled });
  }

  subscribe(listener: (state: LifePreferenceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<LifePreferenceState>): Promise<void> {
    const next = { ...this.state, ...patch };
    if (
      next.displayMode === this.state.displayMode &&
      next.showFps === this.state.showFps &&
      next.hapticsEnabled === this.state.hapticsEnabled
    ) {
      return this.writeQueue;
    }

    this.state = next;
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
    this.writeQueue = this.writeQueue
      .then(() => this.saveManager.save(STORAGE_KEY, snapshot))
      .catch((error: unknown) => {
        console.warn('[VOL.LIFE] Tercihler kaydedilemedi:', error);
      });
    return this.writeQueue;
  }

  private parse(value: unknown): LifePreferenceState {
    if (!isRecord(value)) return DEFAULT_LIFE_PREFERENCES;
    return {
      displayMode: isDisplayMode(value.displayMode)
        ? value.displayMode
        : DEFAULT_LIFE_PREFERENCES.displayMode,
      showFps:
        typeof value.showFps === 'boolean' ? value.showFps : DEFAULT_LIFE_PREFERENCES.showFps,
      hapticsEnabled:
        typeof value.hapticsEnabled === 'boolean'
          ? value.hapticsEnabled
          : DEFAULT_LIFE_PREFERENCES.hapticsEnabled,
    };
  }
}
