import { describe, expect, it } from 'vitest';
import { BUILDING, KIND, MOVE_DIRECTIONS, REFUND_PERCENT } from '../../src/config/factory';
import { ByteReader, ByteWriter } from '../../src/net/bytes';
import {
  COMMAND,
  isPlayerKey,
  isSystemCommand,
  Ledger,
  parseCommand,
  readCommand,
  RESULT,
  writeCommand,
  type FactoryCommand,
} from '../../src/sim/commands';
import { place, run, smallSim, stage } from '../helpers/world';

describe('parseCommand', () => {
  it('geçerli yükleri komuta çevirir', () => {
    expect(parseCommand({ type: 1, x: 3, y: 4, kind: 2, rot: 1 }, 64, 64)).toEqual({
      type: 1,
      x: 3,
      y: 4,
      kind: 2,
      rot: 1,
    });
    expect(parseCommand({ type: 2, x: 0, y: 63 }, 64, 64)).toEqual({ type: 2, x: 0, y: 63 });
    expect(parseCommand({ type: 3, x: 1, y: 1, rot: 3 }, 64, 64)).toEqual({
      type: 3,
      x: 1,
      y: 1,
      rot: 3,
    });
  });

  it.each([
    [null],
    [undefined],
    [4],
    ['x'],
    [[]],
    [{}],
    [{ type: 1, x: 64, y: 0, kind: 1, rot: 0 }],
    [{ type: 1, x: -1, y: 0, kind: 1, rot: 0 }],
    [{ type: 1, x: 1.5, y: 0, kind: 1, rot: 0 }],
    [{ type: 1, x: 0, y: 0, kind: 1, rot: 4 }],
    [{ type: 1, x: 0, y: 0, kind: 300, rot: 0 }],
    [{ type: 3, x: 0, y: 0, rot: 9 }],
    [{ type: 9, x: 0, y: 0 }],
    [{ type: 1, x: Number.NaN, y: 0, kind: 1, rot: 0 }],
    [{ type: 1, x: '3', y: 0, kind: 1, rot: 0 }],
    [{ type: 4 }],
    [{ type: 4, dir: 17 }],
    [{ type: 4, dir: -1 }],
    [{ type: 4, dir: 1.5 }],
    [{ type: 5, key: 'player-hijack' }],
    [{ type: 5, x: 1, y: 1, key: 'player-hijack' }],
    [{ type: 6, x: 1, y: 1 }],
  ])('geçersiz yükü ve istemciden gelen sistem komutunu reddeder: %j', (payload) => {
    expect(parseCommand(payload, 64, 64)).toBeNull();
  });

  it('hareket niyetini koordinatsız kabul eder; 0 durdurur, 16 son yöndür', () => {
    expect(parseCommand({ type: 4, dir: 0 }, 64, 64)).toEqual({ type: 4, dir: 0 });
    expect(parseCommand({ type: 4, dir: MOVE_DIRECTIONS }, 64, 64)).toEqual({
      type: 4,
      dir: MOVE_DIRECTIONS,
    });
  });
});

