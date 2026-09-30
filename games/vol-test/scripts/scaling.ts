import { createRandom } from '@volstudio/core/random';
import { Projectiles } from '../src/sim/combat/Projectiles';
import type { SimEvent } from '../src/sim/events';
import { World } from '../src/sim/world/World';

/**
 * `scaling` kapısının VOL.TEST ölçümü: mermi adımı iki yük boyunda koşar.
 * Mermi başına iş sabittir; 4 kat mermi ~4 kat süre vermelidir. Rapor
 * `quality.json` → `scaling.games/vol-test.$measure` tarifine uyar.
 */
const COUNTS = [128, 512];
const STEP_MS = 1000 / 60;
const WARMUP_STEPS = 120;
const SAMPLES = 25;
const STEPS_PER_SAMPLE = 60;

const map = new World(1_000_000, 1_000_000, 128);
const events: SimEvent[] = [];

function load(projectiles: Projectiles, count: number): void {
  const random = createRandom(count);
  projectiles.clear();
  for (let index = 0; index < count; index++) {
    const angle = random.next() * Math.PI * 2;
    projectiles.spawn(1, map.width / 2, map.height / 2, Math.cos(angle) * 40, Math.sin(angle) * 40);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const projectilesSeries = COUNTS.map((count) => {
  const projectiles = new Projectiles(count, Number.POSITIVE_INFINITY);
  load(projectiles, count);
  for (let step = 0; step < WARMUP_STEPS; step++) projectiles.step(STEP_MS, map, events);
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    load(projectiles, count);
    const started = performance.now();
    for (let step = 0; step < STEPS_PER_SAMPLE; step++) projectiles.step(STEP_MS, map, events);
    samples.push((performance.now() - started) / STEPS_PER_SAMPLE);
    events.length = 0;
  }
  if (projectiles.count !== count) throw new Error(`mermi kaybı: ${projectiles.count}/${count}`);
  return { count, ms: median(samples) };
});

console.log(JSON.stringify({ projectiles: projectilesSeries }));
