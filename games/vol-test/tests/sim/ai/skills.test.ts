import { describe, expect, it } from 'vitest';
import { BOT } from '@/config/bot';
import { GAME } from '@/config/game';
import {
  ARACHNID,
  BARRACUDA,
  GOLIATH,
  LEVIATHAN,
  MANTA,
  STRIKER,
  WIDOW,
  type VehicleSpec,
} from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

const STEP = GAME.simulationStepMs;

interface Duel {
  readonly sim: Simulation;
  readonly bot: Vehicle;
  readonly foe: Vehicle;
  readonly brain: BotBrain;
}

/**
 * Bot (takım 0) ve hareketsiz düşman (takım 1) `distance` birim arayla kurulur. Düşman `shoots` ise
 * bota ateş eder. Düşman ölmesin diye canı her adım doldurulur: sınanan şey yeteneğin kararıdır.
 */
function duel(spec: VehicleSpec, distance: number, seed = 5): Duel {
  const sim = new Simulation({ world: new World(8192, 8192, 128), spawnPlayer: false });
  const y = 4096;
  const bot = sim.spawn(4096 - distance / 2, y, 0, 0, undefined, spec);
  const foe = sim.spawn(4096 + distance / 2, y, Math.PI, 1, undefined, STRIKER);
  for (const vehicle of [bot, foe]) vehicle.vitality.protectionRemainingMs = 0;
  const brain = new BotBrain(bot, { seed, skill: 1 });
  return { sim, bot, foe, brain };
}

/** Botu `seconds` sürer; yetenek açık kalan toplam süreyi (sn) döndürür. */
function skillSeconds(setup: Duel, seconds: number, shoots = false): number {
  const { sim, bot, foe, brain } = setup;
  const out = idleCommand();
  const aim = idleCommand();
  let active = 0;
  for (let step = 0; step < (seconds * 1000) / STEP; step++) {
    sim.step((vehicle) => {
      if (vehicle === bot) return brain.think(sim, STEP, out);
      const dx = bot.chassis.x - foe.chassis.x;
      const dy = bot.chassis.y - foe.chassis.y;
      const length = Math.hypot(dx, dy) || 1;
      aim.aimX = dx / length;
      aim.aimY = dy / length;
      aim.fire = shoots;
      return aim;
    }, STEP);
    foe.vitality.heal(1000);
    if (bot.chassis.boosting) active += STEP / 1000;
  }
  return active;
}

describe('bot: yetenek kararları', () => {
  it('Goliath kalkanı yalnız üstüne mermi gelirken açar; ateş yoksa depoyu harcamaz', () => {
    const range = GOLIATH.armament.weapon.flight.maxRange;
    const quiet = skillSeconds(duel(GOLIATH, range * 0.6), 8);
    expect(quiet).toBe(0);
    const fired = skillSeconds(duel(GOLIATH, range * 0.6), 8, true);
    expect(fired).toBeGreaterThan(0.5);
    // Kalkan süreli: savaş boyunca hep açık kalmaz.
    expect(fired).toBeLessThan(6);
  });

  it('Goliath kalkanı hasarı fiilen keser: ateş altındaki bot ateş eden rakipten sağlam çıkar', () => {
    const setup = duel(GOLIATH, GOLIATH.armament.weapon.flight.maxRange * 0.6);
    skillSeconds(setup, 6, true);
    const shielded = setup.bot.vitality.health;
    // Karşılaştırma: aynı ateşi yetenek kapalı alan nötr araç (Striker) alır.
    const control = duel(STRIKER, GOLIATH.armament.weapon.flight.maxRange * 0.6);
    skillSeconds(control, 6, true);
    expect(shielded / GOLIATH.health).toBeGreaterThan(control.bot.vitality.health / STRIKER.health);
  });

  it('Manta aşırı yüke yalnız menzil içinde girer; çok uzak hedefe harcamaz', () => {
    const range = MANTA.armament.weapon.flight.maxRange;
    expect(skillSeconds(duel(MANTA, range * 0.6), 6)).toBeGreaterThan(0.3);
    expect(skillSeconds(duel(MANTA, BOT.sightRange * 0.98), 1.2)).toBe(0);
  });

  it('Barracuda hedefe yüklenir: menzile girince çarpma atağı açılır', () => {
    const range = BARRACUDA.armament.weapon.flight.maxRange;
    expect(skillSeconds(duel(BARRACUDA, range * 0.9), 6)).toBeGreaterThan(0.2);
  });

  it('Leviathan kuşatmayı menzilde kurar, dibe girmiş düşmana karşı kurmaz', () => {
    const range = LEVIATHAN.armament.weapon.flight.maxRange;
    expect(skillSeconds(duel(LEVIATHAN, range * 0.7), 6)).toBeGreaterThan(0.5);
    expect(skillSeconds(duel(LEVIATHAN, range * BOT.skills.siegeMin * 0.5), 0.4)).toBe(0);
  });

  it('Arachnid ve Widow uzak hedefe sıçrayarak kapanır; yakın hedefte sıçramaz', () => {
    for (const spec of [ARACHNID, WIDOW]) {
      const range = spec.armament.weapon.flight.maxRange;
      expect(skillSeconds(duel(spec, BOT.sightRange * 0.95), 6), spec.id).toBeGreaterThan(0.1);
      expect(skillSeconds(duel(spec, range * 0.3), 0.4), spec.id).toBe(0);
    }
  });
});
