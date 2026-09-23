import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { expandArchetype, type ArchetypeRequestV1 } from './archetype';
import { PROGRAM_REGISTRY } from './catalog';
import type { ParamSpec, ParamUnit } from './params';
import type { ArchetypeEntry, ControlEntry } from './registry';
import { resolveProgram, type AcousticProgramV1 } from './schema';

/**
 * Arama ve aile için ORTAK boyut sözlüğü. Bir boyut programın ANLAMSAL bir
 * ayarını adresler; keyfi JSON yolu, yama dili ya da ifade dili yoktur. Üç
 * hedef vardır ve her biri aralığını registry'deki parametre tanımından alır:
 *
 * - `archetype-param`: archetype makrosu (genişletmeden ÖNCE istek parametresi).
 * - `control`: program makrosu (`control.*` değeri, 0.5 nötr).
 * - `node-param`: adlı katmandaki bir düğümün registry parametresi; düğümün
 *   `primitive` kimliği adreste yazılır ve eşleşmezse boyut reddedilir.
 *
 * Uygulama sırası sabittir: archetype genişletmesi → makrolar → düğüm
 * parametreleri. Gesture'a bağlı bir değer boyut olamaz (eğriyi siler).
 */
export type ProgramBaseV1 =
  | { readonly kind: 'archetype'; readonly request: ArchetypeRequestV1 }
  | { readonly kind: 'program'; readonly program: AcousticProgramV1 };

export type NodeSlot = 'source' | 'articulation' | 'resonator' | 'effect';

export type DimensionTarget =
  | { readonly kind: 'archetype-param'; readonly param: string }
  | { readonly kind: 'control'; readonly control: string }
  | {
      readonly kind: 'node-param';
      /** `effect` dışındaki yuvalarda zorunlu katman adı. */
      readonly layer?: string;
      readonly slot: NodeSlot;
      /** Yalnız `resonator` ve `effect` yuvalarında. */
      readonly index?: number;
      readonly primitive: string;
      readonly param: string;
    };

export type DimensionValue = number | string;

export interface DimensionRangeV1 {
  readonly min: number;
  readonly max: number;
  readonly scale: 'linear' | 'log';
  readonly unit: ParamUnit;
}

export interface DimensionV1 {
  readonly name: string;
  readonly target: DimensionTarget;
  readonly range?: DimensionRangeV1;
  readonly options?: readonly DimensionValue[];
}

export const MAX_DIMENSIONS = 8;
export const MAX_OPTIONS = 16;
const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const SLOTS: readonly NodeSlot[] = ['source', 'articulation', 'resonator', 'effect'];

type Doc = Record<string, unknown>;

export function checkBase(value: unknown, path: string): ProgramBaseV1 {
  const o = checkObject(value, path, ['kind', 'request', 'program']);
  const kind = checkChoice(o.kind, `${path}.kind`, ['archetype', 'program'] as const);
  if (kind === 'archetype') {
    checkObject(value, path, ['kind', 'request']);
    expandArchetype(o.request);
    return { kind, request: o.request as ArchetypeRequestV1 };
  }
  checkObject(value, path, ['kind', 'program']);
  resolveProgram(o.program);
  return { kind, program: o.program as AcousticProgramV1 };
}

export function baseArchetype(base: ProgramBaseV1): ArchetypeEntry | null {
  if (base.kind !== 'archetype') return null;
  return PROGRAM_REGISTRY.resolve(
    base.request.archetype,
    base.request.version,
    ['archetype'],
    'base',
  );
}

