import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { substream } from '../program/random';
import { checkArticulations } from './articulation';
import { degreeToMidi } from './tonal';
import { parseNote } from './tuning';
import { MUSIC_KEY, checkPattern, checkText, type Articulation } from './terms';

/**
 * Tracker/step-pattern yüzeyi: arcade ve ritmik müzik için ızgara yazımı.
 * Desen adımlardan oluşur; satırlar (davul/tekrarlı vuruş) dizgiyle, melodik
 * adımlar listeyle yazılır. Bölüm içindeki parça desenleri ZİNCİRLER:
 * tekrar, varyasyon ve her N'inci örnekte dolgu (fill). Olasılık, olay
 * kimliğine bağlı bir alt akıştan çekilir — aynı program aynı vuruşları
 * verir ve bir adımın olasılığını değiştirmek diğer olayların kimliğini
 * kaydırmaz.
 *
 * Satır dizgisi: `x` vuruş, `X` vurgu (accent), `o` hayalet (ghost), `.`
 * sus, `_` önceki vuruşu bir adım uzatır. Boşluk ve `|` okunabilirlik
 * içindir, adım sayılmaz.
 */
export const PATTERN_HIT = { x: [], X: ['accent'], o: ['ghost'] } as const satisfies Record<
  string,
  readonly Articulation[]
>;

export const MAX_PATTERN_STEPS = 64;
export const MAX_PATTERNS = 32;
export const MAX_PATTERN_ROWS = 16;

interface PitchRef {
  readonly note?: string;
  readonly degree?: number;
}

export interface PatternRowV1 extends PitchRef {
  readonly steps: string;
  readonly velocity?: number;
  /** Satırdaki her vuruşun çalma olasılığı (0–1). */
  readonly probability?: number;
}

export interface PatternEventV1 extends PitchRef {
  readonly step: number;
  /** Adım cinsinden süre (varsayılan 1). */
  readonly length?: number;
  readonly velocity?: number;
  readonly articulations?: readonly Articulation[];
  readonly probability?: number;
}

export interface PatternVariationV1 {
  readonly id: string;
  /** Satır indeksine göre yeni adım dizgisi. */
  readonly rows: readonly { readonly row: number; readonly steps: string }[];
}

export interface PatternV1 {
  readonly id: string;
  readonly steps: number;
  /** Adımın vuruş cinsinden süresi (4/4'te onaltılık = 0.25). */
  readonly stepBeats: number;
  readonly rows?: readonly PatternRowV1[];
  readonly events?: readonly PatternEventV1[];
  readonly variations?: readonly PatternVariationV1[];
}

export interface PatternLinkV1 {
  readonly pattern: string;
  readonly variation?: string;
  readonly repeat?: number;
}

export interface PatternPartFieldsV1 {
  readonly chain: readonly PatternLinkV1[];
  /** Zincir bölüm sonuna kadar yeniden başlasın mı. */
  readonly loop?: boolean;
  /** Her `every`. desen örneğinin yerine dolgu deseni çalar. */
  readonly fill?: { readonly pattern: string; readonly every: number };
  /** Bölüm başına göre başlangıç ölçüsü. */
  readonly bar?: number;
}

function cells(steps: string): string {
  return steps.replace(/[\s|]/g, '');
}

function checkSteps(value: unknown, path: string, length: number): string {
  const text = checkText(value, path, 256);
  const compact = cells(text);
  if (compact.length !== length) {
    throw new AudioParamError(path, 'range', `${length} adım olmalı`, compact.length);
  }
  const bad = [...compact].find((c) => !'xXo._'.includes(c));
  if (bad) throw new AudioParamError(path, 'type', 'yalnız x X o . _ | ve boşluk', bad);
  if (compact[0] === '_') {
    throw new AudioParamError(path, 'combination', '`_` uzatacak bir vuruş ister', text);
  }
  return text;
}

function checkPitch(o: ParamObject, path: string): PitchRef {
  if ((o.note === undefined) === (o.degree === undefined)) {
    throw new AudioParamError(path, 'combination', 'note ya da degree (yalnız biri)', undefined);
  }
  if (o.note !== undefined) {
    const note = checkText(o.note, `${path}.note`, 16);
    parseNote(note, `${path}.note`);
    return { note };
  }
  return { degree: checkNumber(o.degree, `${path}.degree`, { min: -48, max: 48, integer: true }) };
}

