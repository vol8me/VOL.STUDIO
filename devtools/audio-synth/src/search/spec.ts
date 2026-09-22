import { validateCheck, type MechanicalCheckV1 } from '../analysis/checks';
import { DEFAULT_BATCH_BUDGET, type BatchBudget } from '../guard/batch';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import {
  checkBase,
  checkDimensions,
  type DimensionV1,
  type DimensionValue,
  type ProgramBaseV1,
} from '../program/dimensions';
import { SEARCH_STRATEGIES, type SearchStrategyId } from './strategy';

export const SEARCH_SPEC_SCHEMA = 'AcousticSearchSpecV1';

/**
 * Sınırlı, tohumlu aday araması. Tanım yalnız VERİdir: taban (archetype
 * isteği ya da program), adlı boyutlar, bildirimsel dışlama kuralları,
 * mekanik filtreler ve toplu bütçe. Boyut dizisinin sırası anlam taşımaz —
 * normalize biçimde ada göre dizilir ve spec özeti bu biçimden alınır.
 */
export interface ExcludeConditionV1 {
  readonly dimension: string;
  readonly min?: number;
  readonly max?: number;
  readonly equals?: DimensionValue;
}

/** Koşulların HEPSİ tutan aday render'dan önce geçersiz sayılır (ifade dili değil, bağlaç). */
export interface ExcludeRuleV1 {
  readonly kind: 'exclude';
  readonly when: readonly ExcludeConditionV1[];
  readonly reason: string;
}

export interface AcousticSearchSpecV1 {
  readonly schema: typeof SEARCH_SPEC_SCHEMA;
  readonly searchId: string;
  readonly description?: string;
  readonly base: ProgramBaseV1;
  readonly seed: number;
  readonly strategy: { readonly id: SearchStrategyId; readonly version: number };
  readonly candidates: number;
  readonly dimensions: readonly DimensionV1[];
  readonly constraints?: readonly ExcludeRuleV1[];
  readonly filters?: readonly MechanicalCheckV1[];
  readonly budget?: Partial<BatchBudget>;
}

export const SEARCH_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_CANDIDATES = 256;
const MAX_FILTERS = 32;
const MAX_CONSTRAINTS = 16;

function checkStrategy(value: unknown): AcousticSearchSpecV1['strategy'] {
  const o = checkObject(value, 'strategy', ['id', 'version']);
  const id = checkChoice(o.id, 'strategy.id', Object.keys(SEARCH_STRATEGIES) as SearchStrategyId[]);
  if (o.version !== SEARCH_STRATEGIES[id].version) {
    throw new AudioParamError(
      'strategy.version',
      'version',
      `${id} sürümü ${SEARCH_STRATEGIES[id].version}`,
      o.version,
    );
  }
  return { id, version: SEARCH_STRATEGIES[id].version };
}

function checkBudget(value: unknown): Partial<BatchBudget> {
  const keys = Object.keys(DEFAULT_BATCH_BUDGET) as (keyof BatchBudget)[];
  const o = checkObject(value, 'budget', keys);
  const out: Partial<Record<keyof BatchBudget, number>> = {};
  for (const key of keys) {
    if (o[key] === undefined) continue;
    const integer = key === 'maxItems';
    out[key] = checkNumber(
      o[key],
      `budget.${key}`,
      integer ? { min: 1, max: MAX_CANDIDATES, integer } : { above: 0 },
    );
  }
  return out;
}

