import { describe, expect, it } from 'vitest';
import type { LakeSpec } from '@/config/lakes';
import type { OutcropSpec } from '@/config/rocks';
import { ROCKS } from '@/config/rocks';
import { JACKAL, LEAPER_IDS, PANTHER, RHINO, VEHICLES } from '@/config/vehicles';
import { TRACK_LEFT, TRACK_RIGHT, legBit } from '@/sim/chassis/parts';
import { Leaper } from '@/sim/leaper/Leaper';
import { World } from '@/sim/world/World';
import { command, DT, world } from '../../support/sim';

const space = world(8192);

function leaper(spec = JACKAL, at = { x: 4096, y: 4096 }): Leaper {
  const result = new Leaper(spec.leaper, spec.suspension);
  result.place(at.x, at.y, 0);
  result.capturePose();
  return result;
}

/** Her adımın hızını toplar: sekmenin hız dalgasını görmek için. */
function speeds(subject: Leaper, patch: Parameters<typeof command>[0], seconds: number): number[] {
  const full = command(patch);
  const samples: number[] = [];
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    subject.step(full, space, DT);
    samples.push(subject.speed);
  }
  return samples;
}

describe('Leaper sürüşü', () => {
  it('sıçrayıcı türündedir; katalogdaki üç araç yürüyücü sürüşüyle tavan hıza çıkar', () => {
    expect(LEAPER_IDS).toEqual(['jackal', 'panther', 'rhino']);
    for (const id of LEAPER_IDS) {
      const spec = VEHICLES[id];
      if (spec.kind !== 'leaper') throw new Error(`${id} sıçrayıcı değil`);
      const subject = leaper(spec);
      expect(subject.kind).toBe('leaper');
      const samples = speeds(subject, { moveX: 1, aimX: 1 }, 4);
      expect(Math.max(...samples), id).toBeGreaterThan(spec.leaper.maxSpeed * 0.97);
      expect(Math.max(...samples), id).toBeLessThanOrEqual(spec.leaper.maxSpeed * 1.02);
    }
  });

  it('her sekmenin başında hız çukuruna düşüp toparlanır; durağan araçta dalga yoktur', () => {
    const samples = speeds(leaper(PANTHER), { moveX: 1, aimX: 1 }, 5).slice(120);
    const top = PANTHER.leaper.maxSpeed;
    expect(Math.min(...samples)).toBeLessThan(top * (1 - PANTHER.leaper.strideDip * 0.6));
    expect(Math.max(...samples)).toBeGreaterThan(top * 0.99);
    expect(Math.max(...speeds(leaper(PANTHER), {}, 1))).toBe(0);
  });

  it('Space sıçramadır: kısa sürede tavanın çok üstüne çıkar, depo boşalınca iner', () => {
    const subject = leaper(JACKAL);
    const full = command({ moveX: 1, aimX: 1, brake: true });
    let peak = 0;
    let airSteps = 0;
    for (let step = 0; step < 90; step++) {
      subject.step(full, space, DT);
      peak = Math.max(peak, subject.speed);
      if (subject.airborne) airSteps++;
    }
    expect(peak).toBeGreaterThan(JACKAL.leaper.maxSpeed * 1.7);
    // Sıçrama süresi depo kapasitesi / boşalma hızıdır (~0,44 sn); tuş bırakılmasa da uzamaz.
    const expected = JACKAL.leaper.boostCapacity / JACKAL.leaper.boostDrain / DT;
    expect(airSteps).toBeGreaterThan(expected * 0.8);
    expect(airSteps).toBeLessThan(expected * 1.4);
    expect(subject.airborne).toBe(false);
  });

  it('havada balistiktir: komut hız yönünü yalnız `leapTurnRate` hızıyla çevirir', () => {
    const subject = leaper(JACKAL);
    // Doğuya fırlat, sonra tam kuzeye komut ver.
    subject.step(command({ moveX: 1, aimX: 1, brake: true }), space, DT);
    for (let step = 0; step < 8; step++)
      subject.step(command({ moveY: -1, aimX: 1, brake: true }), space, DT);
    let deviation = 0;
    for (let step = 0; step < 14 && subject.airborne; step++) {
      subject.step(command({ moveY: -1, aimX: 1, brake: true }), space, DT);
      deviation = Math.max(deviation, Math.abs(Math.atan2(subject.vy, subject.vx)));
    }
    // Sapma, dönme hızı × sıçrama süresini aşamaz (balistik kavis).
    const duration = JACKAL.leaper.boostCapacity / JACKAL.leaper.boostDrain;
    expect(deviation).toBeGreaterThan(0.05);
    expect(deviation).toBeLessThan(JACKAL.leaper.leapTurnRate * duration + 0.1);
  });

  it('bir bacağını kaybeden sıçrayıcı topallar; yanda yalnız iki bacak vardır', () => {
    const top = (subject: Leaper) => Math.max(...speeds(subject, { moveX: 1, aimX: 1 }, 5));
    const sound = top(leaper());
    const lame = leaper();
    lame.parts = legBit(0, 0);
    const one = top(lame);
    expect(one).toBeLessThan(sound * 0.95);
    const both = leaper();
    both.parts = legBit(0, 0) | legBit(0, 1);
    expect(top(both)).toBeLessThan(one);
    const all = leaper();
    all.parts = TRACK_LEFT | TRACK_RIGHT | legBit(0, 1) | legBit(1, 1);
    expect(top(all)).toBeGreaterThan(0);
  });

  it('koşu hızında geniş yay çizer: dönüş tavanı `carve` kadar düşer, `carve` yoksa çevik kalır', () => {
    // Komutun ilk çeyrek saniyesi: hız hâlâ tavandadır, dönüşün tavanı koşu hızına bağlıdır.
    const peakTurn = (carve: number): number => {
      const subject = new Leaper({ ...PANTHER.leaper, carve }, PANTHER.suspension);
      subject.place(4096, 4096, 0);
      subject.capturePose();
      speeds(subject, { moveX: 1, aimX: 1 }, 4);
      const turn = command({ moveY: -1, aimX: 1 });
      let peak = 0;
      for (let step = 0; step < Math.round(0.25 / DT); step++) {
        subject.step(turn, space, DT);
        peak = Math.max(peak, Math.abs(subject.angularVelocity));
      }
      return peak;
    };
    const stiff = peakTurn(0);
    const arcing = peakTurn(PANTHER.leaper.carve);
    expect(arcing).toBeLessThan(PANTHER.leaper.maxTurnRate * (1 - PANTHER.leaper.carve * 0.6));
    expect(stiff).toBeGreaterThan(arcing * 1.2);
  });

  it('sert dönüşte pençeler basar: `turnDip` dönerken koşu hızını düz koşudan fazla keser', () => {
    const meanSpeed = (turnDip: number, turning: boolean): number => {
      const result = new Leaper({ ...RHINO.leaper, turnDip }, RHINO.suspension);
      result.place(4096, 4096, 0);
      result.capturePose();
      speeds(result, { moveX: 1, aimX: 1 }, 4);
      // Komutu her 0,3 sn'de ters çevir: gövde sürekli döner ve doğrultu kalıcı değişir.
      const run = command({ moveX: 1, aimX: 1 });
      const flip = command({ moveX: -0.2, moveY: 1, aimX: 1 });
      let total = 0;
      const steps = Math.round(1.2 / DT);
      for (let step = 0; step < steps; step++) {
        result.step(turning && Math.floor((step * DT) / 0.3) % 2 === 0 ? flip : run, space, DT);
        total += result.speed;
      }
      return total / steps;
    };
    const dipped = meanSpeed(RHINO.leaper.turnDip, true);
    const free = meanSpeed(0, true);
    expect(dipped).toBeLessThan(free * 0.99);
    // Düz koşuda açısal hız yoktur: `turnDip` düz koşuyu etkilemez.
    expect(meanSpeed(RHINO.leaper.turnDip, false)).toBeCloseTo(meanSpeed(0, false), 1);
  });

  it('aynı komut dizisi aynı konumu verir (belirlenimli sekme ve sıçrama)', () => {
    const run = (): [number, number] => {
      const subject = leaper(RHINO);
      speeds(subject, { moveX: 1, moveY: 0.4, aimX: 1, brake: true }, 3);
      return [subject.x, subject.y];
    };
    expect(run()).toEqual(run());
  });
});

