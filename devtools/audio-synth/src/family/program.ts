import { validateFamilyQualityPolicy, type FamilyQualityPolicyV1 } from '../analysis/family';
import { DEFAULT_BATCH_BUDGET, type BatchBudget } from '../guard/batch';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import {
  checkBase,
  checkDimensions,
  isIntegerDimension,
  materialize,
  valueAt,
  type DimensionRangeV1,
  type DimensionV1,
  type DimensionValue,
  type ProgramBaseV1,
} from '../program/dimensions';
import { substream } from '../program/random';
import { resolveProgram, type AcousticProgramV1 } from '../program/schema';
import { hashCanonical, type Sha256 } from '../protocol/canonical';

export const SOUND_FAMILY_SCHEMA = 'SoundFamilyProgramV1';
export const FAMILY_VARIATION_POLICY = 'role-subrange-v1';

/**
 * Ses AİLESİ: bir preset'in rastgele kopyaları değil, ortak akustik kimlikten
 * (archetype isteği ya da program) türeyen, adlı ve açıklanabilir varyantlar.
 * Varyant değerleri boyut sözlüğündeki anlamsal ayarlardır; rol ekseni o
 * ayarın alt aralığını seçer, değer o alt aralıkta varyantın ADLI alt
 * akışından çekilir: `family:<familyId>/variant:<variantKey>/<boyut>`.
 * Dizi sırası rastgeleliği belirlemez; yeni bir varyant, rol ya da yalnız
 * rolle kapsanan yeni bir boyut eski varyantların programını değiştirmez.
 *
 * Roller GENEL bir sözlükten gelir; oyun alanı kavramı (düşman türü,
 * organizma, silah durumu, boss evresi, oyuncu sınıfı) şemada YOKTUR.
 */
export const ROLE_AXES = {
  intensity: ['soft', 'medium', 'hard'],
  weight: ['light', 'medium', 'heavy'],
  length: ['short', 'long'],
  speed: ['slow', 'medium', 'fast'],
  wetness: ['dry', 'wet'],
  rarity: ['common', 'alternate', 'rare'],
  onset: ['soft', 'sharp'],
} as const;
export type RoleAxis = keyof typeof ROLE_AXES;

export type FamilyDimensionV1 = DimensionV1 & {
  /** `all`: her varyanta uygulanır; `role`: yalnız bir rolü onu kısıtlayan varyanta. */
  readonly scope: 'all' | 'role';
};

export type RoleConstraintV1 =
  | { readonly min: number; readonly max: number }
  | { readonly options: readonly DimensionValue[] };

export interface FamilyVariantV1 {
  readonly key: string;
  readonly roles: Readonly<Partial<Record<RoleAxis, string>>>;
  readonly tags: readonly string[];
}

export interface FamilyDeliveryV1 {
  readonly package: string;
  /** Paket-göreli dizin; varyant asset'i `<assetDir>/<key>.ogg`. */
  readonly assetDir: string;
  readonly subtype: 'sfx' | 'organic' | 'ambience';
  readonly assetClass: 'ui' | 'sfx' | 'ambience';
  readonly durationSeconds: { readonly min: number; readonly max: number };
}

export interface SoundFamilyProgramV1 {
  readonly schema: typeof SOUND_FAMILY_SCHEMA;
  readonly familyId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly base: ProgramBaseV1;
  readonly seed: number;
  readonly variation: { readonly policy: typeof FAMILY_VARIATION_POLICY };
  readonly dimensions: readonly FamilyDimensionV1[];
  readonly roles: Readonly<
    Partial<Record<RoleAxis, Readonly<Record<string, Readonly<Record<string, RoleConstraintV1>>>>>>
  >;
  readonly variants: readonly FamilyVariantV1[];
  readonly quality?: FamilyQualityPolicyV1;
  readonly budget?: Partial<BatchBudget>;
  readonly delivery: FamilyDeliveryV1;
  /** Aile bir arama adayından türediyse onun kimliği (bilgi; program tabanı bağlayıcıdır). */
  readonly provenance?: {
    readonly searchId: string;
    readonly candidateId: string;
    readonly reportHash: Sha256;
  };
}

