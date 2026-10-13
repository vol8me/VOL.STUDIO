/**
 * Kontrol ölçümü: aynı dünyayı Colyseus Schema + StateView ile eşitlemenin bayt ve CPU maliyeti.
 *
 *   pnpm --filter @volstudio/vol-test2 exec tsx --tsconfig tsconfig.json scripts/schema-control.ts
 *
 * Bu bir ürün yolu değildir; özel ikili protokol ve kilit adımlı eşitlemenin neden seçildiğinin ölçülü
 * karşılığıdır. Sınırlar: yalnız sunucu tarafı kodlama ölçülür (istemci kod çözümü, ağ ve
 * `bufferedAmount` yok); bant eşyaları ve birimler için basit şema modeli kullanılır, daha akıllı bir
 * şema (örneğin chunk başına paketlenmiş bayt dizisi) bu sayıları değiştirebilir.
 */
import { Encoder, StateView, schema, t } from '@colyseus/schema';
import { BELT, NET, UNIT_KIND, WORLD } from '../src/config/forge';
import { buildComb } from '../src/sim/scenario';
import { ForgeSim } from '../src/sim/sim';

const argv = process.argv.slice(2).filter((value) => value !== '--');
const flag = (name: string, fallback: number): number => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? Number(argv[index + 1]) : fallback;
};
const belts = flag('belts', 8000);
const unitsTarget = flag('units', 400);
const clients = flag('clients', 12);
const ticks = flag('ticks', 600);
const patchEvery = flag('patchEvery', 2);

const Unit = schema({ x: t.float32(), y: t.float32(), hp: t.uint8(), kind: t.uint8() }, 'CUnit');
const Belt = schema(
  { n: t.uint8(), a: t.uint16(), b: t.uint16(), c: t.uint16(), d: t.uint16() },
  'CBelt',
);
const World = schema(
  {
    tick: t.uint32(),
    units: t.map(Unit).view(),
    belts: t.map(Belt).view(),
  },
  'CWorld',
);

const sim = ForgeSim.create({ seed: 0x5eed1234, sustainUnits: unitsTarget });
buildComb(sim, { maxBelts: belts, turrets: 24, fill: 2, smelterEvery: 3 });
for (let step = 0; step < 600; step++) sim.step();
const s = sim.state;

const world = new World();
const beltTiles: number[] = [];
for (let tile = 0; tile < s.count; tile++) {
  if (s.kind[tile] !== 1) continue;
  beltTiles.push(tile);
  const node = new Belt();
  node.n = s.beltCount[tile];
  world.belts.set(String(tile), node);
}
Encoder.BUFFER_SIZE = 8 * 1024 * 1024;
const encoder = new Encoder(world);

const chunksX = s.width / WORLD.chunk;
const views: StateView[] = [];
const rects: { x0: number; y0: number; x1: number; y1: number }[] = [];
let seed = 12345;
const next = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let client = 0; client < clients; client++) {
  const view = new StateView();
  const x0 = Math.floor(next() * (chunksX - NET.maxAoiChunks.x + 1));
  const y0 = Math.floor(next() * (chunksX - NET.maxAoiChunks.y + 1));
  const rect = {
    x0,
    y0,
    x1: x0 + NET.maxAoiChunks.x - 1,
    y1: y0 + NET.maxAoiChunks.y - 1,
  };
  rects.push(rect);
  for (const tile of beltTiles) {
    const cx = Math.floor((tile % s.width) / WORLD.chunk);
    const cy = Math.floor(Math.floor(tile / s.width) / WORLD.chunk);
    if (cx >= rect.x0 && cx <= rect.x1 && cy >= rect.y0 && cy <= rect.y1)
      view.add(world.belts.get(String(tile))!);
  }
  views.push(view);
}

const inView = (client: number, x: number, y: number): boolean => {
  const rect = rects[client];
  const cx = Math.floor(x / WORLD.chunk);
  const cy = Math.floor(y / WORLD.chunk);
  return cx >= rect.x0 && cx <= rect.x1 && cy >= rect.y0 && cy <= rect.y1;
};
const visibleUnits = views.map(() => new Map<number, unknown>());

