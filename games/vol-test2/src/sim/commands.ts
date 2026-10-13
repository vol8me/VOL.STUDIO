import {
  BUILDABLE,
  BUILDING,
  KIND,
  MOVE_DIRECTIONS,
  PLAYER,
  REFUND_PERCENT,
  type Kind,
} from '@/config/factory';
import type { ByteReader, ByteWriter } from '@/net/bytes';
import { circleHitsBlocked } from './playerMove';
import { isSolid } from './solid';
import { PLAYER_STATUS, type FactoryState } from './state';
import { clearTile } from './units';

/** Komut sonuç kodları; istemciye ack ile gider, sıra değişmez. */
export const RESULT = {
  ok: 0,
  outOfBounds: 1,
  occupied: 2,
  needsOre: 3,
  tooPoor: 4,
  empty: 5,
  protected: 6,
  badKind: 7,
  duplicate: 8,
  rateLimited: 9,
  malformed: 10,
  /** Sunucu günlüğü yazamıyor: komut kabul edilmedi, durum değişmedi. */
  unavailable: 11,
  /** Hedef tile oyuncunun inşa menzilinin dışında. */
  tooFar: 12,
  /** Komutu veren anahtarın dünyada tankı yok (JOIN uygulanmadı ya da yuva dolu). */
  noPlayer: 13,
  /** Tank ölü: doğuşu beklerken komut geçmez. */
  dead: 14,
} as const;
export type CommandResult = (typeof RESULT)[keyof typeof RESULT];

export const COMMAND = { place: 1, remove: 2, rotate: 3, move: 4, join: 5, leave: 6 } as const;

export type FactoryCommand =
  | {
      readonly type: typeof COMMAND.place;
      readonly x: number;
      readonly y: number;
      readonly kind: number;
      readonly rot: number;
    }
  | { readonly type: typeof COMMAND.remove; readonly x: number; readonly y: number }
  | {
      readonly type: typeof COMMAND.rotate;
      readonly x: number;
      readonly y: number;
      readonly rot: number;
    }
  /** Hareket niyeti: 0 durur, 1..16 yön. Niyet `PLAYER.moveTtlTicks` sonra söner; istemci yeniler. */
  | { readonly type: typeof COMMAND.move; readonly dir: number }
  /** Yalnız sunucu verir: anahtara yuva açar ve tankı doğurur. */
  | { readonly type: typeof COMMAND.join; readonly key: string }
  /** Yalnız sunucu verir: yuvayı boşaltır. */
  | { readonly type: typeof COMMAND.leave };

/** Sunucunun kendi verdiği komutlar: istemci mesajında bulunamaz, günlükte ayrı kayıt türüdür. */
export function isSystemCommand(command: FactoryCommand): boolean {
  return command.type === COMMAND.join || command.type === COMMAND.leave;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Ağdan gelen yükü istemci komutuna çevirir; geçersiz yük (ve sistem komutu) `null` olur. */
export function parseCommand(value: unknown, width: number, height: number): FactoryCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.type === COMMAND.move)
    return integer(data.dir, 0, MOVE_DIRECTIONS) ? { type: COMMAND.move, dir: data.dir } : null;
  if (!integer(data.x, 0, width - 1) || !integer(data.y, 0, height - 1)) return null;
  switch (data.type) {
    case COMMAND.place:
      if (!integer(data.kind, 0, 255) || !integer(data.rot, 0, 3)) return null;
      return { type: COMMAND.place, x: data.x, y: data.y, kind: data.kind, rot: data.rot };
    case COMMAND.remove:
      return { type: COMMAND.remove, x: data.x, y: data.y };
    case COMMAND.rotate:
      if (!integer(data.rot, 0, 3)) return null;
      return { type: COMMAND.rotate, x: data.x, y: data.y, rot: data.rot };
    default:
      return null;
  }
}