const UNIT = { min: 0, max: 1 } as const;

function optional<T>(o: ParamObject, key: string, read: (v: unknown) => T): Record<string, T> {
  return o[key] === undefined ? {} : { [key]: read(o[key]) };
}

export function validatePattern(value: unknown, path: string): PatternV1 {
  const o = checkObject(value, path, ['id', 'steps', 'stepBeats', 'rows', 'events', 'variations']);
  const steps = checkNumber(o.steps, `${path}.steps`, {
    min: 1,
    max: MAX_PATTERN_STEPS,
    integer: true,
  });
  const rows = o.rows === undefined ? undefined : checkArray(o.rows, `${path}.rows`);
  const events = o.events === undefined ? undefined : checkArray(o.events, `${path}.events`);
  if (!rows?.length && !events?.length) {
    throw new AudioParamError(path, 'required', 'en az bir satır ya da adım olayı', undefined);
  }
  if ((rows?.length ?? 0) > MAX_PATTERN_ROWS) {
    throw new AudioParamError(
      `${path}.rows`,
      'range',
      `en çok ${MAX_PATTERN_ROWS} satır`,
      rows?.length,
    );
  }
  const pattern: PatternV1 = {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    steps,
    stepBeats: checkNumber(o.stepBeats, `${path}.stepBeats`, { above: 0, max: 4 }),
    ...(rows
      ? {
          rows: rows.map((raw, i): PatternRowV1 => {
            const at = `${path}.rows[${i}]`;
            const r = checkObject(raw, at, ['note', 'degree', 'steps', 'velocity', 'probability']);
            return {
              ...checkPitch(r, at),
              steps: checkSteps(r.steps, `${at}.steps`, steps),
              ...optional(r, 'velocity', (v) => checkNumber(v, `${at}.velocity`, UNIT)),
              ...optional(r, 'probability', (v) => checkNumber(v, `${at}.probability`, UNIT)),
            };
          }),
        }
      : {}),
    ...(events
      ? {
          events: events.map((raw, i): PatternEventV1 => {
            const at = `${path}.events[${i}]`;
            const e = checkObject(raw, at, [
              'step',
              'note',
              'degree',
              'length',
              'velocity',
              'articulations',
              'probability',
            ]);
            const step = checkNumber(e.step, `${at}.step`, {
              min: 0,
              max: steps - 1,
              integer: true,
            });
            return {
              step,
              ...checkPitch(e, at),
              ...optional(e, 'length', (v) =>
                checkNumber(v, `${at}.length`, { above: 0, max: steps - step }),
              ),
              ...optional(e, 'velocity', (v) => checkNumber(v, `${at}.velocity`, UNIT)),
              ...optional(e, 'articulations', (v) => checkArticulations(v, `${at}.articulations`)),
              ...optional(e, 'probability', (v) => checkNumber(v, `${at}.probability`, UNIT)),
            };
          }),
        }
      : {}),
  };
  if (o.variations !== undefined) {
    const seen = new Set<string>();
    const variations = checkArray(o.variations, `${path}.variations`).map((raw, i) => {
      const at = `${path}.variations[${i}]`;
      const v = checkObject(raw, at, ['id', 'rows']);
      const id = checkPattern(v.id, `${at}.id`, MUSIC_KEY);
      if (seen.has(id)) throw new AudioParamError(`${at}.id`, 'combination', 'tekrar etti', id);
      seen.add(id);
      return {
        id,
        rows: checkArray(v.rows, `${at}.rows`).map((rawRow, j) => {
          const r = checkObject(rawRow, `${at}.rows[${j}]`, ['row', 'steps']);
          const row = checkNumber(r.row, `${at}.rows[${j}].row`, {
            min: 0,
            max: (pattern.rows?.length ?? 0) - 1,
            integer: true,
          });
          return { row, steps: checkSteps(r.steps, `${at}.rows[${j}].steps`, steps) };
        }),
      };
    });
    return { ...pattern, variations };
  }
  return pattern;
}

