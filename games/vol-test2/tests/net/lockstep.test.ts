import { describe, expect, it } from 'vitest';
import { createStatefulRandom } from '@volstudio/core/random';
import { KIND, NET } from '../../src/config/forge';
import { ByteWriter } from '../../src/net/bytes';
import {
  LockstepClient,
  readTickPacket,
  writeTickPacket,
  type TickPacket,
} from '../../src/net/lockstep';
import { COMMAND, RESULT, type ForgeCommand } from '../../src/sim/commands';
import { buildComb } from '../../src/sim/scenario';
import { ForgeSim } from '../../src/sim/sim';
import { LockstepFeed } from '../../server/lockstepFeed';
import { SMALL } from '../helpers/world';

/** Sunucu tarafı: gerçek akış, gerçek kodlama; ağ yerine doğrudan teslim. */
class Server {
  readonly sim: ForgeSim;
  readonly feed: LockstepFeed;
  readonly clients: LockstepClient[] = [];
  readonly random = createStatefulRandom(4242);
  seq = 1;
  accepted = 0;
  packetBytes = 0;
  packets = 0;

  constructor(seed = 21) {
    this.sim = ForgeSim.create({ ...SMALL, seed });
    buildComb(this.sim, { maxBelts: 300, turrets: 6, fill: 1, smelterEvery: 2 });
    this.feed = new LockstepFeed(this.sim.tick);
  }

  private randomCommand(): ForgeCommand {
    const r = this.random;
    const x = Math.floor(r.next() * SMALL.width);
    const y = Math.floor(r.next() * SMALL.height);
    const roll = r.next();
    if (roll < 0.55)
      return {
        type: COMMAND.place,
        x,
        y,
        kind: [KIND.conveyor, KIND.conveyor, KIND.wall, KIND.turret][Math.floor(r.next() * 4)],
        rot: Math.floor(r.next() * 4),
      };
    if (roll < 0.8) return { type: COMMAND.remove, x, y };
    return { type: COMMAND.rotate, x, y, rot: Math.floor(r.next() * 4) };
  }

  /** Bir sunucu adımı: bu adımın komutları, adım, paket akışı. */
  tick(commandsPerTick = 0.6): void {
    const sim = this.sim;
    while (this.random.next() < commandsPerTick / (1 + commandsPerTick)) {
      const command = this.randomCommand();
      const outcome = sim.apply('player-synthetic', this.seq++, command);
      if (outcome.fresh && outcome.result === RESULT.ok) {
        this.feed.record(sim.tick, 0, command);
        this.accepted++;
      }
    }
    sim.step();
    const flushed = this.feed.flush(sim, this.clients.length);
    if (!flushed) return;
    this.packets++;
    this.packetBytes += flushed.bytes.length;
    for (const client of this.clients) client.receive(readTickPacket(flushed.bytes));
  }

  join(): LockstepClient {
    const client = new LockstepClient();
    client.install(this.sim.snapshot());
    this.clients.push(client);
    return client;
  }
}

