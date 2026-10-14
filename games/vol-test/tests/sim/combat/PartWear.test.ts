import { describe, expect, it } from 'vitest';
import { PARTS } from '@/config/parts';
import {
  ARACHNID,
  MANTA,
  TANK_IDS,
  VEHICLES,
  WALKER_IDS,
  WIDOW,
  STRIKER,
  type TankSpec,
  type VehicleSpec,
  type WalkerSpec,
} from '@/config/vehicles';
import { LEGS_PER_SIDE, TRACK_LEFT, TRACK_RIGHT, legBit } from '@/sim/chassis/parts';
import { Vehicle } from '@/sim/entities/Vehicle';

const AT = { x: 2000, y: 2000 };
/** Katalogdaki bütün tanklar ve yürüyücüler: yeni araç dayanım tablosuna kendiliğinden girer. */
const TANKS: readonly TankSpec[] = TANK_IDS.map((id) => VEHICLES[id] as TankSpec);
const WALKERS: readonly WalkerSpec[] = WALKER_IDS.map((id) => VEHICLES[id] as WalkerSpec);

function build(spec: VehicleSpec, hull = 0): Vehicle {
  const vehicle = new Vehicle(1, spec);
  vehicle.chassis.place(AT.x, AT.y, hull);
  return vehicle;
}

/** Gövde çerçevesinde (ileri, sağ) bir noktaya vurur; kırılan parça maskesini döner ve `parts`a yazar. */
function strike(vehicle: Vehicle, forward: number, right: number, damage: number): number {
  const chassis = vehicle.chassis;
  const cos = Math.cos(chassis.hull);
  const sin = Math.sin(chassis.hull);
  const broken = vehicle.wear.strike(
    chassis,
    chassis.x + forward * cos - right * sin,
    chassis.y + forward * sin + right * cos,
    damage,
  );
  chassis.parts |= broken;
  return broken;
}

/** Aynı noktaya kaç isabette bir parça kırılır (kırılmazsa `Infinity`). */
function hitsToBreak(spec: VehicleSpec, forward: number, edge: number): number {
  const vehicle = build(spec);
  const right = vehicle.chassis.shape.halfWidth * edge;
  for (let hit = 1; hit <= 40; hit++) {
    if (strike(vehicle, forward, right, spec.armament.weapon.damage) !== 0) return hit;
  }
  return Infinity;
}

const frontStation = (spec: VehicleSpec): number =>
  spec.kind === 'walker' ? PARTS.walker.stations[spec.id][0] : 0;

