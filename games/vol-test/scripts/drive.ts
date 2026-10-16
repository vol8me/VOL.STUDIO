import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  JsonlReport,
  judgeFleet,
  observeServer,
  runFleet,
  type BotHandle,
  type FleetBudget,
} from '@volstudio/network/drive';
import { loadQualityConfig } from '../../../scripts/quality/config.mjs';
import { NETWORK } from '../src/config/network';
import { ROOM } from '../src/network/rooms';
import { WORLD_SCHEMA, type TankInputData, type WorldSnapshot } from '../src/network/schema';
import { GAME } from '../src/config/game';
import { VEHICLE_IDS } from '../src/config/vehicles';

/**
 * Başsız çok istemcili savaş sürücüsü: `--clients` kadar gerçek Colyseus istemcisi kalıcı savaş
 * dünyasına katılır, 60 Hz girdi yollar (sürüş, dönüş, nişan, ara sıra ateş) ve katılım süresi,
 * yama aralığı, ping, kopma ve hataları JSONL rapora yazar. `--ops` verilirse sunucunun `/metrics`
 * (oda adım süresi, trafik, bağlantı kapısı) her örnekte rapora `server` satırı olarak eklenir.
 * Yalnız ağ ve sunucu yükü ölçülür; çizim, öngörü ve uzlaştırma tarayıcıdadır ve burada yoktur.
 *
 * `--profile` verilirse özet `quality.json` `fleetBudget` profiline karşı yargılanır: hüküm rapora
 * `verdict` satırı olarak yazılır, geçmezse süreç 1 ile çıkar. Sunucu maddeleri `--ops` olmadan
 * denetlenmez ve hüküm `complete: false` kalır (tam hüküm için `--ops` şarttır).
 */
const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://127.0.0.1:2567' },
    ops: { type: 'string' },
    clients: { type: 'string', default: '8' },
    seconds: { type: 'string', default: '30' },
    ramp: { type: 'string' },
    out: { type: 'string', default: 'records/drive/last.jsonl' },
    reconnect: { type: 'boolean', default: false },
    profile: { type: 'string' },
  },
});

const clients = Number(values.clients);
const seconds = Number(values.seconds);
if (!Number.isSafeInteger(clients) || clients < 1)
  throw new RangeError('--clients pozitif tam sayı');
if (!(seconds > 0)) throw new RangeError('--seconds pozitif sayı');

const out = resolve(values.out);
mkdirSync(dirname(out), { recursive: true });
const report = JsonlReport.toFile(out);
const inputs = new WeakMap<object, ReturnType<BotHandle<WorldSnapshot>['room']['input']>>();
const clock = new Map<number, number>();

/** Her botun kendi rastgele-benzeri ama yeniden üretilebilir davranışı: deterministik, bot indeksinden türer. */
function drive({ index, room }: BotHandle<WorldSnapshot>): void {
  let handle = inputs.get(room);
  if (!handle) {
    handle = room.input<TankInputData>();
    inputs.set(room, handle);
  }
  const step = (clock.get(index) ?? 0) + 1;
  clock.set(index, step);
  const seconds = (step * GAME.simulationStepMs) / 1000;
  const data = handle.data as TankInputData;
  data.moveY = 1;
  data.moveX = Math.sin(seconds * 0.5 + index) * 0.8;
  data.aimX = Math.cos(seconds * 0.7 + index);
  data.aimY = Math.sin(seconds * 0.7 + index);
  data.fire = step % 90 < 20;
  data.boost = false;
  data.brake = false;
  handle.send();
}

const metricsUrl = values.ops ? `${values.ops.replace(/\/$/, '')}/metrics` : null;
const observed: unknown[] = [];
const poll = metricsUrl
  ? setInterval(() => {
      fetch(metricsUrl)
        .then((response) => response.json() as Promise<unknown>)
        .then((metrics) => {
          observed.push({ metrics });
          report.write('server', { metrics });
        })
        .catch((error: unknown) => report.write('serverError', { message: String(error) }));
    }, 1000)
  : undefined;

const summary = await runFleet<WorldSnapshot>({
  endpoint: values.server,
  roomName: ROOM.world,
  clients,
  durationMs: seconds * 1000,
  rampMs: values.ramp === undefined ? undefined : Number(values.ramp),
  actMs: 17,
  schema: WORLD_SCHEMA,
  reconnect: values.reconnect,
  joinOptions: (index) => ({
    name: `${NETWORK.fallbackName}-bot${index}`,
    model: index % VEHICLE_IDS.length,
  }),
  act: drive,
  report,
});
clearInterval(poll);
let verdict = null;
if (values.profile !== undefined) {
  const config = loadQualityConfig(resolve(import.meta.dirname, '../../../quality.json')) as {
    fleetBudget?: Record<string, Record<string, FleetBudget>>;
  };
  const budget = config.fleetBudget?.['games/vol-test']?.[values.profile];
  if (!budget) throw new RangeError(`--profile ${values.profile}: quality.json fleetBudget'ta yok`);
  verdict = judgeFleet(summary, budget, observeServer(observed));
  report.write('verdict', { profile: values.profile, ...verdict });
}
await report.close();
console.log(JSON.stringify({ out, summary, verdict }, null, 2));
if (verdict && (!verdict.pass || !verdict.complete)) process.exitCode = 1;
