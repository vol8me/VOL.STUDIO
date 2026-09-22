/**
 * `audio:job` alt komutlarının ortak argüman okuyucusu. Hata her zaman
 * `ProtocolError`dır; CLI kabuğu onu makine-okunur JSON'a çevirir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ProtocolError } from '../../src/protocol';

export interface Parsed {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(['json', 'loop', 'audition', 'all', 'serve']);

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
