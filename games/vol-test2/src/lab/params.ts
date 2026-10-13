/**
 * Yük parametreleri: ajanın verdiği değerleri doğrular. Bilinmeyen ad ve aralık dışı değer sessizce
 * düzeltilmez, reddedilir ve izin verilen aralık mesajda yazılır; yazım hatası bir ölçümü
 * farkında olmadan varsayılanla koşturmasın.
 */

export type ParamValue = number | boolean | string;
export type ParamValues = Readonly<Record<string, ParamValue>>;

interface ParamBase {
  readonly name: string;
  /** Zorunlu parametrenin varsayılanı yoktur: verilmezse çağrı reddedilir (`default` yalnız şemayı doldurur). */
  readonly required?: boolean;
}

export type ParamSpec =
  | (ParamBase & {
      readonly type: 'integer' | 'number';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly description: string;
    })
  | (ParamBase & {
      readonly type: 'boolean';
      readonly default: boolean;
      readonly description: string;
    })
  | (ParamBase & {
      readonly type: 'choice';
      readonly default: string;
      readonly choices: readonly string[];
      readonly description: string;
    });

export type ParamResult =
  | { readonly ok: true; readonly values: ParamValues; readonly key: string }
  | { readonly ok: false; readonly message: string };

type One =
  | { readonly ok: true; readonly value: ParamValue }
  | { readonly ok: false; readonly message: string };

function resolveOne(spec: ParamSpec, raw: unknown): One {
  if (spec.type === 'boolean') {
    return typeof raw === 'boolean'
      ? { ok: true, value: raw }
      : { ok: false, message: `${spec.name}: true ya da false olmalı` };
  }
  if (spec.type === 'choice') {
    return typeof raw === 'string' && spec.choices.includes(raw)
      ? { ok: true, value: raw }
      : {
          ok: false,
          message: `${spec.name}: ${spec.choices.join(' | ')} değerlerinden biri olmalı`,
        };
  }
  const valid =
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    (spec.type === 'number' || Number.isInteger(raw)) &&
    raw >= spec.min &&
    raw <= spec.max;
  if (valid) return { ok: true, value: raw };
  const kind = spec.type === 'integer' ? 'tamsayı' : 'sayı';
  return { ok: false, message: `${spec.name}: ${spec.min}..${spec.max} aralığında ${kind} olmalı` };
}

/** Girdiyi şemaya göre çözer. `key`, aynı yük ve aynı değerler için sabit bir dizgidir (taban çizgi anahtarı). */
export function resolveParams(specs: readonly ParamSpec[], input: unknown): ParamResult {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input)))
    return { ok: false, message: 'params bir nesne olmalı' };
  const given = (input ?? {}) as Record<string, unknown>;
  const known = specs.map((spec) => spec.name);
  for (const name of Object.keys(given)) {
    if (!known.includes(name))
      return {
        ok: false,
        message: `bilinmeyen parametre: ${name} (geçerli: ${known.join(', ') || 'yok'})`,
      };
  }
  const values: Record<string, ParamValue> = {};
  for (const spec of specs) {
    const present = Object.prototype.hasOwnProperty.call(given, spec.name);
    if (!present && spec.required === true) return { ok: false, message: `${spec.name}: zorunlu` };
    const raw = present ? given[spec.name] : spec.default;
    const one = resolveOne(spec, raw);
    if (!one.ok) return one;
    values[spec.name] = one.value;
  }
  const key = Object.keys(values)
    .sort()
    .map((name) => `${name}=${String(values[name])}`)
    .join(',');
  return { ok: true, values, key };
}