export function validatePatternPart(
  o: ParamObject,
  path: string,
  patterns: readonly PatternV1[],
): PatternPartFieldsV1 {
  const find = (id: unknown, at: string): PatternV1 => {
    const key = checkPattern(id, at, MUSIC_KEY);
    const found = patterns.find((p) => p.id === key);
    if (!found) throw new AudioParamError(at, 'unknown-id', 'tanımlı bir desen olmalı', key);
    return found;
  };
  const chain = checkArray(o.chain, `${path}.chain`);
  if (chain.length === 0 || chain.length > 32) {
    throw new AudioParamError(`${path}.chain`, 'range', '1–32 halka', chain.length);
  }
  const links = chain.map((raw, i): PatternLinkV1 => {
    const at = `${path}.chain[${i}]`;
    const l = checkObject(raw, at, ['pattern', 'variation', 'repeat']);
    const pattern = find(l.pattern, `${at}.pattern`);
    if (l.variation !== undefined) {
      const variation = checkPattern(l.variation, `${at}.variation`, MUSIC_KEY);
      if (!pattern.variations?.some((v) => v.id === variation)) {
        throw new AudioParamError(
          `${at}.variation`,
          'unknown-id',
          `${pattern.id} desenin varyasyonu değil`,
          variation,
        );
      }
    }
    return {
      pattern: pattern.id,
      ...(l.variation === undefined ? {} : { variation: l.variation as string }),
      ...optional(l, 'repeat', (v) =>
        checkNumber(v, `${at}.repeat`, { min: 1, max: 64, integer: true }),
      ),
    };
  });
  let fill: PatternPartFieldsV1['fill'];
  if (o.fill !== undefined) {
    const f = checkObject(o.fill, `${path}.fill`, ['pattern', 'every']);
    const pattern = find(f.pattern, `${path}.fill.pattern`);
    const every = checkNumber(f.every, `${path}.fill.every`, { min: 2, max: 64, integer: true });
    const span = (p: PatternV1) => p.steps * p.stepBeats;
    const mismatched = links.find((l) => span(find(l.pattern, path)) !== span(pattern));
    if (mismatched) {
      throw new AudioParamError(
        `${path}.fill`,
        'combination',
        'dolgu, yerine çaldığı desenle aynı uzunlukta olmalı',
        mismatched.pattern,
      );
    }
    fill = { pattern: pattern.id, every };
  }
  if (o.loop !== undefined && typeof o.loop !== 'boolean') {
    throw new AudioParamError(`${path}.loop`, 'type', 'boolean', o.loop);
  }
  return {
    chain: links,
    ...(o.loop === undefined ? {} : { loop: o.loop }),
    ...(fill ? { fill } : {}),
    ...optional(o, 'bar', (v) =>
      checkNumber(v, `${path}.bar`, { min: 0, max: 512, integer: true }),
    ),
  };
}

/** Desen genişletmesinin ürettiği nota; score onu olaya çevirir. */
export interface PatternHitV1 {
  readonly written: number;
  readonly cents?: number;
  readonly gridBeat: number;
  readonly beats: number;
  readonly velocity?: number;
  readonly articulations?: readonly Articulation[];
  /** Olasılık çekilişinde düşen vuruş: olay yazılmaz ama kimlik sayacı ilerler. */
  readonly dropped: boolean;
  readonly provenance: {
    readonly kind: 'pattern';
    readonly pattern: string;
    readonly variation?: string;
    readonly instance: number;
    readonly row: number | null;
    readonly step: number;
  };
}

export interface PatternContext {
  readonly start: number;
  readonly end: number;
  readonly beatsPerBar: number;
  readonly rootMidi: number;
  readonly scale: readonly number[];
  readonly seed: number;
  /** Olasılık alt akışının kimliği: `music:<id>/pattern/<bölüm>/<şerit>`. */
  readonly stream: string;
}

function pitchOf(ref: PitchRef, context: PatternContext): { midi: number; cents?: number } {
  return ref.note !== undefined
    ? parseNote(ref.note, 'pattern.note')
    : { midi: degreeToMidi(context.rootMidi, context.scale, ref.degree as number) };
}

