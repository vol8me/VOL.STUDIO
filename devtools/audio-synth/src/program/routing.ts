import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject, readNumber } from '../guard/read';
import { checkName, resolveParams, type ResolvedNode, type ResolveScope } from './bindings';
import { PROGRAM_REGISTRY } from './catalog';
import type { EffectEntry } from './registry';

/**
 * SoundGraph yönlendirmesi: katman → grup bus'ı → send/return → master. Tek
 * mix veriyolu (`arrange/mix.ts`) korunur; bus bir tampon + efekt zinciri +
 * çıkış kenarıdır, ikinci bir mikser değildir. Kurallar:
 *
 * - `master` ayrılmış addır; bus çıkışı bir bus ya da master'dır.
 * - Zamana yayılan efekt (reverb, delay, konvolüsyon) katman insert'ine
 *   giremez: kuyruk bir send/return bus'ında paylaşılır, nota içine gömülmez.
 * - Kenarlar (çıkış, send, sidechain) döngü oluşturamaz; işlem sırası
 *   topolojiktir ve eşit durumda ADA göre sıralıdır (deterministik).
 * - Girdisi olmayan bus bir yazım hatasıdır ve reddedilir.
 */
export const MASTER_BUS = 'master';

export const ROUTING_LIMITS = {
  buses: 16,
  sendsPerSource: 4,
  inserts: 8,
  busEffects: 8,
} as const;

export interface SendV1 {
  readonly bus: string;
  readonly levelDb: number;
}

export interface EffectNodeV1 {
  readonly primitive: string;
  readonly version: number;
  readonly params?: Readonly<Record<string, number | string>>;
  /** Detektörün dinlediği bus ya da katman adı (yalnız sidechain alan efektlerde). */
  readonly sidechain?: string;
}

export interface BusV1 {
  readonly output?: string;
  readonly gainDb?: number;
  readonly effects?: readonly EffectNodeV1[];
  readonly sends?: readonly SendV1[];
}

export interface ResolvedSend {
  readonly bus: string;
  readonly levelDb: number;
  readonly gain: number;
}

export interface SidechainRef {
  readonly kind: 'bus' | 'layer';
  readonly name: string;
}

export interface ResolvedEffect extends ResolvedNode<EffectEntry> {
  readonly sidechain: SidechainRef | null;
}

export interface ResolvedBus {
  readonly name: string;
  readonly output: string;
  readonly gainDb: number;
  readonly gain: number;
  readonly effects: readonly ResolvedEffect[];
  readonly sends: readonly ResolvedSend[];
}

