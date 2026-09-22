import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject, checkSampleRate } from '../guard/read';
import { PROGRAM_REGISTRY } from './catalog';
import { substream } from './random';
import { resolveProgram, type AcousticProgramV1 } from './schema';

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
];

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
  const random = substream(root, `archetype:${entry.id}/variation:${variation}`);
  const program = entry.expand(params, random, sampleRate);
  resolveProgram(program);
  return program as unknown as AcousticProgramV1;
}
