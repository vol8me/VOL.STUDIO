import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  joinPath,
  type NumberRule,
  type ParamObject,
} from '../guard/read';
import { PROGRAM_REGISTRY } from './catalog';
import type { GesturePoint } from './curves';
import type { NumberParamSpec } from './params';
import { applyLaw } from './primitives/controls';
import type { ControlEntry, CurveEntry, ModulatorEntry, ProgramEntry } from './registry';

/**
 * Parametre bağlama dilbilgisi — bir sayısal parametre dört biçimden birini alır:
 * `sayı`, `{ gesture }`, `{ value?, gesture?, modulate: [{ by, depth }] }`.
 * Gesture ve modülasyon yalnız `automatable` alanda; `depth` dB biriminde
 * EKLENEN dB, diğer birimlerde GÖRELİ orandır (p·(1 + depth·m)). Makrolar
 * (`controls`) hedef parametreyi ayrıca ölçekler; sonuç aralığa kırpılır.
 */
export const LIMITS = {
  gestures: 64,
  gesturePoints: 512,
  modulators: 16,
  modulationsPerParam: 4,
  relativeDepth: 0.95,
  decibelDepth: 24,
} as const;

export interface ResolvedGesture {
  readonly name: string;
  readonly curve: CurveEntry;
  readonly points: readonly GesturePoint[];
}

export interface ControlFactor {
  readonly control: string;
  readonly law: 'octaves' | 'linear';
  readonly span: number;
  readonly value: number | ResolvedGesture;
}

export interface Modulation {
  readonly by: string;
  readonly depth: number;
  readonly additive: boolean;
}

/** Zamanla değişen parametre — render tamponu uzunluğunda örneklenir. */
export interface ResolvedSignal {
  readonly kind: 'signal';
  readonly spec: NumberParamSpec;
  readonly base: number | ResolvedGesture;
  readonly controls: readonly ControlFactor[];
  readonly modulations: readonly Modulation[];
}

export type ResolvedValue = number | string | ResolvedSignal;

export interface ResolvedNode<E> {
  readonly entry: E;
  /** Alt akış etiketinin kökü: katman/modülatör ADIYLA kurulur, sırayla değil. */
  readonly streamPath: string;
  readonly params: Readonly<Record<string, ResolvedValue>>;
}

export interface ActiveControl {
  readonly entry: ControlEntry;
  readonly value: number | ResolvedGesture;
  readonly path: string;
}

export interface ResolveScope {
  readonly sampleRate: number;
  readonly gestures: ReadonlyMap<string, ResolvedGesture>;
  readonly modulators: ReadonlySet<string>;
  readonly controls: readonly ActiveControl[];
  readonly used: {
    readonly gestures: Set<string>;
    readonly modulators: Set<string>;
    readonly controls: Set<string>;
  };
}

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;

export function checkName(value: unknown, path: string): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new AudioParamError(path, 'type', `ad ${NAME.source} kalıbına uymalı`, value);
  }
  return value;
}

function checkRecord(value: unknown, path: string, limit: number): ParamObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AudioParamError(path, 'type', 'ad → nesne sözlüğü olmalı', value);
  }
  const record = value as ParamObject;
  if (Object.keys(record).length > limit) {
    throw new AudioParamError(path, 'range', `en çok ${limit} kayıt`, Object.keys(record).length);
  }
  return record;
}

const numberRule = (spec: NumberParamSpec): NumberRule => ({
  min: spec.min,
  max: spec.max,
  integer: spec.integer,
});

function checkValue(
  value: unknown,
  spec: NumberParamSpec,
  path: string,
  sampleRate: number,
): number {
  const number = checkNumber(value, path, numberRule(spec));
  if (spec.belowNyquist && !(number < sampleRate / 2)) {
    throw new AudioParamError(
      path,
      'range',
      `örnek oranının yarısından (${sampleRate / 2} Hz) küçük olmalı`,
      number,
    );
  }
  return number;
}

