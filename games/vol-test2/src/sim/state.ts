import { BELT, ITEM_COUNT, KIND, UNIT_POOL, WORLD } from '@/config/factory';

/** Yön 0=doğu, 1=güney, 2=batı, 3=kuzey. */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

/** Havuzdaki sabit birim nesnesi; `alive` olmayan yuva boştur. */
export class Unit {
  x = 0;
  y = 0;
  hp = 0;
  kind = 0;
  alive = false;
  constructor(readonly slot: number) {}
}

/**
 * Simülasyonun bütün kalıcı durumu. Büyük diziler tile başına düz tiplenmiş
 * dizidir; nesne tahsisi ve Map yoktur. Anlık görüntü ve karma bu alanların
 * tamamını kapsar; türetilmiş listeler (`beltList`, `machineList`, yol alanı)
 * kapsanmaz ve geri yüklemede yeniden kurulur.
 */
export class FactoryState {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  readonly chunksX: number;
  readonly chunksY: number;

  tick = 0;
  nextWaveTick = 0;
  wave = 0;
  defeats = 0;
  coreHp = 0;
  /** Yol alanının son hesaplandığı adım ve yeniden hesap bekleyip beklemediği. */
  flowTick = -1;
  flowDirty = true;

  /** Arazi: cevher var mı. */
  readonly ore: Uint8Array;
  readonly kind: Uint8Array;
  readonly rot: Uint8Array;
  readonly team: Uint8Array;
  readonly hp: Uint16Array;
  /** Matkap/işleyici/taret zamanlayıcısı. */
  readonly timer: Uint16Array;
  /** İşleyici cevher deposu veya taret mühimmatı. */
  readonly bufA: Uint8Array;
  /** İşleyici çıkış deposu. */
  readonly bufOut: Uint8Array;
  readonly beltCount: Uint8Array;
  readonly beltItem: Uint8Array;
  readonly beltPos: Uint16Array;

  readonly inventory = new Uint32Array(ITEM_COUNT);
  /** Çekirdeğe ulaşan toplam eşya (ölçüm). */
  readonly delivered = new Uint32Array(ITEM_COUNT);

  readonly units: Unit[];
  readonly unitGen: Uint8Array;
  readonly freeUnits: Int32Array;
  freeCount = 0;
  aliveUnits = 0;

  // --- Türetilmiş (anlık görüntüye girmez) ---
  readonly chunkOfTile: Uint16Array;
  /** Chunk yapı sürümü: kind/rot/hp niceliği değişince artar. */
  readonly chunkVersion: Uint32Array;
  /** Hasar niceliği bekleyen chunk. */
  readonly chunkHpDirty: Uint8Array;
  /** Chunk içindeki bant eşyası sayısı (bu adımın sonunda). */
  readonly chunkItems: Uint16Array;
  beltList: Int32Array;
  beltListLength = 0;
  machineList: Int32Array;
  machineListLength = 0;
  listsDirty = true;
  readonly flowDir: Int8Array;