describe('kilit adımlı eşitleme', () => {
  it('istemci rastgele komut akışında sunucuyla aynı durumda kalır', () => {
    const server = new Server();
    const client = server.join();
    for (let step = 0; step < 1350; step++) {
      server.tick();
      client.advance(Infinity);
      if (client.sim!.tick === server.sim.tick && step % 150 === 0)
        expect(client.sim!.stateHash()).toBe(server.sim.stateHash());
    }
    expect(client.status).toBe('running');
    expect(client.sim!.tick).toBe(server.sim.tick);
    expect(client.sim!.stateHash()).toBe(server.sim.stateHash());
    expect(client.metrics.hashChecks).toBeGreaterThan(6);
    expect(client.metrics.commandsApplied).toBe(server.accepted);
    expect(server.accepted).toBeGreaterThan(50);
  });

  it('paket sınırında olmayan bir adımda geç katılan, anlık görüntüyle yetişir', () => {
    const server = new Server(33);
    const early = server.join();
    for (let step = 0; step < 301; step++) {
      server.tick();
      early.advance(Infinity);
    }
    expect(server.sim.tick % NET.syncEvery).toBe(1);
    const late = new LockstepClient();
    const snapshot = server.sim.snapshot();
    server.clients.push(late);
    for (let step = 0; step < 5; step++) {
      server.tick();
      early.advance(Infinity);
    }
    late.install(snapshot);
    for (let step = 0; step < 700; step++) {
      server.tick();
      early.advance(Infinity);
      late.advance(Infinity);
    }
    expect(late.status).toBe('running');
    expect(late.sim!.stateHash()).toBe(server.sim.stateHash());
    expect(early.sim!.stateHash()).toBe(server.sim.stateHash());
  });

  it('paket ağdan gecikmeli gelse de istemci paket kapsamının ötesine geçmez', () => {
    const server = new Server(5);
    const client = server.join();
    for (let step = 0; step < 100; step++) server.tick();
    expect(client.lagTicks).toBeGreaterThan(0);
    expect(client.advance(10)).toBe(10);
    expect(client.sim!.tick).toBe(10);
    client.advance(Infinity);
    expect(client.sim!.tick).toBe(client.horizon);
    expect(client.advance(5)).toBe(0);
  });

  it('istemci durumu bozulursa sonraki karma denetiminde sapmayı bildirir ve durur', () => {
    const server = new Server(8);
    const client = server.join();
    for (let step = 0; step < 100; step++) {
      server.tick();
      client.advance(Infinity);
    }
    client.sim!.state.coreHp -= 1;
    for (let step = 0; step < NET.hashEvery * 2; step++) {
      server.tick();
      client.advance(Infinity);
    }
    expect(client.status).toBe('desynced');
    expect(client.desyncAt % NET.hashEvery).toBe(0);
    const frozen = client.sim!.tick;
    server.tick();
    expect(client.advance(100)).toBe(0);
    expect(client.sim!.tick).toBe(frozen);
  });

  it('kayıp paket boşluk olarak saptanır', () => {
    const server = new Server(9);
    const client = server.join();
    const lost: TickPacket[] = [];
    const real = client.receive.bind(client);
    let count = 0;
    client.receive = (packet) => {
      if (++count === 5) lost.push(packet);
      else real(packet);
    };
    for (let step = 0; step < 40; step++) server.tick();
    client.advance(Infinity);
    expect(lost).toHaveLength(1);
    expect(client.status).toBe('desynced');
  });

  it('bozuk anlık görüntü kurulumu reddeder ve istemci boş kalır', () => {
    const client = new LockstepClient();
    expect(() => client.install(new Uint8Array(40))).toThrow();
    expect(client.sim).toBeNull();
    expect(client.advance(5)).toBe(0);
  });

  it('komutsuz dünyada paket başına yük küçüktür', () => {
    const server = new Server(10);
    server.join();
    for (let step = 0; step < 600; step++) server.tick(0);
    expect(server.packets).toBe(300);
    expect(server.packetBytes / server.packets).toBeLessThan(14);
  });
});

describe('paket kodlaması', () => {
  const packet: TickPacket = {
    from: 100,
    to: 102,
    commands: [
      {
        tick: 100,
        player: 3,
        command: { type: COMMAND.place, x: 4, y: 5, kind: KIND.drill, rot: 2 },
      },
      { tick: 101, player: 0, command: { type: COMMAND.remove, x: 9, y: 9 } },
    ],
    hash: { tick: 102, value: 0xdeadbeef },
    players: 5,
  };

  it('gidiş-dönüşte korunur', () => {
    expect(readTickPacket(writeTickPacket(packet))).toEqual(packet);
    const bare = { ...packet, commands: [], hash: null };
    expect(readTickPacket(writeTickPacket(bare))).toEqual(bare);
  });

  it('kesik, artık baytlı, aralık dışı ve bilinmeyen komutlu paketi reddeder', () => {
    const good = writeTickPacket(packet);
    expect(() => readTickPacket(good.slice(0, good.length - 2))).toThrow(RangeError);
    const padded = new Uint8Array(good.length + 1);
    padded.set(good);
    expect(() => readTickPacket(padded)).toThrow(/artık/);

    const outside = new ByteWriter();
    outside.u32(100);
    outside.u16(2);
    outside.u8(0);
    outside.u8(1);
    outside.u16(1);
    outside.u16(5);
    outside.u8(0);
    outside.u8(COMMAND.remove);
    outside.u16(1);
    outside.u16(1);
    expect(() => readTickPacket(outside.finish())).toThrow(/aralığı dışında/);

    const unknown = new ByteWriter();
    unknown.u32(100);
    unknown.u16(2);
    unknown.u8(0);
    unknown.u8(1);
    unknown.u16(1);
    unknown.u16(0);
    unknown.u8(0);
    unknown.u8(77);
    unknown.u16(1);
    unknown.u16(1);
    expect(() => readTickPacket(unknown.finish())).toThrow(/bilinmiyor/);
  });
});
