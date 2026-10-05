import { execFileSync } from './command.mjs';
import { readFileSync } from 'node:fs';
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

/** `default` dışındaki Cargo feature adları; feature'lı yol da derlenir. */
export function optionalFeatures(manifestText) {
  const section = /^\[features\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(manifestText);
  if (!section) return [];
  return [...section[1].matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)]
    .map((match) => match[1])
    .filter((name) => name !== 'default');
}

/** Bir crate için sırayla koşan cargo adımları. */
export function cargoSteps(manifestText) {
  const lint = ['clippy', '--locked', '--all-targets'];
  const deny = ['--', '-D', 'warnings'];
  return [
    ['fmt', '--check'],
    [...lint, ...deny],
    ...(optionalFeatures(manifestText).length > 0 ? [[...lint, '--all-features', ...deny]] : []),
    ['test', '--locked', '--all-targets'],
  ];
}

export function checkRust(
  root,
  run = execFileSync,
  lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json')),
) {
  const manifests = rustManifests(root, lifecycle);
  if (manifests.length === 0) throw new Error('Rust kapısı: Cargo.toml bulunamadı');
  // Crate'ler aynı bağımlılık ağacını paylaşır; ortak hedef dizini onları bir kez derler.
  const env = {
    ...process.env,
    CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? join(root, 'target'),
  };
  const cargo = String(env['CARGO'] || 'cargo');
  for (const manifest of manifests) {
    console.log(`[rust] ${manifest}`);
    /** @type {import('node:child_process').ExecFileSyncOptions} */
    const options = { cwd: resolve(root, dirname(manifest)), stdio: 'inherit', env };
    for (const args of cargoSteps(readFileSync(join(root, manifest), 'utf8'))) {
      run(cargo, args, options);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkRust(process.cwd());
}
