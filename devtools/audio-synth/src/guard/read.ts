import { AudioParamError } from './errors';

export type ParamObject = Readonly<Record<string, unknown>>;

/** Kök nesnede alan adının kendisi, iç içe nesnede `üst.alan` döner. */
export function joinPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/**
 * Sayısal alan kuralı. `min`/`max` kapsayıcıdır; `above` dışlayıcı alt
 * sınırdır (`above: 0` → değer 0'dan BÜYÜK olmalı).
 */
export interface NumberRule {
  readonly min?: number;
  readonly max?: number;
  readonly above?: number;
  readonly integer?: boolean;
}

function describeRule(rule: NumberRule): string {
  const low =
    rule.above !== undefined ? `(${rule.above}` : rule.min !== undefined ? `[${rule.min}` : '(-∞';
  const high = rule.max !== undefined ? `${rule.max}]` : '∞)';
  return `${low}, ${high}`;
}

export function checkNumber(value: unknown, path: string, rule: NumberRule = {}): number {
  if (typeof value !== 'number') {
    throw new AudioParamError(path, 'type', 'sayı olmalı', value);
  }
  if (!Number.isFinite(value)) {
    throw new AudioParamError(path, 'non-finite', 'sonlu bir sayı olmalı', value);
  }
  if (rule.integer && !Number.isInteger(value)) {
    throw new AudioParamError(path, 'type', 'tamsayı olmalı', value);
  }
  const belowFloor =
    (rule.above !== undefined && !(value > rule.above)) ||
    (rule.min !== undefined && value < rule.min);
  if (belowFloor || (rule.max !== undefined && value > rule.max)) {
    throw new AudioParamError(path, 'range', `${describeRule(rule)} aralığında olmalı`, value);
  }
  return value;
}

export function readNumber(
  obj: ParamObject,
  key: string,
  path: string,
  rule: NumberRule,
  fallback: number,
): number {
  const value = obj[key];
  return value === undefined ? fallback : checkNumber(value, joinPath(path, key), rule);
}

export function requireNumber(
  obj: ParamObject,
  key: string,
  path: string,
  rule: NumberRule = {},
): number {
  const value = obj[key];
  if (value === undefined) {
    throw new AudioParamError(joinPath(path, key), 'required', 'zorunlu alan eksik', value);
  }
  return checkNumber(value, joinPath(path, key), rule);
}

export function checkChoice<T extends string>(
  value: unknown,
  path: string,
  choices: readonly T[],
): T {
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new AudioParamError(path, 'type', `şunlardan biri olmalı: ${choices.join(', ')}`, value);
  }
  return value as T;
}

export function readChoice<T extends string>(
  obj: ParamObject,
  key: string,
  path: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = obj[key];
  return value === undefined ? fallback : checkChoice(value, joinPath(path, key), choices);
}

export function readBoolean(
  obj: ParamObject,
  key: string,
  path: string,
  fallback: boolean,
): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new AudioParamError(joinPath(path, key), 'type', 'boolean olmalı', value);
  }
  return value;
}

/**
 * Düz nesne ve bilinen alanlar. Bilinmeyen alan bir yazım hatasıdır
 * (`decy`, `cuttoff`): sessizce yok sayılırsa istenen etki hiç uygulanmaz ve
 * bunu yalnız kulak fark eder.
 */
export function checkObject(value: unknown, path: string, keys: readonly string[]): ParamObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AudioParamError(path === '' ? 'params' : path, 'type', 'nesne olmalı', value);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new AudioParamError(joinPath(path, key), 'unknown-key', 'bilinmeyen alan', key);
    }
  }
  return value as ParamObject;
}

export function checkArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new AudioParamError(path, 'type', 'dizi olmalı', value);
  return value;
}

/**
 * Motorun desteklediği örnek oranı aralığı. 8 kHz standart ses oranlarının
 * tabanıdır (telefon bandı); 384 kHz üstü hiçbir teslim biçiminde yoktur.
 * Tamsayı şartı WAV/OGG başlıklarından gelir.
 */
export const SAMPLE_RATE_RULE: NumberRule = { min: 8000, max: 384000, integer: true };

export function checkSampleRate(value: unknown, path: string): number {
  return checkNumber(value, path, SAMPLE_RATE_RULE);
}
