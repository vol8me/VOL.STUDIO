import { addVoice, createMix, type Mix } from '../arrange/mix';
import { renderVoices, trimmedLength } from '../arrange/render';
import { AudioParamError } from '../guard/errors';
import type { RenderCost } from '../guard/budget';
import { checkArray, checkObject } from '../guard/read';
import type { ResolveScope } from '../program/bindings';
import { runEffects } from '../program/mixdown';
import { deriveSeed, substream } from '../program/random';
import {
  MASTER_BUS,
  resolveBuses,
  resolveSends,
  type BusV1,
  type GraphNames,
  type ResolvedBus,
  type ResolvedSend,
  type SendV1,
} from '../program/routing';
import type { NodeContext, ProgramEntry } from '../program/registry';
import type { ResolvedNode } from '../program/schema';
import type { MusicPlayback } from './terms';
import type { MusicRenderV1 } from './render';
import { beatSeconds, eventsFor, loopFrames, ONE_SHOT_TAIL_SECONDS, voicesOf } from './render';
import type { MusicScoreV1 } from './score';

/**
 * Müzik bus/send grafiği — akustik SoundGraph ile AYNI çözücü ve efekt
 * zinciri (`program/routing.ts`, `runEffects`): şerit → grup bus'ı →
 * send/return → master. Dördüncü bir mikser yoktur; müzik yalnız şeritleri
 * kaynak olarak koyar.
 *
 * Stem paritesi (stem toplamı = referans mix) iki kuralla korunur:
 * - Doğrusal olmayan efekt (`routing.linear: false`) taşıyan bus yalnız TEK
 *   stem'den beslenebilir; doğrusal bus'lar (EQ, reverb, konvolüsyon, delay)
 *   birden çok stem alır, çünkü toplamın işlemi işlemlerin toplamıdır.
 * - Sidechain kaynağı bir ŞERİTTİR ve anahtar her zaman tam score'dan
 *   render edilir. `adaptiveLoop`'ta anahtar şeridi başka bir stem'de ise
 *   reddedilir: çalışma zamanı o stem'i kısınca pişmiş ducking yanlış kalır.
 */
export interface MusicMixV1 {
  readonly routes?: Readonly<Record<string, string>>;
  readonly laneSends?: Readonly<Record<string, readonly SendV1[]>>;
  readonly buses: Readonly<Record<string, BusV1>>;
}

export interface ResolvedMusicMix {
  readonly routes: ReadonlyMap<string, string>;
  readonly sends: ReadonlyMap<string, readonly ResolvedSend[]>;
  readonly buses: readonly ResolvedBus[];
}

interface LaneInfo {
  readonly id: string;
  readonly stem: string;
}

function emptyScope(sampleRate: number): ResolveScope {
  return {
    sampleRate,
    gestures: new Map(),
    modulators: new Set(),
    controls: [],
    used: { gestures: new Set(), modulators: new Set(), controls: new Set() },
  };
}

/** Bus'ı besleyen stem kümeleri (şerit rotaları, send'ler ve yukarı akış bus'ları). */
function stemsFeeding(mix: ResolvedMusicMix, lanes: readonly LaneInfo[]): Map<string, Set<string>> {
  const feeds = new Map<string, Set<string>>(mix.buses.map((b) => [b.name, new Set()]));
  for (const lane of lanes) {
    const route = mix.routes.get(lane.id);
    if (route && route !== MASTER_BUS) feeds.get(route)?.add(lane.stem);
    for (const send of mix.sends.get(lane.id) ?? []) feeds.get(send.bus)?.add(lane.stem);
  }
  for (const bus of mix.buses) {
    const own = feeds.get(bus.name) ?? new Set<string>();
    for (const target of [bus.output, ...bus.sends.map((s) => s.bus)]) {
      if (target !== MASTER_BUS) for (const stem of own) feeds.get(target)?.add(stem);
    }
  }
  return feeds;
}

