import {
  spawn,
  spawnSync,
  type SpawnOptions,
  type SpawnSyncOptionsWithStringEncoding,
} from 'node:child_process';
import { createRequire } from 'node:module';

const TSX = createRequire(import.meta.url).resolve('tsx/cli');

export function spawnTsx(script: string, args: string[], options: SpawnOptions = {}) {
  return spawn(process.execPath, [TSX, script, ...args], options);
}

export function spawnTsxSync(
  script: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8' },
) {
  const result = spawnSync(process.execPath, [TSX, script, ...args], options);
  if (result.error) throw result.error;
  return result;
}