describe('writeCommand / readCommand', () => {
  it('üç komutu gidiş dönüşte korur', () => {
    const commands: FactoryCommand[] = [
      { type: COMMAND.place, x: 5, y: 60, kind: KIND.drill, rot: 2 },
      { type: COMMAND.remove, x: 9, y: 9 },
      { type: COMMAND.rotate, x: 1, y: 2, rot: 3 },
    ];
    const out = new ByteWriter();
    for (const command of commands) writeCommand(out, command);
    const input = new ByteReader(out.finish());
    expect(commands.map(() => readCommand(input))).toEqual(commands);
  });

  it('hareket, katılım ve ayrılış komutları da gidiş dönüşte korunur', () => {
    const commands: FactoryCommand[] = [
      { type: COMMAND.move, dir: 0 },
      { type: COMMAND.move, dir: 16 },
      { type: COMMAND.join, key: 'player-roundtrip_01' },
      { type: COMMAND.leave },
      { type: COMMAND.rotate, x: 1, y: 2, rot: 3 },
    ];
    const out = new ByteWriter();
    for (const command of commands) writeCommand(out, command);
    const bytes = out.finish();
    const input = new ByteReader(bytes);
    expect(commands.map(() => readCommand(input))).toEqual(commands);
    expect(input.remaining).toBe(0);
  });

  it('geçersiz yön ya da anahtarlı hareket ve katılım null olur', () => {
    const badMove = new ByteWriter();
    badMove.u8(COMMAND.move);
    badMove.u8(MOVE_DIRECTIONS + 1);
    expect(readCommand(new ByteReader(badMove.finish()))).toBeNull();
    const badKey = new ByteWriter();
    badKey.u8(COMMAND.join);
    badKey.u8(3);
    badKey.bytes(new TextEncoder().encode('a/b'));
    expect(readCommand(new ByteReader(badKey.finish()))).toBeNull();
  });

  it('yalnız katılım ve ayrılış sistem komutudur', () => {
    expect(isSystemCommand({ type: COMMAND.join, key: 'player-system1' })).toBe(true);
    expect(isSystemCommand({ type: COMMAND.leave })).toBe(true);
    expect(isSystemCommand({ type: COMMAND.move, dir: 1 })).toBe(false);
    expect(isSystemCommand({ type: COMMAND.remove, x: 1, y: 1 })).toBe(false);
  });

  it('bilinmeyen komut türü null olur', () => {
    const out = new ByteWriter();
    out.u8(77);
    out.u16(1);
    out.u16(1);
    expect(readCommand(new ByteReader(out.finish()))).toBeNull();
  });
});

describe('applyCommand', () => {
  it('yerleştirir, bedelini düşer ve chunk yapı sürümünü artırır', () => {
    const sim = smallSim();
    const s = sim.state;
    const before = s.inventory[1];
    const tile = s.index(5, 5);
    const version = s.chunkVersion[s.chunkOfTile[tile]];
    expect(place(sim, 5, 5, KIND.conveyor, 2)).toBe(RESULT.ok);
    expect(s.kind[tile]).toBe(KIND.conveyor);
    expect(s.rot[tile]).toBe(2);
    expect(s.hp[tile]).toBe(BUILDING[KIND.conveyor].hp);
    expect(s.inventory[1]).toBe(before - 1);
    expect(s.chunkVersion[s.chunkOfTile[tile]]).toBeGreaterThan(version);
  });

  it('sınır, dolu kare, tür, cevher ve bakiye hatalarını ayırır', () => {
    const sim = smallSim();
    const s = sim.state;
    expect(run(sim, { type: COMMAND.place, x: -1, y: 0, kind: 1, rot: 0 })).toBe(
      RESULT.outOfBounds,
    );
    expect(place(sim, 5, 5, KIND.conveyor)).toBe(RESULT.ok);
    expect(place(sim, 5, 5, KIND.conveyor)).toBe(RESULT.occupied);
    expect(place(sim, 6, 5, KIND.core)).toBe(RESULT.badKind);
    s.ore[s.index(7, 5)] = 0;
    expect(place(sim, 7, 5, KIND.drill)).toBe(RESULT.needsOre);
    s.inventory[1] = 0;
    expect(place(sim, 8, 5, KIND.conveyor)).toBe(RESULT.tooPoor);
  });

  it('silince yarı iade eder, çekirdeği korur, boş kareyi söyler', () => {
    const sim = smallSim();
    const s = sim.state;
    s.ore[s.index(10, 10)] = 1;
    expect(place(sim, 10, 10, KIND.drill)).toBe(RESULT.ok);
    const poor = s.inventory[1];
    expect(run(sim, { type: COMMAND.remove, x: 10, y: 10 })).toBe(RESULT.ok);
    const refund = Math.floor((BUILDING[KIND.drill].cost.ore! * REFUND_PERCENT) / 100);
    expect(s.inventory[1]).toBe(poor + refund);
    expect(s.kind[s.index(10, 10)]).toBe(KIND.empty);
    expect(run(sim, { type: COMMAND.remove, x: 10, y: 10 })).toBe(RESULT.empty);
    const core = s.coreOrigin;
    expect(run(sim, { type: COMMAND.remove, x: core.x, y: core.y })).toBe(RESULT.protected);
  });

  it('döndürür; duvar ve taret döndürülmez', () => {
    const sim = smallSim();
    const s = sim.state;
    place(sim, 2, 2, KIND.conveyor, 0);
    place(sim, 3, 2, KIND.wall, 0);
    expect(run(sim, { type: COMMAND.rotate, x: 2, y: 2, rot: 3 })).toBe(RESULT.ok);
    expect(s.rot[s.index(2, 2)]).toBe(3);
    expect(run(sim, { type: COMMAND.rotate, x: 3, y: 2, rot: 1 })).toBe(RESULT.badKind);
    expect(run(sim, { type: COMMAND.rotate, x: 4, y: 2, rot: 1 })).toBe(RESULT.empty);
  });

  it('katı bina yol alanını kirletir, bant kirletmez', () => {
    const sim = smallSim();
    const s = sim.state;
    s.flowDirty = false;
    place(sim, 2, 2, KIND.conveyor);
    expect(s.flowDirty).toBe(false);
    place(sim, 3, 3, KIND.wall);
    expect(s.flowDirty).toBe(true);
  });
});

