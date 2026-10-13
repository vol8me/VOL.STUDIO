import { SIM } from '@/config/factory';
import { LockstepClient, type TickPacket } from '@/net/lockstep';
import { LockstepFeed } from '@/net/lockstepFeed';
import type { Ack } from '@/net/protocol';
import type { SessionStatus } from '@/net/session';
import type { FactoryCommand } from '@/sim/commands';
import { RESULT, type FactorySim } from '@/sim/sim';

const PLAYER_KEY = 'lab-local';
const PLAYER_SLOT = 0;

/** Duvar saati geride kalırsa (sekme arka planı) tek `pump`ta yetişilecek en çok adım. */
const MAX_CATCH_UP = 8;

export interface LocalSessionOptions {
  readonly sustainUnits?: number;
  readonly now?: () => number;
  /** Üretilen her tik paketinin baytları: kayıt ve yeniden oynatma bunu dinler. */
  readonly onPacket?: (bytes: Uint8Array, packet: TickPacket) => void;
}

interface Waiting {
  readonly seq: number;
  readonly command: FactoryCommand;
  readonly sentAt: number;
  readonly resolve: (ack: Ack) => void;
}

/**
 * Sunucusuz kilit adımlı oturum: aynı sayfada yetkili bir `FactorySim`, sunucunun kullandığı
 * `LockstepFeed` ve gerçek `LockstepClient`. Denetleyici ve sahne `FactorySession`dan farkı görmez;
 * paketler, karmalar ve komut sırası aynı kod yolundan geçer, yalnız soket yoktur.
 * Yetkili simülasyonun CPU maliyeti kare süresine girer: `authorityStepMs` ayrı raporlanır.
 */
export class LocalSession {
  status: SessionStatus = 'live';
  rttMs = 0;
  readonly lockstep = new LockstepClient();
  /** Yetkili simülasyonun tek adım süresi penceresi (ms). */
  authorityStepMs = 0;
  authoritySteps = 0;
  /** Kopyalanıp atılan istemci durumu sayısı (yeniden eşitleme). */
  resyncs = 0;

  private nextSeq = 1;
  private readonly waiting: Waiting[] = [];
  private readonly feed: LockstepFeed;
  private readonly now: () => number;
  private readonly sustainUnits: number;
  private epoch: number | null = null;
  private due = 0;

  /** `authority` yetkili dünyadır; istemci simülasyonu onun anlık görüntüsünden kurulur. */
  constructor(
    readonly authority: FactorySim,
    private readonly options: LocalSessionOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.sustainUnits = options.sustainUnits ?? 0;
    this.feed = new LockstepFeed(authority.tick);
    this.install();
  }

  private install(): void {
    this.lockstep.install(this.authority.snapshot(), { sustainUnits: this.sustainUnits });
  }

  get nextCommandSeq(): number {
    return this.nextSeq;
  }

  /** Komut sıraya girer; sonraki `pump`ta yetkili dünya uygular ve ack çözülür. */
  submit(command: FactoryCommand): Promise<Ack> {
    const seq = this.nextSeq++;
    return new Promise<Ack>((resolve) => {
      this.waiting.push({ seq, command, sentAt: this.now(), resolve });
    });
  }

  /**
   * Duvar saatine göre yetkili dünyayı ilerletir (sunucunun adım döngüsünün karşılığı) ve paketleri
   * istemciye verir. Her karenin başında çağrılır; uygulanan adım sayısını döndürür.
   */
  pump(now = this.now()): number {
    if (this.epoch === null) this.epoch = now - this.authority.tick * SIM.stepMs;
    const target = Math.floor((now - this.epoch) / SIM.stepMs);
    let steps = 0;
    while (this.authority.tick < target && steps < MAX_CATCH_UP) {
      this.authorityStep(now);
      steps++;
    }
    // Çok geride kalındıysa (arka plan sekmesi) birikimi at: yarış değil gerçek zaman izlenir.
    if (this.authority.tick < target) this.epoch = now - this.authority.tick * SIM.stepMs;
    return steps;
  }

  private authorityStep(now: number): void {
    const authority = this.authority;
    const batch = this.waiting.splice(0);
    for (const entry of batch) {
      const outcome = authority.apply(PLAYER_KEY, entry.seq, entry.command);
      if (outcome.fresh && outcome.result === RESULT.ok)
        this.feed.record(authority.tick, PLAYER_SLOT, entry.command);
      this.rttMs = now - entry.sentAt;
      entry.resolve({ seq: entry.seq, result: outcome.result, tick: authority.tick });
    }
    const started = performance.now();
    authority.step();
    this.authorityStepMs = performance.now() - started;
    this.authoritySteps++;
    const flushed = this.feed.flush(authority, 1);
    if (flushed === null) return;
    this.options.onPacket?.(flushed.bytes, flushed.packet);
    this.lockstep.receive(flushed.packet);
  }

  advance(maxSteps: number): number {
    return this.lockstep.advance(maxSteps);
  }

  /** Sapmada yetkili anlık görüntüyü yeniden kurar; sunucudaki yeniden el sıkışmanın karşılığı. */
  resync(): boolean {
    this.resyncs++;
    this.install();
    return true;
  }

  /**
   * Hata enjeksiyonu: istemci durumunu bozar. Sonraki karma denetiminde (en çok `NET.hashEvery`
   * adım) `desynced` olmalı ve denetleyici yeniden eşitlemelidir.
   */
  corruptClient(): boolean {
    const sim = this.lockstep.sim;
    if (sim === null) return false;
    sim.state.coreHp += 1;
    return true;
  }
}
