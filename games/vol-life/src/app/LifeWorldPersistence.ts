import { DisposableScope, observeAppVisibility, type AppVisibilityState } from '@volstudio/core';
import {
  cloneSubstrateConfig,
  fingerprintSubstrateConfig,
  type SubstrateConfig,
} from '@/config/substrate';
import {
  decodeLifeWorldSnapshot,
  encodeLifeWorldSnapshot,
  type LifeWorldSaveEnvelope,
} from '@/app/LifeWorldSnapshotCodec';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { validateLifeWorldSnapshot } from '@/runtime/sim/LifeWorldSnapshotValidation';

const STORAGE_KEY = 'vol-life:world';
const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

export interface LifeWorldSnapshotSource {
  snapshot(): LifeWorldSnapshot;
}

/** Kayıt yokken ya da güvenle yüklenemediğinde neden; kullanıcıya i18n ile söylenir. */
export type LifeWorldLoadIssue = 'incompatible' | 'corrupt';

export interface LifeWorldLoadResult {
  readonly snapshot: LifeWorldSnapshot | null;
  readonly issue: LifeWorldLoadIssue | null;
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
  private readonly config: SubstrateConfig;

  constructor(
    private readonly store: LifeWorldStore,
    config: SubstrateConfig,
  ) {
    this.config = cloneSubstrateConfig(config);
    this.configFingerprint = fingerprintSubstrateConfig(this.config);
  }

  /** Okunamayan kayıt yeni dünyayı ENGELLEMEZ; nedeni sonuçta taşınır. */
  async load(): Promise<LifeWorldLoadResult> {
    try {
      const value = await this.store.load<LifeWorldSaveEnvelope | null>(STORAGE_KEY, null);
      const result = await decodeLifeWorldSnapshot(value, this.configFingerprint);
      if (result.kind === 'none') return { snapshot: null, issue: null };
      if (result.kind === 'incompatible') {
        console.warn(`[VOL.LIFE] Dünya kaydı uyumsuz (${result.reason}); yeni dünya başlatılıyor.`);
        return { snapshot: null, issue: 'incompatible' };
      }
      validateLifeWorldSnapshot(result.snapshot, this.config);
      return { snapshot: result.snapshot, issue: null };
    } catch (error) {
      console.warn('[VOL.LIFE] Dünya kaydı okunamadı; yeni dünya başlatılıyor:', error);
      return { snapshot: null, issue: 'corrupt' };
    }
  }

  async save(snapshot: LifeWorldSnapshot): Promise<void> {
    validateLifeWorldSnapshot(snapshot, this.config);
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