describe('Ledger', () => {
  it('yeni seq taze, aynı seq önbellek, eski seq kopya sayılır', () => {
    const ledger = new Ledger();
    expect(ledger.lookup('player-a', 1)).toEqual({ fresh: true });
    ledger.record('player-a', 5, RESULT.occupied);
    expect(ledger.lookup('player-a', 5)).toEqual({ fresh: false, result: RESULT.occupied });
    expect(ledger.lookup('player-a', 3)).toEqual({ fresh: false, result: RESULT.duplicate });
    expect(ledger.lookup('player-a', 6)).toEqual({ fresh: true });
    expect(ledger.lookup('player-b', 1)).toEqual({ fresh: true });
    expect(ledger.size).toBe(1);
  });

  it('geçersiz oyuncu anahtarını ve sıfır sırasını reddeder, son sırayı söyler', () => {
    const ledger = new Ledger();
    for (const bad of ['', 'kısa', 'çok-uzun-'.repeat(20), 'boşluk var 123', 'x'.repeat(65)])
      expect(() => ledger.record(bad, 1, 0)).toThrow(RangeError);
    expect(isPlayerKey('player-01_ok')).toBe(true);
    expect(isPlayerKey(42)).toBe(false);
    expect(ledger.lastSeq('player-a')).toBe(0);
    ledger.record('player-a', 7, 0);
    expect(ledger.lastSeq('player-a')).toBe(7);
  });

  it('sıralı gezer ve temizlenir', () => {
    const ledger = new Ledger();
    ledger.record('player-z', 1, 0);
    ledger.record('player-a', 2, 0);
    const keys: string[] = [];
    ledger.forEach((key) => keys.push(key));
    expect(keys).toEqual(['player-a', 'player-z']);
    ledger.clear();
    expect(ledger.size).toBe(0);
  });

  it('sim.apply aynı komutu ikinci kez uygulamaz', () => {
    const sim = smallSim();
    const command: FactoryCommand = {
      type: COMMAND.place,
      x: 5,
      y: 5,
      kind: KIND.conveyor,
      rot: 0,
    };
    const ore = sim.state.inventory[1];
    stage(sim, 'player-p', 5, 5);
    expect(sim.apply('player-p', 1, command)).toEqual({ fresh: true, result: RESULT.ok });
    expect(sim.apply('player-p', 1, command)).toEqual({ fresh: false, result: RESULT.ok });
    expect(sim.apply('player-p', 0, command)).toEqual({ fresh: false, result: RESULT.duplicate });
    expect(sim.state.inventory[1]).toBe(ore - 1);
  });
});
