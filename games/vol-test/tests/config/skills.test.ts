import { describe, expect, it } from 'vitest';
import { SKILL_IDS, SKILLS } from '@/config/skills';
import {
  ARACHNID,
  BARRACUDA,
  GOLIATH,
  HOVER_IDS,
  LEAPER_IDS,
  LEVIATHAN,
  MANTA,
  MECH_IDS,
  TANK_IDS,
  VEHICLE_IDS,
  VEHICLES,
  WIDOW,
  skillOf,
} from '@/config/vehicles';

describe('araç yetenekleri', () => {
  it('her yeteneğin çarpanları sonlu ve negatif değildir; dash ve leap etkisizdir', () => {
    for (const id of SKILL_IDS) {
      for (const value of Object.values(SKILLS[id])) {
        expect(Number.isFinite(value) && value >= 0, `${id}: ${value}`).toBe(true);
      }
    }
    for (const id of ['dash', 'leap'] as const) {
      expect(
        Object.values(SKILLS[id]).every((value) => value === 1),
        id,
      ).toBe(true);
    }
  });

  it('her araç bir yetenek taşır ve katalogdaki dağılım budur', () => {
    for (const id of VEHICLE_IDS) expect(SKILL_IDS, id).toContain(skillOf(VEHICLES[id]));
    for (const id of [...TANK_IDS, ...MECH_IDS]) expect(skillOf(VEHICLES[id]), id).toBe('dash');
    for (const id of LEAPER_IDS) expect(skillOf(VEHICLES[id]), id).toBe('leap');
    // Örümcekler atılmaz, sıçrar; en büyüğü zıplamaz, kalkan açar.
    expect(skillOf(ARACHNID)).toBe('leap');
    expect(skillOf(WIDOW)).toBe('leap');
    expect(skillOf(GOLIATH)).toBe('shield');
  });

  it('süzülen araçların her biri kendine özgü bir yetenek taşır', () => {
    expect(skillOf(MANTA)).toBe('overdrive');
    expect(skillOf(BARRACUDA)).toBe('ram');
    expect(skillOf(LEVIATHAN)).toBe('siege');
    const skills = HOVER_IDS.map((id) => skillOf(VEHICLES[id]));
    expect(new Set(skills).size).toBe(HOVER_IDS.length);
  });

  it('kalkan hasarı tümüyle emer; kuşatma gelen hasarı azaltıp verileni artırır; aşırı yük atışı hızlandırır', () => {
    expect(SKILLS.shield.taken).toBe(0);
    expect(SKILLS.siege.taken).toBeGreaterThan(0);
    expect(SKILLS.siege.taken).toBeLessThan(1);
    expect(SKILLS.siege.dealt).toBeGreaterThan(1);
    expect(SKILLS.overdrive.fireRate).toBeGreaterThan(1.3);
    expect(SKILLS.ram.ram).toBeGreaterThan(1);
    expect(SKILLS.ram.ramTaken).toBeLessThan(1);
  });

  it('kalkan ve kuşatma yürüyüşü zorlamaz; öteki atılımlar zorlar', () => {
    expect(GOLIATH.walker.dashPull).toBe(0);
    expect(LEVIATHAN.hover.dashPull).toBe(0);
    expect(ARACHNID.walker.dashPull).toBe(1);
    expect(MANTA.hover.dashPull).toBe(1);
    expect(BARRACUDA.hover.dashPull).toBe(1);
  });

  it('kalkan 2,5 sn civarı sürer ve dolum süresi sürenin bir ila iki buçuk katıdır', () => {
    const { boostCapacity, boostDrain, boostRegen, boostRestart } = GOLIATH.walker;
    const duration = boostCapacity / boostDrain;
    const cooldown = boostRestart / boostRegen;
    expect(duration).toBeGreaterThan(2);
    expect(duration).toBeLessThan(3.5);
    expect(cooldown).toBeGreaterThan(duration);
    expect(cooldown).toBeLessThan(duration * 2.5);
  });
  it('her aracın yetenek deposu açılabilir: yeniden başlatma eşiği kapasiteyi aşmaz, süre pozitiftir', () => {
    for (const id of VEHICLE_IDS) {
      const spec = VEHICLES[id];
      const config =
        spec.kind === 'tank'
          ? spec.tank
          : spec.kind === 'walker'
            ? spec.walker
            : spec.kind === 'hover'
              ? spec.hover
              : spec.kind === 'mech'
                ? spec.mech
                : spec.leaper;
      expect(
        config.boostRestart,
        `${id}: eşik kapasiteyi aşıyor, yetenek hiç açılmaz`,
      ).toBeLessThanOrEqual(config.boostCapacity);
      expect(config.boostCapacity / config.boostDrain, id).toBeGreaterThan(0.4);
    }
  });
});
