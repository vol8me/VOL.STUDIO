/**
 * İstemci başına çoğaltma baytı ve çerçeve üretim süresi. Soket yok: çerçeveler üretilir,
 * boyutu sayılır. Gerçek soket ve süreçler arası ölçüm `scripts/loadtest.ts`tedir.
 *
 *   pnpm --filter @volstudio/vol-test2 exec tsx scripts/bandwidth.ts --clients 12 --mode spread
 *
 * Modlar: `spread` her istemci rastgele bir ilgi alanında, `core` herkes çekirdek başında,
 * `dense` herkes çekirdek başında ve `--dense` kadar birim ilgi alanına yığılmış (sim durur).
 */
import { cpus } from 'node:os';
import { NET, SIM, UNIT_KIND } from '../src/config/forge';
import { buildComb } from '../src/sim/scenario';
import { ForgeSim } from '../src/sim/sim';
import { dueAt, Replicator, totalBytes, type ClientCursor } from '../server/replication';
import type { Hud } from '../src/net/protocol';

function arg(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : Number(process.argv[at + 1]);
}
function word(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
}

const clients = arg('clients', 12);
const ticks = arg('ticks', 900);
const belts = arg('belts', 8000);
const units = arg('units', 400);
const fill = arg('fill', 2);
const mode = word('mode', 'spread');
const dense = arg('dense', 0);
const dynamicsEvery = arg('dynamicsEvery', NET.dynamicsEvery);
const beltsEvery = arg('beltsEvery', NET.beltsEvery);

const sim = ForgeSim.create({ seed: 0x5eed1234, sustainUnits: units });
const built = buildComb(sim, { maxBelts: belts, turrets: 24, fill, smelterEvery: 3 });
sim.run(900);
const s = sim.state;

const replicator = new Replicator(sim);
const aoi = NET.maxAoiChunks;
const cursors: ClientCursor[] = [];
let seed = 12345;
const next = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
};
const coreChunkX = Math.floor(s.coreCenter.x / 16);
const coreChunkY = Math.floor(s.coreCenter.y / 16);
for (let index = 0; index < clients; index++) {
  const cursor = replicator.createCursor(aoi, index);
  if (mode === 'spread') {
    const x0 = Math.floor(next() * (s.chunksX - aoi.x + 1));
    const y0 = Math.floor(next() * (s.chunksY - aoi.y + 1));
    cursor.setRect({ x0, y0, x1: x0 + aoi.x - 1, y1: y0 + aoi.y - 1 });
  } else {
    const x0 = coreChunkX - Math.floor(aoi.x / 2);
    const y0 = coreChunkY - Math.floor(aoi.y / 2);
    cursor.setRect({ x0, y0, x1: x0 + aoi.x - 1, y1: y0 + aoi.y - 1 });
  }
  cursors.push(cursor);
}

if (dense > 0) {
  const rect = cursors[0].rect;
  for (const unit of s.units) s.releaseUnit(unit);
  for (let index = 0; index < dense; index++) {
    s.allocateUnit(
      index % 10 === 0 ? UNIT_KIND.brute : UNIT_KIND.crawler,
      (rect.x0 + next() * (rect.x1 - rect.x0 + 1)) * 16,
      (rect.y0 + next() * (rect.y1 - rect.y0 + 1)) * 16,
      30,
    );
  }
}

const hud = (): Hud => ({
  tick: s.tick,
  coreHp: s.coreHp,
  wave: s.wave,
  nextWaveIn: 0,
  defeats: s.defeats,
  ore: s.inventory[1],
  plate: s.inventory[2],
  deliveredOre: s.delivered[1],
  deliveredPlate: s.delivered[2],
  units: s.aliveUnits,
  players: clients,
  tickMs100: 0,
});

// Isınma: ilk yapı gönderimi ölçümden sayılmaz, ayrıca raporlanır.
const warm = (): void => {
  for (let step = 0; step < 40; step++) {
    if (dense === 0) sim.step();
    else s.tick++;
    replicator.collectShots(sim.shots);
    for (const cursor of cursors)
      replicator.frameFor(cursor, { dynamics: true, belts: true, hud: null });
  }
};
warm();
const initial = cursors.reduce((sum, cursor) => sum + totalBytes(cursor.bytes), 0);
for (const cursor of cursors) {
  for (const key of Object.keys(cursor.bytes) as (keyof typeof cursor.bytes)[])
    cursor.bytes[key] = 0;
  cursor.frames = 0;
}

