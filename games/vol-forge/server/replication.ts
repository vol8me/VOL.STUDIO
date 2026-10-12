import { BELT, NET, UNIT, UNIT_KIND, UNIT_POOL } from '@/config/forge';
import { ByteWriter, fnv1a } from '@/net/bytes';
import {
  CHUNK,
  CHUNK_TILES,
  FRAME_HEADER_BYTES,
  POS_SCALE,
  SECTION,
  SECTION_HEADER_BYTES,
  SHOT_RECORD_BYTES,
  UNIT_RECORD_BYTES,
  packBeltItem,
  packHp,
  packTile,
  writeHud,
  type ChunkRect,
  type Hud,
} from '@/net/protocol';
import type { ForgeSim } from '@/sim/sim';
import type { Shot } from '@/sim/units';

/** Bir çerçevede en çok gönderilen yapı chunk'ı; ilk bağlanışta yük birkaç çerçeveye yayılır. */
const STRUCTURE_PER_FRAME = 24;
const MAX_SHOTS_PENDING = 2048;
const MAX_SHOTS_PER_CHUNK = 255;

/** Çerçeve bölümü başına gönderilen bayt sayacı; ölçüm içindir. */
export interface SectionBytes {
  structure: number;
  dynamics: number;
  belts: number;
  hud: number;
  header: number;
}

export function emptySectionBytes(): SectionBytes {
  return { structure: 0, dynamics: 0, belts: 0, hud: 0, header: 0 };
}

/** Bütün bölümlerin ve üstbilgilerin toplam baytı. */
export function totalBytes(bytes: SectionBytes): number {
  return bytes.structure + bytes.dynamics + bytes.belts + bytes.hud + bytes.header;
}

export interface DueSections {
  readonly dynamics: boolean;
  readonly belts: boolean;
  readonly hud: Hud | null;
}

/** Çevrimin hangi bölümleri bu adımda bu istemci için vadesi geldiğini söyler; HUD'u çağıran üretir. */
export function dueAt(tick: number, phase: number, hud: () => Hud): DueSections {
  const hudDue = (tick + phase) % NET.hudEvery === 0;
  return {
    dynamics: (tick + phase) % NET.dynamicsEvery === 0,
    belts: (tick + phase) % NET.beltsEvery === 0,
    hud: hudDue ? hud() : null,
  };
}

/**
 * Bir istemcinin çoğaltma durumu: ilgi alanı ve sunucunun ona ne gönderdiğine dair kayıt.
 * Yeni oturum her şeyi sıfırdan alır; yeniden bağlanan istemci eski kaydı kullanmaz.
 */
export class ClientCursor {
  rect: ChunkRect;
  readonly structureSent: Uint32Array;
  readonly beltSent: Uint8Array;
  readonly beltHash: Uint32Array;
  readonly bytes = emptySectionBytes();
  frames = 0;
  skippedForBackpressure = 0;

  constructor(
    private readonly chunksX: number,
    private readonly chunksY: number,
    private readonly maxAoi: { readonly x: number; readonly y: number },
    /** Gönderimleri çevrimlere yaymak için istemciye özgü kayıklık. */
    readonly phase: number,
  ) {
    this.structureSent = new Uint32Array(chunksX * chunksY);
    this.beltSent = new Uint8Array(chunksX * chunksY);
    this.beltHash = new Uint32Array(chunksX * chunksY);
    this.rect = this.clamp({ x0: 0, y0: 0, x1: maxAoi.x - 1, y1: maxAoi.y - 1 });
  }

  /** Dünya içine ve izin verilen boyuta kırpar; sıralaması bozuk dikdörtgeni olduğu gibi bırakmaz. */
  clamp(rect: ChunkRect): ChunkRect {
    const x0 = Math.max(0, Math.min(rect.x0, this.chunksX - 1));
    const y0 = Math.max(0, Math.min(rect.y0, this.chunksY - 1));
    const x1 = Math.max(x0, Math.min(rect.x1, this.chunksX - 1, x0 + this.maxAoi.x - 1));
    const y1 = Math.max(y0, Math.min(rect.y1, this.chunksY - 1, y0 + this.maxAoi.y - 1));
    return { x0, y0, x1, y1 };
  }

  /**
   * İlgi alanını değiştirir. Alana yeni giren chunk'ların bant bilgisi istemcide düşmüş olduğundan
   * yeniden gönderilmek üzere işaretlenir; yapı bilgisi sürüm eşleşiyorsa istemcide kalır.
   */
  setRect(next: ChunkRect): void {
    const rect = this.clamp(next);
    const before = this.rect;
    for (let cy = rect.y0; cy <= rect.y1; cy++) {
      for (let cx = rect.x0; cx <= rect.x1; cx++) {
        const inside = cx >= before.x0 && cx <= before.x1 && cy >= before.y0 && cy <= before.y1;
        if (!inside) this.beltSent[cy * this.chunksX + cx] = 0;
      }
    }
    this.rect = rect;
  }