/** Brief kimliği `<familyId>-<key>` 64 karakteri aşmasın diye: 40 + 1 + 23. */
export const FAMILY_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KEY = /^[a-z0-9][a-z0-9-]{0,22}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 64;

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakter`, value);
  }
  return value;
}

function checkRoleConstraint(
  value: unknown,
  path: string,
  dim: FamilyDimensionV1,
): RoleConstraintV1 {
  const o: ParamObject = checkObject(value, path, ['min', 'max', 'options']);
  if (dim.options) {
    checkObject(value, path, ['options']);
    const options = checkArray(o.options, `${path}.options`);
    if (options.length < 1)
      throw new AudioParamError(`${path}.options`, 'range', 'en az bir seçenek', 0);
    for (const [i, v] of options.entries()) {
      if (!dim.options.includes(v as DimensionValue)) {
        throw new AudioParamError(
          `${path}.options[${i}]`,
          'combination',
          `boyut seçeneği değil (${dim.name})`,
          v,
        );
      }
    }
    return { options: options as DimensionValue[] };
  }
  checkObject(value, path, ['min', 'max']);
  const range = dim.range as DimensionRangeV1;
  const min = checkNumber(o.min, `${path}.min`, { min: range.min, max: range.max });
  return { min, max: checkNumber(o.max, `${path}.max`, { above: min, max: range.max }) };
}

function checkRoles(
  value: unknown,
  dims: readonly FamilyDimensionV1[],
): SoundFamilyProgramV1['roles'] {
  const raw = checkObject(value, 'roles', Object.keys(ROLE_AXES));
  const out: Record<string, Record<string, Record<string, RoleConstraintV1>>> = {};
  for (const axis of Object.keys(raw).sort() as RoleAxis[]) {
    const values = checkObject(raw[axis], `roles.${axis}`, ROLE_AXES[axis]);
    out[axis] = {};
    for (const role of Object.keys(values).sort()) {
      const at = `roles.${axis}.${role}`;
      const constraints = checkObject(
        values[role],
        at,
        dims.map((d) => d.name),
      );
      out[axis][role] = {};
      for (const name of Object.keys(constraints).sort()) {
        const dim = dims.find((d) => d.name === name) as FamilyDimensionV1;
        out[axis][role][name] = checkRoleConstraint(constraints[name], `${at}.${name}`, dim);
      }
    }
  }
  return out;
}

function checkVariants(value: unknown, roles: SoundFamilyProgramV1['roles']): FamilyVariantV1[] {
  const raw = checkArray(value, 'variants');
  if (raw.length < MIN_VARIANTS || raw.length > MAX_VARIANTS) {
    throw new AudioParamError(
      'variants',
      'range',
      `${MIN_VARIANTS}…${MAX_VARIANTS} varyant`,
      raw.length,
    );
  }
  const keys = new Set<string>();
  const variants = raw.map((item, i): FamilyVariantV1 => {
    const at = `variants[${i}]`;
    const o = checkObject(item, at, ['key', 'roles', 'tags']);
    if (typeof o.key !== 'string' || !KEY.test(o.key))
      throw new AudioParamError(`${at}.key`, 'type', KEY.source, o.key);
    if (keys.has(o.key))
      throw new AudioParamError(`${at}.key`, 'combination', 'varyant anahtarı tekil olmalı', o.key);
    keys.add(o.key);
    const assigned =
      o.roles === undefined ? {} : checkObject(o.roles, `${at}.roles`, Object.keys(roles));
    const variantRoles: Record<string, string> = {};
    for (const axis of Object.keys(assigned).sort() as RoleAxis[]) {
      variantRoles[axis] = checkChoice(
        assigned[axis],
        `${at}.roles.${axis}`,
        Object.keys(roles[axis] as object),
      );
    }
    const tags = o.tags === undefined ? [] : checkArray(o.tags, `${at}.tags`);
    for (const [k, tag] of tags.entries()) {
      if (typeof tag !== 'string' || !TAG.test(tag))
        throw new AudioParamError(`${at}.tags[${k}]`, 'type', TAG.source, tag);
    }
    return { key: o.key, roles: variantRoles, tags: [...(tags as string[])].sort() };
  });
  for (const axis of Object.keys(roles) as RoleAxis[]) {
    for (const role of Object.keys(roles[axis] as object)) {
      if (!variants.some((v) => v.roles[axis] === role)) {
        throw new AudioParamError(
          `roles.${axis}.${role}`,
          'combination',
          'rol kapsamı: bu rolü hiçbir varyant kullanmıyor',
          role,
        );
      }
    }
  }
  return variants.sort((a, b) => (a.key < b.key ? -1 : 1));
}

function checkDelivery(value: unknown): FamilyDeliveryV1 {
  const o = checkObject(value, 'delivery', [
    'package',
    'assetDir',
    'subtype',
    'assetClass',
    'durationSeconds',
  ]);
  const d = checkObject(o.durationSeconds, 'delivery.durationSeconds', ['min', 'max']);
  const min = checkNumber(d.min, 'delivery.durationSeconds.min', { above: 0, max: 600 });
  const assetDir = text(o.assetDir, 'delivery.assetDir', 200);
  if (
    assetDir.startsWith('/') ||
    assetDir.split('/').some((s) => s === '..' || s === '.' || s === '')
  ) {
    throw new AudioParamError(
      'delivery.assetDir',
      'type',
      'paket-göreli, `..` içermeyen yol',
      assetDir,
    );
  }
  return {
    package: text(o.package, 'delivery.package', 100),
    assetDir,
    subtype: checkChoice(o.subtype, 'delivery.subtype', ['sfx', 'organic', 'ambience'] as const),
    assetClass: checkChoice(o.assetClass, 'delivery.assetClass', [
      'ui',
      'sfx',
      'ambience',
    ] as const),
    durationSeconds: {
      min,
      max: checkNumber(d.max, 'delivery.durationSeconds.max', { min, max: 600 }),
    },
  };
}

function checkFamilyDimensions(value: unknown, base: ProgramBaseV1): FamilyDimensionV1[] {
  const raw = checkArray(value, 'dimensions');
  const scopes = new Map<string, 'all' | 'role'>();
  const plain = raw.map((item, i) => {
    const o = checkObject(item, `dimensions[${i}]`, [
      'name',
      'target',
      'range',
      'options',
      'scope',
    ]);
    const scope =
      o.scope === undefined
        ? 'all'
        : checkChoice(o.scope, `dimensions[${i}].scope`, ['all', 'role'] as const);
    scopes.set(String(o.name), scope);
    return Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'scope'));
  });
  return checkDimensions(plain, 'dimensions', base).map((d) => ({
    ...d,
    scope: scopes.get(d.name) as 'all' | 'role',
  }));
}

/** Aile tanımını doğrular ve normalize eder (boyutlar, roller, varyantlar ada göre). */
export function validateFamilyProgram(value: unknown): SoundFamilyProgramV1 {
  const o = checkObject(value, '', [
    'schema',
    'familyId',
    'version',
    'title',
    'description',
    'base',
    'seed',
    'variation',
    'dimensions',
    'roles',
    'variants',
    'quality',
    'budget',
    'delivery',
    'provenance',
  ]);
  if (o.schema !== SOUND_FAMILY_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${SOUND_FAMILY_SCHEMA}" olmalı`, o.schema);
  if (typeof o.familyId !== 'string' || !FAMILY_ID.test(o.familyId)) {
    throw new AudioParamError('familyId', 'type', FAMILY_ID.source, o.familyId);
  }
  const variation = checkObject(o.variation, 'variation', ['policy']);
  checkChoice(variation.policy, 'variation.policy', [FAMILY_VARIATION_POLICY] as const);
  const base = checkBase(o.base, 'base');
  const dimensions = checkFamilyDimensions(o.dimensions, base);
  const roles = checkRoles(o.roles, dimensions);
  const budgetKeys = Object.keys(DEFAULT_BATCH_BUDGET) as (keyof BatchBudget)[];
  const budget = o.budget === undefined ? undefined : checkObject(o.budget, 'budget', budgetKeys);
  const provenance =
    o.provenance === undefined
      ? undefined
      : checkObject(o.provenance, 'provenance', ['searchId', 'candidateId', 'reportHash']);
  return {
    schema: SOUND_FAMILY_SCHEMA,
    familyId: o.familyId,
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: text(o.title, 'title', 80),
    description: text(o.description, 'description', 2000),
    base,
    seed: checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true }),
    variation: { policy: FAMILY_VARIATION_POLICY },
    dimensions,
    roles,
    variants: checkVariants(o.variants, roles),
    ...(o.quality === undefined
      ? {}
      : { quality: validateFamilyQualityPolicy(o.quality, 'quality') }),
    ...(budget
      ? {
          budget: Object.fromEntries(
            Object.entries(budget).map(([k, v]) => [
              k,
              checkNumber(v, `budget.${k}`, { above: 0 }),
            ]),
          ) as Partial<BatchBudget>,
        }
      : {}),
    delivery: checkDelivery(o.delivery),
    ...(provenance
      ? {
          provenance: {
            searchId: text(provenance.searchId, 'provenance.searchId', 64),
            candidateId: text(provenance.candidateId, 'provenance.candidateId', 64),
            reportHash: text(provenance.reportHash, 'provenance.reportHash', 80) as Sha256,
          },
        }
      : {}),
  };
}

