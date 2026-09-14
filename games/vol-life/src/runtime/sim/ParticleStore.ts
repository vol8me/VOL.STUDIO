export interface ParticleSnapshot {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly type: Uint8Array;
  readonly active: Uint8Array;
  readonly stableId: Uint32Array;
  readonly nextStableId: number;
}

export const NO_SLOT = -1;

/**
 * SoA parçacık deposu. Depolama slotu kimlik DEĞİLDİR: pasifleşen slot dizi
 * kaydırmaz, yeniden kullanılan slot yeni `stableId` alır (DESIGN.md §3).
 * Pasif slotun konum/hız içeriği tanımsızdır ve hiçbir tüketici okumaz.
 */
export class ParticleStore {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly previousX: Float32Array;
  readonly previousY: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly forceX: Float32Array;
  readonly forceY: Float32Array;
  readonly type: Uint8Array;
  readonly active: Uint8Array;
  readonly stableId: Uint32Array;
  /** Son tick'te ölçülen kıyı mesafesi (SDF); türetilmiş, snapshot'a girmez. */
  readonly edgeDistance: Float32Array;
  private activeTotal = 0;
  private nextId = 1;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`Parçacık kapasitesi pozitif bir tam sayı olmalı: ${capacity}`);
    }
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.forceX = new Float32Array(capacity);
    this.forceY = new Float32Array(capacity);
    this.type = new Uint8Array(capacity);
    this.active = new Uint8Array(capacity);
    this.stableId = new Uint32Array(capacity);
    this.edgeDistance = new Float32Array(capacity).fill(Number.POSITIVE_INFINITY);
  }

  get activeCount(): number {
    return this.activeTotal;
  }

  get nextStableId(): number {
    return this.nextId;
  }

  /** Boş slot yoksa `NO_SLOT`; kapasite dolu olduğunda yeni madde bekletilir. */
  spawn(x: number, y: number, vx: number, vy: number, type: number): number {
    if (!Number.isInteger(type) || type < 0 || type > 255) {
      throw new RangeError(`Parçacık türü bayt aralığında olmalı: ${type}`);
    }
    if (![x, y, vx, vy].every(Number.isFinite)) {
      throw new RangeError('Yeni madde sonlu konum ve hızla doğar.');
    }
    const slot = this.active.indexOf(0);
    if (slot === NO_SLOT) return NO_SLOT;
    if (this.nextId > 0xffffffff) throw new RangeError('Stable ID alanı tükendi.');
    this.x[slot] = x;
    this.y[slot] = y;
    this.previousX[slot] = x;
    this.previousY[slot] = y;
    this.vx[slot] = vx;
    this.vy[slot] = vy;
    this.forceX[slot] = 0;
    this.forceY[slot] = 0;
    this.type[slot] = type;
    this.edgeDistance[slot] = Number.POSITIVE_INFINITY;
    this.active[slot] = 1;
    this.stableId[slot] = this.nextId++;
    this.activeTotal++;
    return slot;
  }

  /** Geri dönüşsüz: slot pasifleşir, ID bir daha kullanılmaz; ikinci çağrı sessizdir. */
  deactivate(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) {
      throw new RangeError(`Slot kapasite dışında: ${slot}`);
    }
    if (this.active[slot] === 0) return;
    this.active[slot] = 0;
    this.activeTotal--;
  }

  snapshot(): ParticleSnapshot {
    return {
      x: this.x.slice(),
      y: this.y.slice(),
      vx: this.vx.slice(),
      vy: this.vy.slice(),
      type: this.type.slice(),
      active: this.active.slice(),
      stableId: this.stableId.slice(),
      nextStableId: this.nextId,
    };
  }

  capturePrevious(): void {
    this.previousX.set(this.x);
    this.previousY.set(this.y);
  }

  restore(snapshot: ParticleSnapshot): void {
    validateParticleSnapshot(snapshot, this.capacity);
    this.x.set(snapshot.x);
    this.y.set(snapshot.y);
    this.capturePrevious();
    this.vx.set(snapshot.vx);
    this.vy.set(snapshot.vy);
    this.type.set(snapshot.type);
    this.active.set(snapshot.active);
    this.stableId.set(snapshot.stableId);
    this.nextId = snapshot.nextStableId;
    this.forceX.fill(0);
    this.forceY.fill(0);
    this.edgeDistance.fill(Number.POSITIVE_INFINITY);
    let total = 0;
    for (let slot = 0; slot < this.capacity; slot++) total += snapshot.active[slot];
    this.activeTotal = total;
  }
}

/** Uzunluk, sonluluk, aktif bayrak, ID tekilliği ve sayaç tutarlılığı; canlı state'e dokunmaz. */
export function validateParticleSnapshot(snapshot: ParticleSnapshot, capacity: number): void {
  const arrays = [
    snapshot.x,
    snapshot.y,
    snapshot.vx,
    snapshot.vy,
    snapshot.type,
    snapshot.active,
    snapshot.stableId,
  ];
  if (arrays.some((array) => array.length !== capacity)) {
    throw new RangeError(`Parçacık snapshotı ${capacity} değer taşımalı`);
  }
  if (!Number.isInteger(snapshot.nextStableId) || snapshot.nextStableId < 1) {
    throw new RangeError('Sonraki stable ID pozitif tam sayı olmalı.');
  }
  const seen = new Set<number>();
  for (let slot = 0; slot < capacity; slot++) {
    const flag = snapshot.active[slot];
    if (flag !== 0 && flag !== 1) throw new RangeError(`Aktif bayrağı 0/1 olmalı: slot ${slot}`);
    if (flag === 0) continue;
    if (
      !Number.isFinite(snapshot.x[slot]) ||
      !Number.isFinite(snapshot.y[slot]) ||
      !Number.isFinite(snapshot.vx[slot]) ||
      !Number.isFinite(snapshot.vy[slot])
    ) {
      throw new RangeError(`Aktif parçacık sonlu konum ve hız taşımalı: slot ${slot}`);
    }
    const id = snapshot.stableId[slot];
    if (id < 1 || id >= snapshot.nextStableId || seen.has(id)) {
      throw new RangeError(`Stable ID tekil ve sayacın altında olmalı: slot ${slot}`);
    }
    seen.add(id);
  }
}
