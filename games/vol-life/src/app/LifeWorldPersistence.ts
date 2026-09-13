import {
  DisposableScope,
  observeAppVisibility,
  type AppVisibilityState,
  type SaveManager,
} from '@volstudio/core';
import type { ParticleConfig } from '@/config/particles';
import type { WorldConfig } from '@/config/world';
import {
  decodeLifeWorldSnapshot,
  encodeLifeWorldSnapshot,
  type LifeWorldSaveEnvelope,
} from '@/app/LifeWorldSnapshotCodec';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';

const STORAGE_KEY = 'vol-life:world';
const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

export interface LifeWorldSnapshotSource {
  snapshot(): LifeWorldSnapshot;
}

export interface LifeWorldAutosaveOptions {
  readonly intervalMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly observeVisibility?: (listener: (state: AppVisibilityState) => void) => () => void;
}

export class LifeWorldPersistence {
  readonly configFingerprint: string;

  constructor(
    private readonly saveManager: SaveManager,
    worldConfig: WorldConfig,
    particleConfig: ParticleConfig,
  ) {
    this.configFingerprint = createWorldConfigFingerprint(worldConfig, particleConfig);
  }

  async load(): Promise<LifeWorldSnapshot | null> {
    try {
      const value = await this.saveManager.load<LifeWorldSaveEnvelope | null>(STORAGE_KEY, null);
      return await decodeLifeWorldSnapshot(value, this.configFingerprint);
    } catch (error) {
      console.warn('[VOL.LIFE] Dünya kaydı okunamadı; yeni dünya başlatılıyor:', error);
      return null;
    }
  }

  async save(snapshot: LifeWorldSnapshot): Promise<void> {
    const envelope = await encodeLifeWorldSnapshot(snapshot, this.configFingerprint);
    await this.saveManager.save(STORAGE_KEY, envelope);
  }

  attach(
    source: LifeWorldSnapshotSource,
    options: LifeWorldAutosaveOptions = {},
  ): LifeWorldAutosave {
    return new LifeWorldAutosave(this, source, options);
  }
}

export class LifeWorldAutosave {
  private readonly scope = new DisposableScope();
  private pending: LifeWorldSnapshot | null = null;
  private running: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly persistence: Pick<LifeWorldPersistence, 'save'>,
    private readonly source: LifeWorldSnapshotSource,
    private readonly options: LifeWorldAutosaveOptions = {},
  ) {
    const intervalMs = options.intervalMs ?? DEFAULT_AUTOSAVE_INTERVAL_MS;
    if (!(intervalMs > 0) || !Number.isFinite(intervalMs)) {
      throw new RangeError(`Otomatik kayıt aralığı pozitif ve sonlu olmalı: ${intervalMs}`);
    }
    this.scope.addInterval(() => this.requestSave(), intervalMs);
    const observe = options.observeVisibility ?? observeAppVisibility;
    this.scope.addSubscription(
      observe((state) => {
        if (state === 'background') this.requestSave();
      }),
    );
  }

  requestSave(): void {
    this.pending = this.source.snapshot();
    this.startDrain();
  }

  async flush(): Promise<void> {
    this.requestSave();
    while (this.running) await this.running;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.requestSave();
    this.destroyed = true;
    this.scope.dispose();
  }

  private startDrain(): void {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.pending) this.startDrain();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      try {
        await this.persistence.save(snapshot);
      } catch (error) {
        console.warn('[VOL.LIFE] Dünya otomatik kaydedilemedi:', error);
        this.options.onError?.(error);
      }
    }
  }
}

export function createWorldConfigFingerprint(
  worldConfig: WorldConfig,
  particleConfig: ParticleConfig,
): string {
  const serialized = JSON.stringify({
    worldConfig,
    particleConfig: {
      ...particleConfig,
      interactionMatrix: Array.from(particleConfig.interactionMatrix),
    },
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `life-world-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
