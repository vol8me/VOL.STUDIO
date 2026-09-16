import { buildScalingReport, type ScalingEntry } from './benchmark/particleScaling';

const options = parseArgs(process.argv.slice(2));
const report = buildScalingReport(options);

if (options.json) console.log(JSON.stringify(report));
else {
  print('algoritmik (tabakalı, sabit yerel yoğunluk)', report.particleKernel);
  print('ürün (gerçek seeder)', report.productionSeeding);
}

function print(title: string, entries: readonly ScalingEntry[]): void {
  console.log(`# ${title}`);
  for (const entry of entries) {
    console.log(
      `${entry.particles} parçacık | aktif ${entry.active} | azami hücre ${entry.maxPerCell} | ` +
        `aday/parçacık ${entry.candidatePairsPerParticle.toFixed(1)} | ` +
        `p50 ${entry.msPerTick.toFixed(3)} ms | p95 ${entry.p95MsPerTick.toFixed(3)} ms`,
    );
  }
  const [low, high] = entries;
  if (low && high) console.log(`oran ${(high.msPerTick / low.msPerTick).toFixed(2)}×`);
}

function parseArgs(args: string[]): { iterations: number; samples: number; json: boolean } {
  const valueAfter = (flag: string, fallback: number): number => {
    const index = args.indexOf(flag);
    return index < 0 ? fallback : Number(args[index + 1]);
  };
  return {
    iterations: valueAfter('--iterations', 120),
    samples: valueAfter('--samples', 5),
    json: args.includes('--json'),
  };
}