function checkTarget(value: unknown, path: string): DimensionTarget {
  const head = checkObject(value, path, [
    'kind',
    'param',
    'control',
    'layer',
    'slot',
    'index',
    'primitive',
  ]);
  const kind = checkChoice(head.kind, `${path}.kind`, [
    'archetype-param',
    'control',
    'node-param',
  ] as const);
  const text = (v: unknown, at: string) => {
    if (typeof v !== 'string' || v.length === 0 || v.length > 64) {
      throw new AudioParamError(at, 'type', 'boş olmayan kimlik metni', v);
    }
    return v;
  };
  if (kind === 'archetype-param') {
    const o = checkObject(value, path, ['kind', 'param']);
    return { kind, param: text(o.param, `${path}.param`) };
  }
  if (kind === 'control') {
    const o = checkObject(value, path, ['kind', 'control']);
    return { kind, control: text(o.control, `${path}.control`) };
  }
  const o = checkObject(value, path, ['kind', 'layer', 'slot', 'index', 'primitive', 'param']);
  const slot = checkChoice(o.slot, `${path}.slot`, SLOTS);
  const indexed = slot === 'resonator' || slot === 'effect';
  if (indexed !== (o.index !== undefined)) {
    throw new AudioParamError(
      `${path}.index`,
      'combination',
      'yalnız resonator/effect yuvasında ve orada zorunlu',
      o.index,
    );
  }
  if ((slot === 'effect') !== (o.layer === undefined)) {
    throw new AudioParamError(
      `${path}.layer`,
      'combination',
      'effect dışında zorunlu, effect’te yasak',
      o.layer,
    );
  }
  return {
    kind,
    slot,
    primitive: text(o.primitive, `${path}.primitive`),
    param: text(o.param, `${path}.param`),
    ...(o.layer === undefined ? {} : { layer: text(o.layer, `${path}.layer`) }),
    ...(indexed
      ? { index: checkNumber(o.index, `${path}.index`, { min: 0, max: 31, integer: true }) }
      : {}),
  };
}

/** Hedefin adreslediği düğüm nesnesi; bulunamazsa açıklama. */
function locateNode(
  program: Doc,
  target: Extract<DimensionTarget, { kind: 'node-param' }>,
): Doc | string {
  let node: unknown;
  if (target.slot === 'effect') {
    node = (program.effects as unknown[] | undefined)?.[target.index ?? 0];
  } else {
    const layer = (program.layers as Doc[]).find((l) => l.name === target.layer);
    if (!layer) return `katman "${target.layer}" yok`;
    node =
      target.slot === 'resonator'
        ? (layer.resonators as unknown[] | undefined)?.[target.index ?? 0]
        : layer[target.slot];
  }
  if (typeof node !== 'object' || node === null)
    return `${target.slot}${target.index === undefined ? '' : `[${target.index}]`} yok`;
  const found = (node as Doc).primitive;
  if (found !== target.primitive) return `düğüm ${String(found)}, adres ${target.primitive} diyor`;
  return node as Doc;
}

/** Boyutun bağlandığı registry parametre tanımı (base'e göre). */
type SearchableSpec = Exclude<ParamSpec, { type: 'sample' }>;

function specOf(
  target: DimensionTarget,
  base: ProgramBaseV1,
  probe: Doc,
  path: string,
): SearchableSpec {
  if (target.kind === 'archetype-param') {
    const entry = baseArchetype(base);
    if (!entry)
      throw new AudioParamError(
        `${path}.target`,
        'combination',
        'archetype-param yalnız archetype tabanında',
        target.param,
      );
    const spec = entry.params[target.param];
    if (!spec || spec.type === 'sample')
      throw new AudioParamError(
        `${path}.target.param`,
        'unknown-id',
        `${entry.id} parametresi değil`,
        target.param,
      );
    return spec;
  }
  if (target.kind === 'control') {
    const entry = controlEntry(target.control, `${path}.target.control`);
    const archetype = baseArchetype(base);
    if (archetype?.macros.includes(entry.id)) {
      throw new AudioParamError(
        `${path}.target.control`,
        'combination',
        `${entry.id} ${archetype.id} makrosudur; archetype-param ile aranır`,
        entry.id,
      );
    }
    const existing = (probe.controls as Doc[] | undefined)?.find((c) => c.control === entry.id);
    if (existing && typeof existing.value === 'object') {
      throw new AudioParamError(
        `${path}.target`,
        'combination',
        'gesture’a bağlı makro aranamaz',
        entry.id,
      );
    }
    return entry.params.value as SearchableSpec;
  }
  const node = locateNode(probe, target);
  if (typeof node === 'string')
    throw new AudioParamError(`${path}.target`, 'combination', node, target.primitive);
  const entry = PROGRAM_REGISTRY.resolve(
    node.primitive,
    node.version,
    ['source', 'exciter', 'resonator', 'articulation', 'effect'],
    `${path}.target.primitive`,
  );
  const spec = entry.params[target.param];
  if (!spec)
    throw new AudioParamError(
      `${path}.target.param`,
      'unknown-id',
      `${entry.id} parametresi değil`,
      target.param,
    );
  if (spec.type === 'sample') {
    const detail = 'sample başvurusu aranamaz (içerik özetiyle sabittir)';
    throw new AudioParamError(`${path}.target.param`, 'combination', detail, target.param);
  }
  const current = (node.params as Doc | undefined)?.[target.param];
  if (typeof current === 'object' && current !== null) {
    throw new AudioParamError(
      `${path}.target`,
      'combination',
      'gesture/modülasyona bağlı parametre aranamaz',
      target.param,
    );
  }
  return spec;
}

