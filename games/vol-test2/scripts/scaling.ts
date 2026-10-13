import { buildComb } from '../src/sim/scenario';
import { ForgeSim } from '../src/sim/sim';

/**
 * `scaling` kapısının VOL.TEST2 ölçümü: fabrika dünyasının adımı iki yük boyunda koşar.
 * Yük bant sayısıdır; birim sayısı bantın onda biridir. Bant ve birim başına iş sabit
 * olduğundan 4 kat yük ~4 kat süre vermelidir. Rapor `quality.json` → `scaling`
 * içindeki `games/vol-test2.$measure` tarifine uyar.
 */
const LOADS = [1000, 4000];
const WARMUP_STEPS = 240;
const SAMPLES = 15;
const STEPS_PER_SAMPLE = 90;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const steps = LOADS.map((load) => {
  const sim = ForgeSim.create({ seed: 0x5eed1234, sustainUnits: load / 10 });
  const built = buildComb(sim, { maxBelts: load, turrets: 24, fill: 3, smelterEvery: 3 });
  if (built.belts < load * 0.9) throw new Error(`bant kurulamadı: ${built.belts}/${load}`);
  for (let step = 0; step < WARMUP_STEPS; step++) sim.step();
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const started = performance.now();
    for (let step = 0; step < STEPS_PER_SAMPLE; step++) sim.step();
    samples.push((performance.now() - started) / STEPS_PER_SAMPLE);
  }
  return { load, ms: median(samples) };
});

console.log(JSON.stringify({ steps }));
