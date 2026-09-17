import { mkdirSync, writeFileSync } from 'node:fs';
import { substrateConfig } from '@/config/substrate';
import { runUnits } from '../morphology/workerPool';
import {
  runSeedingUnit,
  type SeedingUnitInput,
  type SeedingUnitOutput,
} from '../morphology/seedingStudy';
import { seedingRanges } from '../morphology/seedingSampler';

/*
 * F1 koşusu: ön-kayıtlı aralıklarda scrambled Sobol ile seeding profilleri
 * örneklenir ve her profil §8.4 launch envelope'una göre seed başına ölçülür.
 * Reroll YOKTUR, seed seçilmez.
 */
const PROFILE_COUNT = Number(process.argv[2] ?? 512);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECONDS = 30;
const HZ = 60;
const SAMPLE_TICKS = 30;
const SCRAMBLE_SEED = 1;
const WORKERS = Number(process.argv[3] ?? 8);

const units = Array.from({ length: PROFILE_COUNT }, (_, index) => ({
  workId: `seeding:${String(index).padStart(4, '0')}`,
  input: {
    substrate: substrateConfig,
    profileIndex: index,
    scrambleSeed: SCRAMBLE_SEED,
    seeds: SEEDS,
    seconds: SECONDS,
    simulationHz: HZ,
    sampleIntervalTicks: SAMPLE_TICKS,
  } satisfies SeedingUnitInput,
}));

const started = Date.now();
const results = await runUnits(units, WORKERS, 'seedingWorker.mjs', runSeedingUnit);
const outputs = results.map((result) => result.output as SeedingUnitOutput);
const elapsedMs = Date.now() - started;

const valid = outputs.filter((output) => !output.invalid);
const invalid = outputs.length - valid.length;
/* Kapı: seed'lerin ≥ %90'ı geçmeli. 8 seed'de bu 8/8 demektir (7/8 = %87,5). */
const passing = valid.filter((output) => output.passedSeedFraction >= 0.9);
const ranked = [...valid].sort((a, b) => b.medianRetention10 - a.medianRetention10);

const summary = {
  madde: 'F1',
  tarih: new Date().toISOString().slice(0, 10),
  profilSayısı: PROFILE_COUNT,
  seedSayısı: SEEDS.length,
  saniye: SECONDS,
  scrambleSeed: SCRAMBLE_SEED,
  aralıklar: seedingRanges,
  süreMs: elapsedMs,
  geçersizProfil: invalid,
  geçersizOran: +(invalid / outputs.length).toFixed(4),
  kapıyıGeçen: passing.length,
  kapıyıGeçenOran: +(passing.length / Math.max(1, valid.length)).toFixed(4),
  enİyiOn: ranked.slice(0, 10).map((output) => ({
    index: output.profileIndex,
    medyanKoruma10: +output.medianRetention10.toFixed(4),
    geçenSeedPayı: +output.passedSeedFraction.toFixed(3),
    profil: output.profile,
  })),
  varsayılanKarşılaştırma: {
    not: 'Varsayılan seeding E9 taban ölçümünde 10 sn medyan 0,828 ile kapıdan düşüyordu.',
  },
};

mkdirSync('benchmarks/results', { recursive: true });
writeFileSync('benchmarks/results/f1-seeding.json', JSON.stringify(summary, null, 2), 'utf8');
console.log(
  `F1: ${PROFILE_COUNT} profil × ${SEEDS.length} seed × ${SECONDS} sn — ` +
    `geçersiz ${invalid}, kapıyı geçen ${passing.length}, süre ${(elapsedMs / 60000).toFixed(
      1,
    )} dk`,
);
for (const output of ranked.slice(0, 5)) {
  console.log(
    `  #${output.profileIndex} medyanKoruma10=${output.medianRetention10.toFixed(3)} ` +
      `geçenSeed=${(output.passedSeedFraction * 100).toFixed(0)}%`,
  );
}