export function resolveMusicMix(
  value: unknown,
  path: string,
  lanes: readonly LaneInfo[],
  playback: MusicPlayback,
  sampleRate: number,
): ResolvedMusicMix {
  const o = checkObject(value, path, ['routes', 'laneSends', 'buses']);
  const laneIds = new Set(lanes.map((l) => l.id));
  const busRecord = checkObject(o.buses, `${path}.buses`, Object.keys((o.buses as object) ?? {}));
  const names: GraphNames = { layers: laneIds, buses: new Set(Object.keys(busRecord).sort()) };
  const routes = new Map<string, string>();
  const rawRoutes =
    o.routes === undefined ? {} : checkObject(o.routes, `${path}.routes`, [...laneIds]);
  for (const [lane, bus] of Object.entries(rawRoutes)) {
    if (typeof bus !== 'string' || (bus !== MASTER_BUS && !names.buses.has(bus))) {
      throw new AudioParamError(
        `${path}.routes.${lane}`,
        'unknown-id',
        'tanımlı bus ya da master',
        bus,
      );
    }
    routes.set(lane, bus);
  }
  const sends = new Map<string, readonly ResolvedSend[]>();
  const rawSends =
    o.laneSends === undefined ? {} : checkObject(o.laneSends, `${path}.laneSends`, [...laneIds]);
  for (const [lane, list] of Object.entries(rawSends)) {
    checkArray(list, `${path}.laneSends.${lane}`);
    sends.set(lane, resolveSends(list, `${path}.laneSends.${lane}`, names, null, 0));
  }
  const routeList = lanes.map((l) => ({
    name: l.id,
    bus: routes.get(l.id) ?? MASTER_BUS,
    sends: sends.get(l.id) ?? [],
  }));
  const buses = resolveBuses(busRecord, emptyScope(sampleRate), names, routeList, 0);
  const mix = { routes, sends, buses };
  const feeds = stemsFeeding(mix, lanes);
  const stemOf = new Map(lanes.map((l) => [l.id, l.stem]));
  for (const bus of buses) {
    const stems = feeds.get(bus.name) ?? new Set<string>();
    const nonlinear = bus.effects.find((e) => !e.entry.linear);
    if (nonlinear && stems.size > 1) {
      const detail = `${
        nonlinear.entry.id
      } doğrusal değil; bus tek stem’den beslenmeli (besleyen: ${[...stems].sort().join(', ')})`;
      throw new AudioParamError(`${path}.buses.${bus.name}`, 'combination', detail, bus.name);
    }
    for (const effect of bus.effects) {
      if (!effect.sidechain) continue;
      if (effect.sidechain.kind !== 'layer') {
        const detail =
          'müzikte sidechain kaynağı bir şerittir (anahtar tam score’dan render edilir)';
        throw new AudioParamError(
          `${path}.buses.${bus.name}`,
          'combination',
          detail,
          effect.sidechain.name,
        );
      }
      const keyStem = stemOf.get(effect.sidechain.name);
      if (playback === 'adaptiveLoop' && stems.size > 0 && !stems.has(keyStem ?? '')) {
        const detail = `adaptive’de stem’ler arası sidechain pişmiş ducking bırakır (anahtar stem: ${keyStem})`;
        throw new AudioParamError(
          `${path}.buses.${bus.name}`,
          'combination',
          detail,
          effect.sidechain.name,
        );
      }
    }
  }
  return mix;
}

function prepareNode(
  node: ResolvedNode<ProgramEntry>,
  seed: number,
  sampleRate: number,
  frames: number,
  sidechain?: readonly Float32Array[],
): { params: Record<string, number | string>; ctx: NodeContext } {
  const params = node.params as Record<string, number | string>;
  return {
    params,
    ctx: {
      sampleRate,
      frames,
      random: (label) => substream(seed, `${node.streamPath}/${label}`),
      seed: (label) => deriveSeed(seed, `${node.streamPath}/${label}`),
      ...(sidechain ? { sidechain } : {}),
    },
  };
}

function framesOf(score: MusicScoreV1, playback: MusicPlayback): number {
  if (playback !== 'playlistOneShot') return loopFrames(score);
  const beat = beatSeconds(score);
  const end = score.events.reduce((m, e) => Math.max(m, e.beat + e.beats), 0);
  return Math.ceil((end * beat + ONE_SHOT_TAIL_SECONDS) * score.sampleRate);
}

/**
 * Bus grafiğiyle score render'ı. `stem` verilirse yalnız o stem'in şeritleri
 * kaynak olur; sidechain anahtarları her zaman tam score'dandır. Tek seferlik
 * cue'da kırpma `renderScoreRaw` ile aynı kuraldır (render edilen tamponun
 * kendi sessizliği).
 */