describe('PartWear: bölge', () => {
  it('tank: orta hat gövdeye gider, yan palete değmez', () => {
    const tank = build(STRIKER);
    for (let hit = 0; hit < 20; hit++) expect(strike(tank, 0, 0, 34)).toBe(0);
    expect(tank.wear.wearOf(0)).toBe(0);
    expect(tank.wear.wearOf(1)).toBe(0);
  });

  it('tank: sağ yan sağ paleti, sol yan sol paleti aşındırır (gövde dönükken de)', () => {
    for (const hull of [0, 1.2, -2.4]) {
      const tank = build(STRIKER, hull);
      const width = tank.chassis.shape.halfWidth;
      strike(tank, 0, width * 0.9, 20);
      expect(tank.wear.wearOf(1), `sağ ${hull}`).toBeGreaterThan(0);
      expect(tank.wear.wearOf(0)).toBe(0);
      strike(tank, 0, -width * 0.9, 20);
      expect(tank.wear.wearOf(0), `sol ${hull}`).toBeGreaterThan(0);
    }
  });

  it('tank: kenara yakın isabet kritiktir ve içeri kaymış isabetten çok aşındırır', () => {
    const edge = build(STRIKER);
    const inner = build(STRIKER);
    const width = edge.chassis.shape.halfWidth;
    strike(edge, 0, width, 10);
    strike(inner, 0, width * 0.6, 10);
    expect(edge.wear.wearOf(1)).toBeGreaterThan(inner.wear.wearOf(1) * 2);
  });

  it('yürüyücü: darbe en yakın bacağı aşındırır, komşuyu az, öteki yanı hiç', () => {
    const spider = build(ARACHNID);
    const [front, second] = PARTS.walker.stations.arachnid;
    const width = spider.chassis.shape.halfWidth;
    strike(spider, front, width, 10);
    const slot = (side: number, station: number): number =>
      spider.wear.wearOf(side * LEGS_PER_SIDE + station);
    expect(slot(1, 0)).toBeGreaterThan(slot(1, 1) * 4);
    for (let station = 0; station < LEGS_PER_SIDE; station++) expect(slot(0, station)).toBe(0);
    // Tam iki bacak arasına düşen darbe ikisini de eşit aşındırır.
    const between = build(ARACHNID);
    strike(between, (front + second) / 2, width, 10);
    expect(between.wear.wearOf(4)).toBeCloseTo(between.wear.wearOf(5), 6);
    expect(between.wear.wearOf(4)).toBeGreaterThan(0);
  });

  it('yürüyücü: sol isabet sol bacağı, sağ isabet sağ bacağı kırar', () => {
    const spider = build(WIDOW);
    const station = PARTS.walker.stations.widow[2];
    const width = spider.chassis.shape.halfWidth;
    let left = 0;
    while (left === 0) left = strike(spider, station, -width, WIDOW.armament.weapon.damage);
    expect(left & legBit(0, 2)).toBe(legBit(0, 2));
    expect(left & 0xf0).toBe(0);
    let right = 0;
    while (right === 0) right = strike(spider, station, width, WIDOW.armament.weapon.damage);
    expect(right & legBit(1, 2)).toBe(legBit(1, 2));
    expect(right & 0x0f).toBe(0);
  });

  it('ön yüze gelen darbe de bacağı aşındırır ama yandakinden az', () => {
    const front = build(ARACHNID);
    const side = build(ARACHNID);
    const station = PARTS.walker.stations.arachnid[0];
    strike(front, station, 0.1, 10);
    strike(side, station, side.chassis.shape.halfWidth, 10);
    const worn = (vehicle: Vehicle): number =>
      Math.max(vehicle.wear.wearOf(0), vehicle.wear.wearOf(4));
    expect(worn(front)).toBeGreaterThan(0);
    expect(worn(front)).toBeLessThan(worn(side));
  });

  it('hasar sıfırsa ya da kırık parçaya vurulursa hiçbir şey olmaz', () => {
    const tank = build(STRIKER);
    expect(strike(tank, 0, tank.chassis.shape.halfWidth, 0)).toBe(0);
    tank.chassis.parts = TRACK_RIGHT;
    expect(strike(tank, 0, tank.chassis.shape.halfWidth, 500)).toBe(0);
  });
});

describe('PartWear: dayanım tablosu (kaç isabette kırılır)', () => {
  const critical = 1;
  const flank = 0.7;

  it('kenar isabetiyle her tankın yan paleti 1-3 isabette kırılır; yan gelen isabetle daha geç', () => {
    for (const spec of TANKS) {
      const edge = hitsToBreak(spec, 0, critical);
      const side = hitsToBreak(spec, 0, flank);
      expect(edge, spec.id).toBeGreaterThanOrEqual(1);
      expect(edge, spec.id).toBeLessThanOrEqual(3);
      expect(side, spec.id).toBeGreaterThanOrEqual(edge);
      expect(side, spec.id).toBeLessThanOrEqual(6);
    }
  });

  it('palet, aracın ölmesinden ÖNCE kırılır (kırılmadan ölüm olmaz)', () => {
    for (const spec of TANKS) {
      const killHits = Math.ceil(spec.health / spec.armament.weapon.damage);
      expect(hitsToBreak(spec, 0, critical), spec.id).toBeLessThan(killHits);
    }
  });

  it('orta hat isabeti hiçbir tank parçasını kırmaz', () => {
    for (const spec of TANKS) expect(hitsToBreak(spec, 0, 0)).toBe(Infinity);
  });

  it('yürüyücünün yandan vurulan bacağı birkaç isabette kopar, ölümden önce', () => {
    for (const spec of WALKERS) {
      const hits = hitsToBreak(spec, frontStation(spec), critical);
      const killHits = Math.ceil(spec.health / spec.armament.weapon.damage);
      expect(hits, spec.id).toBeGreaterThanOrEqual(2);
      expect(hits, spec.id).toBeLessThan(killHits);
    }
  });

  it('sürekli ateş yan tarafı kırar: dört bacaklı yanın hepsi tükenir', () => {
    const spider = build(ARACHNID);
    const width = spider.chassis.shape.halfWidth;
    const stations = PARTS.walker.stations.arachnid;
    for (let round = 0; round < 12; round++)
      for (const station of stations) strike(spider, station, width, 24);
    expect(spider.chassis.parts).toBe(0b1111_0000);
  });
});