/** Komutun ikili biçimi: günlük (journal) ve ağ aynı kodlamayı kullanır; alanlar türe göre değişir. */
export function writeCommand(out: ByteWriter, command: FactoryCommand): void {
  out.u8(command.type);
  switch (command.type) {
    case COMMAND.place:
      out.u16(command.x);
      out.u16(command.y);
      out.u8(command.kind);
      out.u8(command.rot);
      break;
    case COMMAND.remove:
      out.u16(command.x);
      out.u16(command.y);
      break;
    case COMMAND.rotate:
      out.u16(command.x);
      out.u16(command.y);
      out.u8(command.rot);
      break;
    case COMMAND.move:
      out.u8(command.dir);
      break;
    case COMMAND.join: {
      const encoded = new TextEncoder().encode(command.key);
      out.u8(encoded.length);
      out.bytes(encoded);
      break;
    }
    case COMMAND.leave:
      break;
  }
}

/** Bozuk veya bilinmeyen komut `null` olur; okuyucu konumu belirsiz kalır, çağıran paketi atar. */
export function readCommand(input: ByteReader): FactoryCommand | null {
  const type = input.u8();
  switch (type) {
    case COMMAND.place:
      return { type, x: input.u16(), y: input.u16(), kind: input.u8(), rot: input.u8() & 3 };
    case COMMAND.remove:
      return { type, x: input.u16(), y: input.u16() };
    case COMMAND.rotate:
      return { type, x: input.u16(), y: input.u16(), rot: input.u8() & 3 };
    case COMMAND.move: {
      const dir = input.u8();
      return dir <= MOVE_DIRECTIONS ? { type, dir } : null;
    }
    case COMMAND.join: {
      const key = new TextDecoder().decode(input.bytes(input.u8()));
      return isPlayerKey(key) ? { type, key } : null;
    }
    case COMMAND.leave:
      return { type };
    default:
      return null;
  }
}

const COST_KEYS = ['ore', 'plate'] as const;
const ITEM_OF = { ore: 1, plate: 2 } as const;

function affordable(
  s: FactoryState,
  cost: Readonly<Partial<Record<'ore' | 'plate', number>>>,
): boolean {
  return COST_KEYS.every((key) => s.inventory[ITEM_OF[key]] >= (cost[key] ?? 0));
}

/** Yaşayan bir tank tile karesine çarpıyor mu: üstüne katı bina konamaz. */
function playerOverlaps(s: FactoryState, tileX: number, tileY: number): boolean {
  const p = s.players;
  const only = (x: number, y: number): boolean => x === tileX && y === tileY;
  for (let slot = 0; slot < PLAYER.slots; slot++) {
    if (p.status[slot] !== PLAYER_STATUS.alive) continue;
    if (circleHitsBlocked(only, p.x[slot], p.y[slot], PLAYER.radius)) return true;
  }
  return false;
}

/**
 * Komutu `slot` yuvasındaki oyuncu adına bir kez uygular; sonuç yalnız dünya durumuna bağlıdır, bu yüzden
 * tekrar oynatmada aynıdır. Yapı komutları yaşayan oyuncunun inşa menzilindeki tile'a geçer.
 * `join`/`leave` sistem komutudur ve burada değil `FactorySim.system`de işlenir.
 */
