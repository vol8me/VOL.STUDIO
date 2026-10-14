import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { ARACHNID, BULWARK, DART, STRIKER } from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

const STEP = GAME.simulationStepMs;
const SPECS = [STRIKER, BULWARK, DART, ARACHNID];

/** İki takım, dört araç ailesi: botlar ortadaki bölge için savaşır. */
function battle(perTeam: number) {
  const sim = new Simulation({ world: new World(4096, 4096, 128), spawnPlayer: false });
  const bots: BotBrain[] = [];
  for (let index = 0; index < perTeam * 2; index++) {
    const team = index % 2;
    const row = Math.floor(index / 2);
    const vehicle = sim.spawn(
      team === 0 ? 500 + row * 50 : 3600 - row * 50,
      2048 + (row - perTeam / 2) * 140,
      team === 0 ? 0 : Math.PI,
      team,
      undefined,
      SPECS[index % SPECS.length],
    );
    const brain = new BotBrain(vehicle, { seed: index + 1, skill: 0.3 + (index % 5) * 0.15 });
    brain.objective = { x: 2048, y: 2048, radius: 300 };
    brain.retreatPoint = { x: team === 0 ? 300 : 3800, y: 2048 };
    bots.push(brain);
  }
  return { sim, bots };
}

describe('bot savaşı', () => {
  it('iki takımın botları dakikalarca sürekli savaşır: ateş eder, öldürür, yeniden doğar', () => {
    const { sim, bots } = battle(6);
    const commands = new Map(bots.map((bot) => [bot.vehicle.id, idleCommand()]));
    const origin = bots.map((bot) => ({ x: bot.vehicle.chassis.x, y: bot.vehicle.chassis.y }));
    const travelled = bots.map(() => 0);
    const last = origin.map((point) => ({ ...point }));
    const events: SimEvent[] = [];
    let fired = 0;
    let deaths = 0;
    let respawns = 0;
    for (let step = 0; step < (60 * 1000) / STEP; step++) {
      sim.step((vehicle) => {
        const bot = bots.find((candidate) => candidate.vehicle === vehicle);
        const command = commands.get(vehicle.id);
        return bot && command ? bot.think(sim, STEP, command) : idleCommand();
      }, STEP);
      events.length = 0;
      for (const event of sim.drainEvents(events)) {
        if (event.kind === 'fired') fired++;
        if (event.kind === 'died') deaths++;
        if (event.kind === 'respawned') respawns++;
      }
      bots.forEach((bot, index) => {
        const { x, y } = bot.vehicle.chassis;
        expect(sim.world.contains(x, y)).toBe(true);
        travelled[index] += Math.hypot(x - last[index].x, y - last[index].y);
        last[index].x = x;
        last[index].y = y;
      });
    }
    expect(fired).toBeGreaterThan(100);
    expect(deaths).toBeGreaterThan(5);
    expect(respawns).toBeGreaterThan(0);
    // Hiçbir bot donup kalmaz.
    for (const distance of travelled) expect(distance).toBeGreaterThan(200);
  });
});
