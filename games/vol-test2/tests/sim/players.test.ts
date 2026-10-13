import { describe, expect, it } from 'vitest';
import {
  DIR_VECTORS,
  KIND,
  MOVE_DIRECTIONS,
  PLAYER,
  UNIT,
  UNIT_KIND,
  UNIT_PLAYER_DAMAGE,
} from '../../src/config/factory';
import { applyCommand, COMMAND, RESULT } from '../../src/sim/commands';
import { damagePlayer, joinPlayer, leavePlayerSlot, spawnPoint } from '../../src/sim/players';
import { SHOT_SOURCE } from '../../src/sim/shot';
import { PLAYER_STATUS } from '../../src/sim/state';
import { place, run, smallSim, stage } from '../helpers/world';

const KEY = 'tank-player-1';
const OTHER = 'tank-player-2';

/** Doğmuş bir tankla küçük dünya; dalga ve birim yoktur, adımlar yalnız oyuncuyu sınar. */
function withTank(key = KEY) {
  const sim = smallSim();
  sim.state.nextWaveTick = 1_000_000;
  sim.applyRaw({ type: COMMAND.join, key }, -1);
  const slot = sim.state.players.slotOf(key);
  return { sim, s: sim.state, p: sim.state.players, slot };
}

function steer(sim: ReturnType<typeof smallSim>, key: string, dir: number): number {
  return run(sim, { type: COMMAND.move, dir }, key);
}

describe('oyuncu yuvaları', () => {
  it('anahtara en düşük boş yuvayı verir; aynı anahtarla ikinci katılım hiçbir şeyi değiştirmez', () => {
    const { sim, p } = withTank();
    expect(p.slotOf(KEY)).toBe(0);
    const at = { x: p.x[0], y: p.y[0] };
    expect(joinPlayer(sim.state, KEY)).toEqual({ slot: 0, changed: false });
    expect({ x: p.x[0], y: p.y[0] }).toEqual(at);
    expect(joinPlayer(sim.state, OTHER)).toEqual({ slot: 1, changed: true });
    expect(p.count).toBe(2);
  });

  it('ayrılan yuva boşalır, sonraki katılımcı onu alır; tank dünyadan kalkar', () => {
    const { sim, p } = withTank();
    joinPlayer(sim.state, OTHER);
    expect(leavePlayerSlot(sim.state, 0)).toBe(true);
    expect(leavePlayerSlot(sim.state, 0)).toBe(false);
    expect(p.status[0]).toBe(PLAYER_STATUS.free);
    expect(p.slotOf(KEY)).toBe(-1);
    expect(joinPlayer(sim.state, 'tank-player-3')).toEqual({ slot: 0, changed: true });
  });

  it('yuvalar dolunca katılım -1 döner ve durum değişmez', () => {
    const { sim, p } = withTank();
    for (let index = 1; index < PLAYER.slots; index++)
      expect(joinPlayer(sim.state, `tank-filler-${index}`).slot).toBe(index);
    expect(joinPlayer(sim.state, 'tank-overflow')).toEqual({ slot: -1, changed: false });
    expect(p.count).toBe(PLAYER.slots);
  });

  it('doğuş noktası çekirdek halkasındadır ve katı binanın içine düşmez', () => {
    const { sim, s } = withTank();
    const core = s.coreCenter;
    const first = spawnPoint(s, 0);
    expect(Math.hypot(first.x - core.x, first.y - core.y)).toBeCloseTo(PLAYER.spawnRing, 5);
    // İlk adayın tile'ını duvarla kapat: doğuş başka bir yön ya da halka seçer.
    const tile = s.index(Math.floor(first.x), Math.floor(first.y));
    s.kind[tile] = KIND.wall;
    const next = spawnPoint(s, 0);
    expect(next).not.toEqual(first);
    expect(s.kind[s.index(Math.floor(next.x), Math.floor(next.y))]).not.toBe(KIND.wall);
    expect(sim.state.players.status[0]).toBe(PLAYER_STATUS.alive);
  });
});

