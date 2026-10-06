import { SCENARIOS, type ScenarioId } from '../src/config/scenarios';
import { SUSPENSION, TANK, WEAPON } from '../src/config/tank';
import { idleCommand } from '../src/sim/command';
import { ScenarioRunner } from '../src/sim/scenarios/ScenarioRunner';
import { Simulation } from '../src/sim/Simulation';
import { WeatherSystem } from '../src/sim/weather/WeatherSystem';
import { World } from '../src/sim/world/World';
import type { WeatherKind } from '../src/config/weather';

/**
 * Birleşik simülasyon yükü: araçlar + mermiler + hava, tek `Simulation.step`
 * maliyeti. Yalnız CPU simülasyonu ölçülür; çizim, GPU ve cihaz kare süresi
 * bu betiğin dışındadır. Başlangıç penceresi ile uzun oturum penceresi ayrı
 * raporlanır ki ısınma ve süreyle büyüme birbirine karışmasın.
 *
 * Ana makine saati ya da zamanlayıcı seviyesi bir koşu sırasında değişebilir:
 * ölçümde bütün aşamalar (alakasız komut üretimi dahil) bir anda aynı oranda
 * yavaşladı. Bu yüzden her pencerenin hemen önünde sabit bir aritmetik referans
 * işi ölçülür (pencere başı ve sonu ortalaması) ve `relative` (adım medyanı / referans) raporlanır; süreyle
 * gerçek büyüme `relative`de görünür, makine seviyesi değişimi görünmez.
 *
 * Bütçe kapısı değildir: `scaling` yalnız dar mermi döngüsünü korur; bu betik
 * algoritmik karar (geniş faz gerekir mi?) için sayı üretir.
 */
const STEP_MS = 1000 / 60;
const WINDOW_STEPS = 1800;

interface Load {
  readonly scenario: ScenarioId;
  readonly weather: WeatherKind | null;
  readonly steps: number;
}

const LOADS: readonly Load[] = [
  { scenario: 'empty', weather: null, steps: 3600 },
  { scenario: 'multitank', weather: null, steps: 3600 },
  { scenario: 'sandbox', weather: null, steps: 3600 },
  { scenario: 'sandbox', weather: 'snow', steps: 36_000 },
];

function reference(): number {
  const started = performance.now();
  let value = 0.5;
  for (let index = 0; index < 400_000; index++) value = Math.sin(value) * 0.999 + Math.cos(index);
  if (!Number.isFinite(value)) throw new Error('referans iş sonlu değil');
  return performance.now() - started;
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarize(samples: Float64Array, from: number, to: number) {
  const sorted = Array.from(samples.subarray(from, to)).sort((a, b) => a - b);
  return {
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

function run(load: Load) {
  const world = new World(4096, 4096, 128);
  const weather = load.weather
    ? new WeatherSystem(world.width, world.height, { seed: 7, override: load.weather })
    : undefined;
  const sim = new Simulation({
    world,
    tank: TANK,
    suspension: SUSPENSION,
    weapon: WEAPON,
    weather,
  });
  const runner = new ScenarioRunner(sim);
  runner.select(load.scenario, 731);
  const events: unknown[] = [];
  const samples = new Float64Array(load.steps);
  const references: number[] = [];
  let peakProjectiles = 0;
  let peakEvents = 0;
  for (let step = 0; step < load.steps; step++) {
    if (step % WINDOW_STEPS === 0) references.push(reference());
    const phase = (step * STEP_MS) / 1000;
    const player = {
      ...idleCommand(),
      moveX: Math.cos(phase * 0.5),
      moveY: Math.sin(phase * 0.5),
      aimX: Math.cos(phase),
      aimY: Math.sin(phase),
      fire: true,
      boost: step % 400 < 120,
    };
    const started = performance.now();
    sim.step((vehicle) => runner.commandFor(vehicle, player), STEP_MS);
    samples[step] = performance.now() - started;
    peakProjectiles = Math.max(peakProjectiles, sim.projectiles.count);
    events.length = 0;
    sim.drainEvents(events as never[]);
    peakEvents = Math.max(peakEvents, events.length);
  }
  references.push(reference());
  const windows: Array<ReturnType<typeof summarize> & { referenceMs: number; relative: number }> =
    [];
  for (let from = 0; from < load.steps; from += WINDOW_STEPS) {
    const stats = summarize(samples, from, Math.min(load.steps, from + WINDOW_STEPS));
    const referenceMs = (references[windows.length] + references[windows.length + 1]) / 2;
    windows.push({ ...stats, referenceMs, relative: stats.medianMs / referenceMs });
  }
  runner.destroy();
  return {
    scenario: load.scenario,
    vehicles: SCENARIOS[load.scenario].count + 1,
    weather: load.weather ?? 'none',
    steps: load.steps,
    startup: summarize(samples, 0, Math.min(300, load.steps)),
    overall: summarize(samples, 0, load.steps),
    firstWindow: windows[0],
    lastWindow: windows[windows.length - 1],
    windows,
    relativeDrift: windows[windows.length - 1].relative / windows[0].relative,
    peakProjectiles,
    peakEvents,
  };
}

// Isıtma: JIT kararlı olmadan ilk koşu sistematik yavaş görünür.
run({ scenario: 'multitank', weather: null, steps: 600 });
console.log(JSON.stringify({ stepBudgetMs: STEP_MS, loads: LOADS.map(run) }, null, 2));
