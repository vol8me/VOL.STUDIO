import { BUILDABLE, BUILDING, KIND, REFUND_PERCENT, type Kind } from '@/config/forge';
import type { ByteReader, ByteWriter } from '@/net/bytes';
import { clearTile, isSolid } from './units';
import type { ForgeState } from './state';

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
} as const;
export type CommandResult = (typeof RESULT)[keyof typeof RESULT];

export const COMMAND = { place: 1, remove: 2, rotate: 3 } as const;

export type ForgeCommand =
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
    };

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Ağdan gelen yükü komuta çevirir; geçersiz yük `null` olur. */
export function parseCommand(value: unknown, width: number, height: number): ForgeCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
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

/** Komutun ikili biçimi: günlük (journal) ve ağ aynı kodlamayı kullanır. */
export function writeCommand(out: ByteWriter, command: ForgeCommand): void {
  out.u8(command.type);
  out.u16(command.x);
  out.u16(command.y);
  if (command.type === COMMAND.place) {
    out.u8(command.kind);
    out.u8(command.rot);
  } else if (command.type === COMMAND.rotate) {
    out.u8(command.rot);
  }
}

/** Bozuk veya bilinmeyen komut `null` olur; okuyucu konumu belirsiz kalır, çağıran paketi atar. */
export function readCommand(input: ByteReader): ForgeCommand | null {
  const type = input.u8();
  const x = input.u16();
  const y = input.u16();
  switch (type) {
    case COMMAND.place:
      return { type, x, y, kind: input.u8(), rot: input.u8() & 3 };
    case COMMAND.remove:
      return { type, x, y };
    case COMMAND.rotate:
      return { type, x, y, rot: input.u8() & 3 };
    default:
      return null;
  }
}

const COST_KEYS = ['ore', 'plate'] as const;
const ITEM_OF = { ore: 1, plate: 2 } as const;

function affordable(
  s: ForgeState,
  cost: Readonly<Partial<Record<'ore' | 'plate', number>>>,
): boolean {
  return COST_KEYS.every((key) => s.inventory[ITEM_OF[key]] >= (cost[key] ?? 0));
}

/** Komutu bir kez uygular; sonuç yalnız dünya durumuna bağlıdır, bu yüzden tekrar oynatmada aynıdır. */
export function applyCommand(s: ForgeState, command: ForgeCommand): CommandResult {
  if (!s.inBounds(command.x, command.y)) return RESULT.outOfBounds;
  const tile = s.index(command.x, command.y);
  if (command.type === COMMAND.place) {
    if (!(BUILDABLE as readonly number[]).includes(command.kind)) return RESULT.badKind;
    if (s.kind[tile] !== KIND.empty) return RESULT.occupied;
    const spec = BUILDING[command.kind as Exclude<Kind, 0>];
    if (command.kind === KIND.drill && s.ore[tile] === 0) return RESULT.needsOre;
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
