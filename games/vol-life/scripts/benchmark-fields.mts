import { performance } from 'node:perf_hooks';
import { substrateConfig } from '../src/config/substrate';
import { LifeWorld } from '../src/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '../src/runtime/sim/WorldMetadata';

const CANDIDATES = [
  { label: '256² tam', resolution: 256, bands: 1 },
  { label: '512² / 4 bant', resolution: 512, bands: 4 },
] as const;
const WARMUP_TICKS = 60;
const FIELD_UPDATES_PER_SAMPLE = 100;
const SAMPLE_COUNT = 7;

for (const candidate of CANDIDATES) {
  const config = {
    ...substrateConfig,
    world: {
      ...substrateConfig.world,
      fieldResolution: candidate.resolution,
      fieldUpdateBands: candidate.bands,
    },
  };
  const world = new LifeWorld(config, createExplicitWorldMetadata(1));
  for (let tick = 0; tick < WARMUP_TICKS; tick++) world.step();

  const samples: number[] = [];
  const simulationTicks = (60 / substrateConfig.world.fieldHz) * FIELD_UPDATES_PER_SAMPLE;
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const startedAt = performance.now();
    for (let tick = 0; tick < simulationTicks; tick++) world.step();
    samples.push((performance.now() - startedAt) / FIELD_UPDATES_PER_SAMPLE);
  }
  samples.sort((left, right) => left - right);
  const fieldTickMs = samples[Math.floor(samples.length / 2)];

  console.log(
    JSON.stringify({
      candidate: candidate.label,
      fieldTickMs: round(fieldTickMs),
      fullRefreshMs: round(fieldTickMs * candidate.bands),
      samplesMs: samples.map(round),
    }),
  );
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