export interface ExpandedVariant {
  readonly key: string;
  readonly variantId: string;
  readonly roles: FamilyVariantV1['roles'];
  readonly tags: readonly string[];
  readonly values: Readonly<Record<string, DimensionValue>>;
  readonly program: AcousticProgramV1;
  readonly programHash: Sha256;
}

/** Varyantın kısıtlanmış boyutu: tam aralık ∩ varyantın rollerinin alt aralıkları. */
function narrowed(
  family: SoundFamilyProgramV1,
  variant: FamilyVariantV1,
  dim: FamilyDimensionV1,
): DimensionV1 | null {
  let constrained = false;
  let options = dim.options ? [...dim.options] : null;
  let range = dim.range ? { ...dim.range } : null;
  for (const axis of Object.keys(variant.roles).sort() as RoleAxis[]) {
    const c = family.roles[axis]?.[variant.roles[axis] as string]?.[dim.name];
    if (!c) continue;
    constrained = true;
    if ('options' in c && options) options = options.filter((v) => c.options.includes(v));
    if ('min' in c && range)
      range = { ...range, min: Math.max(range.min, c.min), max: Math.min(range.max, c.max) };
  }
  if (dim.scope === 'role' && !constrained) return null;
  if ((options && options.length === 0) || (range && !(range.min <= range.max))) {
    throw new AudioParamError(
      `variants.${variant.key}`,
      'combination',
      `rollerin ${dim.name} kısıtları kesişmiyor`,
      variant.key,
    );
  }
  return options
    ? { name: dim.name, target: dim.target, options }
    : { name: dim.name, target: dim.target, range: range as DimensionRangeV1 };
}