describe('hareket', () => {
  it('doğuya sürerken adım başına tam hız kadar ilerler', () => {
    const { sim, p, slot } = withTank();
    const startX = p.x[slot];
    const startY = p.y[slot];
    expect(steer(sim, KEY, 1)).toBe(RESULT.ok);
    sim.run(10);
    expect(p.x[slot]).toBeCloseTo(startX + PLAYER.speed * 10 * DIR_VECTORS[0][0], 9);
    expect(p.y[slot]).toBeCloseTo(startY, 9);
  });

  it('niyet süresi dolunca tank kendiliğinden durur (kopan istemci kaçak bırakmaz)', () => {
    const { sim, p, slot } = withTank();
    steer(sim, KEY, 9);
    sim.run(PLAYER.moveTtlTicks + 5);
    expect(p.dir[slot]).toBe(0);
    const stopped = p.x[slot];
    sim.run(20);
    expect(p.x[slot]).toBe(stopped);
  });

  it('niyeti yenilemek süreyi uzatır; sıfır niyeti hemen durdurur', () => {
    const { sim, p, slot } = withTank();
    steer(sim, KEY, 9);
    sim.run(PLAYER.moveTtlTicks - 10);
    steer(sim, KEY, 9);
    sim.run(PLAYER.moveTtlTicks - 10);
    expect(p.dir[slot]).toBe(9);
    steer(sim, KEY, 0);
    const stopped = p.x[slot];
    sim.run(5);
    expect(p.x[slot]).toBe(stopped);
  });

  it('on altı yönün hepsi birim hızdadır (bir yön diğerinden hızlı değil)', () => {
    for (let dir = 1; dir <= MOVE_DIRECTIONS; dir++) {
      const [vx, vy] = DIR_VECTORS[dir - 1];
      expect(Math.hypot(vx, vy)).toBeCloseTo(1, 12);
    }
  });

  it('katı bina tankı durdurur, duvar boyunca kaydırır', () => {
    const { sim, s, p, slot } = withTank();
    p.x[slot] = 20.5;
    p.y[slot] = 20.5;
    for (let y = 15; y < 30; y++) s.kind[s.index(24, y)] = KIND.wall;
    steer(sim, KEY, 3);
    sim.run(60);
    expect(p.x[slot]).toBeLessThanOrEqual(24 - PLAYER.radius + 1e-9);
    // Çapraz sürüş duvara dayanıp y'de ilerlemeye devam eder.
    expect(p.y[slot]).toBeGreaterThan(20.5);
  });

  it('bant geçilebilir, dünya kenarı geçilemez', () => {
    const { sim, s, p, slot } = withTank();
    p.x[slot] = 5.5;
    p.y[slot] = 10.5;
    s.kind[s.index(6, 10)] = KIND.conveyor;
    steer(sim, KEY, 1);
    sim.run(30);
    expect(p.x[slot]).toBeGreaterThan(6.5);
    p.x[slot] = 1.2;
    steer(sim, KEY, 9);
    sim.run(60);
    expect(p.x[slot]).toBeGreaterThanOrEqual(PLAYER.radius - 1e-9);
  });

  it('aynı komut dizisi iki dünyada aynı durumu ve karmayı verir', () => {
    const run2 = () => {
      const { sim } = withTank();
      // Sıra numaraları sabit: defter anlık görüntüye girer ve `hash()` onu da kapsar.
      [1, 4, 9, 13, 16, 2].forEach((dir, index) => {
        sim.apply(KEY, index + 1, { type: COMMAND.move, dir });
        sim.run(45);
      });
      return sim;
    };
    const a = run2();
    const b = run2();
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.hash()).toBe(b.hash());
  });

  it('tank konumu durum karmasına girer', () => {
    const { sim } = withTank();
    const before = sim.stateHash();
    steer(sim, KEY, 1);
    sim.run(1);
    expect(sim.stateHash()).not.toBe(before);
  });
});

