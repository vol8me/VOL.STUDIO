import { ByteReader, ByteWriter } from './bytes';
import { readCommand, writeCommand, type ForgeCommand } from '@/sim/commands';
import { ForgeSim } from '@/sim/sim';
import { SnapshotError } from '@/sim/snapshot';

/**
 * Kilit adımlı eşitleme: fabrika ve birim simülasyonu istemcide de koşar, sunucudan yalnız komutlar
 * ve zaman işaretleri gelir. Bant sayısı ne olursa olsun ağ yükü komut sayısıyla orantılıdır.
 * Simülasyon deterministik olduğu için sunucuyla aynı duruma ulaşır; periyodik karma sapmayı yakalar.
 */

/** Bir paketteki komut: hangi adımda uygulandığı ve hangi oyuncunun olduğu. */
export interface TickCommand {
  readonly tick: number;
  readonly player: number;
  readonly command: ForgeCommand;
}

/** `[from, to)` adımlarını kapsar; `to` sunucunun tamamladığı adım sayısıdır. */
export interface TickPacket {
  readonly from: number;
  readonly to: number;
  readonly commands: readonly TickCommand[];
  /** Varsa `hashTick` anındaki durum karması (adım `hashTick`e ulaşıldığında, komutlar uygulanmadan önce). */
  readonly hash: { readonly tick: number; readonly value: number } | null;
  readonly players: number;
}

const FLAG_HASH = 1;

export function writeTickPacket(packet: TickPacket): Uint8Array {
  const out = new ByteWriter(16 + packet.commands.length * 12);
  out.u32(packet.from);
  out.u16(packet.to - packet.from);
  out.u8(packet.hash ? FLAG_HASH : 0);
  out.u8(packet.players);
  if (packet.hash) {
    out.u32(packet.hash.tick);
    out.u32(packet.hash.value);
  }
  out.u16(packet.commands.length);
  for (const entry of packet.commands) {
    out.u16(entry.tick - packet.from);
    out.u8(entry.player);
    writeCommand(out, entry.command);
  }
  return out.finish();
}

export function readTickPacket(bytes: Uint8Array): TickPacket {
  const input = new ByteReader(bytes);
  const from = input.u32();
  const span = input.u16();
  const flags = input.u8();
  const players = input.u8();
  const hash = flags & FLAG_HASH ? { tick: input.u32(), value: input.u32() } : null;
  const count = input.u16();
  const commands: TickCommand[] = [];
  for (let index = 0; index < count; index++) {
    const offset = input.u16();
    const player = input.u8();
    const command = readCommand(input);
    if (command === null) throw new RangeError('Paketteki komut bilinmiyor.');
    if (offset >= span) throw new RangeError('Komut paketin aralığı dışında.');
    commands.push({ tick: from + offset, player, command });
  }
  if (input.remaining !== 0) throw new RangeError('Paket sonunda artık bayt var.');
  return { from, to: from + span, commands, hash, players };
}

export type LockstepStatus = 'waiting' | 'running' | 'desynced';

export interface LockstepMetrics {
  stepsRun: number;
  commandsApplied: number;
  hashChecks: number;
  maxLagTicks: number;
}

/**
 * İstemci tarafı: anlık görüntüyü kurar, paketleri sıraya alır ve simülasyonu paketlerin izin verdiği
 * kadar ilerletir. Çizim `sim.state`ten okur.
 */
export class LockstepClient {
  sim: ForgeSim | null = null;
  status: LockstepStatus = 'waiting';
  /** Sunucunun tamamladığını bildirdiği adım sayısı; simülasyon bunun ötesine geçmez. */
  horizon = 0;
  players = 0;
  desyncAt = -1;
  readonly metrics: LockstepMetrics = {
    stepsRun: 0,
    commandsApplied: 0,
    hashChecks: 0,
    maxLagTicks: 0,
  };

  private readonly queued: TickCommand[] = [];
  private cursor = 0;
  private hashes = new Map<number, number>();
  private buffered: TickPacket[] = [];

  /** Anlık görüntü gelmeden gelen paketler tutulur; kurulumda tekrar oynatılır. */
  receive(packet: TickPacket): void {
    if (this.sim === null) {
      this.buffered.push(packet);
      return;
    }
    this.absorb(packet);
  }

  /** Bozuk anlık görüntü `SnapshotError` fırlatır ve hiçbir şey kurulmaz. */
  install(snapshot: Uint8Array, options: { sustainUnits?: number } = {}): void {
    const sim = ForgeSim.restore(snapshot, options);
    this.sim = sim;
    this.horizon = sim.tick;
    this.queued.length = 0;
    this.cursor = 0;
    this.hashes.clear();
    this.status = 'running';
    this.desyncAt = -1;
    const waiting = this.buffered;
    this.buffered = [];
    for (const packet of waiting) this.absorb(packet);
  }

  private absorb(packet: TickPacket): void {
    if (packet.to <= this.horizon) return;
    if (packet.from > this.horizon) {
      // Paket sırasında boşluk var: kayıp paket, simülasyon artık güvenilir değil.
      this.status = 'desynced';
      this.desyncAt = this.horizon;
      return;
    }
    for (const entry of packet.commands) if (entry.tick >= this.horizon) this.queued.push(entry);
    if (packet.hash) this.hashes.set(packet.hash.tick, packet.hash.value);
    this.horizon = packet.to;
    this.players = packet.players;
  }

  /** Simülasyon ile sunucu arasındaki adım farkı. */
  get lagTicks(): number {
    return this.sim ? this.horizon - this.sim.tick : 0;
  }

  /**
   * En çok `maxSteps` adım ilerler; paketlerin kapsadığı adımların ötesine geçmez. Çalıştırılan adım
   * sayısını döndürür. Sapma saptanırsa durur ve durumu `desynced` olur.
   */
  advance(maxSteps: number): number {
    const sim = this.sim;
    if (sim === null || this.status !== 'running') return 0;
    this.metrics.maxLagTicks = Math.max(this.metrics.maxLagTicks, this.horizon - sim.tick);
    let steps = 0;
    while (steps < maxSteps && sim.tick < this.horizon) {
      const tick = sim.tick;
      const expected = this.hashes.get(tick);
      if (expected !== undefined) {
        this.hashes.delete(tick);
        this.metrics.hashChecks++;
        if (sim.stateHash() !== expected) {
          this.status = 'desynced';
          this.desyncAt = tick;
          return steps;
        }
      }
      if (this.cursor < this.queued.length && this.queued[this.cursor].tick < tick) {
        // Atlanmış bir komut var: paket sırası bozuk ya da bir paket kayıp.
        this.status = 'desynced';
        this.desyncAt = tick;
        return steps;
      }
      while (this.cursor < this.queued.length && this.queued[this.cursor].tick === tick) {
        const entry = this.queued[this.cursor++];
        // Sonuç sunucuyla aynıdır; istemci defteri tutmaz, bu yüzden doğrudan uygulanır.
        sim.applyRaw(entry.command);
        this.metrics.commandsApplied++;
      }
      if (this.cursor > 4096) {
        this.queued.splice(0, this.cursor);
        this.cursor = 0;
      }
      sim.step();
      steps++;
      this.metrics.stepsRun++;
    }
    return steps;
  }
}

export { SnapshotError };