describe('Leaper ve zemin', () => {
  const rockSpec: OutcropSpec = { id: 'test', x: 0.5, y: 0.5, radius: 260, lobes: 1, seed: 7 };
  const rocky = new World(12288, 12288, 128, [], [rockSpec]);
  const rock = rocky.rocks.rocks[0];
  const edge = rock.radius * ROCKS.collisionInset;

  /** Kayanın batısında doğuya bakan sıçrayıcıyı verilen komutla `steps` adım sürer. */
  function approach(patch: Parameters<typeof command>[0], steps: number) {
    const subject = leaper(JACKAL, { x: rock.x - edge - 36, y: rock.y });
    const input = command({ moveX: 1, aimX: 1, ...patch });
    let furthestAirborne = subject.x;
    let airborneClimb = 0;
    for (let step = 0; step < steps; step++) {
      subject.capturePose();
      subject.step(input, rocky, DT);
      if (subject.airborne) {
        furthestAirborne = Math.max(furthestAirborne, subject.x);
        airborneClimb = Math.max(airborneClimb, subject.climb);
      }
    }
    return { subject, furthestAirborne, airborneClimb };
  }

  it('yerdeki sıçrayıcı kayaya tank gibi çarpar; tırmanmaz', () => {
    const run = approach({}, 180);
    expect(run.subject.climb).toBe(0);
    expect(run.subject.x + run.subject.shape.halfLength).toBeLessThan(rock.x - edge + 8);
  });

  it('sıçrayan araç kayanın üstünden geçer ve kaya direnci hissetmez', () => {
    const run = approach({ brake: true }, 14);
    // Yerde kaya yüzeyinin önünde duracağı noktanın ötesine havadayken geçer.
    expect(run.furthestAirborne + run.subject.shape.halfLength).toBeGreaterThan(rock.x - edge + 20);
    expect(run.airborneClimb).toBe(0);
  });

  it('havadaki araç suyu hissetmez ve boğulmaz; yere inince su derinliği geri gelir', () => {
    const lake: LakeSpec = { id: 'g', x: 0.5, y: 0.5, rx: 600, ry: 600, rotation: 0, shape: [] };
    const wet = new World(12288, 12288, 128, [lake]);
    const subject = leaper(JACKAL, { x: 6144, y: 6144 });
    subject.step(command(), wet, DT);
    expect(subject.waterDepth).toBeGreaterThan(0.5);
    let airDepth = 1;
    for (let step = 0; step < 6; step++) {
      subject.step(command({ moveX: 1, aimX: 1, brake: true }), wet, DT);
      if (subject.airborne) airDepth = Math.min(airDepth, subject.waterDepth);
    }
    expect(subject.airborne).toBe(true);
    expect(airDepth).toBe(0);
    for (let step = 0; step < 90; step++) subject.step(command(), wet, DT);
    expect(subject.airborne).toBe(false);
    expect(subject.waterDepth).toBeGreaterThanOrEqual(0);
  });

  it('sıçramadan kalan hız kayarak erir: yerdeki aşırı hız `landBraking` ile söner, duruş freni sert kalır', () => {
    const slide = (landBraking: number): number => {
      const result = new Leaper({ ...JACKAL.leaper, landBraking }, JACKAL.suspension);
      result.place(4096, 4096, 0);
      result.capturePose();
      // Sıçra, in; sonra komutu bırak ve iniş anındaki konumdan durana dek katedilen yolu ölç.
      for (let step = 0; step < 120 && !(step > 4 && !result.airborne); step++)
        result.step(command({ moveX: 1, aimX: 1, brake: true }), space, DT);
      const landed = result.x;
      for (let step = 0; step < 240; step++) result.step(command({ aimX: 1 }), space, DT);
      expect(result.speed).toBeLessThan(1);
      return result.x - landed;
    };
    // Aynı iniş hızından yumuşak fren daha uzağa kaydırır; sert fren (yürüyüş freni) kısa keser.
    expect(slide(JACKAL.leaper.landBraking)).toBeGreaterThan(slide(JACKAL.leaper.braking) + 4);
  });

  it('iniş bir çömelmedir: sıçramadan hemen sonra tavan `landFloor`a iner, depo dolunca toparlar', () => {
    const subject = leaper(JACKAL);
    for (let step = 0; step < 120 && !(step > 4 && !subject.airborne); step++)
      subject.step(command({ moveX: 1, aimX: 1, brake: true }), space, DT);
    // Kayma bitene dek bekle, sonra tavanı depo boşken ölç.
    const crouched = Math.max(...speeds(subject, { moveX: 1, aimX: 1 }, 0.5).slice(40));
    expect(crouched).toBeLessThan(JACKAL.leaper.maxSpeed * (JACKAL.leaper.landFloor + 0.18));
    const recovered = Math.max(...speeds(subject, { moveX: 1, aimX: 1 }, 3));
    expect(recovered).toBeGreaterThan(JACKAL.leaper.maxSpeed * 0.97);
  });
});
