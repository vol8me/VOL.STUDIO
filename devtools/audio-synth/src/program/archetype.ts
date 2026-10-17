import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject, checkSampleRate } from '../guard/read';
import { PROGRAM_REGISTRY } from './catalog';
import { substream } from './random';
import { materialById } from './materials';
import type { ArchetypeProfiles } from './registry';
import { resolveProgram, type AcousticProgramV1 } from './schema';
import type { StyleRefV1 } from './style';

export const ARCHETYPE_REQUEST_SCHEMA = 'ArchetypeRequestV1';

/**
 * Archetype isteği: aile + sürüm + makro parametreleri + varyasyon sırası.
 * Genişletme saf ve deterministiktir: aynı istek aynı program belgesini
 * verir. Parametre aralığı, yapısal kısıt ve üretilen programın kendisi
 * render'dan ÖNCE doğrulanır.
 */
export interface ArchetypeRequestV1 {
  readonly schema: typeof ARCHETYPE_REQUEST_SCHEMA;
  readonly archetype: string;
  readonly version: number;
  readonly variation: number;
  readonly seed?: number;
  readonly sampleRate?: number;
  readonly params?: Readonly<Record<string, number>>;
  /** Yalnız profil kabul eden archetype'larda: stil başvurusu ve gövde materyali. */
  readonly profiles?: { readonly style?: StyleRefV1; readonly material?: string };
}

const DEFAULT_ROOT = 0x5eed;
const REQUEST_KEYS = [
  'schema',
  'archetype',
  'version',
  'variation',
  'seed',
  'sampleRate',
  'params',
  'profiles',
];

function checkProfiles(value: unknown, accepted: readonly string[]): ArchetypeProfiles {
  if (value === undefined) return {};
  const o = checkObject(value, 'profiles', ['style', 'material']);
  for (const key of Object.keys(o)) {
    if (!accepted.includes(key)) {
      const detail = `bu archetype ${key} profili almaz`;
      throw new AudioParamError(`profiles.${key}`, 'combination', detail, key);
    }
  }
  if (o.material !== undefined && (typeof o.material !== 'string' || !materialById(o.material))) {
    throw new AudioParamError(
      'profiles.material',
      'unknown-id',
      'materyal profili yok',
      o.material,
    );
  }
  return {
    ...(o.style === undefined ? {} : { style: o.style }),
    ...(o.material === undefined ? {} : { material: o.material }),
  };
}

export function expandArchetype(value: unknown): AcousticProgramV1 {
  const o = checkObject(value, '', REQUEST_KEYS);
  if (o.schema !== ARCHETYPE_REQUEST_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${ARCHETYPE_REQUEST_SCHEMA}" olmalı`, o.schema);
  }
  const entry = PROGRAM_REGISTRY.resolve(o.archetype, o.version, ['archetype'], 'archetype');
  const variation = checkNumber(o.variation, 'variation', {
    min: 0,
    max: 1_000_000,
    integer: true,
  });
  const root =
    o.seed === undefined
      ? DEFAULT_ROOT
      : checkNumber(o.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true });
  const sampleRate =
    o.sampleRate === undefined ? 48000 : checkSampleRate(o.sampleRate, 'sampleRate');
  const raw =
    o.params === undefined ? {} : checkObject(o.params, 'params', Object.keys(entry.params));
  const params: Record<string, number> = {};
  for (const [key, spec] of Object.entries(entry.params)) {
    if (spec.type !== 'number') continue;
    params[key] = checkNumber(raw[key] ?? spec.default, `params.${key}`, {
      min: spec.min,
      max: spec.max,
    });
  }
  const issue = entry.constraint(params);
  if (issue) throw new AudioParamError('params', 'combination', issue, params);
  const profiles = checkProfiles(o.profiles, entry.profiles ?? []);
  const random = substream(root, `archetype:${entry.id}/variation:${variation}`);
  const program = entry.expand(params, random, sampleRate, profiles);
  resolveProgram(program);
  return program as unknown as AcousticProgramV1;
}
