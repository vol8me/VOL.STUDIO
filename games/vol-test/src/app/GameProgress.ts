import { AutosaveCoordinator, type ScopedSaveManager } from '@volstudio/core';

export interface ProgressSnapshot {
  readonly distance: number;
  readonly shots: number;
}

function valid(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export class GameProgress {
  private distance = 0;
  private shots = 0;
  private autosave: AutosaveCoordinator<ProgressSnapshot> | null = null;

  constructor(private readonly store: ScopedSaveManager) {}

  async load(): Promise<void> {
    const value: unknown = await this.store.load('synced.voltest.progress', {});
    const record = value && typeof value === 'object' ? (value as Partial<ProgressSnapshot>) : {};
    this.distance = valid(record.distance);
    this.shots = Math.floor(valid(record.shots));
    this.autosave = new AutosaveCoordinator({
      capture: () => this.get(),
      save: (snapshot) => this.store.save('synced.voltest.progress', snapshot),
      onError: (error) => console.warn('[VOL.TEST] İlerleme kaydedilemedi:', error),
    });
  }

  travel(distance: number): void {
    this.distance += valid(distance);
  }
  fired(): void {
    this.shots++;
  }
  get(): ProgressSnapshot {
    return { distance: this.distance, shots: this.shots };
  }
  flush(): Promise<void> {
    return this.autosave?.flush() ?? Promise.resolve();
  }
  dispose(): void {
    this.autosave?.stop();
    this.autosave = null;
  }
}
