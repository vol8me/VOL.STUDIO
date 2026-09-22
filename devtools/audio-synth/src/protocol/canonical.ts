import { createHash } from 'node:crypto';

/**
 * Kanonik JSON: anahtarlar her düzeyde UTF-16 kod birimi sırasıyla dizilir,
 * boşluk yoktur, `-0` → `0`. JSON'a sığmayan değer (NaN, Infinity,
 * `undefined`, fonksiyon, bigint, typed array, döngü) SESSİZCE düşürülmez —
 * `JSON.stringify` bunları `null`a çevirir ya da atlar ve iki farklı belge
 * aynı özete düşerdi.
 */
export class CanonicalJsonError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'CanonicalJsonError';
    this.path = path;
  }
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalJsonError(path, 'sonlu olmayan sayı');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new CanonicalJsonError(path, `JSON değeri değil (${typeof value})`);
  }
  const object = value;
  if (seen.has(object)) throw new CanonicalJsonError(path, 'döngüsel başvuru');
  seen.add(object);
  let out: string;
  if (Array.isArray(object)) {
    out = `[${object.map((item, i) => encode(item, `${path}[${i}]`, seen)).join(',')}]`;
  } else {
    if (!isPlainObject(object)) throw new CanonicalJsonError(path, 'düz nesne değil');
    const record = object as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      if (record[key] === undefined) throw new CanonicalJsonError(`${path}.${key}`, 'undefined');
      parts.push(`${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`, seen)}`);
    }
    out = `{${parts.join(',')}}`;
  }
  seen.delete(object);
  return out;
}

export function canonicalJson(value: unknown): string {
  return encode(value, '$', new Set());
}

export type Sha256 = `sha256:${string}`;

export const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function sha256Bytes(bytes: Uint8Array | string): Sha256 {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Belge kimliği: kanonik JSON'un özeti. Diskteki biçim (girinti) kimliği değiştirmez. */
export function hashCanonical(value: unknown): Sha256 {
  return sha256Bytes(canonicalJson(value));
}

/**
 * Diske yazılan biçim: sıralı anahtar, iki boşluk girinti, sonda satır sonu.
 * Kanonik biçimden türetilir — aynı belge her yazımda aynı baytları verir.
 */
export function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
}

/**
 * Kanonik PCM kimliği: yazıcıya giden örneklerin kendisi (kelepçeli,
 * interleaved float32 LE) + biçim başlığı. Kodlayıcı/kap değişikliği bu
 * özeti değiştirmez; ses değişikliği değiştirir.
 */
export function hashPcm(channels: readonly Float32Array[], sampleRate: number): Sha256 {
  const frames = channels[0]?.length ?? 0;
  const hash = createHash('sha256');
  hash.update(`pcm-f32le-interleaved-v1;rate=${sampleRate};channels=${channels.length};`);
  hash.update(`frames=${frames};`);
  const chunkFrames = 4096;
  const buffer = Buffer.alloc(chunkFrames * channels.length * 4);
  for (let start = 0; start < frames; start += chunkFrames) {
    const end = Math.min(frames, start + chunkFrames);
    let offset = 0;
    for (let i = start; i < end; i++) {
      for (const channel of channels) {
        buffer.writeFloatLE(Math.max(-1, Math.min(1, channel[i])), offset);
        offset += 4;
      }
    }
    hash.update(buffer.subarray(0, offset));
  }
  return `sha256:${hash.digest('hex')}`;
}
