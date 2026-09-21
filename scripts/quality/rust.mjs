import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

/** Git'in gördüğü her aktif Cargo paketi kapıya girer; lifecycle tek kaynaktır. */
export function rustManifests(
  root,
  lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json')),
) {
  const manifests = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '**/Cargo.toml', 'Cargo.toml'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean);
  const prefixes = lifecycle.workspaces
    .filter((workspace) => workspace.status === 'active')
    .map((workspace) => `${workspace.path}/`);
  return manifests
    .filter((manifest) => prefixes.some((prefix) => manifest.startsWith(prefix)))
    .sort();
}

export function checkRust(
  root,
  run = execFileSync,
  lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json')),
) {
  const manifests = rustManifests(root, lifecycle);
  if (manifests.length === 0) throw new Error('Rust kapısı: Cargo.toml bulunamadı');
  for (const manifest of manifests) {
    console.log(`[rust] ${manifest}`);
    const options = { cwd: resolve(root, dirname(manifest)), stdio: 'inherit' };
    run('cargo', ['check', '--locked'], options);
    run('cargo', ['fmt', '--check'], options);
    run('cargo', ['clippy', '--locked', '--', '-D', 'warnings'], options);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkRust(process.cwd());
}
