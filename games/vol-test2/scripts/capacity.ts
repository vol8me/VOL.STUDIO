/**
 * Başsız simülasyon kapasite ölçümü. Sunucu, ağ ve diski içermez: yalnız adım maliyeti.
 *
 *   pnpm --filter @volstudio/vol-test2 capacity -- --belts 8000 --units 400 --ticks 3000
 *
 * Çıktı insan okuyabilir tablo ve son satırda tek satır JSON'dur. Sayılar bu makineye,
 * Node sürümüne ve güç durumuna bağlıdır; çıktıya ortam bilgisi eklenir.
 */
import { cpus, totalmem } from 'node:os';
import { PerformanceObserver } from 'node:perf_hooks';
import { SpatialIndex } from '@volstudio/core/spatial';
import { buildComb } from '../src/sim/scenario';
import { FactorySim, PHASES } from '../src/sim/sim';
import { ITEM, KIND, MACHINES, SIM, UNIT_KIND } from '../src/config/factory';
import { turretStep, type Shot } from '../src/sim/units';
import type { Unit } from '../src/sim/state';

interface Args {
  belts: number;
  units: number;
  turrets: number;
  fill: number;
  ticks: number;
  warmup: number;
  worlds: number;
  size: number;
  smelterEvery: number;
  density: number;
  json: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = {
    belts: 8000,
    units: 400,
    turrets: 24,
    fill: 2,
    ticks: 3000,
    warmup: 600,
    worlds: 1,
    size: 256,
    smelterEvery: 3,
    density: 0,
    json: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--json') args.json = true;
    else if (flag.startsWith('--')) {
      const key = flag.slice(2) as keyof Args;
      if (!(key in args)) throw new Error(`Bilinmeyen bayrak: ${flag}`);
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Sayı bekleniyordu: ${flag}`);
      (args[key] as number) = value;
    }
  }
  return args;
}

function percentile(sorted: Float64Array, fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

const args = parse(process.argv.slice(2).filter((value) => value !== '--'));
const budgetMs = SIM.stepMs;

const sims: FactorySim[] = [];
let report = { belts: 0, drills: 0, smelters: 0, turrets: 0, items: 0 };
for (let world = 0; world < args.worlds; world++) {
  const sim = FactorySim.create({
    seed: 0x5eed1234 + world,
    width: args.size,
    height: args.size,
    sustainUnits: args.units,
  });
  report = buildComb(sim, {
    maxBelts: args.belts,
    turrets: args.turrets,
    fill: args.fill,
    smelterEvery: args.smelterEvery,
  });
  sims.push(sim);
}

for (let step = 0; step < args.warmup; step++) for (const sim of sims) sim.step();
const rssBefore = process.memoryUsage().rss;
for (const sim of sims) sim.measure(() => performance.now());

// Her turda bütün dünyalar sırayla adımlanır: tek iş parçacıklı sunucudaki gerçek yük budur.
const round = new Float64Array(args.ticks);
const gcPauses: number[] = [];
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) gcPauses.push(entry.duration);
});
observer.observe({ entryTypes: ['gc'] });
const deliveredBefore = sims.reduce(
  (sum, sim) => sum + sim.state.delivered[1] + sim.state.delivered[2],
  0,
);
const defeatsBefore = sims.reduce((sum, sim) => sum + sim.state.defeats, 0);
let shots = 0;
for (let tick = 0; tick < args.ticks; tick++) {
  const started = performance.now();
  for (const sim of sims) {
    sim.step();
    shots += sim.shots.length;
  }
  round[tick] = performance.now() - started;
}
await new Promise((resolve) => setImmediate(resolve));
for (const entry of observer.takeRecords()) gcPauses.push(entry.duration);
observer.disconnect();
const seconds = args.ticks / SIM.tickRate;
const deliveredPerSecond =
  (sims.reduce((sum, sim) => sum + sim.state.delivered[1] + sim.state.delivered[2], 0) -
    deliveredBefore) /
  seconds /
  sims.length;
const rssAfter = process.memoryUsage().rss;

const sorted = Float64Array.from(round).sort();
const mean = round.reduce((sum, value) => sum + value, 0) / round.length;
const over = round.filter((value) => value > budgetMs).length;
const alive = sims.reduce((sum, sim) => sum + sim.state.aliveUnits, 0) / sims.length;
const phases = PHASES.map((name, index) => ({
  name,
  ms: sims.reduce((sum, sim) => sum + sim.profile![index], 0) / args.ticks,
}));

const summary = {
  env: {
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0]?.model.trim(),
    cores: cpus().length,
    memoryGb: Math.round((totalmem() / 2 ** 30) * 10) / 10,
  },
  scenario: { ...args, built: report, aliveUnitsPerWorld: Math.round(alive) },
  roundMs: {
    mean,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    p999: percentile(sorted, 0.999),
    max: sorted[sorted.length - 1],
  },
  budgetMs,
  activity: {
    deliveredItemsPerSecondPerWorld: deliveredPerSecond,
    turretShotsPerSecondPerWorld: shots / seconds / sims.length,
    defeatsDuringRun: sims.reduce((sum, sim) => sum + sim.state.defeats, 0) - defeatsBefore,
  },
  overBudgetPercent: (over / round.length) * 100,
  overBudget60HzPercent:
    (round.filter((value) => value > SIM.stepMs / 2).length / round.length) * 100,
  gc: {
    pauses: gcPauses.length,
    totalMs: gcPauses.reduce((sum, value) => sum + value, 0),
    maxMs: gcPauses.reduce((max, value) => Math.max(max, value), 0),
  },
  cpuPercentOfOneCoreAt30Hz: ((mean * SIM.tickRate) / 1000) * 100,
  phasesMsPerRound: phases,
  rssMb: { before: rssBefore / 2 ** 20, after: rssAfter / 2 ** 20 },
};

if (!args.json) {
  const f = (value: number) => value.toFixed(3).padStart(8);
  console.log(
    `dünya ${args.size}x${args.size} x${args.worlds} | bant ${report.belts} matkap ${report.drills} ` +
      `işleyici ${report.smelters} taret ${report.turrets} | birim ~${Math.round(alive)} | ` +
      `bant üstü eşya ${report.items}`,
  );
  console.log(
    `adım ms  ort${f(mean)} p50${f(summary.roundMs.p50)} p90${f(summary.roundMs.p90)} ` +
      `p99${f(summary.roundMs.p99)} p99.9${f(summary.roundMs.p999)} maks${f(summary.roundMs.max)}`,
  );
  console.log(
    `bütçe ${budgetMs.toFixed(2)} ms: aşım %${summary.overBudgetPercent.toFixed(2)} | ` +
      `tek çekirdek %${summary.cpuPercentOfOneCoreAt30Hz.toFixed(1)} | ` +
      `RSS ${summary.rssMb.before.toFixed(0)} → ${summary.rssMb.after.toFixed(0)} MB`,
  );
  console.log(
    `60 Hz bütçe ${(SIM.stepMs / 2).toFixed(2)} ms: aşım %${summary.overBudget60HzPercent.toFixed(2)} | ` +
      `GC ${summary.gc.pauses} duraklama, toplam ${summary.gc.totalMs.toFixed(1)} ms, en uzun ${summary.gc.maxMs.toFixed(2)} ms`,
  );
  console.log(
    `etkinlik: çekirdeğe ${deliveredPerSecond.toFixed(1)} eşya/s | taret atışı ` +
      `${(shots / seconds / sims.length).toFixed(1)}/s | yenilgi ${summary.activity.defeatsDuringRun}`,
  );
  console.log(
    'aşama ms/tur  ' + phases.map((phase) => `${phase.name} ${phase.ms.toFixed(3)}`).join(' | '),
  );
}
console.log(JSON.stringify(summary));

if (args.density > 0) {
  // Savunma tıkanma noktasında birimler taretlerin dibine yığılır: en kötü hedef tarama yükü.
  const sim = sims[0];
  const s = sim.state;
  for (const unit of s.units) s.releaseUnit(unit);
  const center = s.coreCenter;
  for (let index = 0; index < args.density; index++) {
    const angle = (index % 360) * (Math.PI / 180);
    const radius = 6 + (index % 5);
    const unit = s.allocateUnit(
      UNIT_KIND.crawler,
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
      1e12,
    );
    if (!unit) break;
  }
  const index = new SpatialIndex<Unit>(MACHINES.turret.range, (unit) => unit.alive);
  const sink: Shot[] = [];
  const times = new Float64Array(2000);
  for (let run = 0; run < times.length; run++) {
    s.inventory[ITEM.plate] = 1000;
    sink.length = 0;
    const started = performance.now();
    index.refresh(s.units);
    turretStep(s, index, sink);
    times[run] = performance.now() - started;
  }
  const ordered = Float64Array.from(times).sort();
  const turrets = Array.from(
    { length: s.machineListLength },
    (_, i) => s.kind[s.machineList[i]],
  ).filter((kind) => kind === KIND.turret).length;
  console.log(
    JSON.stringify({
      density: {
        units: s.aliveUnits,
        turrets,
        refreshPlusTurretMs: { p50: percentile(ordered, 0.5), p99: percentile(ordered, 0.99) },
      },
    }),
  );
}