/** Grafiğin bilinen adları: katmanlar ve bus'lar (master hariç). */
export interface GraphNames {
  readonly layers: ReadonlySet<string>;
  readonly buses: ReadonlySet<string>;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

export function busNames(value: unknown): Set<string> {
  if (value === undefined) return new Set();
  const record = checkObject(value, 'buses', Object.keys((value as object) ?? {}));
  const names = Object.keys(record).sort();
  if (names.length > ROUTING_LIMITS.buses) {
    const detail = `en çok ${ROUTING_LIMITS.buses} bus`;
    throw new AudioParamError('buses', 'range', detail, names.length);
  }
  for (const name of names) {
    checkName(name, `buses.${name}`);
    if (name === MASTER_BUS) {
      throw new AudioParamError(`buses.${name}`, 'combination', 'master ayrılmış addır', name);
    }
  }
  return new Set(names);
}

/** Send listesi: hedef tanımlı bir bus, her hedef bir kez, seviye dB. */
export function resolveSends(
  value: unknown,
  path: string,
  names: GraphNames,
  self: string | null,
  spaceDb: number,
): ResolvedSend[] {
  if (value === undefined) return [];
  const items = checkArray(value, path);
  if (items.length > ROUTING_LIMITS.sendsPerSource) {
    const detail = `en çok ${ROUTING_LIMITS.sendsPerSource} send`;
    throw new AudioParamError(path, 'range', detail, items.length);
  }
  const seen = new Set<string>();
  return items.map((item, i) => {
    const at = `${path}[${i}]`;
    const o = checkObject(item, at, ['bus', 'levelDb']);
    const bus = checkName(o.bus, `${at}.bus`);
    if (!names.buses.has(bus)) {
      throw new AudioParamError(
        `${at}.bus`,
        'unknown-id',
        'tanımlı bir bus olmalı (master değil)',
        bus,
      );
    }
    if (bus === self || seen.has(bus)) {
      throw new AudioParamError(`${at}.bus`, 'combination', 'kendine ya da iki kez send', bus);
    }
    seen.add(bus);
    const levelDb = checkNumber(o.levelDb, `${at}.levelDb`, { min: -120, max: 12 });
    return { bus, levelDb, gain: dbToGain(Math.max(-120, levelDb + spaceDb)) };
  });
}

function sidechainOf(
  value: unknown,
  path: string,
  entry: EffectEntry,
  names: GraphNames,
): SidechainRef | null {
  if (value === undefined) return null;
  if (!entry.sidechain) {
    const detail = `${entry.id} sidechain almaz`;
    throw new AudioParamError(path, 'combination', detail, value);
  }
  const name = checkName(value, path);
  if (names.buses.has(name)) return { kind: 'bus', name };
  if (names.layers.has(name)) return { kind: 'layer', name };
  throw new AudioParamError(path, 'unknown-id', 'tanımlı bir bus ya da katman olmalı', name);
}

export interface ChainOptions {
  readonly streamPrefix: string;
  readonly allowTimeBased: boolean;
  readonly allowSidechain: boolean;
  readonly limit: number;
}

/**
 * Efekt zincirini çözer. Akış yolu `<önek><sıra>`: master zinciri geçmişle
 * aynı `effect:<i>` yolunu kullanır (mevcut programların PCM'i değişmez).
 */
export function resolveEffectChain(
  value: unknown,
  path: string,
  scope: ResolveScope,
  names: GraphNames,
  options: ChainOptions,
): ResolvedEffect[] {
  if (value === undefined) return [];
  const items = checkArray(value, path);
  if (items.length > options.limit) {
    throw new AudioParamError(path, 'range', `en çok ${options.limit}`, items.length);
  }
  return items.map((item, i) => {
    const at = `${path}[${i}]`;
    const keys = [
      'primitive',
      'version',
      'params',
      ...(options.allowSidechain ? ['sidechain'] : []),
    ];
    const node = checkObject(item, at, keys);
    const entry = PROGRAM_REGISTRY.resolve(
      node.primitive,
      node.version,
      ['effect'],
      `${at}.primitive`,
    );
    if (entry.timeBased && !options.allowTimeBased) {
      const detail = `${entry.id} zamana yayılır: katman insert'i değil, bus/send ile kullanılır`;
      throw new AudioParamError(`${at}.primitive`, 'combination', detail, entry.id);
    }
    return {
      entry,
      streamPath: `${options.streamPrefix}${i}`,
      params: resolveParams(entry, node.params, `${at}.params`, scope),
      sidechain: sidechainOf(node.sidechain, `${at}.sidechain`, entry, names),
    };
  });
}

export interface LayerRoute {
  readonly name: string;
  readonly bus: string;
  readonly sends: readonly ResolvedSend[];
}

/**
 * Bus'ları çözer ve işlem sırasına dizer. Bağımlılık: kaynak bus, çıkış/send
 * hedefinden ve kendisini sidechain olarak dinleyen bus'tan ÖNCE işlenir.
 */
export function resolveBuses(
  value: unknown,
  scope: ResolveScope,
  names: GraphNames,
  routes: readonly LayerRoute[],
  spaceDb: number,
): ResolvedBus[] {
  if (value === undefined) return [];
  const record = value as Readonly<Record<string, unknown>>;
  const buses = [...names.buses].map((name): ResolvedBus => {
    const path = `buses.${name}`;
    const o = checkObject(record[name], path, ['output', 'gainDb', 'effects', 'sends']);
    const output = o.output === undefined ? MASTER_BUS : checkName(o.output, `${path}.output`);
    if (output !== MASTER_BUS && !names.buses.has(output)) {
      throw new AudioParamError(`${path}.output`, 'unknown-id', 'tanımlı bus ya da master', output);
    }
    if (output === name) {
      throw new AudioParamError(`${path}.output`, 'combination', 'bus kendine akamaz', output);
    }
    const gainDb = readNumber(o, 'gainDb', path, { min: -120, max: 24 }, 0);
    const effects = resolveEffectChain(o.effects, `${path}.effects`, scope, names, {
      streamPrefix: `bus:${name}/effect:`,
      allowTimeBased: true,
      allowSidechain: true,
      limit: ROUTING_LIMITS.busEffects,
    });
    for (const [i, effect] of effects.entries()) {
      if (effect.sidechain?.kind === 'bus' && effect.sidechain.name === name) {
        const at = `${path}.effects[${i}].sidechain`;
        throw new AudioParamError(at, 'combination', 'bus kendi sidechain’i olamaz', name);
      }
    }
    return {
      name,
      output,
      gainDb,
      gain: dbToGain(gainDb),
      effects,
      sends: resolveSends(o.sends, `${path}.sends`, names, name, spaceDb),
    };
  });
  checkFed(buses, routes);
  return orderBuses(buses);
}

function checkFed(buses: readonly ResolvedBus[], routes: readonly LayerRoute[]): void {
  const fed = new Set<string>();
  for (const route of routes) {
    fed.add(route.bus);
    for (const send of route.sends) fed.add(send.bus);
  }
  for (const bus of buses) {
    fed.add(bus.output);
    for (const send of bus.sends) fed.add(send.bus);
  }
  for (const bus of buses) {
    if (!fed.has(bus.name)) {
      const detail = 'hiçbir katman ya da bus bu bus’a akmıyor (etkisiz bus)';
      throw new AudioParamError(`buses.${bus.name}`, 'combination', detail, bus.name);
    }
  }
}

/** Kahn sıralaması; hazır kümede ada göre en küçük önce. Döngü adlı hata verir. */
function orderBuses(buses: readonly ResolvedBus[]): ResolvedBus[] {
  const byName = new Map(buses.map((b) => [b.name, b]));
  const after = new Map<string, Set<string>>(buses.map((b) => [b.name, new Set()]));
  const edge = (from: string, to: string) => {
    if (from !== MASTER_BUS && to !== MASTER_BUS && byName.has(from) && byName.has(to)) {
      after.get(from)?.add(to);
    }
  };
  for (const bus of buses) {
    edge(bus.name, bus.output);
    for (const send of bus.sends) edge(bus.name, send.bus);
    for (const effect of bus.effects) {
      if (effect.sidechain?.kind === 'bus') edge(effect.sidechain.name, bus.name);
    }
  }
  const indegree = new Map(buses.map((b) => [b.name, 0]));
  for (const targets of after.values()) {
    for (const to of targets) indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const ready = [...indegree]
    .filter(([, d]) => d === 0)
    .map(([n]) => n)
    .sort();
  const order: ResolvedBus[] = [];
  while (ready.length > 0) {
    const name = ready.shift() as string;
    order.push(byName.get(name) as ResolvedBus);
    for (const to of [...(after.get(name) ?? [])].sort()) {
      const left = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, left);
      if (left === 0) {
        ready.push(to);
        ready.sort();
      }
    }
  }
  if (order.length !== buses.length) {
    const cyclic = buses.filter((b) => !order.includes(b)).map((b) => b.name);
    const detail = `döngü: ${cyclic.join(' → ')}`;
    throw new AudioParamError('buses', 'combination', detail, cyclic);
  }
  return order;
}