  forEachChunk(visit: (chunk: number) => void): void {
    for (let cy = this.rect.y0; cy <= this.rect.y1; cy++)
      for (let cx = this.rect.x0; cx <= this.rect.x1; cx++) visit(cy * this.chunksX + cx);
  }
}

/**
 * Dünya durumunu istemci çerçevelerine çevirir. Chunk başına kodlama çevrim başına bir kez
 * yapılır ve istemciler arasında paylaşılır; istemci başına maliyet bayt kopyalamadır.
 */
export class Replicator {
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly chunkCount: number;

  private readonly structure: (Uint8Array | null)[];
  private readonly structureVersion: Uint32Array;

  private readonly beltBlob: Uint8Array[];
  private readonly beltBlobHash: Uint32Array;
  private readonly beltBlobTick: Int32Array;
  private readonly beltScratch = new ByteWriter(CHUNK_TILES * 12);

  private readonly unitChunk = new Int32Array(UNIT_POOL);
  private readonly unitCounts: Uint16Array;
  private readonly unitStart: Uint32Array;
  private readonly unitFill: Uint32Array;
  private readonly shotFill: Uint32Array;
  private readonly unitBytes = new Uint8Array(UNIT_POOL * UNIT_RECORD_BYTES);
  private readonly shotCounts: Uint8Array;
  private readonly shotStart: Uint32Array;
  private shotBytes = new Uint8Array(MAX_SHOTS_PENDING * SHOT_RECORD_BYTES);
  private pendingShots: { x: number; y: number; tx: number; ty: number }[] = [];
  private dynamicsTick = -1;

  private readonly frame = new ByteWriter(64 * 1024);

  constructor(private readonly sim: ForgeSim) {
    const s = sim.state;
    this.chunksX = s.chunksX;
    this.chunksY = s.chunksY;
    this.chunkCount = s.chunkCount;
    this.structure = new Array<Uint8Array | null>(this.chunkCount).fill(null);
    this.structureVersion = new Uint32Array(this.chunkCount);
    this.beltBlob = new Array<Uint8Array>(this.chunkCount).fill(new Uint8Array(0));
    this.beltBlobHash = new Uint32Array(this.chunkCount);
    this.beltBlobTick = new Int32Array(this.chunkCount).fill(-1);
    this.unitCounts = new Uint16Array(this.chunkCount);
    this.unitStart = new Uint32Array(this.chunkCount + 1);
    this.unitFill = new Uint32Array(this.chunkCount);
    this.shotFill = new Uint32Array(this.chunkCount);
    this.shotCounts = new Uint8Array(this.chunkCount);
    this.shotStart = new Uint32Array(this.chunkCount + 1);
  }

  createCursor(maxAoi: { readonly x: number; readonly y: number }, phase: number): ClientCursor {
    return new ClientCursor(this.chunksX, this.chunksY, maxAoi, phase);
  }

  /** Her adımdan sonra çağrılır: atışlar dinamik çevrimler arasında birikir. */
  collectShots(shots: readonly Shot[]): void {
    for (const shot of shots) {
      if (this.pendingShots.length >= MAX_SHOTS_PENDING) return;
      const s = this.sim.state;
      this.pendingShots.push({
        x: shot.tile % s.width,
        y: Math.floor(shot.tile / s.width),
        tx: shot.targetX,
        ty: shot.targetY,
      });
    }
  }

  private chunkAt(x: number, y: number): number {
    const s = this.sim.state;
    const cx = Math.min(this.chunksX - 1, Math.max(0, Math.floor(x / CHUNK)));
    const cy = Math.min(this.chunksY - 1, Math.max(0, Math.floor(y / CHUNK)));
    return cy * s.chunksX + cx;
  }