export function resolveGestures(
  value: unknown,
  durationLimit: number,
): Map<string, ResolvedGesture> {
  const out = new Map<string, ResolvedGesture>();
  if (value === undefined) return out;
  const record = checkRecord(value, 'gestures', LIMITS.gestures);
  for (const name of Object.keys(record).sort()) {
    const path = `gestures.${checkName(name, `gestures.${name}`)}`;
    const spec = checkObject(record[name], path, ['curve', 'version', 'points']);
    const curve = PROGRAM_REGISTRY.resolve(spec.curve, spec.version, ['curve'], `${path}.curve`);
    const rawPoints = checkArray(spec.points, `${path}.points`);
    if (rawPoints.length < 1 || rawPoints.length > LIMITS.gesturePoints) {
      throw new AudioParamError(
        `${path}.points`,
        'range',
        `1…${LIMITS.gesturePoints} nokta olmalı`,
        rawPoints.length,
      );
    }
    let previous = 0;
    const points = rawPoints.map((raw, i): GesturePoint => {
      const pointPath = `${path}.points[${i}]`;
      const pair = checkArray(raw, pointPath);
      if (pair.length !== 2)
        throw new AudioParamError(pointPath, 'type', '[saniye, değer] olmalı', raw);
      const t = checkNumber(pair[0], `${pointPath}[0]`, { min: previous, max: durationLimit });
      previous = t;
      return [t, checkNumber(pair[1], `${pointPath}[1]`)];
    });
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] === points[i - 1][0]) continue;
      const issue = curve.segmentIssue(points[i - 1][1], points[i][1]);
      if (issue)
        throw new AudioParamError(`${path}.points[${i}]`, 'combination', issue, points[i][1]);
    }
    out.set(name, { name, curve, points });
  }
  return out;
}

function gestureFor(
  name: unknown,
  path: string,
  spec: NumberParamSpec,
  scope: ResolveScope,
): ResolvedGesture {
  const key = checkName(name, path);
  const gesture = scope.gestures.get(key);
  if (!gesture) throw new AudioParamError(path, 'unknown-id', 'tanımsız gesture', key);
  gesture.points.forEach(([, v], i) =>
    checkValue(v, spec, `gestures.${key}.points[${i}][1]→${path}`, scope.sampleRate),
  );
  scope.used.gestures.add(key);
  return gesture;
}

function resolveModulations(
  value: unknown,
  spec: NumberParamSpec,
  path: string,
  scope: ResolveScope,
): Modulation[] {
  const items = checkArray(value, path);
  if (items.length > LIMITS.modulationsPerParam) {
    throw new AudioParamError(
      path,
      'range',
      `en çok ${LIMITS.modulationsPerParam} modülasyon`,
      items.length,
    );
  }
  const additive = spec.unit === 'dB';
  return items.map((item, i) => {
    const o = checkObject(item, `${path}[${i}]`, ['by', 'depth']);
    const by = checkName(o.by, `${path}[${i}].by`);
    if (!scope.modulators.has(by))
      throw new AudioParamError(`${path}[${i}].by`, 'unknown-id', 'tanımsız modülatör', by);
    scope.used.modulators.add(by);
    const depth = checkNumber(o.depth, `${path}[${i}].depth`, {
      min: 0,
      max: additive ? LIMITS.decibelDepth : LIMITS.relativeDepth,
    });
    return { by, depth, additive };
  });
}

function controlsFor(
  entry: ProgramEntry,
  key: string,
  spec: NumberParamSpec,
  path: string,
  scope: ResolveScope,
): ControlFactor[] {
  const factors: ControlFactor[] = [];
  for (const active of scope.controls) {
    for (const target of active.entry.targets) {
      if (target.primitive !== entry.id || target.param !== key) continue;
      if (typeof active.value !== 'number' && !spec.automatable) {
        throw new AudioParamError(
          active.path,
          'combination',
          `gesture ile sürülen makro ${path} hedefine uygulanamaz (otomasyon almaz)`,
          active.entry.id,
        );
      }
      scope.used.controls.add(active.entry.id);
      factors.push({
        control: active.entry.id,
        law: target.law,
        span: target.span,
        value: active.value,
      });
    }
  }
  return factors;
}

export function clampToSpec(value: number, spec: NumberParamSpec, sampleRate: number): number {
  const upper = spec.belowNyquist ? Math.min(spec.max, 0.49 * sampleRate) : spec.max;
  const clamped = Math.max(spec.min, Math.min(upper, value));
  return spec.integer ? Math.round(clamped) : clamped;
}

