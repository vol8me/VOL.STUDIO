import { describe, expect, it } from 'vitest';
import { BOT } from '@/config/bot';
import { GAME } from '@/config/game';
import { ARACHNID, BULWARK, DART, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { BotBrain, createProfile, interceptTime, isHostile } from '@/sim/ai/BotBrain';
import { idleCommand, type TankCommand } from '@/sim/command';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import { createStatefulRandom } from '@volstudio/core/random';

const STEP = GAME.simulationStepMs;

function arena(size = 4096) {
  return new Simulation({ world: new World(size, size, 128), spawnPlayer: false });
}

interface Bot {
  readonly vehicle: Vehicle;
  readonly brain: BotBrain;
}

function addBot(
  sim: Simulation,
  spec: VehicleSpec,
  x: number,
  y: number,
  team: number | null,
  seed: number,
  skill = 1,
): Bot {
  const vehicle = sim.spawn(x, y, 0, team, undefined, spec);
  vehicle.vitality.protectionRemainingMs = 0;
  return { vehicle, brain: new BotBrain(vehicle, { seed, skill }) };
}

/** Botları `seconds` boyunca sürer; olayları toplar. */
function run(
  sim: Simulation,
  bots: readonly Bot[],
  seconds: number,
  onStep?: () => void,
  onCommand?: (command: TankCommand) => void,
) {
  const events: SimEvent[] = [];
  const commands = new Map(bots.map((bot) => [bot.vehicle.id, idleCommand()]));
  for (let step = 0; step < (seconds * 1000) / STEP; step++) {
    sim.step((vehicle) => {
      const bot = bots.find((candidate) => candidate.vehicle === vehicle);
      const out = commands.get(vehicle.id);
      if (!bot || !out) return idleCommand();
      const command = bot.brain.think(sim, STEP, out);
      onCommand?.(command);
      return command;
    }, STEP);
    sim.drainEvents(events);
    onStep?.();
  }
  return events;
}

describe('interceptTime', () => {
  it('duran hedefe düz uçuş süresini verir', () => {
    expect(interceptTime(600, 0, 0, 0, 900)).toBeCloseTo(600 / 900, 9);
  });

  it('kaçan hedefin gelecekteki konumunu tutturur', () => {
    const speed = 900;
    const [rx, ry, vx, vy] = [500, -200, 120, 260];
    const time = interceptTime(rx, ry, vx, vy, speed);
    expect(Math.hypot(rx + vx * time, ry + vy * time)).toBeCloseTo(speed * time, 6);
    expect(time).toBeGreaterThan(0);
  });

  it('mermiden hızlı hedefte çözüm yoksa düz uçuşa düşer ve sonlu kalır', () => {
    const time = interceptTime(400, 0, 3000, 0, 900);
    expect(Number.isFinite(time)).toBe(true);
    expect(time).toBeGreaterThan(0);
  });
});

describe('isHostile', () => {
  it('takımsız araçlar birbirine, aynı takım olmayanlar birbirine düşmandır', () => {
    const sim = arena();
    const a = sim.spawn(100, 100, 0, 0);
    const b = sim.spawn(200, 100, 0, 0);
    const c = sim.spawn(300, 100, 0, 1);
    const free = sim.spawn(400, 100, 0, null);
    expect(isHostile(a, b)).toBe(false);
    expect(isHostile(a, a)).toBe(false);
    expect(isHostile(a, c)).toBe(true);
    expect(isHostile(a, free)).toBe(true);
    expect(isHostile(free, sim.spawn(500, 100, 0, null))).toBe(true);
  });
});

describe('createProfile', () => {
  it('beceri arttıkça tepki ve nişan hatası azalır, önden gitme artar', () => {
    const novice = createProfile(0, createStatefulRandom(1));
    const expert = createProfile(1, createStatefulRandom(1));
    expect(expert.reactionMs).toBeLessThan(novice.reactionMs);
    expect(expert.aimErrorRad).toBeLessThan(novice.aimErrorRad);
    expect(expert.leadAccuracy).toBeGreaterThan(novice.leadAccuracy);
    expect(expert.retreatHealth).toBeLessThan(novice.retreatHealth);
  });

  it('beceri [0, 1] ile sınırlıdır', () => {
    expect(createProfile(9, createStatefulRandom(1)).reactionMs).toBe(BOT.profile.reactionMs[1]);
    expect(createProfile(-3, createStatefulRandom(1)).reactionMs).toBe(BOT.profile.reactionMs[0]);
  });
});

describe('BotBrain', () => {
  it('takım arkadaşını hedef almaz, düşmanı alır', () => {
    const sim = arena();
    const friend = addBot(sim, STRIKER, 1000, 1000, 0, 1);
    const mate = addBot(sim, STRIKER, 1300, 1000, 0, 2);
    const foe = addBot(sim, STRIKER, 1000, 1400, 1, 3);
    run(sim, [friend, mate, foe], 0.5);
    expect(friend.brain.targetId).toBe(foe.vehicle.id);
    expect(foe.brain.targetId).not.toBeNull();
    const lone = arena();
    const a = addBot(lone, STRIKER, 1000, 1000, 0, 1);
    addBot(lone, STRIKER, 1300, 1000, 0, 2);
    run(lone, [a], 0.5);
    expect(a.brain.targetId).toBeNull();
  });

  it('görüş mesafesinin dışındaki düşmanı görmez', () => {
    const sim = arena();
    const a = addBot(sim, STRIKER, 500, 500, 0, 1);
    addBot(sim, STRIKER, 500 + BOT.sightRange * 1.5, 500, 1, 2);
    run(sim, [a], 0.5);
    expect(a.brain.targetId).toBeNull();
  });

  it.each([
    ['Striker', STRIKER],
    ['Bulwark', BULWARK],
    ['Dart', DART],
    ['Arachnid', ARACHNID],
  ] as const)('%s düşmanıyla savaşır: can düşer, kimse dünyadan çıkmaz', (_name, spec) => {
    const sim = arena();
    const mine = addBot(sim, spec, 1800, 2000, 0, 7);
    const foe = addBot(sim, STRIKER, 2400, 2000, 1, 8);
    const bots = [mine, foe];
    const events = run(sim, bots, 25, () => {
      for (const { vehicle } of bots) {
        const { x, y } = vehicle.chassis;
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(sim.world.contains(x, y)).toBe(true);
      }
    });
    expect(events.some((event) => event.kind === 'fired')).toBe(true);
    expect(events.some((event) => event.kind === 'damaged')).toBe(true);
  });

  it('usta bot durağan hedefi birkaç saniyede vurur', () => {
    const sim = arena();
    const shooter = addBot(sim, STRIKER, 1500, 2000, 0, 3, 1);
    const dummy = sim.spawn(2000, 2000, 0, 1);
    dummy.vitality.protectionRemainingMs = 0;
    const events = run(sim, [shooter], 8);
    expect(events.some((event) => event.kind === 'damaged' && event.target === dummy.id)).toBe(
      true,
    );
  });

  it('görev noktasına gider, varınca bölge içinde dolaşır', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 600, 600, 0, 5, 0.5);
    const goal = { x: 1800, y: 1500, radius: 200 };
    bot.brain.objective = goal;
    run(sim, [bot], 40);
    const { x, y } = bot.vehicle.chassis;
    expect(Math.hypot(x - goal.x, y - goal.y)).toBeLessThan(goal.radius * 1.25);
    // Bölgeye vardıktan sonra da içinde kalır.
    let leftZone = false;
    run(sim, [bot], 20, () => {
      const c = bot.vehicle.chassis;
      if (Math.hypot(c.x - goal.x, c.y - goal.y) > goal.radius * 1.6) leftZone = true;
    });
    expect(leftZone).toBe(false);
  });

  it('uzak görevde atılım kullanır ve depoyu tüketir', () => {
    const sim = arena(8192);
    const bot = addBot(sim, STRIKER, 600, 600, 0, 5);
    bot.brain.objective = { x: 7000, y: 6000, radius: 200 };
    let boosted = false;
    run(sim, [bot], 6, () => {
      if (bot.vehicle.chassis.boosting) boosted = true;
    });
    expect(boosted).toBe(true);
  });

  it('canı azalınca geri çekilme noktasına döner ve iyileşince savaşa döner', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 2000, 2000, 0, 9, 0.5);
    addBot(sim, STRIKER, 2400, 2000, 1, 10, 0.3);
    bot.brain.retreatPoint = { x: 400, y: 2000 };
    bot.vehicle.vitality.health = bot.vehicle.vitality.maxHealth * 0.1;
    const before = Math.hypot(bot.vehicle.chassis.x - 400, bot.vehicle.chassis.y - 2000);
    run(sim, [bot], 2);
    expect(bot.brain.mode).toBe('retreat');
    const after = Math.hypot(bot.vehicle.chassis.x - 400, bot.vehicle.chassis.y - 2000);
    expect(after).toBeLessThan(before);
    bot.vehicle.vitality.health = bot.vehicle.vitality.maxHealth;
    run(sim, [bot], 0.5);
    expect(bot.brain.mode).not.toBe('retreat');
  });

  it('menzil dışındaki düşmanın peşine görev bağı (leash) dışında düşmez', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 2000, 2000, 0, 11, 0.5);
    addBot(sim, STRIKER, 2000 + 900, 2000, 1, 12, 0.5);
    bot.brain.objective = { x: 2000, y: 2000, radius: 160, leash: 200 };
    run(sim, [bot], 0.5);
    expect(bot.brain.mode).not.toBe('engage');
  });

  it('duvar kenarına itilmez: dünya dışı bir görevde sınır payının içinde dengelenir', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 200, 2000, 0, 13);
    bot.brain.objective = { x: -2000, y: 2000, radius: 100 };
    run(sim, [bot], 15, () => {
      expect(sim.world.contains(bot.vehicle.chassis.x, bot.vehicle.chassis.y)).toBe(true);
    });
    // Duvara yaslanıp sürünmez: itme ile görev dengelenir, araç sınır payında durur.
    expect(bot.vehicle.chassis.x).toBeGreaterThan(40);
    expect(bot.vehicle.chassis.x).toBeLessThan(BOT.wallMargin);
  });

  it('ilerleyemediğini anlayınca kurtulma manevrası yapar ve görevine döner', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 1000, 1000, 0, 41);
    bot.brain.objective = { x: 3000, y: 1000, radius: 100 };
    const idle = idleCommand();
    const out = idleCommand();
    const modes: string[] = [];
    // Araç komutu uygulamıyor (sıkışmış gibi): bot ilerlemek istediği hâlde yer değiştirmiyor.
    for (let step = 0; step < 240; step++) {
      bot.brain.think(sim, STEP, out);
      modes.push(bot.brain.mode);
      sim.step(() => idle, STEP);
    }
    expect(modes).toContain('unstick');
    expect(modes[0]).toBe('advance');
    expect(modes.at(-1)).not.toBe('hold');
  });

  it('iki paleti de kırık bot yerinde kalır ama nişan almaya ve ateş etmeye devam eder', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 1000, 1000, 0, 21);
    const foe = addBot(sim, STRIKER, 1500, 1000, 1, 22);
    foe.vehicle.vitality.health = 1e6;
    bot.vehicle.chassis.parts = 3;
    bot.brain.objective = { x: 3000, y: 3000, radius: 100 };
    const events = run(sim, [bot], 12);
    const chassis = bot.vehicle.chassis;
    expect(Number.isFinite(chassis.x + chassis.y + chassis.hull)).toBe(true);
    expect(Math.hypot(chassis.x - 1000, chassis.y - 1000)).toBeLessThan(120);
    expect(events.some((event) => event.kind === 'fired' && event.source === bot.vehicle.id)).toBe(
      true,
    );
  });

  it('tek paleti kırık bot sürüklenir ama sonlu ve dünyanın içinde kalır; kurtulma döngüsü gövdeyi savurmaz', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 1000, 1000, 0, 23);
    bot.vehicle.chassis.parts = 1;
    bot.brain.objective = { x: 3000, y: 1000, radius: 100 };
    let maxSpin = 0;
    run(sim, [bot], 25, () => {
      maxSpin = Math.max(maxSpin, Math.abs(bot.vehicle.chassis.angularVelocity));
    });
    const chassis = bot.vehicle.chassis;
    expect(Number.isFinite(chassis.x + chassis.y + chassis.hull)).toBe(true);
    expect(chassis.x).toBeGreaterThan(0);
    expect(chassis.x).toBeLessThan(4096);
    expect(chassis.y).toBeGreaterThan(0);
    expect(chassis.y).toBeLessThan(4096);
    expect(maxSpin).toBeLessThan(6);
  });

  it('ölü araç boşta kalır ve doğunca kaldığı yerden karar verir', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 1000, 1000, 0, 14);
    addBot(sim, STRIKER, 1300, 1000, 1, 15);
    bot.vehicle.vitality.health = 0;
    const out = idleCommand();
    bot.brain.think(sim, STEP, out);
    expect(out).toEqual(idleCommand());
    expect(bot.brain.targetId).toBeNull();
  });

  it('aynı tohum ve aynı dünya bit bit aynı yolu izler', () => {
    const trace = (): number[] => {
      const sim = arena();
      const a = addBot(sim, DART, 1500, 1800, 0, 21, 0.7);
      const b = addBot(sim, ARACHNID, 2300, 2100, 1, 22, 0.4);
      a.brain.objective = { x: 3000, y: 3000, radius: 200 };
      const samples: number[] = [];
      run(sim, [a, b], 12, () => {
        samples.push(
          a.vehicle.chassis.x,
          a.vehicle.chassis.y,
          b.vehicle.chassis.x,
          b.vehicle.chassis.y,
        );
      });
      return samples;
    };
    expect(trace()).toEqual(trace());
  });

  it('farklı tohum farklı davranış üretir', () => {
    const final = (seed: number): number => {
      const sim = arena();
      const a = addBot(sim, STRIKER, 1500, 1800, 0, seed, 0.5);
      addBot(sim, STRIKER, 2300, 2100, 1, 99, 0.5);
      run(sim, [a], 6);
      return a.vehicle.chassis.x;
    };
    expect(final(1)).not.toBe(final(2));
  });

  it('komut sözleşmesine uyar: hareket en çok 1, nişan sıfır ya da birim', () => {
    const sim = arena();
    const a = addBot(sim, ARACHNID, 1500, 1800, 0, 31);
    const b = addBot(sim, STRIKER, 2000, 1800, 1, 32);
    let checked = 0;
    run(sim, [a, b], 10, undefined, (command) => {
      expect(Math.hypot(command.moveX, command.moveY)).toBeLessThanOrEqual(1 + 1e-9);
      const aim = Math.hypot(command.aimX, command.aimY);
      expect(aim === 0 || Math.abs(aim - 1) < 1e-9).toBe(true);
      checked++;
    });
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('BotBrain taktik', () => {
  const rangeOf = (spec: VehicleSpec): number => spec.armament.weapon.flight.maxRange;
  const gap = (a: Vehicle, b: Vehicle): number =>
    Math.hypot(a.chassis.x - b.chassis.x, a.chassis.y - b.chassis.y);

  it('usta zayıf hedefe yüklenir; acemi yalnız mesafeye bakar', () => {
    const pick = (skill: number): number | null => {
      const sim = arena();
      const bot = addBot(sim, STRIKER, 2000, 2000, 0, 41, skill);
      addBot(sim, STRIKER, 2500, 2000, 1, 42);
      const weak = addBot(sim, STRIKER, 2000, 2620, 1, 43);
      weak.vehicle.vitality.health = weak.vehicle.vitality.maxHealth * 0.1;
      run(sim, [bot], 0.5);
      return bot.brain.targetId === weak.vehicle.id ? 1 : 0;
    };
    expect(pick(1)).toBe(1);
    expect(pick(0)).toBe(0);
  });

  it('doğma korumalı düşman, vurulabilir bir düşman varken hedef seçilmez', () => {
    const sim = arena();
    const bot = addBot(sim, STRIKER, 2000, 2000, 0, 44, 0.6);
    const guarded = addBot(sim, STRIKER, 2400, 2000, 1, 45);
    guarded.vehicle.vitality.protectionRemainingMs = 8000;
    const open = addBot(sim, STRIKER, 2000, 2700, 1, 46);
    run(sim, [bot], 0.5);
    expect(bot.brain.targetId).toBe(open.vehicle.id);
    // Tek düşman korumalıysa yine de ona döner (hedefsiz kalmaz).
    const solo = arena();
    const hunter = addBot(solo, STRIKER, 2000, 2000, 0, 44, 0.6);
    const only = addBot(solo, STRIKER, 2400, 2000, 1, 45);
    only.vehicle.vitality.protectionRemainingMs = 8000;
    run(solo, [hunter], 0.5);
    expect(hunter.brain.targetId).toBe(only.vehicle.id);
  });

  it('menzil üstünlüğü olan bot düşmanın menzilinin dışından vurur', () => {
    const long = DART;
    const short = ARACHNID;
    expect(rangeOf(long)).toBeGreaterThan(rangeOf(short) * BOT.tactics.kiteRangeRatio);
    const sim = arena();
    const sniper = addBot(sim, long, 2000, 2000, 0, 47, 1);
    const target = addBot(sim, short, 2000 + rangeOf(short) * 0.6, 2000, 1, 48);
    let sum = 0;
    let count = 0;
    let elapsed = 0;
    run(sim, [sniper], 10, () => {
      elapsed += STEP;
      if (elapsed < 6000) return;
      sum += gap(sniper.vehicle, target.vehicle);
      count++;
    });
    expect(sum / count).toBeGreaterThan(rangeOf(short));
    expect(sum / count).toBeLessThan(rangeOf(long) * BOT.fireRangeFraction);
  });

  it('menzili kısa bot düşmanın içine girer', () => {
    const sim = arena();
    const brawler = addBot(sim, ARACHNID, 2000, 2000, 0, 49, 1);
    const target = addBot(sim, DART, 2000 + 700, 2000, 1, 50);
    let sum = 0;
    let count = 0;
    let elapsed = 0;
    run(sim, [brawler], 22, () => {
      elapsed += STEP;
      if (elapsed < 16000) return;
      sum += gap(brawler.vehicle, target.vehicle);
      count++;
    });
    expect(sum / count).toBeLessThan(rangeOf(ARACHNID) * 0.7);
  });

  describe('sayısal üstünlük', () => {
    const setup = (skill: number, allies: number) => {
      const sim = arena();
      const bot = addBot(sim, STRIKER, 2000, 2000, 0, 51, skill);
      bot.brain.retreatPoint = { x: 300, y: 2000 };
      for (let index = 0; index < allies; index++)
        addBot(sim, STRIKER, 2000, 2200 + index * 60, 0, 60 + index);
      // Küme uzaktaki müttefikler: sayım çemberinin dışında ama toplanma yarıçapının içinde.
      const rally = addBot(sim, STRIKER, 1000, 2000, 0, 70);
      for (const offset of [-120, 0, 120])
        addBot(sim, STRIKER, 2420, 2000 + offset, 1, 80 + offset);
      return { sim, bot, rally };
    };

    it('sayıca ezilen taktik bot müttefik kümesine çekilir ve ateş etmeyi bırakmaz', () => {
      const { sim, bot, rally } = setup(1, 0);
      const before = gap(bot.vehicle, rally.vehicle);
      let fired = false;
      run(sim, [bot], 2.5, undefined, (command) => {
        if (command.fire) fired = true;
      });
      expect(bot.brain.mode).toBe('regroup');
      expect(gap(bot.vehicle, rally.vehicle)).toBeLessThan(before - 200);
      expect(bot.brain.targetId).not.toBeNull();
      expect(fired).toBe(true);
    });

    it('yanında yeterli müttefik varsa çekilmez; acemi bot hiç çekilmez', () => {
      const covered = setup(1, 3);
      run(covered.sim, [covered.bot], 1);
      expect(covered.bot.brain.mode).not.toBe('regroup');
      const novice = setup(0, 0);
      run(novice.sim, [novice.bot], 1);
      expect(novice.bot.brain.mode).not.toBe('regroup');
    });
  });

  describe('mermiden kaçınma', () => {
    const FOE_ID = 9999;
    const dodge = (skill: number, offsetY: number, ownerTeam?: number) => {
      const sim = arena();
      const bot = addBot(sim, STRIKER, 2000, 2000, 0, 52, skill);
      let owner = FOE_ID;
      if (ownerTeam !== undefined) {
        const shooter = addBot(sim, STRIKER, 3300, 3300, ownerTeam, 53);
        owner = shooter.vehicle.id;
      }
      sim.projectiles.spawn(owner, 2400, 2000 + offsetY, -600, 0);
      const command = idleCommand();
      for (let step = 0; step < 15; step++) bot.brain.think(sim, STEP, command);
      return command;
    };

    it('yoluna gelen mermiden dikine, mermi geçeceği yerin ters yanına kaçar', () => {
      expect(dodge(1, 30).moveY).toBeLessThan(-0.3);
      expect(dodge(1, -30).moveY).toBeGreaterThan(0.3);
      expect(Math.abs(dodge(1, 0).moveY)).toBeGreaterThan(0.3);
    });

    it('acemi bot kaçmaz; müttefik mermisinden ve ıskalayan mermiden de kaçılmaz', () => {
      expect(dodge(0.1, 30).moveY).toBe(0);
      expect(dodge(1, 30, 0).moveY).toBe(0);
      expect(dodge(1, 400).moveY).toBe(0);
    });
  });
});