  /** Birimleri ve atışları chunk'a göre bir kez kodlar; çevrimde bir kereden fazla çağrılmaz. */
  prepareDynamics(): void {
    const s = this.sim.state;
    if (this.dynamicsTick === s.tick) return;
    this.dynamicsTick = s.tick;
    this.unitCounts.fill(0);
    for (const unit of s.units) {
      if (!unit.alive) {
        this.unitChunk[unit.slot] = -1;
        continue;
      }
      const chunk = this.chunkAt(unit.x, unit.y);
      this.unitChunk[unit.slot] = chunk;
      this.unitCounts[chunk]++;
    }
    let offset = 0;
    for (let chunk = 0; chunk < this.chunkCount; chunk++) {
      this.unitStart[chunk] = offset;
      offset += this.unitCounts[chunk] * UNIT_RECORD_BYTES;
    }
    this.unitStart[this.chunkCount] = offset;
    const fill = this.unitFill.fill(0);
    const view = new DataView(this.unitBytes.buffer);
    for (const unit of s.units) {
      const chunk = this.unitChunk[unit.slot];
      if (chunk < 0) continue;
      const at = this.unitStart[chunk] + fill[chunk]++ * UNIT_RECORD_BYTES;
      const max = unit.kind === UNIT_KIND.brute ? UNIT.brute.hp : UNIT.crawler.hp;
      view.setUint16(at, unit.slot, true);
      this.unitBytes[at + 2] = s.unitGen[unit.slot];
      this.unitBytes[at + 3] =
        ((unit.kind === UNIT_KIND.brute ? 1 : 0) << 7) |
        Math.min(127, Math.max(0, Math.ceil((127 * unit.hp) / max)));
      view.setUint16(at + 4, Math.round(unit.x * POS_SCALE), true);
      view.setUint16(at + 6, Math.round(unit.y * POS_SCALE), true);
    }

    this.shotCounts.fill(0);
    const shots = this.pendingShots;
    for (const shot of shots) {
      const chunk = this.chunkAt(shot.x, shot.y);
      if (this.shotCounts[chunk] < MAX_SHOTS_PER_CHUNK) this.shotCounts[chunk]++;
    }
    offset = 0;
    for (let chunk = 0; chunk < this.chunkCount; chunk++) {
      this.shotStart[chunk] = offset;
      offset += this.shotCounts[chunk] * SHOT_RECORD_BYTES;
    }
    this.shotStart[this.chunkCount] = offset;
    const shotFill = this.shotFill.fill(0);
    const shotView = new DataView(this.shotBytes.buffer);
    for (const shot of shots) {
      const chunk = this.chunkAt(shot.x, shot.y);
      if (shotFill[chunk] >= this.shotCounts[chunk]) continue;
      const at = this.shotStart[chunk] + shotFill[chunk]++ * SHOT_RECORD_BYTES;
      shotView.setUint16(at, shot.x, true);
      shotView.setUint16(at + 2, shot.y, true);
      shotView.setUint16(at + 4, Math.round(shot.tx * POS_SCALE), true);
      shotView.setUint16(at + 6, Math.round(shot.ty * POS_SCALE), true);
    }
    this.pendingShots = [];
  }

  private structureBlob(chunk: number): Uint8Array {
    const s = this.sim.state;
    const version = s.chunkVersion[chunk];
    const cached = this.structure[chunk];
    if (cached !== null && this.structureVersion[chunk] === version) return cached;
    const blob = new Uint8Array(2 + 4 + CHUNK_TILES * 2);
    const view = new DataView(blob.buffer);
    view.setUint16(0, chunk, true);
    view.setUint32(2, version, true);
    const originX = (chunk % this.chunksX) * CHUNK;
    const originY = Math.floor(chunk / this.chunksX) * CHUNK;
    for (let local = 0; local < CHUNK_TILES; local++) {
      const tile = (originY + ((local / CHUNK) | 0)) * s.width + originX + (local % CHUNK);
      const kind = s.kind[tile];
      blob[6 + local] = packTile(kind, s.rot[tile], s.ore[tile]);
      blob[6 + CHUNK_TILES + local] = packHp(kind, s.hp[tile]);
    }
    this.structure[chunk] = blob;
    this.structureVersion[chunk] = version;
    return blob;
  }

  /** Chunk'ın bant eşyaları; çevrim başına en çok bir kez kodlanır. */
  private beltsOf(chunk: number): { bytes: Uint8Array; hash: number } {
    const s = this.sim.state;
    if (this.beltBlobTick[chunk] === s.tick) {
      return { bytes: this.beltBlob[chunk], hash: this.beltBlobHash[chunk] };
    }
    let bytes: Uint8Array;
    if (s.chunkItems[chunk] === 0) {
      bytes = EMPTY;
    } else {
      const out = this.beltScratch;
      out.reset();
      const originX = (chunk % this.chunksX) * CHUNK;
      const originY = Math.floor(chunk / this.chunksX) * CHUNK;
      for (let local = 0; local < CHUNK_TILES; local++) {
        const tile = (originY + ((local / CHUNK) | 0)) * s.width + originX + (local % CHUNK);
        const count = s.beltCount[tile];
        if (count === 0) continue;
        out.u8(local);
        out.u8(count);
        for (let slot = 0; slot < count; slot++)
          out.u16(
            packBeltItem(s.beltItem[tile * BELT.slots + slot], s.beltPos[tile * BELT.slots + slot]),
          );
      }
      bytes = out.finish();
    }
    const hash = fnv1a(bytes);
    this.beltBlob[chunk] = bytes;
    this.beltBlobHash[chunk] = hash;
    this.beltBlobTick[chunk] = s.tick;
    return { bytes, hash };
  }

