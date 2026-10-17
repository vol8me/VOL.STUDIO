import { describe, expect, it } from 'vitest';
import { JUGGERNAUT, MECH_IDS, VEHICLES, WARHOUND } from '@/config/vehicles';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { Mech } from '@/sim/mech/Mech';
import { command, DT, world } from '../../support/sim';

const space = world(8192);

function mech(spec = WARHOUND): Mech {
  const result = new Mech(spec.mech, spec.suspension);
  result.place(4096, 4096, 0);
  return result;
}

/** Her adımın hızını toplar: yürüyüşün hız dalgasını görmek için. */
function speeds(subject: Mech, patch: Parameters<typeof command>[0], seconds: number): number[] {
  const full = command(patch);
  const samples: number[] = [];
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    subject.step(full, space, DT);
    samples.push(subject.speed);
  }
  return samples;
}

describe('Mech sürüşü', () => {
  it('mech türündedir ve katalogdaki üç robot yürüyücü sürüşüyle tavan hıza çıkar', () => {
    expect(MECH_IDS).toEqual(['warhound', 'templar', 'juggernaut']);
    for (const id of MECH_IDS) {
      const spec = VEHICLES[id];
      if (spec.kind !== 'mech') throw new Error(`${id} mech değil`);
      const subject = mech(spec);
      expect(subject.kind).toBe('mech');
      const samples = speeds(subject, { moveX: 1, aimX: 1 }, 4);
      expect(Math.max(...samples), id).toBeGreaterThan(spec.mech.maxSpeed * 0.97);
      expect(Math.max(...samples), id).toBeLessThanOrEqual(spec.mech.maxSpeed * 1.02);
    }
  });

  it('her ayak basışında hız adım çukuruna düşüp toparlanır; durağan robotta dalga yoktur', () => {
    const subject = mech(JUGGERNAUT);
    const samples = speeds(subject, { moveX: 1, aimX: 1 }, 6).slice(180);
    const top = JUGGERNAUT.mech.maxSpeed;
    expect(Math.min(...samples)).toBeLessThan(top * (1 - JUGGERNAUT.mech.strideDip * 0.6));
    expect(Math.max(...samples)).toBeGreaterThan(top * 0.99);
    const idle = speeds(mech(JUGGERNAUT), {}, 1);
    expect(Math.max(...idle)).toBe(0);
  });

  it('bir bacağını kaybeden robot topallar: tavan düşer ve kopan yana sürüklenir', () => {
    const sound = mech();
    const lame = mech();
    lame.parts = TRACK_LEFT;
    const top = (subject: Mech) => Math.max(...speeds(subject, { moveX: 1, aimX: 1 }, 5));
    expect(top(lame)).toBeLessThan(top(sound) * 0.8);
    const both = mech();
    both.parts = TRACK_LEFT | TRACK_RIGHT;
    expect(top(both)).toBeLessThan(top(lame));
    expect(top(both)).toBeGreaterThan(0);
  });

  it('aynı komut dizisi aynı konumu verir (belirlenimli yürüyüş)', () => {
    const run = (): [number, number] => {
      const subject = mech();
      speeds(subject, { moveX: 1, moveY: 0.5, aimX: 1 }, 3);
      return [subject.x, subject.y];
    };
    expect(run()).toEqual(run());
  });
});
