#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { activeWorkspaceNames, loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

export function selectActivePackages(lifecycle, packages) {
  const active = new Set(activeWorkspaceNames(lifecycle));
  return packages.filter((pkg) => active.has(pkg.name));
}

function listWorkspacePackages(root) {
  const listed = JSON.parse(
    execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  return listed
    .filter((pkg) => resolve(pkg.path) !== resolve(root))
    .map((pkg) => ({
      name: pkg.name,
      dir: relative(root, pkg.path).split(sep).join('/'),
      scripts: JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8')).scripts ?? {},
    }));
}

export function buildActiveScriptCommand(lifecycle, packages, script, options = {}) {
  const selected = selectActivePackages(lifecycle, packages).filter(
    (pkg) => !options.ifPresent || Boolean(pkg.scripts?.[script]),
  );
  if (selected.length === 0) throw new Error(`Aktif workspace'lerde "${script}" script'i yok.`);
  const args = ['-r'];
  if (options.parallel) args.push('--parallel');
  if (options.ifPresent) args.push('--if-present');
  for (const pkg of selected) args.push('--filter', pkg.name);
  args.push('run', script);
  return { command: 'pnpm', args, packages: selected.map((pkg) => pkg.name) };
}

function main() {
  const root = process.cwd();
  const script = process.argv[2];
  if (!script) {
    console.error('Kullanım: node scripts/quality/runActive.mjs <script> [--if-present] [--parallel]');
    return 2;
  }
  const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
  const command = buildActiveScriptCommand(lifecycle, listWorkspacePackages(root), script, {
    ifPresent: process.argv.includes('--if-present'),
    parallel: process.argv.includes('--parallel'),
  });
  console.log(`[active-workspaces] ${script}: ${command.packages.join(', ')}`);
  const result = spawnSync(command.command, command.args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