export function applyCommand(
  s: FactoryState,
  command: FactoryCommand,
  slot: number,
): CommandResult {
  if (command.type === COMMAND.join || command.type === COMMAND.leave) return RESULT.malformed;
  const players = s.players;
  if (slot < 0 || slot >= PLAYER.slots || players.status[slot] === PLAYER_STATUS.free)
    return RESULT.noPlayer;
  // Reddedilen komut durumu değiştirmez: istemciler yalnız kabul edilen komutları alır.
  if (players.status[slot] === PLAYER_STATUS.dead) return RESULT.dead;
  if (command.type === COMMAND.move) {
    players.dir[slot] = command.dir;
    players.moveUntil[slot] = command.dir === 0 ? 0 : s.tick + PLAYER.moveTtlTicks;
    return RESULT.ok;
  }
  if (!s.inBounds(command.x, command.y)) return RESULT.outOfBounds;
  const reachX = command.x + 0.5 - players.x[slot];
  const reachY = command.y + 0.5 - players.y[slot];
  if (reachX * reachX + reachY * reachY > PLAYER.buildRange * PLAYER.buildRange)
    return RESULT.tooFar;
  const tile = s.index(command.x, command.y);
  if (command.type === COMMAND.place) {
    if (!(BUILDABLE as readonly number[]).includes(command.kind)) return RESULT.badKind;
    if (s.kind[tile] !== KIND.empty) return RESULT.occupied;
    const spec = BUILDING[command.kind as Exclude<Kind, 0>];
    if (command.kind === KIND.drill && s.ore[tile] === 0) return RESULT.needsOre;
    if (isSolid(command.kind) && playerOverlaps(s, command.x, command.y)) return RESULT.occupied;
    if (!affordable(s, spec.cost)) return RESULT.tooPoor;
    for (const key of COST_KEYS) s.inventory[ITEM_OF[key]] -= spec.cost[key] ?? 0;
    s.kind[tile] = command.kind;
    s.rot[tile] = command.rot;
    s.team[tile] = 1;
    s.hp[tile] = spec.hp;
    s.timer[tile] = 0;
    s.bufA[tile] = 0;
    s.bufOut[tile] = 0;
    s.beltCount[tile] = 0;
    s.touchStructure(tile);
    if (isSolid(command.kind)) s.flowDirty = true;
    return RESULT.ok;
  }
  const kind = s.kind[tile];
  if (kind === KIND.empty) return RESULT.empty;
  if (kind === KIND.core) return RESULT.protected;
  if (command.type === COMMAND.rotate) {
    if (kind === KIND.wall || kind === KIND.turret) return RESULT.badKind;
    s.rot[tile] = command.rot;
    s.touchStructure(tile);
    return RESULT.ok;
  }
  const spec = BUILDING[kind as Exclude<Kind, 0>];
  for (const key of COST_KEYS) {
    const refund = Math.floor(((spec.cost[key] ?? 0) * REFUND_PERCENT) / 100);
    s.inventory[ITEM_OF[key]] += refund;
  }
  const solid = isSolid(kind);
  clearTile(s, tile);
  if (solid) s.flowDirty = true;
  return RESULT.ok;
}

/** Oyuncu anahtarı: istemcinin ürettiği kalıcı kimlik. Anlık görüntü biçimi 255 bayta kadar taşır; 64'te kesilir. */
export const PLAYER_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isPlayerKey(value: unknown): value is string {
  return typeof value === 'string' && PLAYER_KEY_PATTERN.test(value);
}

/** Oyuncu başına son komut sırası ve sonucu; yeniden gönderilen komut ikinci kez uygulanmaz. */
export class Ledger {
  private readonly entries = new Map<string, { seq: number; result: number }>();

  get size(): number {
    return this.entries.size;
  }

  /** `seq` bu oyuncu için yeni mi? Yeni değilse önbellekteki sonucu döndürür. */
  lookup(key: string, seq: number): { fresh: true } | { fresh: false; result: number } {
    const entry = this.entries.get(key);
    if (!entry || seq > entry.seq) return { fresh: true };
    return { fresh: false, result: seq === entry.seq ? entry.result : RESULT.duplicate };
  }

  /** Geçersiz anahtar anlık görüntü biçimini bozacağı için girişte reddedilir. */
  record(key: string, seq: number, result: number): void {
    if (!isPlayerKey(key))
      throw new RangeError('Oyuncu anahtarı 8-64 harf, rakam, _ veya - olmalı.');
    this.entries.set(key, { seq, result });
  }

  /** Oyuncunun kabul edilmiş son komut sırası; hiç komutu yoksa 0. İstemci buradan devam eder. */
  lastSeq(key: string): number {
    return this.entries.get(key)?.seq ?? 0;
  }

  forEach(visit: (key: string, seq: number, result: number) => void): void {
    const sorted = [...this.entries.keys()].sort();
    for (const key of sorted) {
      const entry = this.entries.get(key)!;
      visit(key, entry.seq, entry.result);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
