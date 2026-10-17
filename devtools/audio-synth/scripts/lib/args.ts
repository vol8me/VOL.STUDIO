/**
 * `audio:job` alt komutlarının ortak argüman okuyucusu. Hata her zaman
 * `ProtocolError`dır; CLI kabuğu onu makine-okunur JSON'a çevirir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { RenderQuality } from '../../src/kernel/session';
import { ProtocolError } from '../../src/protocol/errors';

export interface Parsed {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

export const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  'json',
  'loop',
  'audition',
  'all',
  'serve',
  'draft',
  'semantic',
]);

/** Değer alan bayraklar; komutların okuduğu adlarla birebir (testle kilitli). */
export const VALUE_FLAGS: ReadonlySet<string> = new Set([
  'asset',
  'brief',
  'by',
  'candidate',
  'families',
  'file',
  'fits',
  'from',
  'from-report',
  'ids',
  'jobs',
  'label',
  'music',
  'negative',
  'note',
  'package',
  'port',
  'positive',
  'profile',
  'reason',
  'render',
  'runtime-key',
  'scorer',
  'search',
  'searches',
  'seed',
  'skeleton',
  'state',
  'workers',
]);

export function parse(argv: readonly string[]): Parsed {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!BOOLEAN_FLAGS.has(name) && !VALUE_FLAGS.has(name)) {
      throw new ProtocolError('invalid', `bilinmeyen bayrak --${name}`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
    } else {
      const value = rest[++i];
      if (value === undefined) throw new ProtocolError('invalid', `--${name} bir değer ister`);
      flags.set(name, value);
    }
  }
  return { command, positional, flags };
}

export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (
      existsSync(join(dir, 'workspace-lifecycle.json')) &&
      existsSync(join(dir, 'pnpm-workspace.yaml'))
    )
      return dir;
    const parent = dirname(dir);
    if (parent === dir)
      throw new ProtocolError('not-found', 'repo kökü bulunamadı (workspace-lifecycle.json)');
    dir = parent;
  }
}

export function text(flags: Parsed['flags'], name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function required(flags: Parsed['flags'], name: string): string {
  const value = text(flags, name);
  if (value === undefined) throw new ProtocolError('invalid', `--${name} zorunlu`);
  return value;
}

export function positional(parsed: Parsed, index: number, what: string): string {
  const value = parsed.positional[index];
  if (!value) throw new ProtocolError('invalid', `${parsed.command} ${what} ister`);
  return value;
}

export function readInput(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProtocolError('invalid', `girdi okunamadı: ${(error as Error).message}`, path);
  }
}

export function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Pozitif tam sayı değeri isteyen bayrak (ör. `--workers`). */
export function positiveCount(parsed: Parsed, name: string): number {
  const raw = required(parsed.flags, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ProtocolError('invalid', `--${name} pozitif tam sayı olmalı: ${raw}`);
  }
  return value;
}

/** `--draft` bayrağı: hızlı yineleme kalitesi; yayın yalnız nihai kaliteyi kabul eder. */
export function qualityOf(parsed: Parsed): RenderQuality {
  return parsed.flags.has('draft') ? 'draft' : 'final';
}
