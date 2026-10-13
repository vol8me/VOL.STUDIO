import { BELT } from '@/config/factory';
import { ByteReader } from './bytes';
import {
  CHUNK,
  CHUNK_TILES,
  POS_SCALE,
  SECTION,
  SHOT_RECORD_BYTES,
  readHud,
  type ChunkRect,
  type Hud,
  type Welcome,
} from './protocol';

/** Uzaktaki birimin son iki konumu; çizim bunlar arasında kayar. */
export interface RemoteUnit {
  readonly slot: number;
  gen: number;
  kind: number;
  /** Can oranı, 0-1. */
  health: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Son güncellemenin yerel varış zamanı (ms). */
  at: number;
  seen: number;
}

export interface RemoteShot {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly at: number;
}

/**
 * İstemcideki dünya kopyası. Sunucu çerçevelerini uygular; yalnız ilgi alanı içindeki chunk'lar
 * canlıdır. Her bağlantıda (yeniden bağlanma dahil) `reset` ile sıfırdan başlar: sunucu da yeni
 * oturumda her şeyi yeniden gönderir.
 */
export class Replica {
  welcome: Welcome | null = null;
  hud: Hud | null = null;
  rect: ChunkRect | null = null;
  tick = 0;

  kind = new Uint8Array(0);
  rot = new Uint8Array(0);
  ore = new Uint8Array(0);
  hp = new Uint8Array(0);
  chunkVersion = new Uint32Array(0);
  beltCount = new Uint8Array(0);
  beltItem = new Uint8Array(0);
  beltPos = new Uint16Array(0);

  readonly units = new Map<number, RemoteUnit>();
  /** Son çerçevelerdeki atışlar; çizim bunları kısa süre gösterir. */
  readonly shots: RemoteShot[] = [];

  private width = 0;
  private height = 0;
  private chunksX = 0;
  private generation = 0;

  reset(welcome: Welcome): void {
    this.welcome = welcome;
    this.width = welcome.width;
    this.height = welcome.height;
    this.chunksX = welcome.width / welcome.chunk;
    const count = welcome.width * welcome.height;
    this.kind = new Uint8Array(count);
    this.rot = new Uint8Array(count);
    this.ore = new Uint8Array(count);
    this.hp = new Uint8Array(count);
    this.chunkVersion = new Uint32Array(this.chunksX * (welcome.height / welcome.chunk));
    this.beltCount = new Uint8Array(count);
    this.beltItem = new Uint8Array(count * BELT.slots);
    this.beltPos = new Uint16Array(count * BELT.slots);
    this.units.clear();
    this.shots.length = 0;
    this.rect = null;
    this.hud = null;
    this.tick = welcome.tick;
  }

  /** Çerçeveyi uygular. Bozuk paket `RangeError` verir; çağıran bağlantıyı kapatmalıdır. */
  apply(frame: Uint8Array, now: number): void {
    if (this.welcome === null) throw new RangeError('Çerçeve karşılama olmadan geldi.');
    const input = new ByteReader(frame);
    this.tick = input.u32();
    const sections = input.u8();
    for (let index = 0; index < sections; index++) {
      const tag = input.u8();
      const length = input.u32();
      const body = new ByteReader(input.bytes(length));
      switch (tag) {
        case SECTION.structure:
          this.applyStructure(body);
          break;
        case SECTION.dynamics:
          this.applyDynamics(body, now);
          break;
        case SECTION.belts:
          this.applyBelts(body);
          break;
        case SECTION.hud:
          this.hud = readHud(body);
          break;
        default:
          throw new RangeError(`Bilinmeyen bölüm: ${tag}`);
      }
    }
  }

  private chunkOrigin(chunk: number): { x: number; y: number } {
    return { x: (chunk % this.chunksX) * CHUNK, y: Math.floor(chunk / this.chunksX) * CHUNK };
  }