function rowHits(pattern: PatternV1, rows: readonly PatternRowV1[]) {
  return rows.flatMap((row, index) => {
    const compact = cells(row.steps);
    const hits: { row: number; step: number; length: number; symbol: keyof typeof PATTERN_HIT }[] =
      [];
    for (let step = 0; step < compact.length; step++) {
      const symbol = compact[step];
      if (symbol === '_') {
        const last = hits[hits.length - 1];
        if (last && last.step + last.length === step) last.length++;
      } else if (symbol !== '.') {
        hits.push({ row: index, step, length: 1, symbol: symbol as keyof typeof PATTERN_HIT });
      }
    }
    return hits.map((hit) => ({ ...hit, source: row, pattern }));
  });
}

function playing(probability: number | undefined, context: PatternContext, key: string): boolean {
  if (probability === undefined || probability >= 1) return true;
  return substream(context.seed, `${context.stream}/${key}`).next() < probability;
}

/** Zinciri bölümün ızgarasına yerleştirir; bölüm sonunu aşan örnek kesilmez, reddedilir. */
export function expandPatternPart(
  part: PatternPartFieldsV1,
  patterns: readonly PatternV1[],
  context: PatternContext,
  path: string,
): PatternHitV1[] {
  const byId = new Map(patterns.map((p) => [p.id, p]));
  const sequence = part.chain.flatMap((link) =>
    Array.from({ length: link.repeat ?? 1 }, () => link),
  );
  const hits: PatternHitV1[] = [];
  let cursor = context.start + (part.bar ?? 0) * context.beatsPerBar;
  let instance = 0;
  do {
    for (const link of sequence) {
      if (cursor >= context.end - 1e-9) {
        if (part.loop) break;
        throw new AudioParamError(
          path,
          'range',
          `zincir bölüm sonunu aşıyor (${instance + 1}. örnek)`,
          cursor,
        );
      }
      instance++;
      const filled = part.fill && instance % part.fill.every === 0;
      const id = filled && part.fill ? part.fill.pattern : link.pattern;
      const pattern = byId.get(id) as PatternV1;
      const span = pattern.steps * pattern.stepBeats;
      if (cursor + span > context.end + 1e-9) {
        throw new AudioParamError(
          path,
          'range',
          `desen örneği ${instance} bölüm sonunu aşıyor`,
          cursor + span,
        );
      }
      const variation = filled
        ? undefined
        : pattern.variations?.find((v) => v.id === link.variation);
      const rows = (pattern.rows ?? []).map((row, i) => {
        const override = variation?.rows.find((r) => r.row === i);
        return override ? { ...row, steps: override.steps } : row;
      });
      const provenance = (row: number | null, step: number) => ({
        kind: 'pattern' as const,
        pattern: pattern.id,
        ...(variation ? { variation: variation.id } : {}),
        instance,
        row,
        step,
      });
      for (const hit of rowHits(pattern, rows)) {
        const pitch = pitchOf(hit.source, context);
        hits.push({
          written: pitch.midi,
          ...(pitch.cents === undefined ? {} : { cents: pitch.cents }),
          gridBeat: cursor + hit.step * pattern.stepBeats,
          beats: hit.length * pattern.stepBeats,
          ...(hit.source.velocity === undefined ? {} : { velocity: hit.source.velocity }),
          ...(PATTERN_HIT[hit.symbol].length
            ? { articulations: [...PATTERN_HIT[hit.symbol]] }
            : {}),
          dropped: !playing(hit.source.probability, context, `${instance}/r${hit.row}/${hit.step}`),
          provenance: provenance(hit.row, hit.step),
        });
      }
      for (const [i, event] of (pattern.events ?? []).entries()) {
        const pitch = pitchOf(event, context);
        hits.push({
          written: pitch.midi,
          ...(pitch.cents === undefined ? {} : { cents: pitch.cents }),
          gridBeat: cursor + event.step * pattern.stepBeats,
          beats: (event.length ?? 1) * pattern.stepBeats,
          ...(event.velocity === undefined ? {} : { velocity: event.velocity }),
          ...(event.articulations ? { articulations: event.articulations } : {}),
          dropped: !playing(event.probability, context, `${instance}/e${i}`),
          provenance: provenance(null, event.step),
        });
      }
      cursor += span;
    }
  } while (part.loop && cursor < context.end - 1e-9);
  return hits.sort((a, b) => a.gridBeat - b.gridBeat || a.written - b.written);
}