function controlEntry(id: string, path: string): ControlEntry {
  const entry = PROGRAM_REGISTRY.entries().find((e) => e.id === id);
  if (entry?.kind !== 'control')
    throw new AudioParamError(path, 'unknown-id', 'registry makrosu değil', id);
  return entry;
}

function checkOption(value: unknown, spec: SearchableSpec, path: string): DimensionValue {
  if (spec.type === 'choice') return checkChoice(value, path, spec.choices);
  return checkNumber(value, path, { min: spec.min, max: spec.max, integer: spec.integer });
}

function targetKey(target: DimensionTarget): string {
  if (target.kind === 'archetype-param') return `archetype:${target.param}`;
  if (target.kind === 'control') return `control:${target.control}`;
  return `node:${target.layer ?? ''}/${target.slot}/${target.index ?? 0}/${target.param}`;
}

/**
 * Boyut listesini doğrular ve AD sırasına dizer — dizi sırası anlam taşımaz.
 * Aralık registry sınırları içinde, birim registry birimiyle aynı olmalı;
 * seçenekler registry'nin kabul ettiği değerler olmalı.
 */
export function checkDimensions(value: unknown, path: string, base: ProgramBaseV1): DimensionV1[] {
  const raw = checkArray(value, path);
  if (raw.length < 1 || raw.length > MAX_DIMENSIONS) {
    throw new AudioParamError(path, 'range', `1…${MAX_DIMENSIONS} boyut`, raw.length);
  }
  const probe = materializeBase(base, {});
  const names = new Set<string>();
  const targets = new Set<string>();
  const dims = raw.map((item, i): DimensionV1 => {
    const at = `${path}[${i}]`;
    const o = checkObject(item, at, ['name', 'target', 'range', 'options']);
    if (typeof o.name !== 'string' || !NAME.test(o.name)) {
      throw new AudioParamError(`${at}.name`, 'type', `${NAME.source} kalıbına uymalı`, o.name);
    }
    if (names.has(o.name))
      throw new AudioParamError(`${at}.name`, 'combination', 'boyut adı tekil olmalı', o.name);
    names.add(o.name);
    const target = checkTarget(o.target, `${at}.target`);
    if (targets.has(targetKey(target)))
      throw new AudioParamError(`${at}.target`, 'combination', 'aynı hedef iki kez', o.name);
    targets.add(targetKey(target));
    const spec = specOf(target, base, probe, at);
    if ((o.range === undefined) === (o.options === undefined)) {
      throw new AudioParamError(at, 'combination', 'range ya da options (yalnız biri)', o.name);
    }
    if (o.options !== undefined) {
      const options = checkArray(o.options, `${at}.options`);
      if (options.length < 2 || options.length > MAX_OPTIONS) {
        throw new AudioParamError(
          `${at}.options`,
          'range',
          `2…${MAX_OPTIONS} seçenek`,
          options.length,
        );
      }
      const values = options.map((v, k) => checkOption(v, spec, `${at}.options[${k}]`));
      if (new Set(values).size !== values.length)
        throw new AudioParamError(`${at}.options`, 'combination', 'yinelenen seçenek', o.name);
      return { name: o.name, target, options: values };
    }
    if (spec.type !== 'number')
      throw new AudioParamError(
        `${at}.range`,
        'combination',
        'seçenekli parametre yalnız options ile aranır',
        o.name,
      );
    return { name: o.name, target, range: checkRange(o.range, `${at}.range`, spec) };
  });
  dims.forEach((dim, i) => {
    if (dim.target.kind !== 'control') return;
    try {
      materialize(base, [dim], { [dim.name]: valueAt(dim, 0.5) });
    } catch (error) {
      if (!(error instanceof AudioParamError)) throw error;
      throw new AudioParamError(
        `${path}[${i}].target`,
        'combination',
        `tabana uygulanamıyor: ${error.message}`,
        dim.name,
      );
    }
  });
  return dims.sort((a, b) => (a.name < b.name ? -1 : 1));
}