const encodeMs = new Float64Array(ticks);
for (let tick = 0; tick < ticks; tick++) {
  if (dense === 0) sim.step();
  else s.tick++;
  replicator.collectShots(sim.shots);
  const started = performance.now();
  for (const cursor of cursors) {
    const base = dueAt(s.tick, cursor.phase, hud);
    replicator.frameFor(cursor, {
      dynamics: (s.tick + cursor.phase) % dynamicsEvery === 0,
      belts: (s.tick + cursor.phase) % beltsEvery === 0,
      hud: base.hud,
    });
  }
  encodeMs[tick] = performance.now() - started;
}

const seconds = ticks / SIM.tickRate;
const totals = { structure: 0, dynamics: 0, belts: 0, hud: 0, header: 0 };
let frames = 0;
for (const cursor of cursors) {
  for (const key of Object.keys(totals) as (keyof typeof totals)[])
    totals[key] += cursor.bytes[key];
  frames += cursor.frames;
}
const perClient = (value: number) => value / clients / seconds;
const sorted = Float64Array.from(encodeMs).sort();
const pick = (fraction: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
const sum = Object.values(totals).reduce((a, b) => a + b, 0);

const unitsInAoi = (() => {
  const rect = cursors[0].rect;
  let count = 0;
  for (const unit of s.units)
    if (unit.alive) {
      const cx = Math.floor(unit.x / 16);
      const cy = Math.floor(unit.y / 16);
      if (cx >= rect.x0 && cx <= rect.x1 && cy >= rect.y0 && cy <= rect.y1) count++;
    }
  return count;
})();

const report = {
  env: { node: process.version, cpu: cpus()[0]?.model.trim() },
  scenario: {
    clients,
    mode,
    belts: built.belts,
    items: built.items,
    units: s.aliveUnits,
    unitsInFirstAoi: unitsInAoi,
    dense,
    fill,
    dynamicsEvery,
    beltsEvery,
    ticks,
  },
  initialSyncBytesPerClient: initial / clients,
  bytesPerClientPerSecond: {
    total: perClient(sum),
    dynamics: perClient(totals.dynamics),
    belts: perClient(totals.belts),
    structure: perClient(totals.structure),
    hud: perClient(totals.hud),
    header: perClient(totals.header),
  },
  framesPerClientPerSecond: frames / clients / seconds,
  worldEgressKBps: (perClient(sum) * clients) / 1024,
  encodeMsPerTickAllClients: {
    mean: encodeMs.reduce((a, b) => a + b, 0) / ticks,
    p50: pick(0.5),
    p99: pick(0.99),
    max: sorted[sorted.length - 1],
  },
};

console.log(
  `${mode}: ${clients} istemci | bant ${built.belts} eşya ${built.items} | birim ${s.aliveUnits} (ilk alanda ${unitsInAoi})`,
);
const kb = (value: number) => (value / 1024).toFixed(1).padStart(7);
const b = report.bytesPerClientPerSecond;
console.log(
  `istemci başına KB/s: toplam ${kb(b.total)} | birim ${kb(b.dynamics)} | bant ${kb(b.belts)} | yapı ${kb(b.structure)} | hud ${kb(b.hud)} | üstbilgi ${kb(b.header)}`,
);
console.log(
  `dünya çıkışı ${report.worldEgressKBps.toFixed(0)} KB/s (${((report.worldEgressKBps * 8) / 1024).toFixed(2)} Mbit/s) | çerçeve/sn/istemci ${report.framesPerClientPerSecond.toFixed(1)} | ` +
    `ilk senkron ${(report.initialSyncBytesPerClient / 1024).toFixed(0)} KB/istemci`,
);
console.log(
  `kodlama ms/adım (tüm istemciler): ort ${report.encodeMsPerTickAllClients.mean.toFixed(3)} p50 ${report.encodeMsPerTickAllClients.p50.toFixed(3)} p99 ${report.encodeMsPerTickAllClients.p99.toFixed(3)} maks ${report.encodeMsPerTickAllClients.max.toFixed(3)}`,
);
console.log(JSON.stringify(report));