describe('savaş', () => {
  it('menzildeki en yakın birime ateş eder; atış kaynağı oyuncudur', () => {
    const { sim, s, p, slot } = withTank();
    const near = s.allocateUnit(UNIT_KIND.crawler, p.x[slot] + 4, p.y[slot], UNIT.crawler.hp)!;
    s.allocateUnit(UNIT_KIND.crawler, p.x[slot] + 6, p.y[slot], UNIT.crawler.hp);
    const hp = near.hp;
    sim.step();
    expect(near.hp).toBeLessThan(hp);
    const shot = sim.shots.find((entry) => entry.source === SHOT_SOURCE.player)!;
    expect(shot).toBeDefined();
    expect(shot.tile).toBe(-1);
    expect(shot.fromX).toBe(p.x[slot]);
    expect(p.aimX[slot]).toBeGreaterThan(0.99);
  });

  it('ateş bekleme süresine uyar ve menzil dışına vurmaz', () => {
    const { sim, s, p, slot } = withTank();
    const far = s.allocateUnit(UNIT_KIND.crawler, p.x[slot] + PLAYER.gun.range + 1, p.y[slot], 50)!;
    sim.run(10);
    expect(far.hp).toBe(50);
    const unit = s.allocateUnit(UNIT_KIND.brute, p.x[slot] + 3, p.y[slot], 1000)!;
    sim.step();
    expect(unit.hp).toBe(1000 - PLAYER.gun.damage);
    const shots: number[] = [];
    for (let tick = 0; tick < PLAYER.gun.cooldown * 3; tick++) {
      sim.step();
      shots.push(sim.shots.filter((entry) => entry.source === SHOT_SOURCE.player).length);
    }
    expect(shots.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(2);
    expect(shots.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(3);
  });

  it('öldürülen birim havuza döner', () => {
    const { sim, s, p, slot } = withTank();
    const unit = s.allocateUnit(UNIT_KIND.crawler, p.x[slot] + 3, p.y[slot], 1)!;
    const alive = s.aliveUnits;
    sim.step();
    expect(unit.alive).toBe(false);
    expect(s.aliveUnits).toBe(alive - 1);
  });

  it('birim teması tanka hasar verir; can bitince tank ölür ve süre sonunda doğar', () => {
    const { sim, s, p, slot } = withTank();
    s.allocateUnit(UNIT_KIND.brute, p.x[slot], p.y[slot], 100_000);
    for (let tick = 0; tick < PLAYER.contact.every * 2 && p.hp[slot] === PLAYER.hp; tick++)
      sim.step();
    expect(p.hp[slot]).toBeLessThan(PLAYER.hp);
    expect(PLAYER.hp - p.hp[slot]).toBe(UNIT_PLAYER_DAMAGE.brute);

    damagePlayer(s, slot, PLAYER.hp * 10);
    expect(p.status[slot]).toBe(PLAYER_STATUS.dead);
    expect(p.hp[slot]).toBe(0);
    const diedAt = s.tick;
    // Ölüyken komut geçmez ve tank kımıldamaz.
    expect(steer(sim, KEY, 1)).toBe(RESULT.dead);
    for (const unit of s.units) if (unit.alive) s.releaseUnit(unit);
    sim.run(PLAYER.respawnTicks - 2);
    expect(p.status[slot]).toBe(PLAYER_STATUS.dead);
    sim.run(4);
    expect(p.status[slot]).toBe(PLAYER_STATUS.alive);
    expect(p.hp[slot]).toBe(PLAYER.hp);
    expect(s.tick - diedAt).toBeGreaterThanOrEqual(PLAYER.respawnTicks);
    const spawn = spawnPoint(s, slot);
    expect(p.x[slot]).toBe(spawn.x);
    expect(p.y[slot]).toBe(spawn.y);
  });

  it('ölü tanka hasar ikinci kez ölüm saymaz', () => {
    const { s, p, slot } = withTank();
    damagePlayer(s, slot, PLAYER.hp);
    const respawnAt = p.respawnAt[slot];
    s.tick += 10;
    damagePlayer(s, slot, PLAYER.hp);
    expect(p.respawnAt[slot]).toBe(respawnAt);
  });
});

describe('inşa kuralları', () => {
  it('menzil içindeki tile kabul edilir, dışındaki tooFar döner ve durum değişmez', () => {
    const { sim, s, p, slot } = withTank();
    p.x[slot] = 20.5;
    p.y[slot] = 20.5;
    const ore = s.inventory[1];
    expect(
      sim.apply(KEY, 1, { type: COMMAND.place, x: 20 + 11, y: 20, kind: KIND.conveyor, rot: 0 }),
    ).toEqual({ fresh: true, result: RESULT.ok });
    const far = sim.apply(KEY, 2, {
      type: COMMAND.place,
      x: 20 + 13,
      y: 20,
      kind: KIND.conveyor,
      rot: 0,
    });
    expect(far.result).toBe(RESULT.tooFar);
    expect(s.kind[s.index(33, 20)]).toBe(KIND.empty);
    expect(s.inventory[1]).toBe(ore - 1);
  });

  it('silme ve döndürme de menzile bağlıdır', () => {
    const { sim, s, p, slot } = withTank();
    p.x[slot] = 10.5;
    p.y[slot] = 10.5;
    expect(place(sim, 12, 10, KIND.conveyor)).toBe(RESULT.ok);
    p.x[slot] = 40.5;
    p.y[slot] = 40.5;
    expect(applyCommand(s, { type: COMMAND.remove, x: 12, y: 10 }, slot)).toBe(RESULT.tooFar);
    expect(applyCommand(s, { type: COMMAND.rotate, x: 12, y: 10, rot: 2 }, slot)).toBe(
      RESULT.tooFar,
    );
    expect(s.kind[s.index(12, 10)]).toBe(KIND.conveyor);
  });

  it('tankı olmayan anahtarın komutu noPlayer döner ve hiçbir şeyi değiştirmez', () => {
    const sim = smallSim();
    const ore = sim.state.inventory[1];
    const outcome = sim.apply('tank-ghost-1', 1, {
      type: COMMAND.place,
      x: 30,
      y: 34,
      kind: KIND.wall,
      rot: 0,
    });
    expect(outcome.result).toBe(RESULT.noPlayer);
    expect(sim.state.inventory[1]).toBe(ore);
    expect(sim.state.kind[sim.state.index(30, 34)]).toBe(KIND.empty);
    expect(sim.ledger.lastSeq('tank-ghost-1')).toBe(1);
  });

  it('ölü tank inşa edemez', () => {
    const { sim, s, slot } = withTank();
    damagePlayer(s, slot, PLAYER.hp);
    const wall = { type: COMMAND.place, x: s.players.x[slot] + 2, y: 34, kind: KIND.wall, rot: 0 };
    expect(sim.apply(KEY, 1, { ...wall, x: Math.floor(wall.x) }).result).toBe(RESULT.dead);
  });

  it('katı bina tankın altına konamaz, bant konabilir', () => {
    const { sim, s, p, slot } = withTank();
    stage(sim, KEY, 10, 10);
    const tx = Math.floor(p.x[slot]);
    const ty = Math.floor(p.y[slot]);
    expect(place(sim, tx, ty, KIND.wall)).toBe(RESULT.occupied);
    expect(s.kind[s.index(tx, ty)]).toBe(KIND.empty);
    expect(place(sim, tx, ty, KIND.conveyor)).toBe(RESULT.ok);
  });

  it('JOIN ve LEAVE istemci yolundan uygulanamaz', () => {
    const { s, slot } = withTank();
    expect(applyCommand(s, { type: COMMAND.join, key: OTHER }, slot)).toBe(RESULT.malformed);
    expect(applyCommand(s, { type: COMMAND.leave }, slot)).toBe(RESULT.malformed);
    expect(s.players.slotOf(OTHER)).toBe(-1);
  });

  it('oyuncu yolu (apply) sistem komutunu reddeder ve deftere yazmaz', () => {
    const { sim } = withTank();
    const outcome = sim.apply(KEY, 5, { type: COMMAND.join, key: OTHER });
    expect(outcome).toEqual({ fresh: false, result: RESULT.malformed });
    expect(sim.apply(KEY, 6, { type: COMMAND.leave }).result).toBe(RESULT.malformed);
    expect(sim.state.players.slotOf(OTHER)).toBe(-1);
    expect(sim.state.players.slotOf(KEY)).toBe(0);
    expect(sim.ledger.lastSeq(KEY)).toBe(0);
  });
});
