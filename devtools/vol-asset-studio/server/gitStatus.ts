import { spawn } from 'node:child_process';
import type { GitStatus } from '../shared/contracts.js';

export interface GitStatusSnapshot {
  available: boolean;
  byPath: Map<string, GitStatus>;
}

function tailAfterTokens(record: string, tokenCount: number): string | undefined {
  let cursor = 0;
  for (let token = 0; token < tokenCount; token += 1) {
    const separator = record.indexOf(' ', cursor);
    if (separator < 0) return undefined;
    cursor = separator + 1;
  }
  return record.slice(cursor);
}

function statusFromXY(xy: string): GitStatus {
  return xy.includes('D') ? 'deleted' : 'modified';
}

export function parsePorcelainV2(output: Buffer): Map<string, GitStatus> {
  const statuses = new Map<string, GitStatus>();
  for (const entry of output.toString('utf8').split('\0')) {
    if (entry === '' || entry.startsWith('# ')) continue;
    if (entry.startsWith('! ')) {
      statuses.set(entry.slice(2), 'ignored');
      continue;
    }
    if (entry.startsWith('? ')) {
      statuses.set(entry.slice(2), 'untracked');
      continue;
    }
    if (entry.startsWith('1 ')) {
      const path = tailAfterTokens(entry, 8);
      if (path !== undefined) statuses.set(path, statusFromXY(entry.slice(2, 4)));
      continue;
    }
    if (entry.startsWith('u ')) {
      const path = tailAfterTokens(entry, 10);
      if (path !== undefined) statuses.set(path, 'modified');
    }
  }
  return statuses;
}

function runGit(repoRoot: string, arguments_: string[], timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['--literal-pathspecs', '-c', 'core.quotepath=false', ...arguments_],
      { cwd: repoRoot, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let settled = false;
    const finish = (error?: Error, output?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) reject(error);
      else resolve(output ?? Buffer.alloc(0));
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('git_status_timeout'));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 16 * 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('git_status_output_limit'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('git_status_error_limit'));
      }
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(undefined, Buffer.concat(chunks));
      else finish(new Error(`git_status_exit:${String(code)}`));
    });
  });
}

/** Yapılandırılmış rootlarla sınırlı, salt okunur Git çalışma ağacı özeti. */
export async function readGitStatus(
  repoRoot: string,
  rootPaths: string[],
  timeoutMs = 10_000,
): Promise<GitStatusSnapshot> {
  if (rootPaths.length === 0) return { available: false, byPath: new Map() };
  try {
    const [statusOutput, trackedOutput] = await Promise.all([
      runGit(
        repoRoot,
        [
          'status',
          '--porcelain=v2',
          '-z',
          '--untracked-files=all',
          '--ignored=matching',
          '--no-renames',
          '--',
          ...rootPaths,
        ],
        timeoutMs,
      ),
      runGit(repoRoot, ['ls-files', '--cached', '-z', '--', ...rootPaths], timeoutMs),
    ]);
    const byPath = parsePorcelainV2(statusOutput);
    for (const path of trackedOutput.toString('utf8').split('\0')) {
      if (path !== '' && !byPath.has(path)) byPath.set(path, 'clean');
    }
    return {
      available: true,
      byPath,
    };
  } catch {
    return { available: false, byPath: new Map() };
  }
}
