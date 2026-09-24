import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, type ParamObject } from '../guard/read';
import type { ScoreEventV1 } from './score';
import { ARTICULATIONS, type Articulation } from './terms';

/**
 * Artikülasyon notanın AÇIK verisidir; render onu sessizce yok sayamaz.
 * Kümeler çelişkiyi yapıyla engeller: "staccato + legato" iki uzunluk
 * kararıdır, "accent + staccato" bir dinamik ve bir uzunluk kararıdır.
 */
export const ARTICULATION_GROUPS = {
  sustain: 'length',
  staccato: 'length',
  legato: 'length',
  tie: 'length',
  'let-ring': 'length',
  accent: 'dynamic',
  ghost: 'dynamic',
  mute: 'technique',
  slide: 'technique',
} as const satisfies Record<Articulation, 'length' | 'dynamic' | 'technique'>;

/** Staccato çalınan süre notanın bu payıdır; çok kısa notada taban korunur. */
export const STACCATO_RATIO = 0.5;
export const STACCATO_MIN_SECONDS = 0.03;
/** Legato notası bir sonraki notanın başlangıcını bu kadar örter: boşluk duyulmaz. */
export const LEGATO_OVERLAP_SECONDS = 0.03;
export const ACCENT_VELOCITY_BOOST = 0.2;
export const GHOST_VELOCITY_SCALE = 0.45;
/** Mute: kısa sönüm ve kararmış tını. */
export const MUTE_LENGTH_RATIO = 0.35;
export const MUTE_BRIGHTNESS = 0.5;
/** Slide: önceki notanın perdesinden hedefe kayma süresi (notanın yarısını aşmaz). */
export const SLIDE_SECONDS = 0.08;

export const MAX_ARTICULATIONS = 3;

export function checkArticulations(value: unknown, path: string): Articulation[] {
  const list = checkArray(value, path);
  if (list.length === 0 || list.length > MAX_ARTICULATIONS) {
    throw new AudioParamError(path, 'range', `1–${MAX_ARTICULATIONS} artikülasyon`, list.length);
  }
  const seen = new Map<string, Articulation>();
  return list.map((raw, i) => {
    const articulation = checkChoice(raw, `${path}[${i}]`, ARTICULATIONS);
    const group = ARTICULATION_GROUPS[articulation];
    const other = seen.get(group);
    if (other !== undefined) {
      throw new AudioParamError(
        `${path}[${i}]`,
        'combination',
        `${other} ile aynı kümede (${group}); nota her kümeden en çok birini taşır`,
        articulation,
      );
    }
    seen.set(group, articulation);
    return articulation;
  });
}

/** Notanın `velocity` ve `articulations` alanları; yazılmayan alan sonuca girmez. */
export function checkExpression(
  o: ParamObject,
  path: string,
): { velocity?: number; articulations?: Articulation[] } {
  return {
    ...(o.velocity === undefined
      ? {}
      : { velocity: checkNumber(o.velocity, `${path}.velocity`, { min: 0, max: 1 }) }),
    ...(o.articulations === undefined
      ? {}
      : { articulations: checkArticulations(o.articulations, `${path}.articulations`) }),
  };
}

/** Enstrümanın destek listesi: tekrarsız, küme kısıtı yok (bir enstrüman hem staccato hem legato çalar). */
export function checkSupportedArticulations(value: unknown, path: string): Articulation[] {
  const list = checkArray(value, path);
  if (list.length === 0) throw new AudioParamError(path, 'range', 'en az bir artikülasyon', 0);
  const seen = new Set<Articulation>();
  return list.map((raw, i) => {
    const articulation = checkChoice(raw, `${path}[${i}]`, ARTICULATIONS);
    if (seen.has(articulation)) {
      throw new AudioParamError(`${path}[${i}]`, 'combination', 'tekrar etti', articulation);
    }
    seen.add(articulation);
    return articulation;
  });
}

/** Şerit varsayılanı ile notanın kendi listesini birleştirir: nota aynı kümede şeridi ezer. */
export function mergeArticulations(
  lane: Articulation | undefined,
  note: readonly Articulation[] | undefined,
): Articulation[] {
  const own = note ?? [];
  if (!lane || own.some((a) => ARTICULATION_GROUPS[a] === ARTICULATION_GROUPS[lane])) {
    return [...own];
  }
  return [lane, ...own];
}

export function assertSupported(
  supported: readonly Articulation[],
  requested: readonly Articulation[],
  instrument: string,
  path: string,
): void {
  for (const articulation of requested) {
    if (!supported.includes(articulation)) {
      throw new AudioParamError(
        path,
        'unsupported',
        `${instrument} yalnız ${supported.join(', ') || '—'} taşır`,
        articulation,
      );
    }
  }
}

const ADJACENT = 1e-6;

function laneOrder<T extends { readonly lane: string; readonly gridBeat: number }>(
  events: readonly T[],
): Map<string, T[]> {
  const lanes = new Map<string, T[]>();
  for (const event of events) {
    const list = lanes.get(event.lane) ?? [];
    list.push(event);
    lanes.set(event.lane, list);
  }
  for (const list of lanes.values()) list.sort((a, b) => a.gridBeat - b.gridBeat);
  return lanes;
}

/**
 * `tie` notayı, şeritte TAM bitiminde başlayan aynı perdeli notayla tek
 * notaya birleştirir (bağ yeniden vurulmaz). Bağlanacak nota yoksa bu bir
 * yazım hatasıdır; sessizce yok sayılmaz. `slide` bir önceki notadan kayar;
 * şeridin ilk notası kayamaz.
 */
export function applyTies(events: readonly ScoreEventV1[]): ScoreEventV1[] {
  const removed = new Set<string>();
  const merged = new Map<string, ScoreEventV1>();
  for (const list of laneOrder(events).values()) {
    for (let i = 0; i < list.length; i++) {
      const event = list[i];
      if (removed.has(event.id)) continue;
      if (event.articulations?.includes('slide') && i === 0) {
        throw new AudioParamError(
          `score.${event.id}.articulations`,
          'combination',
          'slide önceki bir nota ister; şeridin ilk notası kayamaz',
          'slide',
        );
      }
      let current = event;
      while (current.articulations?.includes('tie')) {
        const end = current.gridBeat + current.beats;
        const next = list.find(
          (other) =>
            !removed.has(other.id) &&
            other.id !== current.id &&
            other.midi === current.midi &&
            Math.abs(other.gridBeat - end) < ADJACENT,
        );
        if (!next) {
          throw new AudioParamError(
            `score.${current.id}.articulations`,
            'combination',
            'tie bitişinde başlayan aynı perdeli nota yok',
            current.note,
          );
        }
        removed.add(next.id);
        const rest = (next.articulations ?? []).filter((a) => ARTICULATION_GROUPS[a] === 'length');
        const kept = (current.articulations ?? []).filter((a) => a !== 'tie');
        const articulations = [...kept, ...rest];
        const { articulations: _drop, ...base } = current;
        current = {
          ...base,
          beats: current.beats + next.beats,
          ...(articulations.length ? { articulations } : {}),
        };
      }
      if (current !== event) merged.set(event.id, current);
    }
  }
  return events.filter((e) => !removed.has(e.id)).map((e) => merged.get(e.id) ?? e);
}
