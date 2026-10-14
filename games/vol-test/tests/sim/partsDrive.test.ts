import { describe, expect, it } from 'vitest';
import { PARTS } from '@/config/parts';
import { ARACHNID, STRIKER, WIDOW } from '@/config/vehicles';
import { LEGS_PER_SIDE, TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import type { Simulation } from '@/sim/Simulation';
import type { SimEvent } from '@/sim/events';
import { Walker } from '@/sim/walker/Walker';
import { command, DT, simulation, STEP_MS, tank, world } from '../support/sim';

const space = world(8192);

function tankDriven(parts: number, seconds: number) {
  const subject = tank({ x: 4096, y: 4096, hull: 0 });
  subject.parts = parts;
  const hulls: number[] = [];
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    subject.step(command({ moveX: 1 }), space, DT);
    hulls.push(subject.hull);
  }
  return { subject, hulls };
}

function spiderDriven(parts: number, seconds: number, spec = ARACHNID) {
  const subject = new Walker(spec.walker, spec.suspension);
  subject.place(4096, 4096, 0);
  subject.parts = parts;
  const speeds: number[] = [];
  const hulls: number[] = [];
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    subject.step(command({ moveX: 1, aimX: 1 }), space, DT);
    speeds.push(subject.speed);
    hulls.push(subject.hull);
  }
  return { subject, speeds, hulls };
}

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

