import { NET } from '@/config/factory';
import { writeTickPacket, type TickCommand, type TickPacket } from './lockstep';
import type { FactoryCommand } from '@/sim/commands';
import type { FactorySim } from '@/sim/sim';

/**
 * Sunucudan istemcilere giden kilit adımlı akış. Uygulanan komutları adım damgasıyla biriktirir ve
 * her `NET.syncEvery` adımda tek paket üretir; paket bütün istemciler için aynıdır.
 */
export class LockstepFeed {
  private commands: TickCommand[] = [];
  private from: number;
  packetsBuilt = 0;
  bytesBuilt = 0;

  constructor(startTick: number) {
    this.from = startTick;
  }

  /** Komut, uygulandığı adım numarasıyla kaydedilir (adım henüz çalışmadan). */
  record(tick: number, player: number, command: FactoryCommand): void {
    this.commands.push({ tick, player, command });
  }

  /**
   * Adım bittikten sonra çağrılır. Paket sınırına gelinmediyse `null`; geldiyse paketi ve baytlarını
   * verir. Karma aralığı geldiğinde durum karması pakete eklenir.
   */
  flush(sim: FactorySim, players: number): { packet: TickPacket; bytes: Uint8Array } | null {
    const to = sim.tick;
    if (to % NET.syncEvery !== 0 || to <= this.from) return null;
    const hash = to % NET.hashEvery === 0 ? { tick: to, value: sim.stateHash() } : null;
    const packet: TickPacket = { from: this.from, to, commands: this.commands, hash, players };
    const bytes = writeTickPacket(packet);
    this.from = to;
    this.commands = [];
    this.packetsBuilt++;
    this.bytesBuilt += bytes.length;
    return { packet, bytes };
  }
}
