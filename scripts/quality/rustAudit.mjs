import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

export function activeCargoLocks(root, lifecycle) {
  const locks = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '**/Cargo.lock', 'Cargo.lock'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const prefixes = lifecycle.workspaces
    .filter((workspace) => workspace.status === 'active')
    .map((workspace) => `${workspace.path}/`);
  return locks.filter((lock) => prefixes.some((prefix) => lock.startsWith(prefix))).sort();
}

export function auditRust(root, run = execFileSync) {
  const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
  const locks = activeCargoLocks(root, lifecycle);
  if (locks.length === 0) throw new Error('Rust güvenlik kapısı: aktif Cargo.lock bulunamadı.');
  for (const lock of locks) {
    console.log(`[rust-security] ${lock}`);
    run('cargo', ['audit', '--file', lock], { cwd: root, stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  auditRust(process.cwd());
}