describe('kırık palet', () => {
  it('sağlam tank düz gider; sol palet kırılınca tank sola, sağ kırılınca sağa sürüklenir', () => {
    const intact = tankDriven(0, 3);
    const left = tankDriven(TRACK_LEFT, 3);
    const right = tankDriven(TRACK_RIGHT, 3);
    expect(Math.abs(intact.subject.hull)).toBeLessThan(0.02);
    // Sol (-y) tarafa dönmek negatif açıdır.
    expect(Math.min(...left.hulls)).toBeLessThan(-0.15);
    expect(Math.max(...right.hulls)).toBeGreaterThan(0.15);
  });

  it('tek palet kırıkken hız ve yol belirgin düşer; ama tank hâlâ ilerler', () => {
    const intact = tankDriven(0, 4).subject;
    const limp = tankDriven(TRACK_LEFT, 4).subject;
    expect(limp.speed).toBeLessThan(intact.speed * 0.8);
    expect(limp.speed).toBeGreaterThan(5);
  });

  it('iki palet de kırıksa tank sürülemez ve yerde kalır', () => {
    const dead = tankDriven(TRACK_LEFT | TRACK_RIGHT, 4).subject;
    expect(dead.speed).toBeLessThan(2);
    const rolling = tank({ x: 4096, y: 4096, hull: 0 });
    for (let step = 0; step < 90; step++) rolling.step(command({ moveX: 1 }), space, DT);
    const before = rolling.speed;
    rolling.parts = TRACK_LEFT | TRACK_RIGHT;
    for (let step = 0; step < 240; step++) rolling.step(command({ moveX: 1 }), space, DT);
    expect(rolling.speed).toBeLessThan(before * 0.1);
  });

  it('kırık palet serbest döner: itki vermez ve kayma üretmez, sağlam palet sürer', () => {
    const { subject } = tankDriven(TRACK_LEFT, 2);
    expect(subject.slideLeft).toBeLessThan(subject.slideRight + 40);
    expect(Math.abs(subject.trackLeft - subject.surfaceLeft)).toBeLessThan(1e-6);
  });

  it('kırık palet taret ve ateşi etkilemez: taret komuta döner', () => {
    const subject = tank();
    subject.parts = TRACK_LEFT | TRACK_RIGHT;
    for (let step = 0; step < 90; step++) subject.step(command({ aimX: 0, aimY: 1 }), world(), DT);
    expect(subject.turret).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('kırık bacak', () => {
  it('kayıp bacak başına tavan hız düşer; taban çevikliği korunur', () => {
    const intact = spiderDriven(0, 4).subject.speed;
    const two = spiderDriven(0b0000_0011, 4).speeds.slice(-60);
    const all = spiderDriven(0xff, 4).speeds.slice(-60);
    expect(mean(two)).toBeLessThan(intact * 0.95);
    expect(mean(all)).toBeLessThan(mean(two));
    expect(mean(all)).toBeGreaterThan(ARACHNID.walker.maxSpeed * PARTS.walker.floor * 0.3);
  });

  it('bir yanın bacakları eksikse yürüyüş o yana sürüklenir', () => {
    const intact = spiderDriven(0, 3);
    const left = spiderDriven(0b0000_1111, 3);
    const right = spiderDriven(0b1111_0000, 3);
    expect(Math.abs(mean(intact.hulls))).toBeLessThan(0.02);
    expect(mean(left.hulls.slice(-60))).toBeLessThan(-0.04);
    expect(mean(right.hulls.slice(-60))).toBeGreaterThan(0.04);
  });

  it('eksik bacaklı yan tökezler: hız yürüyüş döngüsüyle periyodik inip çıkar, sağlamda düz kalır', () => {
    const intact = spiderDriven(0, 4).speeds.slice(-120);
    const limp = spiderDriven(0b0000_0111, 4).speeds.slice(-120);
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    expect(spread(intact)).toBeLessThan(ARACHNID.walker.maxSpeed * 0.01);
    expect(spread(limp)).toBeGreaterThan(ARACHNID.walker.maxSpeed * 0.04);
  });

  it('tek bacak kaybı bile hissedilir: ortalama hız belirgin düşer, her adımda çöküşle hız zıplar', () => {
    const intact = mean(spiderDriven(0, 4).speeds.slice(-120));
    const one = spiderDriven(0b0000_0001, 4).speeds.slice(-120);
    const spread = Math.max(...one) - Math.min(...one);
    expect(mean(one)).toBeLessThan(intact * 0.85);
    expect(spread).toBeGreaterThan(ARACHNID.walker.maxSpeed * 0.15);
  });

  it('tökezleme belirlenimlidir: aynı girdi aynı yolu çizer', () => {
    const a = spiderDriven(0b0000_0111, 3, WIDOW);
    const b = spiderDriven(0b0000_0111, 3, WIDOW);
    expect(a.subject.captureState()).toEqual(b.subject.captureState());
  });

  it('ağ durumundan geri yüklenen yürüyücü kesintisiz olanla bit bit aynı yürür', () => {
    const original = spiderDriven(0b0001_0110, 2).subject;
    const copy = new Walker(ARACHNID.walker, ARACHNID.suspension);
    copy.place(0, 0, 0);
    copy.restoreState(original.captureState());
    for (let step = 0; step < 240; step++) {
      original.step(command({ moveX: 1, aimX: 1 }), space, DT);
      copy.step(command({ moveX: 1, aimX: 1 }), space, DT);
    }
    expect(copy.captureState()).toEqual(original.captureState());
  });

  it('sağlam yürüyücü eski davranışta kalır (parça yokken sapma sıfır)', () => {
    const { subject } = spiderDriven(0, 3);
    expect(subject.speed).toBeCloseTo(ARACHNID.walker.maxSpeed, 0);
    expect(LEGS_PER_SIDE).toBe(4);
  });
});

/** Hedefin sağ kenarına yandan tek bir mermi gönderir ve olayları toplar. */
function shootSide(sim: Simulation, targetId: number, side: 1 | -1, events: SimEvent[]): void {
  const target = sim.vehicle(targetId)!;
  const weapon = target.weapon;
  const owner = sim.player.id;
  const profile = sim.profileFor(sim.player.weapon);
  const width = target.chassis.shape.halfWidth;
  const x = target.chassis.x;
  const y = target.chassis.y + side * (width + 24);
  sim.projectiles.spawn(owner, x, y, 0, -side * weapon.projectileSpeed, profile);
  for (let step = 0; step < 12; step++) {
    sim.step(command(), STEP_MS);
    sim.drainEvents(events);
  }
}

describe('parça hasarı (Simulation)', () => {
  it('yandan gelen mermiler yan paleti kırar; olay, maske ve sarsıntı oluşur, tank hâlâ canlıdır', () => {
    const sim = simulation(8192);
    sim.player.chassis.place(4096, 3000, 0);
    const enemy = sim.spawn(4096, 4096, 0, null, undefined, STRIKER);
    const events: SimEvent[] = [];
    // Sağ yan (+y) ile vurmak için mermi aşağıdan (y büyük) yukarı gelir: side = 1.
    shootSide(sim, enemy.id, 1, events);
    expect(enemy.chassis.parts).toBe(0);
    shootSide(sim, enemy.id, 1, events);
    expect(enemy.chassis.parts).toBe(TRACK_RIGHT);
    const broke = events.filter((event) => event.kind === 'broke');
    expect(broke).toHaveLength(1);
    expect(broke[0]).toMatchObject({ target: enemy.id, part: 1 });
    expect(enemy.vitality.alive).toBe(true);
  });

  it('kırık parça yeniden doğuşta ve sıfırlamada temizlenir', () => {
    const sim = simulation(8192);
    const enemy = sim.spawn(4096, 4096, 0, null, undefined, STRIKER);
    enemy.chassis.parts = TRACK_LEFT | TRACK_RIGHT;
    sim.applyDamage(enemy.id, 1000);
    expect(sim.respawnVehicle(enemy.id)).toBe(true);
    expect(enemy.chassis.parts).toBe(0);
    enemy.chassis.parts = TRACK_LEFT;
    sim.resetVehicle(enemy.id);
    expect(enemy.chassis.parts).toBe(0);
  });

  it('sessizlik sürünce kırık palet yerine oturur; hasar alırken oturmaz', () => {
    const sim = simulation(8192);
    const enemy = sim.spawn(4096, 4096, 0, null, undefined, STRIKER);
    enemy.chassis.parts = TRACK_LEFT;
    enemy.wear.touch();
    const steps = (ms: number): void => {
      for (let t = 0; t < ms; t += STEP_MS) sim.step(command(), STEP_MS);
    };
    steps(PARTS.repair.quietMs - 1000);
    expect(enemy.chassis.parts).toBe(TRACK_LEFT);
    sim.applyDamage(enemy.id, 1);
    steps(PARTS.repair.quietMs - 1000);
    expect(enemy.chassis.parts).toBe(TRACK_LEFT);
    steps(1000 + PARTS.repair.intervalMs + 200);
    expect(enemy.chassis.parts).toBe(0);
  });

  it('yürüyücünün bacağı kopunca sarsılır: hız kesilir ve gövde o yana döner', () => {
    const sim = simulation(8192);
    sim.player.chassis.place(4096, 3000, 0);
    const spider = sim.spawn(4096, 4096, 0, null, undefined, ARACHNID);
    spider.chassis.vx = 120;
    const events: SimEvent[] = [];
    let steps = 0;
    while (spider.chassis.parts === 0 && steps++ < 12) shootSide(sim, spider.id, 1, events);
    expect(spider.chassis.parts & 0xf0).not.toBe(0);
    expect(events.some((event) => event.kind === 'broke')).toBe(true);
  });
});