  /**
   * Bu istemci için çerçeve üretir; gönderilecek bir şey yoksa `null`. Gönderilen bayt sayıları
   * imleçte bölüm bölüm toplanır.
   */
  frameFor(cursor: ClientCursor, due: DueSections): Uint8Array | null {
    const s = this.sim.state;
    const out = this.frame;
    out.reset();
    out.u32(s.tick);
    const countAt = out.length;
    out.u8(0);
    let sections = 0;
    const bytes = cursor.bytes;
    let header = FRAME_HEADER_BYTES;

    const beginSection = (tag: number): number => {
      out.u8(tag);
      const at = out.length;
      out.u32(0);
      header += SECTION_HEADER_BYTES;
      return at;
    };
    const endSection = (at: number, account: keyof SectionBytes): void => {
      const length = out.length - at - 4;
      out.patchU32(at, length);
      bytes[account] += length;
      sections++;
    };

    // Yapı: sürümü eskimiş ve alan içindeki chunk'lar, çerçeve başına sınırlı.
    const stale: number[] = [];
    cursor.forEachChunk((chunk) => {
      if (
        stale.length < STRUCTURE_PER_FRAME &&
        cursor.structureSent[chunk] !== s.chunkVersion[chunk]
      )
        stale.push(chunk);
    });
    if (stale.length > 0) {
      const at = beginSection(SECTION.structure);
      out.u16(stale.length);
      for (const chunk of stale) {
        const blob = this.structureBlob(chunk);
        out.bytes(blob);
        cursor.structureSent[chunk] = new DataView(blob.buffer).getUint32(2, true);
      }
      endSection(at, 'structure');
    }

    if (due.dynamics) {
      this.prepareDynamics();
      const at = beginSection(SECTION.dynamics);
      const rect = cursor.rect;
      out.u8(rect.x0);
      out.u8(rect.y0);
      out.u8(rect.x1);
      out.u8(rect.y1);
      for (let cy = rect.y0; cy <= rect.y1; cy++) {
        for (let cx = rect.x0; cx <= rect.x1; cx++) {
          const chunk = cy * this.chunksX + cx;
          out.u16(this.unitCounts[chunk]);
          out.bytes(this.unitBytes.subarray(this.unitStart[chunk], this.unitStart[chunk + 1]));
          out.u8(this.shotCounts[chunk]);
          out.bytes(this.shotBytes.subarray(this.shotStart[chunk], this.shotStart[chunk + 1]));
        }
      }
      endSection(at, 'dynamics');
    }

    if (due.belts) {
      const changed: { chunk: number; bytes: Uint8Array; hash: number }[] = [];
      cursor.forEachChunk((chunk) => {
        const { bytes: blob, hash } = this.beltsOf(chunk);
        if (cursor.beltSent[chunk] === 1 && cursor.beltHash[chunk] === hash) return;
        // İlk gönderimde boş chunk için bir şey göndermeye gerek yoktur: istemci zaten boştur.
        if (cursor.beltSent[chunk] === 0 && blob.length === 0) {
          cursor.beltSent[chunk] = 1;
          cursor.beltHash[chunk] = hash;
          return;
        }
        changed.push({ chunk, bytes: blob, hash });
      });
      if (changed.length > 0) {
        const at = beginSection(SECTION.belts);
        out.u16(changed.length);
        for (const entry of changed) {
          out.u16(entry.chunk);
          out.u16(entry.bytes.length);
          out.bytes(entry.bytes);
          cursor.beltSent[entry.chunk] = 1;
          cursor.beltHash[entry.chunk] = entry.hash;
        }
        endSection(at, 'belts');
      }
    }

    if (due.hud) {
      const at = beginSection(SECTION.hud);
      writeHud(out, due.hud);
      endSection(at, 'hud');
    }

    if (sections === 0) return null;
    const frame = out.finish();
    frame[countAt] = sections;
    bytes.header += header;
    cursor.frames++;
    return frame;
  }
}

const EMPTY = new Uint8Array(0);
