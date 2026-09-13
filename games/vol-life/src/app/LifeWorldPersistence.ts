import { DisposableScope, observeAppVisibility, type AppVisibilityState } from '@volstudio/core';
import { PARTICLE_TYPE_COUNT, type ParticleConfig } from '@/config/particles';
import type { WorldConfig } from '@/config/world';
import {
  decodeLifeWorldSnapshot,
  encodeLifeWorldSnapshot,
  type LifeWorldSaveEnvelope,
} from '@/app/LifeWorldSnapshotCodec';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { resolveParticleBounds } from '@/runtime/sim/WorldBounds';

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

  constructor(
    private readonly store: LifeWorldStore,
    private readonly worldConfig: WorldConfig,
    private readonly particleConfig: ParticleConfig,
  ) {
    this.configFingerprint = createWorldConfigFingerprint(worldConfig, particleConfig);
  }

  async load(): Promise<LifeWorldSnapshot | null> {
    try {
      const value = await this.store.load<LifeWorldSaveEnvelope | null>(STORAGE_KEY, null);
      const snapshot = await decodeLifeWorldSnapshot(value, this.configFingerprint);
      if (snapshot) validateWorldSnapshot(snapshot, this.worldConfig, this.particleConfig);
      return snapshot;
    } catch (error) {
      console.warn('[VOL.LIFE] Dünya kaydı okunamadı; yeni dünya başlatılıyor:', error);
      return null;
    }
  }

  async save(snapshot: LifeWorldSnapshot): Promise<void> {
    validateWorldSnapshot(snapshot, this.worldConfig, this.particleConfig);
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

function validateWorldSnapshot(
  snapshot: LifeWorldSnapshot,
  worldConfig: WorldConfig,
  particleConfig: ParticleConfig,
): void {
  const fieldLength = worldConfig.fieldResolution ** 2;
  if (
    snapshot.nutrientDiffusionSource.length !== fieldLength ||
    Object.values(snapshot.fields).some((field) => field.length !== fieldLength)
  ) {
    throw new RangeError('Dünya kaydının alan çözünürlüğü yapılandırmayla uyuşmuyor.');
  }
  if (
    !Number.isSafeInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    !Number.isInteger(snapshot.nextFieldBand) ||
    snapshot.nextFieldBand < 0 ||
    snapshot.nextFieldBand >= worldConfig.fieldUpdateBands
  ) {
    throw new RangeError('Dünya kaydının zaman bilgisi geçersiz.');
  }
  const { particles } = snapshot;
  if (
    particles.x.length !== particleConfig.count ||
    particles.y.length !== particleConfig.count ||
    particles.vx.length !== particleConfig.count ||
    particles.vy.length !== particleConfig.count ||
    particles.type.length !== particleConfig.count
  ) {
    throw new RangeError('Dünya kaydının parçacık sayısı yapılandırmayla uyuşmuyor.');
  }
  const bounds = resolveParticleBounds(worldConfig.boundsUnits, worldConfig.boundaryThicknessUnits);
  const minX = bounds.x + particleConfig.radiusUnits;
  const maxX = bounds.x + bounds.width - particleConfig.radiusUnits;
  const minY = bounds.y + particleConfig.radiusUnits;
  const maxY = bounds.y + bounds.height - particleConfig.radiusUnits;
  const maxSpeedSquared = (particleConfig.maxSpeedUnitsPerReferenceTick + 1e-5) ** 2;
  for (let index = 0; index < particles.x.length; index++) {
    const x = particles.x[index];
    const y = particles.y[index];
    const vx = particles.vx[index];
    const vy = particles.vy[index];
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(vx) ||
      !Number.isFinite(vy) ||
      x < minX ||
      x > maxX ||
      y < minY ||
      y > maxY ||
      vx * vx + vy * vy > maxSpeedSquared ||
      particles.type[index] >= PARTICLE_TYPE_COUNT
    ) {
      throw new RangeError(`Dünya kaydındaki ${index}. parçacık geçersiz.`);
    }
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
    this.scope.addInterval(() => this.requestSave(), intervalMs);
    const observe = options.observeVisibility ?? observeAppVisibility;
    this.scope.addSubscription(
      observe((state) => {
        if (state === 'background') this.requestSave();
      }),
    );
  }

  requestSave(): void {
    if (this.destroyed) return;
    this.enqueue(this.source.snapshot());
  }

  flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.enqueue(this.source.snapshot(), { resolve, reject });
    });
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
      const batch = this.pending;
      this.pending = null;
      try {
        await this.persistence.save(batch.snapshot);
        for (const waiter of batch.waiters) waiter.resolve();
      } catch (error) {
        console.warn('[VOL.LIFE] Dünya otomatik kaydedilemedi:', error);
        for (const waiter of batch.waiters) waiter.reject(error);
        try {
          this.options.onError?.(error);
        } catch (callbackError) {
          console.error('[VOL.LIFE] Kayıt hata dinleyicisi başarısız oldu:', callbackError);
        }
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
