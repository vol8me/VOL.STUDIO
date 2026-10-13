/**
 * Uzun süreli sızıntı denetimi: dünya hızlandırılmış zamanda saatlerce işletilir ve her
 * pencerede GC sonrası yığın boyutu ile adım süresi yazılır. Sızıntı varsa yığın doğrusal büyür.
 *
 *   node --expose-gc --import tsx scripts/soak.ts --hours 10
 */
import { buildComb } from '../src/sim/scenario';
import { ForgeSim } from '../src/sim/sim';
import { SIM } from '../src/config/forge';

function arg(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : Number(process.argv[at + 1]);
}

if (typeof globalThis.gc !== 'function') throw new Error('--expose-gc gerekli.');
const hours = arg('hours', 1);
const windows = arg('windows', 20);
const belts = arg('belts', 8000);
const units = arg('units', 400);
const totalTicks = Math.round(hours * 3600 * SIM.tickRate);
const perWindow = Math.floor(totalTicks / windows);

const sim = ForgeSim.create({ sustainUnits: units });
buildComb(sim, { maxBelts: belts, turrets: 24, fill: 2, smelterEvery: 3 });
sim.run(600);

const rows: { hour: number; heapMb: number; rssMb: number; msPerTick: number; defeats: number }[] =
  [];
for (let window = 1; window <= windows; window++) {
  const started = performance.now();
  sim.run(perWindow);
  const elapsed = performance.now() - started;
  globalThis.gc();
  const memory = process.memoryUsage();
  rows.push({
    hour: (window * perWindow) / SIM.tickRate / 3600,
    heapMb: memory.heapUsed / 2 ** 20,
    rssMb: memory.rss / 2 ** 20,
    msPerTick: elapsed / perWindow,
    defeats: sim.state.defeats,
  });
  const row = rows[rows.length - 1];
  console.log(
    `${row.hour.toFixed(2)} sa  yığın ${row.heapMb.toFixed(1)} MB  RSS ${row.rssMb.toFixed(0)} MB  ` +
      `${row.msPerTick.toFixed(3)} ms/adım  yenilgi ${row.defeats}  birim ${sim.state.aliveUnits}`,
  );
}

// İlk pencere ısınmadır; eğim ikinci pencereden sonuna en küçük kareler ile hesaplanır.
const tail = rows.slice(1);
const meanX = tail.reduce((sum, row) => sum + row.hour, 0) / tail.length;
const meanY = tail.reduce((sum, row) => sum + row.heapMb, 0) / tail.length;
const slope =
  tail.reduce((sum, row) => sum + (row.hour - meanX) * (row.heapMb - meanY), 0) /
  tail.reduce((sum, row) => sum + (row.hour - meanX) ** 2, 0);
console.log(
  JSON.stringify({
    soak: {
      hours,
      belts,
      units,
      heapSlopeMbPerHour: slope,
      first: rows[0],
      last: rows[rows.length - 1],
    },
  }),
);