// İlk tam durum: katılım maliyeti.
const full = encoder.encodeAll();
const fullBytes = full.length;
const fullViewBytes: number[] = views.map(
  (view) => encoder.encodeAllView(view, 1, { offset: 1 }).length,
);
encoder.discardChanges();

const syncMs: number[] = [];
const encodeMs: number[] = [];
let sharedBytes = 0;
let viewBytes = 0;

for (let tick = 0; tick < ticks; tick++) {
  sim.step();
  const syncStart = performance.now();
  world.tick = s.tick;
  for (const tile of beltTiles) {
    const node = world.belts.get(String(tile))!;
    const count = s.beltCount[tile];
    if (node.n !== count) node.n = count;
    const base = tile * BELT.slots;
    const [a, b, c, d] = [0, 1, 2, 3].map((slot) =>
      slot < count ? s.beltPos[base + slot] | (s.beltItem[base + slot] << 10) : 0,
    );
    if (node.a !== a) node.a = a;
    if (node.b !== b) node.b = b;
    if (node.c !== c) node.c = c;
    if (node.d !== d) node.d = d;
  }
  const seen = new Set<number>();
  for (const unit of s.units) {
    if (!unit.alive) continue;
    seen.add(unit.slot);
    const key = String(unit.slot);
    let node = world.units.get(key);
    if (node === undefined) {
      node = new Unit();
      world.units.set(key, node);
    }
    const x = Math.fround(unit.x);
    const y = Math.fround(unit.y);
    if (node.x !== x) node.x = x;
    if (node.y !== y) node.y = y;
    node.hp = Math.min(255, unit.hp);
    node.kind = unit.kind === UNIT_KIND.brute ? 2 : 1;
    for (let client = 0; client < clients; client++) {
      const visible = inView(client, unit.x, unit.y);
      const known = visibleUnits[client].has(unit.slot);
      if (visible && !known) {
        views[client].add(node);
        visibleUnits[client].set(unit.slot, node);
      } else if (!visible && known) {
        views[client].remove(node);
        visibleUnits[client].delete(unit.slot);
      }
    }
  }
  for (const key of [...world.units.keys()]) {
    if (!seen.has(Number(key))) {
      world.units.delete(key);
      for (const known of visibleUnits) known.delete(Number(key));
    }
  }
  syncMs.push(performance.now() - syncStart);

  if ((tick + 1) % patchEvery !== 0) continue;
  const encodeStart = performance.now();
  const it = { offset: 1 };
  encoder.sharedBuffer[0] = 0;
  const shared = encoder.encode(it);
  sharedBytes += shared.length;
  const sharedOffset = it.offset;
  for (const view of views) {
    const viewIt = { offset: sharedOffset };
    viewBytes += encoder.encodeView(view, sharedOffset, viewIt).length;
  }
  encoder.discardChanges();
  encodeMs.push(performance.now() - encodeStart);
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const pct = (values: number[], fraction: number) => {
  const list = sorted(values);
  return list[Math.min(list.length - 1, Math.floor(list.length * fraction))];
};
const seconds = ticks / 30;
const perClientBytesPerSecond = viewBytes / clients / seconds;
const result = {
  scenario: { belts: beltTiles.length, unitsAlive: s.aliveUnits, clients, ticks, patchEvery },
  fullState: {
    sharedBytes: fullBytes,
    perViewBytes: fullViewBytes.reduce((a, b) => a + b, 0) / fullViewBytes.length,
  },
  syncMsPerTick: {
    mean: syncMs.reduce((a, b) => a + b, 0) / syncMs.length,
    p99: pct(syncMs, 0.99),
  },
  encodeMsPerPatch: {
    mean: encodeMs.reduce((a, b) => a + b, 0) / encodeMs.length,
    p99: pct(encodeMs, 0.99),
    max: Math.max(...encodeMs),
  },
  patchesPerSecond: 30 / patchEvery,
  bytes: {
    sharedPerSecond: sharedBytes / seconds,
    perClientPerSecond: perClientBytesPerSecond,
    perClientKBPerSecond: perClientBytesPerSecond / 1024,
    mbitPerWorld: (perClientBytesPerSecond * clients * 8) / 1e6,
  },
};
console.log(JSON.stringify(result, null, 2));
