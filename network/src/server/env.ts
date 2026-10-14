export type Env = Readonly<Record<string, string | undefined>>;

/** Ortam değişkeni tam sayı olmalı ve aralıkta kalmalı; aksi halde başlatma durur. */
export function envInteger(
  env: Env,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(`${name} ${min}–${max} arasında tam sayı olmalı.`);
  return value;
}

/** Ortam değişkeni verilmişse kalıba uymalıdır; verilmemişse varsayılan döner. */
export function envText(env: Env, name: string, fallback: string, pattern?: RegExp): string {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : raw;
  if (pattern && !pattern.test(value)) throw new RangeError(`${name} geçersiz.`);
  return value;
}

export function envChoice<T extends string>(
  env: Env,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback : raw;
  if (!(choices as readonly string[]).includes(value))
    throw new RangeError(`${name} şunlardan biri olmalı: ${choices.join(', ')}.`);
  return value as T;
}

/** `1`/`true`/`on` açık, `0`/`false`/`off` kapalıdır. */
export function envFlag(env: Env, name: string, fallback = false): boolean {
  const raw = env[name]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'on'].includes(raw)) return true;
  if (['0', 'false', 'off'].includes(raw)) return false;
  throw new RangeError(`${name} 1/0, true/false ya da on/off olmalı.`);
}

export interface ListenSettings {
  readonly port: number;
  readonly host: string;
}

/**
 * Oyun sunucusunun dinleme adresi: `VOL_NET_PORT` (varsayılan 2567) ve `VOL_NET_HOST`
 * (varsayılan loopback). Uzak erişim açıkça `0.0.0.0` verilerek açılır.
 */
export function listenSettings(env: Env): ListenSettings {
  return {
    port: envInteger(env, 'VOL_NET_PORT', 2567, 0, 65535),
    host: envText(env, 'VOL_NET_HOST', '127.0.0.1'),
  };
}

/**
 * İşletim kapısının adresi: `VOL_NET_OPS_PORT` verilmezse kapı kapalıdır (`null`); verilirse
 * `VOL_NET_OPS_HOST` (varsayılan loopback) üzerinde dinler. Kapı oyun trafiğinden ayrıdır.
 */
export function opsSettings(env: Env): ListenSettings | null {
  const raw = env.VOL_NET_OPS_PORT;
  if (raw === undefined || raw === '') return null;
  return {
    port: envInteger(env, 'VOL_NET_OPS_PORT', 0, 0, 65535),
    host: envText(env, 'VOL_NET_OPS_HOST', '127.0.0.1'),
  };
}
