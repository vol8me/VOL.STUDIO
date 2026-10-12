import { ByteReader, ByteWriter, fnv1a } from '@/net/bytes';
import { ITEM_COUNT, UNIT_POOL } from '@/config/forge';
import type { Ledger } from './commands';
import type { ForgeState } from './state';

const MAGIC = 0x53574656; // "VFWS"
const VERSION = 1;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/**
 * Kalıcı durumun kanonik ikili biçimi. Sonundaki FNV-1a sağlaması hem bozuk dosyayı
 * yakalar hem de `hash()` değeridir: iki simülasyonun durumu aynıysa baytları aynıdır.
 */
export function writeSnapshot(s: ForgeState, rngState: number, ledger: Ledger): Uint8Array {
  const out = new ByteWriter(s.count * 12 + 65536);
  out.u32(MAGIC);
  out.u32(VERSION);
  out.u16(s.width);
  out.u16(s.height);
  out.u32(s.tick);
  out.u32(s.nextWaveTick);
  out.u32(s.wave);
  out.u32(s.defeats);
  out.u32(s.coreHp);
  out.f64(s.flowTick);
  out.u8(s.flowDirty ? 1 : 0);
  out.u32(rngState >>> 0);
  for (let item = 0; item < ITEM_COUNT; item++) out.u32(s.inventory[item]);
  for (let item = 0; item < ITEM_COUNT; item++) out.u32(s.delivered[item]);
  out.typed(s.ore);
  out.typed(s.kind);
  out.typed(s.rot);
  out.typed(s.team);
  out.typed(s.hp);
  out.typed(s.timer);
  out.typed(s.bufA);
  out.typed(s.bufOut);
  out.typed(s.beltCount);
  out.typed(s.beltItem);
  out.typed(s.beltPos);
  out.typed(s.flowDir);

  out.typed(s.unitGen);
  out.u32(s.freeCount);
  for (let index = 0; index < s.freeCount; index++) out.u16(s.freeUnits[index]);
  out.u32(s.aliveUnits);
  for (const unit of s.units) {
    if (!unit.alive) continue;
    out.u16(unit.slot);
    out.u8(unit.kind);
    out.f64(unit.x);
    out.f64(unit.y);
    out.f64(unit.hp);
  }

  out.u32(ledger.size);
  ledger.forEach((key, seq, result) => {
    const encoded = new TextEncoder().encode(key);
    out.u8(encoded.length);
    out.bytes(encoded);
    out.u32(seq);
    out.u8(result);
  });
  const body = out.finish();
  const sealed = new ByteWriter(body.length + 4);
  sealed.bytes(body);
  sealed.u32(fnv1a(body));
  return sealed.finish();
}

/** Başlıktaki dünya boyutu; durum nesnesi bu boyutla kurulur. Sağlama `readSnapshot`ta doğrulanır. */
export function snapshotDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 16) throw new SnapshotError('Anlık görüntü çok kısa.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new SnapshotError('Anlık görüntü imzası geçersiz.');
  return { width: view.getUint16(8, true), height: view.getUint16(10, true) };
}

export interface SnapshotMeta {
  readonly tick: number;
  readonly rngState: number;
  readonly checksum: number;
}

/** Bütün alanlar doğrulanmadan `s`ye tek bayt yazılmaz: bozuk dosya canlı durumu kirletmez. */
export function readSnapshot(bytes: Uint8Array, s: ForgeState, ledger: Ledger): SnapshotMeta {
  if (bytes.length < 8) throw new SnapshotError('Anlık görüntü çok kısa.');
  const body = bytes.subarray(0, bytes.length - 4);
  const expected = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 4, 4).getUint32(
    0,
    true,
  );
  if (fnv1a(body) !== expected) throw new SnapshotError('Anlık görüntü sağlaması uyuşmuyor.');
  const input = new ByteReader(body);
  try {
    if (input.u32() !== MAGIC) throw new SnapshotError('Anlık görüntü imzası geçersiz.');
    if (input.u32() !== VERSION) throw new SnapshotError('Anlık görüntü sürümü desteklenmiyor.');
    if (input.u16() !== s.width || input.u16() !== s.height)
      throw new SnapshotError('Anlık görüntü dünya boyutu farklı.');
    const tick = input.u32();
    const nextWaveTick = input.u32();
    const wave = input.u32();
    const defeats = input.u32();
    const coreHp = input.u32();
    const flowTick = input.f64();
    const flowDirty = input.u8() === 1;
    const rngState = input.u32() | 0;
    const inventory = Array.from({ length: ITEM_COUNT }, () => input.u32());
    const delivered = Array.from({ length: ITEM_COUNT }, () => input.u32());
    const target = [
      s.ore,
      s.kind,
      s.rot,
      s.team,
      s.hp,
      s.timer,
      s.bufA,
      s.bufOut,
      s.beltCount,
      s.beltItem,
      s.beltPos,
      s.flowDir,
    ];
    const staged = target.map((array) => {
      const copy = new Uint8Array(array.byteLength);
      copy.set(input.bytes(array.byteLength));
      return copy;
    });
    const unitGen = input.bytes(UNIT_POOL).slice();
    const freeCount = input.u32();
    if (freeCount > UNIT_POOL) throw new SnapshotError('Birim havuzu bozuk.');
    const free = Array.from({ length: freeCount }, () => input.u16());
    const alive = input.u32();
    if (alive + freeCount !== UNIT_POOL) throw new SnapshotError('Birim sayıları tutarsız.');
    const units = Array.from({ length: alive }, () => ({
      slot: input.u16(),
      kind: input.u8(),
      x: input.f64(),
      y: input.f64(),
      hp: input.f64(),
    }));
    const entries = input.u32();
    const players: { key: string; seq: number; result: number }[] = [];
    for (let index = 0; index < entries; index++) {
      const length = input.u8();
      const key = new TextDecoder().decode(input.bytes(length));
      players.push({ key, seq: input.u32(), result: input.u8() });
    }
    if (input.remaining !== 0) throw new SnapshotError('Anlık görüntüde artık bayt var.');

    // Doğrulama bitti: şimdi uygula.
    s.tick = tick;
    s.nextWaveTick = nextWaveTick;
    s.wave = wave;
    s.defeats = defeats;
    s.coreHp = coreHp;
    s.flowTick = flowTick;
    s.flowDirty = flowDirty;
    inventory.forEach((value, item) => (s.inventory[item] = value));
    delivered.forEach((value, item) => (s.delivered[item] = value));
    target.forEach((array, index) =>
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(staged[index]),
    );
    s.unitGen.set(unitGen);
    s.resetUnits();
    s.freeCount = freeCount;
    free.forEach((slot, index) => (s.freeUnits[index] = slot));
    for (const saved of units) {
      const unit = s.units[saved.slot];
      unit.alive = true;
      unit.kind = saved.kind;
      unit.x = saved.x;
      unit.y = saved.y;
      unit.hp = saved.hp;
    }
    s.aliveUnits = alive;
    ledger.clear();
    for (const entry of players) ledger.record(entry.key, entry.seq, entry.result);
    s.listsDirty = true;
    s.chunkVersion.fill(1);
    return { tick, rngState, checksum: expected };
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError(error instanceof Error ? error.message : 'Anlık görüntü okunamadı.');
  }
}
