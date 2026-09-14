import { DisposableScope, observeAppVisibility, type AppVisibilityState } from '@volstudio/core';
import {
  cloneParticleConfig,
  validateParticleConfig,
  type ParticleConfig,
} from '@/config/particles';
import { cloneWorldConfig, validateWorldConfig, type WorldConfig } from '@/config/world';
import {
  decodeLifeWorldSnapshot,
  encodeLifeWorldSnapshot,
  type LifeWorldSaveEnvelope,
} from '@/app/LifeWorldSnapshotCodec';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { validateLifeWorldSnapshot } from '@/runtime/sim/LifeWorldSnapshotValidation';
import { validateWorldGeometry } from '@/runtime/sim/WorldBounds';

const STORAGE_KEY = 'vol-life:world';
const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

export interface LifeWorldSnapshotSource {
  snapshot(): LifeWorldSnapshot;
}

export interface LifeWorldStore {
  load<T>(key: string, fallback: T): Promise<T>;
  save<T>(key: string, value: T): Promise<void>;
}

export interface LifeWorldAutosaveOptions {
  readonly intervalMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly observeVisibility?: (listener: (state: AppVisibilityState) => void) => () => void;
}

export class LifeWorldPersistence {
  readonly configFingerprint: string;
  private readonly worldConfig: WorldConfig;
  private readonly particleConfig: ParticleConfig;

  constructor(
    private readonly store: LifeWorldStore,
    worldConfig: WorldConfig,
    particleConfig: ParticleConfig,
  ) {
    this.worldConfig = cloneWorldConfig(worldConfig);
    this.particleConfig = cloneParticleConfig(particleConfig);
    this.configFingerprint = createWorldConfigFingerprint(this.worldConfig, this.particleConfig);
  }

  async load(): Promise<LifeWorldSnapshot | null> {
    try {
      const value = await this.store.load<LifeWorldSaveEnvelope | null>(STORAGE_KEY, null);
      const snapshot = await decodeLifeWorldSnapshot(value, this.configFingerprint);
      if (snapshot) validateLifeWorldSnapshot(snapshot, this.worldConfig, this.particleConfig);
      return snapshot;
    } catch (error) {
      console.warn('[VOL.LIFE] Dünya kaydı okunamadı; yeni dünya başlatılıyor:', error);
      return null;
    }
  }

  async save(snapshot: LifeWorldSnapshot): Promise<void> {
    validateLifeWorldSnapshot(snapshot, this.worldConfig, this.particleConfig);
    const envelope = await encodeLifeWorldSnapshot(snapshot, this.configFingerprint);
    await this.store.save(STORAGE_KEY, envelope);
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
  private pending: PendingSave | null = null;
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
    try {
      this.scope.addInterval(() => this.requestSave(), intervalMs);
      const observe = options.observeVisibility ?? observeAppVisibility;
      this.scope.addSubscription(
        observe((state) => {
          if (state === 'background') this.requestSave();
        }),
      );
    } catch (error) {
      this.scope.dispose();
      throw error;
    }
  }

  requestSave(): void {
    if (this.destroyed) return;
    const snapshot = this.captureSnapshot();
    if (snapshot) this.enqueue(snapshot);
  }

  flush(): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new Error('Kapatılmış otomatik kayıt kuyruğu flush edilemez.'));
    }
    let snapshot: LifeWorldSnapshot;
    try {
      snapshot = this.source.snapshot();
    } catch (error) {
      this.reportError(error);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return new Promise((resolve, reject) => {
      this.enqueue(snapshot, { resolve, reject });
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    const snapshot = this.captureSnapshot();
    this.destroyed = true;
    this.scope.dispose();
    if (snapshot) this.enqueue(snapshot);
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
      const batch = this.pending;
      this.pending = null;
      try {
        await this.persistence.save(batch.snapshot);
        for (const waiter of batch.waiters) waiter.resolve();
      } catch (error) {
        this.reportError(error);
        for (const waiter of batch.waiters) waiter.reject(error);
      }
    }
  }

  private enqueue(snapshot: LifeWorldSnapshot, waiter?: SaveWaiter): void {
    if (this.pending) {
      this.pending.snapshot = snapshot;
      if (waiter) this.pending.waiters.push(waiter);
    } else {
      this.pending = { snapshot, waiters: waiter ? [waiter] : [] };
    }
    this.startDrain();
  }

  private captureSnapshot(): LifeWorldSnapshot | null {
    try {
      return this.source.snapshot();
    } catch (error) {
      this.reportError(error);
      return null;
    }
  }

  private reportError(error: unknown): void {
    console.warn('[VOL.LIFE] Dünya otomatik kaydedilemedi:', error);
    try {
      this.options.onError?.(error);
    } catch (callbackError) {
      console.error('[VOL.LIFE] Kayıt hata dinleyicisi başarısız oldu:', callbackError);
    }
  }
}

interface PendingSave {
  snapshot: LifeWorldSnapshot;
  readonly waiters: SaveWaiter[];
}

interface SaveWaiter {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

export function createWorldConfigFingerprint(
  worldConfig: WorldConfig,
  particleConfig: ParticleConfig,
): string {
  validateWorldConfig(worldConfig);
  validateParticleConfig(particleConfig);
  validateWorldGeometry(
    worldConfig.boundsUnits,
    worldConfig.particleCollisionInsetUnits,
    particleConfig.cellSizeUnits,
  );
  const serialized = JSON.stringify({
    worldConfig,
    particleConfig: {
      ...particleConfig,
      interactionMatrix: Array.from(particleConfig.interactionMatrix),
      roleByType: Array.from(particleConfig.roleByType),
      interactionRadiusByRolePair: Array.from(particleConfig.interactionRadiusByRolePair),
    },
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `life-world-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
