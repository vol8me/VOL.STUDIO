#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  activeWorkspaceNames,
  listWorkspacePackages,
  loadWorkspaceLifecycle,
} from './workspaceLifecycle.mjs';

export function selectActivePackages(lifecycle, packages) {
  const active = new Set(activeWorkspaceNames(lifecycle));
  return packages.filter((pkg) => active.has(pkg.name));
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