/** Kararlı varyant kimliği: aile kimliği + anahtar + roller + politika + tohum + program özeti. */
export function variantIdOf(
  family: SoundFamilyProgramV1,
  variant: FamilyVariantV1,
  programHash: Sha256,
): string {
  const identity = hashCanonical({
    schema: SOUND_FAMILY_SCHEMA,
    familyId: family.familyId,
    key: variant.key,
    roles: variant.roles,
    policy: family.variation.policy,
    seed: family.seed,
    programHash,
  });
  return `v-${identity.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/**
 * Deterministik genişletme: her varyant için her uygulanan boyutun değeri
 * `family:<familyId>/variant:<key>/<boyut>` alt akışının İLK çekilişidir.
 * Program doğrulanır; brief süre aralığı dışındaki varyant reddedilir.
 */
export function expandFamily(family: SoundFamilyProgramV1): ExpandedVariant[] {
  const integer = new Map(
    family.dimensions.map((d) => [d.name, isIntegerDimension(d, family.base)]),
  );
  return family.variants.map((variant) => {
    const dims: DimensionV1[] = [];
    const values: Record<string, DimensionValue> = {};
    for (const dim of family.dimensions) {
      const restricted = narrowed(family, variant, dim);
      if (!restricted) continue;
      const u = substream(
        family.seed,
        `family:${family.familyId}/variant:${variant.key}/${dim.name}`,
      ).next();
      dims.push(restricted);
      values[dim.name] = valueAt(restricted, u, integer.get(dim.name));
    }
    const program = materialize(family.base, dims, values);
    const duration = resolveProgram(program).durationSeconds;
    const { min, max } = family.delivery.durationSeconds;
    if (duration < min || duration > max) {
      throw new AudioParamError(
        `variants.${variant.key}`,
        'range',
        `süre ${duration} sn teslim aralığı [${min}, ${max}] dışında`,
        duration,
      );
    }
    const programHash = hashCanonical(program);
    return {
      key: variant.key,
      variantId: variantIdOf(family, variant, programHash),
      roles: variant.roles,
      tags: variant.tags,
      values,
      program,
      programHash,
    };
  });
}

export function familyHash(family: SoundFamilyProgramV1): Sha256 {
  return hashCanonical(family);
}
