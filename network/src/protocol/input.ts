/** Bağlantı protokolü güncellemeleri iki uç tarafından birlikte kabul edilir. */
export const PROTOCOL_VERSION = 1;

export interface PlayerCommand {
  readonly moveX: number;
  readonly moveY: number;
  readonly aimX: number;
  readonly aimY: number;
  readonly fire: boolean;
  readonly boost: boolean;
  readonly brake: boolean;
}

export interface PlayerInput extends PlayerCommand {
  readonly seq: number;
}

export type InputOffer = 'accepted' | 'stale' | 'invalid';

const IDLE: PlayerCommand = Object.freeze({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  fire: false,
  boost: false,
  brake: false,
});

function axis(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1;
}

/** Sunucu fizik girdisini istemcinin beyan ettiği kimlik, poz veya hasardan ayırır. */
export function parseInput(value: unknown): PlayerInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.seq) || (data.seq as number) < 0) return null;
  if (!axis(data.moveX) || !axis(data.moveY) || !axis(data.aimX) || !axis(data.aimY)) return null;
  if (data.moveX ** 2 + data.moveY ** 2 > 1.00001) return null;
  if (data.aimX ** 2 + data.aimY ** 2 > 1.00001) return null;
  if (![data.fire, data.boost, data.brake].every((flag) => typeof flag === 'boolean')) return null;
  return {
    seq: data.seq as number,
    moveX: data.moveX,
    moveY: data.moveY,
    aimX: data.aimX,
    aimY: data.aimY,
    fire: data.fire as boolean,
    boost: data.boost as boolean,
    brake: data.brake as boolean,
  };
}

/** Ağ paketi sayısı simülasyon adımı üretmez; adımda en çok bir komut tüketilir. */
export class InputMailbox {
  private lastSeq = -1;
  private pending: PlayerInput | null = null;
  private held: PlayerCommand = IDLE;
  private holdSteps = 0;

  constructor(private readonly maxHoldSteps = 3) {
    if (!Number.isSafeInteger(maxHoldSteps) || maxHoldSteps < 0)
      throw new RangeError('Tutma adımı sıfır veya pozitif tam sayı olmalı.');
  }

  offer(value: unknown): InputOffer {
    const input = parseInput(value);
    if (!input) return 'invalid';
    if (input.seq <= this.lastSeq) return 'stale';
    this.pending = input;
    this.lastSeq = input.seq;
    return 'accepted';
  }

  consume(): PlayerCommand {
    if (this.pending) {
      this.held = this.pending;
      this.pending = null;
      this.holdSteps = this.maxHoldSteps;
      return this.held;
    }
    if (this.holdSteps > 0) {
      this.holdSteps--;
      return this.held;
    }
    this.held = IDLE;
    return IDLE;
  }

  reset(): void {
    this.pending = null;
    this.held = IDLE;
    this.holdSteps = 0;
  }

  get acknowledgedSeq(): number {
    return this.lastSeq;
  }
}