function checkRange(
  value: unknown,
  path: string,
  spec: Extract<ParamSpec, { type: 'number' }>,
): DimensionRangeV1 {
  const o: ParamObject = checkObject(value, path, ['min', 'max', 'scale', 'unit']);
  const min = checkNumber(o.min, `${path}.min`, { min: spec.min, max: spec.max });
  const max = checkNumber(o.max, `${path}.max`, { above: min, max: spec.max });
  const scale = checkChoice(o.scale, `${path}.scale`, ['linear', 'log'] as const);
  if (scale === 'log' && !(min > 0))
    throw new AudioParamError(`${path}.min`, 'range', 'log ölçekte min > 0', min);
  if (o.unit !== spec.unit) {
    throw new AudioParamError(
      `${path}.unit`,
      'combination',
      `registry birimi "${spec.unit}"`,
      o.unit,
    );
  }
  return { min, max, scale, unit: spec.unit };
}

/** Birim küp koordinatı u ∈ [0, 1) → boyut değeri (6 anlamlı basamak; tamsayı alanda yuvarlanır). */
export function valueAt(dim: DimensionV1, u: number, integer = false): DimensionValue {
  if (dim.options)
    return dim.options[Math.min(dim.options.length - 1, Math.floor(u * dim.options.length))];
  const r = dim.range as DimensionRangeV1;
  const raw = r.scale === 'log' ? r.min * Math.pow(r.max / r.min, u) : r.min + u * (r.max - r.min);
  const value = integer ? Math.round(raw) : Number(raw.toPrecision(6));
  return Math.min(r.max, Math.max(r.min, value));
}

export function isIntegerDimension(dim: DimensionV1, base: ProgramBaseV1): boolean {
  const probe = materializeBase(base, {});
  const spec = specOf(dim.target, base, probe, dim.name);
  return spec.type === 'number' && spec.integer === true;
}

function materializeBase(
  base: ProgramBaseV1,
  archetypeParams: Readonly<Record<string, number>>,
): Doc {
  if (base.kind === 'program') return structuredClone(base.program) as unknown as Doc;
  const request = base.request;
  return expandArchetype({
    ...request,
    params: { ...(request.params ?? {}), ...archetypeParams },
  }) as unknown as Doc;
}

/**
 * Boyut değerlerini tabana uygular ve DOĞRULANMIŞ program belgesini verir.
 * Hata `AudioParamError`dır (archetype kısıtı, registry aralığı, program
 * bütünlüğü); çağıran bunu render ÖNCESİ geçersiz aday olarak sınıflar.
 */
export function materialize(
  base: ProgramBaseV1,
  dims: readonly DimensionV1[],
  values: Readonly<Record<string, DimensionValue>>,
): AcousticProgramV1 {
  const archetypeParams: Record<string, number> = {};
  for (const dim of dims) {
    if (dim.target.kind === 'archetype-param')
      archetypeParams[dim.target.param] = values[dim.name] as number;
  }
  const program = materializeBase(base, archetypeParams);
  for (const dim of dims) {
    const value = values[dim.name];
    const target = dim.target;
    if (target.kind === 'control') {
      const version = controlEntry(target.control, dim.name).version;
      const controls = [...((program.controls as Doc[] | undefined) ?? [])];
      const at = controls.findIndex((c) => c.control === target.control);
      const entry = { control: target.control, version, value };
      if (at < 0) controls.push(entry);
      else controls[at] = entry;
      program.controls = controls;
    } else if (target.kind === 'node-param') {
      const node = locateNode(program, target);
      if (typeof node === 'string')
        throw new AudioParamError(dim.name, 'combination', node, target.primitive);
      node.params = { ...((node.params as Doc | undefined) ?? {}), [target.param]: value };
    }
  }
  resolveProgram(program);
  return program as unknown as AcousticProgramV1;
}

/** Tabanın kanonik kimliği için belge (archetype isteği ya da program). */
export function baseDocument(base: ProgramBaseV1): unknown {
  return base.kind === 'archetype'
    ? { kind: base.kind, request: base.request }
    : { kind: base.kind, program: base.program };
}