function checkConstraints(value: unknown, dims: readonly DimensionV1[]): ExcludeRuleV1[] {
  const rules = checkArray(value, 'constraints');
  if (rules.length > MAX_CONSTRAINTS)
    throw new AudioParamError('constraints', 'range', `en çok ${MAX_CONSTRAINTS}`, rules.length);
  return rules.map((rule, i) => {
    const at = `constraints[${i}]`;
    const o = checkObject(rule, at, ['kind', 'when', 'reason']);
    checkChoice(o.kind, `${at}.kind`, ['exclude'] as const);
    if (typeof o.reason !== 'string' || o.reason.length === 0 || o.reason.length > 200) {
      throw new AudioParamError(`${at}.reason`, 'type', 'en çok 200 karakterlik gerekçe', o.reason);
    }
    const when = checkArray(o.when, `${at}.when`);
    if (when.length < 1) throw new AudioParamError(`${at}.when`, 'range', 'en az bir koşul', 0);
    return {
      kind: 'exclude' as const,
      reason: o.reason,
      when: when.map((c, k) => {
        const cat = `${at}.when[${k}]`;
        const co = checkObject(c, cat, ['dimension', 'min', 'max', 'equals']);
        const dim = dims.find((d) => d.name === co.dimension);
        if (!dim)
          throw new AudioParamError(
            `${cat}.dimension`,
            'unknown-id',
            'tanımlı boyut değil',
            co.dimension,
          );
        if (dim.options) {
          if (
            co.min !== undefined ||
            co.max !== undefined ||
            !dim.options.includes(co.equals as DimensionValue)
          ) {
            throw new AudioParamError(
              cat,
              'combination',
              'seçenekli boyutta yalnız equals: <seçenek>',
              co.equals,
            );
          }
          return { dimension: dim.name, equals: co.equals as DimensionValue };
        }
        if (co.equals !== undefined || (co.min === undefined && co.max === undefined)) {
          throw new AudioParamError(
            cat,
            'combination',
            'aralıklı boyutta min ve/veya max',
            co.equals,
          );
        }
        return {
          dimension: dim.name,
          ...(co.min === undefined ? {} : { min: checkNumber(co.min, `${cat}.min`) }),
          ...(co.max === undefined ? {} : { max: checkNumber(co.max, `${cat}.max`) }),
        };
      }),
    };
  });
}

/** Spec'i doğrular ve NORMALİZE biçimini verir (boyutlar ada göre sıralı). */
export function validateSearchSpec(value: unknown): AcousticSearchSpecV1 {
  const o = checkObject(value, '', [
    'schema',
    'searchId',
    'description',
    'base',
    'seed',
    'strategy',
    'candidates',
    'dimensions',
    'constraints',
    'filters',
    'budget',
  ]);
  if (o.schema !== SEARCH_SPEC_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${SEARCH_SPEC_SCHEMA}" olmalı`, o.schema);
  }
  if (typeof o.searchId !== 'string' || !SEARCH_ID.test(o.searchId)) {
    throw new AudioParamError(
      'searchId',
      'type',
      `${SEARCH_ID.source} kalıbına uymalı`,
      o.searchId,
    );
  }
  if (
    o.description !== undefined &&
    (typeof o.description !== 'string' || o.description.length > 2000)
  ) {
    throw new AudioParamError('description', 'type', 'en çok 2000 karakter', o.description);
  }
  const base = checkBase(o.base, 'base');
  const strategy = checkStrategy(o.strategy);
  const dimensions = checkDimensions(o.dimensions, 'dimensions', base);
  if (dimensions.length > SEARCH_STRATEGIES[strategy.id].maxDimensions) {
    throw new AudioParamError(
      'dimensions',
      'range',
      `${strategy.id} en çok ${SEARCH_STRATEGIES[strategy.id].maxDimensions} boyut`,
      dimensions.length,
    );
  }
  const filters = o.filters === undefined ? undefined : checkArray(o.filters, 'filters');
  if (filters && filters.length > MAX_FILTERS)
    throw new AudioParamError('filters', 'range', `en çok ${MAX_FILTERS}`, filters.length);
  return {
    schema: SEARCH_SPEC_SCHEMA,
    searchId: o.searchId,
    ...(o.description === undefined ? {} : { description: o.description }),
    base,
    seed: checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true }),
    strategy,
    candidates: checkNumber(o.candidates, 'candidates', {
      min: 1,
      max: MAX_CANDIDATES,
      integer: true,
    }),
    dimensions,
    ...(o.constraints === undefined
      ? {}
      : { constraints: checkConstraints(o.constraints, dimensions) }),
    ...(filters ? { filters: filters.map((f, i) => validateCheck(f, `filters[${i}]`)) } : {}),
    ...(o.budget === undefined ? {} : { budget: checkBudget(o.budget) }),
  };
}

export function effectiveBudget(spec: AcousticSearchSpecV1): BatchBudget {
  return { ...DEFAULT_BATCH_BUDGET, ...(spec.budget ?? {}) };
}

/** Dışlama kuralının adaya uyup uymadığı; uyan ilk kural adayı geçersiz kılar. */
export function excludedBy(
  spec: AcousticSearchSpecV1,
  values: Readonly<Record<string, DimensionValue>>,
): number | null {
  const rules = spec.constraints ?? [];
  for (let i = 0; i < rules.length; i++) {
    const hit = rules[i].when.every((c) => {
      const v = values[c.dimension];
      if (c.equals !== undefined) return v === c.equals;
      return (
        typeof v === 'number' &&
        (c.min === undefined || v >= c.min) &&
        (c.max === undefined || v <= c.max)
      );
    });
    if (hit) return i;
  }
  return null;
}
