// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BELT, NET } from '../../src/config/forge';
import { ByteWriter } from '../../src/net/bytes';
import {
  CHUNK,
  packHp,
  POS_SCALE,
  readView,
  SECTION,
  SYNC_MODE,
  TO_CLIENT,
  WIRE_VERSION,
  writeAck,
  writePing,
  writePong,
  writeView,
  readAck,
  readPong,
  readWelcome,
  writeWelcome,
  type Hud,
} from '../../src/net/protocol';
import { Replica } from '../../src/net/replica';
import { buildComb } from '../../src/sim/scenario';
import { ForgeSim } from '../../src/sim/sim';
import { dueAt, Replicator } from '../../server/replication';
import { SMALL } from '../helpers/world';

const ALL = { x: 8, y: 6 };

function busy(): ForgeSim {
  const sim = ForgeSim.create({ ...SMALL, seed: 11, sustainUnits: 80 });
  buildComb(sim, { maxBelts: 500, turrets: 8, fill: 2, smelterEvery: 2 });
  return sim;
}

const HUD: Hud = {
  tick: 0,
  coreHp: 2000,
  wave: 1,
  nextWaveIn: 10,
  defeats: 0,
  ore: 5,
  plate: 6,
  deliveredOre: 7,
  deliveredPlate: 8,
  units: 9,
  players: 1,
  tickMs100: 12,
};

function welcomeOf(sim: ForgeSim) {
  return {
    wire: WIRE_VERSION,
    epoch: 1,
    tick: sim.tick,
    width: sim.state.width,
    height: sim.state.height,
    chunk: CHUNK,
    tickRate: 30,
    maxAoi: ALL,
    lastSeq: 0,
    mode: SYNC_MODE.aoi,
    sustainUnits: 0,
    slot: 0,
  };
}

/** Bir istemciyi tick tick besler; her çerçeveyi kopyaya uygular. */
function connect(sim: ForgeSim) {
  const replicator = new Replicator(sim);
  const cursor = replicator.createCursor(ALL, 0);
  const replica = new Replica();
  replica.reset(welcomeOf(sim));
  const frames: Uint8Array[] = [];
  const pump = (ticks: number, now = 0) => {
    for (let index = 0; index < ticks; index++) {
      sim.step();
      replicator.collectShots(sim.shots);
      const frame = replicator.frameFor(
        cursor,
        dueAt(sim.tick, cursor.phase, () => ({ ...HUD, tick: sim.tick })),
      );
      if (frame) {
        frames.push(frame);
        replica.apply(frame, now + index * 33);
      }
    }
  };
  return { replicator, cursor, replica, frames, pump };
}