export function renderScoreMixed(
  score: MusicScoreV1,
  mix: ResolvedMusicMix,
  options: { readonly playback: MusicPlayback; readonly stem?: string; readonly seed: number },
): MusicRenderV1 {
  const oneShot = options.playback === 'playlistOneShot';
  const frames = framesOf(score, options.playback);
  const seconds = frames / score.sampleRate;
  const channels = 2 as const;
  const master = createMix(seconds, score.sampleRate, channels);
  const buses = new Map(
    mix.buses.map((b) => [b.name, createMix(seconds, score.sampleRate, channels)]),
  );
  const place = (target: Mix, lane: string, events: ReturnType<typeof eventsFor>, gain = 1) => {
    const rendered = renderVoices(
      voicesOf(
        score,
        events.filter((e) => e.lane === lane),
      ),
      {
        durationSeconds: seconds,
        sampleRate: score.sampleRate,
        wrap: !oneShot,
      },
    );
    addVoice(
      target,
      { channels: [...rendered.channels], sampleRate: score.sampleRate, duration: seconds },
      0,
      { gain },
    );
    return rendered;
  };
  const events = eventsFor(score, options.stem);
  for (const lane of score.lanes) {
    const route = mix.routes.get(lane.id) ?? MASTER_BUS;
    const target = route === MASTER_BUS ? master : (buses.get(route) as Mix);
    const rendered = place(target, lane.id, events);
    for (const send of mix.sends.get(lane.id) ?? []) {
      addVoice(
        buses.get(send.bus) as Mix,
        { channels: [...rendered.channels], sampleRate: score.sampleRate, duration: seconds },
        0,
        { gain: send.gain },
      );
    }
  }
  const keys = new Map<string, readonly Float32Array[]>();
  for (const bus of mix.buses) {
    for (const effect of bus.effects) {
      if (effect.sidechain?.kind !== 'layer' || keys.has(effect.sidechain.name)) continue;
      const key = createMix(seconds, score.sampleRate, channels);
      place(key, effect.sidechain.name, score.events.slice());
      keys.set(effect.sidechain.name, key.channels);
    }
  }
  for (const bus of mix.buses) {
    const own = (buses.get(bus.name) as Mix).channels;
    runEffects(
      bus.effects,
      own,
      {
        renderLayer: () => [],
        prepare: (node, sidechain) =>
          prepareNode(node, options.seed, score.sampleRate, frames, sidechain),
      },
      (ref) => (ref ? keys.get(ref.name) : undefined),
    );
    const output = bus.output === MASTER_BUS ? master : (buses.get(bus.output) as Mix);
    output.channels.forEach((c, ch) => {
      for (let i = 0; i < c.length; i++) c[i] += own[ch][i] * bus.gain;
    });
    for (const send of bus.sends) {
      (buses.get(send.bus) as Mix).channels.forEach((c, ch) => {
        for (let i = 0; i < c.length; i++) c[i] += own[ch][i] * bus.gain * send.gain;
      });
    }
  }
  const kept = oneShot ? trimmedLength(master.channels, score.sampleRate) : frames;
  const out = master.channels.map((c) => c.subarray(0, kept));
  return {
    channels: out,
    sampleRate: score.sampleRate,
    frames: kept,
    durationSeconds: kept / score.sampleRate,
  };
}

/** Bus grafiğinin ek maliyeti: bus tamponları, anahtar şeritleri ve efekt işi. */
export function estimateMixCost(
  score: MusicScoreV1,
  mix: ResolvedMusicMix,
  playback: MusicPlayback,
): RenderCost {
  const frames = framesOf(score, playback);
  const keyed = new Set(
    mix.buses.flatMap((b) => b.effects.map((e) => e.sidechain?.name).filter(Boolean)),
  );
  let work = frames * 2 * mix.buses.length * 3;
  for (const bus of mix.buses) {
    for (const effect of bus.effects) {
      const params = effect.params as Record<string, number | string>;
      work += frames * 2 * effect.entry.resource.workPerFrame(params, new Set());
    }
  }
  return {
    peakBytes: (mix.buses.length + keyed.size + score.lanes.length) * frames * 2 * 4,
    workUnits: work,
  };
}
