import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject, readNumber } from '../guard/read';
import { checkName } from './names';
import type { SampleDeclV1 } from './samples';

/**
 * Sampler bankası — kod içi özel yükleyici yazmadan kullanılan bölge
 * (zone) haritası: anahtar aralığı, velocity katmanı, round-robin grubu,
 * başlangıç ofseti, loop bölgesi, akort ve kazanç VERİDİR. Bölge sample'ı
 * programın `samples` bildirimindeki ada başvurur; banka programa gömülür,
 * yani manifest bankayı da taşır. Seçim deterministiktir ve gerekçesi
 * (`selectZone().reason`) manifest'e yazılır.
 */
export const SAMPLE_BANK_SCHEMA = 'SampleBankV1';

export interface SampleZoneV1 {
  readonly sample: string;
  readonly rootKey: number;
  readonly keyLow: number;
  readonly keyHigh: number;
  readonly velocityLow?: number;
  readonly velocityHigh?: number;
  readonly startSeconds?: number;
  readonly loop?: {
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly crossfadeSeconds?: number;
  };
  readonly tuneCents?: number;
  readonly gainDb?: number;
}

export interface SampleBankV1 {
  readonly schema: typeof SAMPLE_BANK_SCHEMA;
  readonly description?: string;
  readonly zones: readonly SampleZoneV1[];
}

export interface ResolvedZone {
  readonly index: number;
  readonly sample: string;
  readonly rootKey: number;
  readonly keyLow: number;
  readonly keyHigh: number;
  readonly velocityLow: number;
  readonly velocityHigh: number;
  readonly startSeconds: number;
  readonly loop: {
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly crossfadeSeconds: number;
  } | null;
  readonly tuneCents: number;
  readonly gainDb: number;
}

const KEY = { min: 0, max: 127, integer: true } as const;
const UNIT = { min: 0, max: 1 } as const;

function resolveZone(
  value: unknown,
  path: string,
  index: number,
  samples: ReadonlyMap<string, SampleDeclV1>,
  used: Set<string>,
): ResolvedZone {
  const o = checkObject(value, path, [
    'sample',
    'rootKey',
    'keyLow',
    'keyHigh',
    'velocityLow',
    'velocityHigh',
    'startSeconds',
    'loop',
    'tuneCents',
    'gainDb',
  ]);
  const sample = checkName(o.sample, `${path}.sample`);
  const decl = samples.get(sample);
  if (!decl)
    throw new AudioParamError(
      `${path}.sample`,
      'unknown-id',
      'programın `samples` bildiriminde yok',
      sample,
    );
  used.add(sample);
  const seconds = decl.frames / decl.sampleRate;
  const keyLow = checkNumber(o.keyLow, `${path}.keyLow`, KEY);
  const keyHigh = checkNumber(o.keyHigh, `${path}.keyHigh`, { ...KEY, min: keyLow });
  const velocityLow = readNumber(o, 'velocityLow', path, UNIT, 0);
  const velocityHigh = readNumber(o, 'velocityHigh', path, { ...UNIT, min: velocityLow }, 1);
  const startSeconds = readNumber(o, 'startSeconds', path, { min: 0, max: seconds * 0.99 }, 0);
  let loop: ResolvedZone['loop'] = null;
  if (o.loop !== undefined) {
    const l = checkObject(o.loop, `${path}.loop`, [
      'startSeconds',
      'endSeconds',
      'crossfadeSeconds',
    ]);
    const loopStart = checkNumber(l.startSeconds, `${path}.loop.startSeconds`, {
      min: startSeconds,
      max: seconds,
    });
    const loopEnd = checkNumber(l.endSeconds, `${path}.loop.endSeconds`, {
      above: loopStart + 0.005,
      max: seconds,
    });
    const crossfade = readNumber(
      l,
      'crossfadeSeconds',
      `${path}.loop`,
      { min: 0, max: (loopEnd - loopStart) / 2 },
      0,
    );
    loop = { startSeconds: loopStart, endSeconds: loopEnd, crossfadeSeconds: crossfade };
  }
  return {
    index,
    sample,
    rootKey: checkNumber(o.rootKey, `${path}.rootKey`, KEY),
    keyLow,
    keyHigh,
    velocityLow,
    velocityHigh,
    startSeconds,
    loop,
    tuneCents: readNumber(o, 'tuneCents', path, { min: -1200, max: 1200 }, 0),
    gainDb: readNumber(o, 'gainDb', path, { min: -48, max: 12 }, 0),
  };
}

export function resolveBanks(
  value: unknown,
  samples: ReadonlyMap<string, SampleDeclV1>,
  usedSamples: Set<string>,
): Map<string, ResolvedZone[]> {
  const out = new Map<string, ResolvedZone[]>();
  if (value === undefined) return out;
  const record = checkObject(value, 'banks', Object.keys((value as object) ?? {}));
  const names = Object.keys(record).sort();
  if (names.length > 8) throw new AudioParamError('banks', 'range', 'en çok 8 banka', names.length);
  for (const name of names) {
    const path = `banks.${checkName(name, `banks.${name}`)}`;
    const o = checkObject(record[name], path, ['schema', 'description', 'zones']);
    if (o.schema !== SAMPLE_BANK_SCHEMA) {
      throw new AudioParamError(
        `${path}.schema`,
        'type',
        `"${SAMPLE_BANK_SCHEMA}" olmalı`,
        o.schema,
      );
    }
    const zones = checkArray(o.zones, `${path}.zones`);
    if (zones.length < 1 || zones.length > 128) {
      throw new AudioParamError(`${path}.zones`, 'range', '1…128 bölge', zones.length);
    }
    out.set(
      name,
      zones.map((zone, i) => resolveZone(zone, `${path}.zones[${i}]`, i, samples, usedSamples)),
    );
  }
  return out;
}

export interface ZoneSelection {
  readonly zone: ResolvedZone;
  readonly candidates: number;
  readonly reason: string;
}

/**
 * Deterministik seçim: anahtar ve velocity aralığına uyan bölgeler (bölge
 * sırasıyla) aday kümesidir; round-robin `event mod n` ile seçilir. Aday
 * yoksa seçim render'dan ÖNCE reddedilir.
 */
export function selectZone(
  zones: readonly ResolvedZone[],
  note: number,
  velocity: number,
  event: number,
): ZoneSelection | null {
  const candidates = zones.filter(
    (z) =>
      note >= z.keyLow &&
      note <= z.keyHigh &&
      velocity >= z.velocityLow &&
      velocity <= z.velocityHigh,
  );
  if (candidates.length === 0) return null;
  const zone = candidates[event % candidates.length];
  return {
    zone,
    candidates: candidates.length,
    reason:
      `nota ${note} ∈ [${zone.keyLow}, ${zone.keyHigh}], velocity ${velocity} ∈ ` +
      `[${zone.velocityLow}, ${zone.velocityHigh}]; round-robin ${event} mod ${candidates.length} → bölge ${zone.index}`,
  };
}