describe('çoğaltma gidiş-dönüşü', () => {
  it('yapı, bant ve birimler istemci kopyasında sunucuyla aynıdır', () => {
    const sim = busy();
    sim.run(200);
    const { replica, pump } = connect(sim);
    pump(30);
    const s = sim.state;
    for (let tile = 0; tile < s.count; tile++) {
      expect(replica.kind[tile]).toBe(s.kind[tile]);
      expect(replica.rot[tile]).toBe(s.rot[tile]);
      expect(replica.ore[tile]).toBe(s.ore[tile]);
      expect(replica.hp[tile]).toBe(packHp(s.kind[tile], s.hp[tile]));
    }
    // Bant: son bant çevriminden sonraki adımlarda sunucu ilerlemiş olabilir; çevrim anında eşitlenir.
    const lastBelt = sim.tick - (sim.tick % NET.beltsEvery);
    expect(lastBelt).toBeGreaterThan(0);
    pump(NET.beltsEvery - (sim.tick % NET.beltsEvery));
    expect(sim.tick % NET.beltsEvery).toBe(0);
    for (let tile = 0; tile < s.count; tile++) {
      expect(replica.beltCount[tile]).toBe(s.beltCount[tile]);
      for (let slot = 0; slot < s.beltCount[tile]; slot++) {
        expect(replica.beltItem[tile * BELT.slots + slot]).toBe(
          s.beltItem[tile * BELT.slots + slot],
        );
        expect(replica.beltPos[tile * BELT.slots + slot]).toBe(s.beltPos[tile * BELT.slots + slot]);
      }
    }
  });

  it('birim konumu 1/64 tile hassasiyetinde ve sayıları eşittir', () => {
    const sim = busy();
    sim.run(300);
    const { replica, pump } = connect(sim);
    pump(NET.dynamicsEvery * 2);
    while (sim.tick % NET.dynamicsEvery !== 0) pump(1);
    expect(replica.units.size).toBe(sim.state.aliveUnits);
    for (const unit of sim.state.units) {
      if (!unit.alive) continue;
      const remote = replica.units.get(unit.slot)!;
      expect(remote).toBeDefined();
      expect(Math.abs(remote.x - unit.x)).toBeLessThanOrEqual(0.5 / POS_SCALE + 1e-9);
      expect(Math.abs(remote.y - unit.y)).toBeLessThanOrEqual(0.5 / POS_SCALE + 1e-9);
    }
  });

  it('taret atışları istemciye ulaşır ve bayt sayacı büyür', () => {
    const sim = busy();
    const { cursor, replica, pump } = connect(sim);
    let seen = 0;
    for (let step = 0; step < 2600; step++) {
      pump(1, step * 33);
      seen = Math.max(seen, replica.shots.length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(cursor.bytes.dynamics).toBeGreaterThan(0);
  });

  it('HUD bölümü gelir', () => {
    const sim = busy();
    const { replica, pump } = connect(sim);
    pump(NET.hudEvery * 2);
    expect(replica.hud?.coreHp).toBe(2000);
    expect(replica.hud?.players).toBe(1);
  });

  it('tıkanmış bant değişmediği sürece yeniden gönderilmez', () => {
    const sim = ForgeSim.create({ ...SMALL, seed: 3 });
    const s = sim.state;
    for (let x = 5; x < 15; x++) {
      const tile = s.index(x, 10);
      s.kind[tile] = 1;
      s.rot[tile] = 0;
      s.beltCount[tile] = 4;
      for (let slot = 0; slot < 4; slot++) {
        s.beltPos[tile * BELT.slots + slot] = BELT.length - 1 - slot * BELT.spacing;
        s.beltItem[tile * BELT.slots + slot] = 1;
      }
      s.touchStructure(tile);
    }
    const { cursor, pump } = connect(sim);
    pump(NET.beltsEvery * 2);
    const first = cursor.bytes.belts;
    expect(first).toBeGreaterThan(0);
    pump(NET.beltsEvery * 8);
    expect(cursor.bytes.belts).toBe(first);
  });

  it('boş dünyada bant bölümü hiç gönderilmez', () => {
    const { cursor, pump } = connect(ForgeSim.create({ ...SMALL, seed: 4 }));
    pump(NET.beltsEvery * 4);
    expect(cursor.bytes.belts).toBe(0);
  });
});

describe('ilgi alanı', () => {
  it('kırpar: dünya dışına ve izin verilen boyutun ötesine çıkamaz', () => {
    const sim = busy();
    const cursor = new Replicator(sim).createCursor({ x: 2, y: 2 }, 0);
    expect(cursor.clamp({ x0: 0, y0: 0, x1: 50, y1: 50 })).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(cursor.clamp({ x0: 3, y0: 3, x1: 9, y1: 9 })).toEqual({ x0: 3, y0: 3, x1: 3, y1: 3 });
    expect(cursor.clamp({ x0: 200, y0: 200, x1: 255, y1: 255 })).toEqual({
      x0: 3,
      y0: 3,
      x1: 3,
      y1: 3,
    });
  });

  it('dar alan yalnız içindeki chunk ve birimleri taşır; alana girenin bandı yeniden gelir', () => {
    const sim = busy();
    sim.run(250);
    const { cursor, replica, pump } = connect(sim);
    cursor.setRect({ x0: 0, y0: 0, x1: 1, y1: 1 });
    pump(NET.beltsEvery * 2);
    const inside = (x: number, y: number) => x < 2 * CHUNK && y < 2 * CHUNK;
    for (const unit of replica.units.values()) expect(inside(unit.x, unit.y)).toBe(true);
    const s = sim.state;
    let outsideKnown = 0;
    for (let tile = 0; tile < s.count; tile++) {
      const x = tile % s.width;
      const y = Math.floor(tile / s.width);
      if (!inside(x, y) && replica.kind[tile] !== 0) outsideKnown++;
    }
    expect(outsideKnown).toBe(0);

    cursor.setRect({ x0: 2, y0: 0, x1: 3, y1: 1 });
    while (sim.tick % NET.beltsEvery !== 0) pump(1);
    pump(NET.beltsEvery);
    while (sim.tick % NET.beltsEvery !== 0) pump(1);
    for (let tile = 0; tile < s.count; tile++) {
      const x = tile % s.width;
      const y = Math.floor(tile / s.width);
      if (x >= 2 * CHUNK && y < 2 * CHUNK) expect(replica.beltCount[tile]).toBe(s.beltCount[tile]);
    }
  });
});

describe('çerçeve biçimi ve bozuk giriş', () => {
  it('bölüm ve üstbilgi baytları sayaçlarla tutarlıdır', () => {
    const sim = busy();
    const { cursor, frames, pump } = connect(sim);
    pump(120);
    const total = frames.reduce((sum, frame) => sum + frame.length, 0);
    const bytes = cursor.bytes;
    expect(bytes.structure + bytes.dynamics + bytes.belts + bytes.hud + bytes.header).toBe(total);
    expect(cursor.frames).toBe(frames.length);
  });

  it('çerçevesiz bağlantı, bilinmeyen bölüm ve dünya dışı chunk reddedilir', () => {
    const sim = busy();
    const fresh = new Replica();
    expect(() => fresh.apply(new Uint8Array(8), 0)).toThrow(RangeError);

    const replica = new Replica();
    replica.reset(welcomeOf(sim));
    const unknown = new ByteWriter();
    unknown.u32(1);
    unknown.u8(1);
    unknown.u8(99);
    unknown.u32(0);
    expect(() => replica.apply(unknown.finish(), 0)).toThrow(/Bilinmeyen bölüm/);

    const outside = new ByteWriter();
    outside.u32(1);
    outside.u8(1);
    outside.u8(SECTION.structure);
    outside.u32(2 + 2 + 4 + 512);
    outside.u16(1);
    outside.u16(60000);
    outside.u32(1);
    outside.bytes(new Uint8Array(512));
    expect(() => replica.apply(outside.finish(), 0)).toThrow(/dünya dışında/);

    const truncated = new ByteWriter();
    truncated.u32(1);
    truncated.u8(1);
    expect(() => replica.apply(truncated.finish(), 0)).toThrow(RangeError);
  });

  it('bant yoğunluğu sınırı aşan paket reddedilir', () => {
    const sim = busy();
    const replica = new Replica();
    replica.reset(welcomeOf(sim));
    const body = new ByteWriter();
    body.u8(0);
    body.u8(BELT.slots + 1);
    const frame = new ByteWriter();
    frame.u32(1);
    frame.u8(1);
    frame.u8(SECTION.belts);
    frame.u32(2 + 2 + 2 + body.length);
    frame.u16(1);
    frame.u16(0);
    frame.u16(body.length);
    frame.bytes(body.finish());
    expect(() => replica.apply(frame.finish(), 0)).toThrow(/Bant doluluğu/);
  });
});

describe('küçük mesajlar', () => {
  it('karşılama, onay, ping ve görünüm kodlaması gidiş-dönüşte korunur', () => {
    const welcome = {
      wire: WIRE_VERSION,
      epoch: 77,
      tick: 123456,
      width: 256,
      height: 256,
      chunk: 16,
      tickRate: 30,
      maxAoi: { x: 8, y: 6 },
      lastSeq: 42,
      mode: SYNC_MODE.lockstep,
      sustainUnits: 300,
      slot: 5,
    };
    expect(readWelcome(writeWelcome(welcome))).toEqual(welcome);
    expect(readAck(writeAck({ seq: 9, result: 3, tick: 11 }))).toEqual({
      seq: 9,
      result: 3,
      tick: 11,
    });
    expect(readPong(writePong(12.5, 99))).toEqual({ clientTime: 12.5, serverTick: 99 });
    expect(writePing(1).length).toBe(8);
    expect(readView(writeView({ x0: 1, y0: 2, x1: 3, y1: 4 }))).toEqual({
      x0: 1,
      y0: 2,
      x1: 3,
      y1: 4,
    });
    expect(readView(Uint8Array.of(3, 3, 2, 3))).toBeNull();
    expect(readView(Uint8Array.of(1, 2, 3))).toBeNull();
    const bad = writeWelcome(welcome);
    bad[0] = 9;
    expect(() => readWelcome(bad)).toThrow(/tel sürümü/);
    expect(TO_CLIENT.frame).toBe(1);
  });
});