describe('PartWear: süzülen aracın yan iticileri', () => {
  it('sağ yan sağ iticiyi, sol yan sol iticiyi aşındırır; orta hat gövdeye gider', () => {
    const manta = build(MANTA, 0.8);
    const width = manta.chassis.shape.halfWidth;
    expect(strike(manta, 0, 0, 20)).toBe(0);
    expect(manta.wear.wearOf(0) + manta.wear.wearOf(1)).toBe(0);
    strike(manta, 0, width * 0.9, 10);
    expect(manta.wear.wearOf(1)).toBeGreaterThan(0);
    expect(manta.wear.wearOf(0)).toBe(0);
    strike(manta, 0, -width * 0.9, 10);
    expect(manta.wear.wearOf(0)).toBeGreaterThan(0);
  });

  it('kenar isabetiyle itici ölümden önce kırılır ve bit maskesi tankın yan bitleriyle aynıdır', () => {
    const hits = hitsToBreak(MANTA, 0, 1);
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThan(Math.ceil(MANTA.health / MANTA.armament.weapon.damage));
    const manta = build(MANTA);
    const width = manta.chassis.shape.halfWidth;
    let broken = 0;
    while (broken === 0) broken = strike(manta, 0, -width, MANTA.armament.weapon.damage);
    expect(broken).toBe(TRACK_LEFT);
  });

  it('kırık itici sessizlik dolunca yerine oturur', () => {
    const manta = build(MANTA);
    manta.chassis.parts = TRACK_RIGHT;
    manta.wear.touch();
    manta.wear.step(manta.chassis, PARTS.repair.quietMs + PARTS.repair.intervalMs);
    expect(manta.chassis.parts).toBe(0);
  });
});

describe('PartWear: sönüm ve onarım', () => {
  function worn(): Vehicle {
    const tank = build(STRIKER);
    strike(tank, 0, tank.chassis.shape.halfWidth, 20);
    tank.wear.touch();
    return tank;
  }

  it('darbeden sonra gecikme dolana dek aşınma korunur, sonra söner', () => {
    const tank = worn();
    const before = tank.wear.wearOf(1);
    tank.wear.step(tank.chassis, PARTS.wear.decayDelayMs * 0.9);
    expect(tank.wear.wearOf(1)).toBe(before);
    tank.wear.step(tank.chassis, PARTS.wear.decayDelayMs * 0.2 + 1000);
    expect(tank.wear.wearOf(1)).toBeLessThan(before);
    for (let step = 0; step < 60; step++) tank.wear.step(tank.chassis, 1000);
    expect(tank.wear.wearOf(1)).toBe(0);
  });

  it('yavaş yavaş gelen isabetler parçayı kırmaz: aşınma aralarda söner', () => {
    const tank = build(STRIKER);
    const edge = tank.chassis.shape.halfWidth;
    for (let hit = 0; hit < 10; hit++) {
      expect(strike(tank, 0, edge, 20)).toBe(0);
      tank.wear.touch();
      tank.wear.step(tank.chassis, 15000);
    }
  });

  it('kırık parça sessizlik dolunca birer birer yerine oturur; hasar sessizliği böler', () => {
    const tank = build(STRIKER);
    tank.chassis.parts = TRACK_LEFT | TRACK_RIGHT;
    tank.wear.touch();
    tank.wear.step(tank.chassis, PARTS.repair.quietMs - 100);
    expect(tank.chassis.parts).toBe(3);
    // Araya giren hasar süreyi sıfırlar.
    tank.wear.touch();
    tank.wear.step(tank.chassis, PARTS.repair.quietMs - 100);
    expect(tank.chassis.parts).toBe(3);
    tank.wear.step(tank.chassis, 200 + PARTS.repair.intervalMs);
    expect(tank.chassis.parts).toBe(TRACK_RIGHT);
    tank.wear.step(tank.chassis, PARTS.repair.intervalMs);
    expect(tank.chassis.parts).toBe(0);
  });

  it('reset aşınmayı ve sayaçları temizler', () => {
    const tank = worn();
    tank.wear.reset();
    expect(tank.wear.wearOf(1)).toBe(0);
    tank.chassis.parts = TRACK_LEFT;
    tank.wear.step(tank.chassis, PARTS.repair.quietMs + PARTS.repair.intervalMs);
    expect(tank.chassis.parts).toBe(0);
  });
});