function resolveNumber(
  value: unknown,
  spec: NumberParamSpec,
  path: string,
  scope: ResolveScope,
  entry: ProgramEntry,
  key: string,
  allowModulation: boolean,
): number | ResolvedSignal {
  let base: number | ResolvedGesture;
  let modulations: Modulation[] = [];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const o = checkObject(
      value,
      path,
      allowModulation ? ['gesture', 'value', 'modulate'] : ['gesture'],
    );
    if (!spec.automatable)
      throw new AudioParamError(path, 'combination', 'bu parametre otomasyon almaz', value);
    const both = o.gesture !== undefined && o.value !== undefined;
    const empty = o.gesture === undefined && o.value === undefined && o.modulate === undefined;
    if (both || empty) {
      throw new AudioParamError(
        path,
        'combination',
        '`gesture` ile `value` birlikte verilmez; biri ya da `modulate` gerekir',
        value,
      );
    }
    base =
      o.gesture !== undefined
        ? gestureFor(o.gesture, joinPath(path, 'gesture'), spec, scope)
        : checkValue(o.value ?? spec.default, spec, joinPath(path, 'value'), scope.sampleRate);
    if (o.modulate !== undefined)
      modulations = resolveModulations(o.modulate, spec, joinPath(path, 'modulate'), scope);
  } else {
    base = checkValue(value, spec, path, scope.sampleRate);
  }
  const controls = controlsFor(entry, key, spec, path, scope);
  if (
    typeof base === 'number' &&
    modulations.length === 0 &&
    controls.every((c) => typeof c.value === 'number')
  ) {
    let folded = base;
    for (const c of controls) folded = applyLaw(c.law, c.span, folded, c.value as number);
    return clampToSpec(folded, spec, scope.sampleRate);
  }
  return { kind: 'signal', spec, base, controls, modulations };
}

export function resolveParams(
  entry: ProgramEntry,
  raw: unknown,
  path: string,
  scope: ResolveScope,
  allowModulation = true,
): Record<string, ResolvedValue> {
  const values: ParamObject =
    raw === undefined ? {} : checkObject(raw, path, Object.keys(entry.params));
  const params: Record<string, ResolvedValue> = {};
  for (const [key, spec] of Object.entries(entry.params)) {
    const value = values[key];
    const at = joinPath(path, key);
    params[key] =
      spec.type === 'choice'
        ? value === undefined
          ? spec.default
          : checkChoice(value, at, spec.choices)
        : resolveNumber(
            value === undefined ? spec.default : value,
            spec,
            at,
            scope,
            entry,
            key,
            allowModulation,
          );
  }
  return params;
}

/** Modülatörler: parametreleri sayı ya da gesture olabilir; modülatör modüle edilemez. */
export function resolveModulators(
  value: unknown,
  scope: ResolveScope,
): ResolvedNode<ModulatorEntry>[] {
  if (value === undefined) return [];
  const record = checkRecord(value, 'modulators', LIMITS.modulators);
  return Object.keys(record)
    .sort()
    .map((name) => {
      const path = `modulators.${checkName(name, `modulators.${name}`)}`;
      const node = checkObject(record[name], path, ['modulator', 'version', 'params']);
      const entry = PROGRAM_REGISTRY.resolve(
        node.modulator,
        node.version,
        ['modulator'],
        `${path}.modulator`,
      );
      return {
        entry,
        streamPath: `modulator:${name}`,
        params: resolveParams(
          entry,
          node.params,
          `${path}.params`,
          { ...scope, controls: [] },
          false,
        ),
      };
    });
}

export function modulatorNames(value: unknown): Set<string> {
  return value === undefined
    ? new Set()
    : new Set(Object.keys(checkRecord(value, 'modulators', LIMITS.modulators)));
}

export function resolveControls(
  value: unknown,
  scope: Omit<ResolveScope, 'controls'>,
): ActiveControl[] {
  if (value === undefined) return [];
  const items = checkArray(value, 'controls');
  const seen = new Set<string>();
  return items.map((item, i) => {
    const path = `controls[${i}]`;
    const o = checkObject(item, path, ['control', 'version', 'value']);
    const entry = PROGRAM_REGISTRY.resolve(o.control, o.version, ['control'], `${path}.control`);
    if (seen.has(entry.id))
      throw new AudioParamError(
        `${path}.control`,
        'combination',
        'makro bir kez verilir',
        entry.id,
      );
    seen.add(entry.id);
    const spec = entry.params.value as NumberParamSpec;
    const raw = o.value === undefined ? spec.default : o.value;
    const resolved =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? gestureFor(
            checkObject(raw, `${path}.value`, ['gesture']).gesture,
            `${path}.value.gesture`,
            spec,
            { ...scope, controls: [] },
          )
        : checkValue(raw, spec, `${path}.value`, scope.sampleRate);
    return { entry, value: resolved, path };
  });
}