  private requireChunk(chunk: number): void {
    if (chunk >= this.chunkVersion.length) throw new RangeError('Chunk dünya dışında.');
  }

  private applyStructure(input: ByteReader): void {
    const count = input.u16();
    for (let index = 0; index < count; index++) {
      const chunk = input.u16();
      this.requireChunk(chunk);
      this.chunkVersion[chunk] = input.u32();
      const tiles = input.bytes(CHUNK_TILES);
      const hps = input.bytes(CHUNK_TILES);
      const origin = this.chunkOrigin(chunk);
      for (let local = 0; local < CHUNK_TILES; local++) {
        const tile = (origin.y + ((local / CHUNK) | 0)) * this.width + origin.x + (local % CHUNK);
        const packed = tiles[local];
        this.kind[tile] = packed & 7;
        this.rot[tile] = (packed >> 3) & 3;
        this.ore[tile] = (packed >> 5) & 1;
        this.hp[tile] = hps[local];
      }
    }
  }

  private applyDynamics(input: ByteReader, now: number): void {
    const rect: ChunkRect = { x0: input.u8(), y0: input.u8(), x1: input.u8(), y1: input.u8() };
    this.rect = rect;
    const generation = ++this.generation;
    for (let cy = rect.y0; cy <= rect.y1; cy++) {
      for (let cx = rect.x0; cx <= rect.x1; cx++) {
        const units = input.u16();
        for (let index = 0; index < units; index++) {
          const slot = input.u16();
          const gen = input.u8();
          const packed = input.u8();
          const x = input.u16() / POS_SCALE;
          const y = input.u16() / POS_SCALE;
          let unit = this.units.get(slot);
          if (unit === undefined || unit.gen !== gen) {
            unit = { slot, gen, kind: 0, health: 0, x, y, prevX: x, prevY: y, at: now, seen: 0 };
            this.units.set(slot, unit);
          } else {
            unit.prevX = unit.x;
            unit.prevY = unit.y;
            unit.x = x;
            unit.y = y;
          }
          unit.kind = (packed >> 7) + 1;
          unit.health = (packed & 127) / 127;
          unit.at = now;
          unit.seen = generation;
        }
        const shots = input.u8();
        for (let index = 0; index < shots; index++) {
          const record = new ByteReader(input.bytes(SHOT_RECORD_BYTES));
          this.shots.push({
            fromX: record.u16() + 0.5,
            fromY: record.u16() + 0.5,
            toX: record.u16() / POS_SCALE,
            toY: record.u16() / POS_SCALE,
            at: now,
          });
        }
      }
    }
    for (const [slot, unit] of this.units) if (unit.seen !== generation) this.units.delete(slot);
    while (this.shots.length > 0 && now - this.shots[0].at > 400) this.shots.shift();
  }

  private applyBelts(input: ByteReader): void {
    const chunks = input.u16();
    for (let index = 0; index < chunks; index++) {
      const chunk = input.u16();
      this.requireChunk(chunk);
      const body = new ByteReader(input.bytes(input.u16()));
      const origin = this.chunkOrigin(chunk);
      for (let local = 0; local < CHUNK_TILES; local++) {
        this.beltCount[
          (origin.y + ((local / CHUNK) | 0)) * this.width + origin.x + (local % CHUNK)
        ] = 0;
      }
      while (body.remaining > 0) {
        const local = body.u8();
        const count = body.u8();
        if (count > BELT.slots) throw new RangeError('Bant doluluğu geçersiz.');
        const tile = (origin.y + ((local / CHUNK) | 0)) * this.width + origin.x + (local % CHUNK);
        this.beltCount[tile] = count;
        for (let slot = 0; slot < count; slot++) {
          const packed = body.u16();
          this.beltItem[tile * BELT.slots + slot] = packed >> 10;
          this.beltPos[tile * BELT.slots + slot] = packed & 1023;
        }
      }
    }
  }
}