  constructor(width: number = WORLD.width, height: number = WORLD.height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
      throw new RangeError('Dünya boyutu pozitif tam sayı olmalı.');
    if (width % WORLD.chunk !== 0 || height % WORLD.chunk !== 0)
      throw new RangeError('Dünya boyutu chunk kenarının katı olmalı.');
    this.width = width;
    this.height = height;
    this.count = width * height;
    this.chunksX = width / WORLD.chunk;
    this.chunksY = height / WORLD.chunk;
    const n = this.count;
    this.ore = new Uint8Array(n);
    this.kind = new Uint8Array(n);
    this.rot = new Uint8Array(n);
    this.team = new Uint8Array(n);
    this.hp = new Uint16Array(n);
    this.timer = new Uint16Array(n);
    this.bufA = new Uint8Array(n);
    this.bufOut = new Uint8Array(n);
    this.beltCount = new Uint8Array(n);
    this.beltItem = new Uint8Array(n * BELT.slots);
    this.beltPos = new Uint16Array(n * BELT.slots);
    this.units = Array.from({ length: UNIT_POOL }, (_, slot) => new Unit(slot));
    this.unitGen = new Uint8Array(UNIT_POOL);
    this.freeUnits = new Int32Array(UNIT_POOL);
    this.resetUnits();
    this.chunkOfTile = new Uint16Array(n);
    const chunks = this.chunksX * this.chunksY;
    this.chunkVersion = new Uint32Array(chunks).fill(1);
    this.chunkHpDirty = new Uint8Array(chunks);
    this.chunkItems = new Uint16Array(chunks);
    this.beltList = new Int32Array(1024);
    this.machineList = new Int32Array(1024);
    this.flowDir = new Int8Array(n).fill(-1);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        this.chunkOfTile[y * width + x] =
          Math.floor(y / WORLD.chunk) * this.chunksX + Math.floor(x / WORLD.chunk);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    );
  }

  get chunkCount(): number {
    return this.chunksX * this.chunksY;
  }

  /** Çekirdeğin sol-üst tile'ı; çekirdek dünya merkezindedir. */
  get coreOrigin(): { x: number; y: number } {
    return {
      x: Math.floor((this.width - WORLD.coreSize) / 2),
      y: Math.floor((this.height - WORLD.coreSize) / 2),
    };
  }

  /** Çekirdek merkezi (tile uzayında, kesirli). */
  get coreCenter(): { x: number; y: number } {
    const origin = this.coreOrigin;
    return { x: origin.x + WORLD.coreSize / 2, y: origin.y + WORLD.coreSize / 2 };
  }

  /** Yapı değişti: chunk sürümünü artırır ve listeleri geçersiz kılar. */
  touchStructure(tile: number): void {
    this.chunkVersion[this.chunkOfTile[tile]]++;
    this.listsDirty = true;
  }

  /** Hasar değişti: sürüm artışı tick sonunda birleştirilir. */
  touchHp(tile: number): void {
    this.chunkHpDirty[this.chunkOfTile[tile]] = 1;
  }

  resetUnits(): void {
    for (const unit of this.units) unit.alive = false;
    for (let slot = 0; slot < UNIT_POOL; slot++) this.freeUnits[slot] = UNIT_POOL - 1 - slot;
    this.freeCount = UNIT_POOL;
    this.aliveUnits = 0;
  }

  /** Boş yuva yoksa `null`. Yuva kimliği yeniden kullanıldığında `gen` artar. */
  allocateUnit(kind: number, x: number, y: number, hp: number): Unit | null {
    if (this.freeCount === 0) return null;
    const slot = this.freeUnits[--this.freeCount];
    const unit = this.units[slot];
    unit.alive = true;
    unit.kind = kind;
    unit.x = x;
    unit.y = y;
    unit.hp = hp;
    this.unitGen[slot] = (this.unitGen[slot] + 1) & 0xff;
    this.aliveUnits++;
    return unit;
  }

  releaseUnit(unit: Unit): void {
    if (!unit.alive) return;
    unit.alive = false;
    this.freeUnits[this.freeCount++] = unit.slot;
    this.aliveUnits--;
  }

  /** Yapılar arasında ileri sürümlü listeleri (bant, makine) tile sırasıyla kurar. */
  rebuildLists(): void {
    let belts = 0;
    let machines = 0;
    for (let tile = 0; tile < this.count; tile++) {
      const kind = this.kind[tile];
      if (kind === KIND.conveyor) belts++;
      else if (kind === KIND.drill || kind === KIND.smelter || kind === KIND.turret) machines++;
    }
    if (this.beltList.length < belts) this.beltList = new Int32Array(growTo(belts));
    if (this.machineList.length < machines) this.machineList = new Int32Array(growTo(machines));
    let b = 0;
    let m = 0;
    for (let tile = 0; tile < this.count; tile++) {
      const kind = this.kind[tile];
      if (kind === KIND.conveyor) this.beltList[b++] = tile;
      else if (kind === KIND.drill || kind === KIND.smelter || kind === KIND.turret)
        this.machineList[m++] = tile;
    }
    this.beltListLength = b;
    this.machineListLength = m;
    this.listsDirty = false;
  }
}

function growTo(minimum: number): number {
  let size = 1024;
  while (size < minimum) size *= 2;
  return size;
}
