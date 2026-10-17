import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activeWorkspacePaths,
  frozenWorkspacePaths,
  loadRepoLifecycle,
} from './workspaceLifecycle.mjs';

const OUTPUT_DIRECTORIES = ['dist', 'coverage', 'test-results', 'playwright-report'];

export function cleanWorkspace(root, all = false) {
  const lifecycle = loadRepoLifecycle(root);
  if (!lifecycle) throw new Error('Temizlik workspace-lifecycle.json gerektirir.');
  const active = activeWorkspacePaths(lifecycle);
  const frozen = frozenWorkspacePaths(lifecycle);
  const candidates = active.flatMap((path) => OUTPUT_DIRECTORIES.map((name) => join(path, name)));
  if (active.includes('devtools/deck')) candidates.push('devtools/deck/web/vendor');
  candidates.push('node_modules/.cache/vol-quality');
  if (all) candidates.push('target');

  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relative(root, path).split('\\').join('/');
      if (entry.isDirectory()) {
        if (
          ['.git', '.claude', 'node_modules', 'target', 'public'].includes(entry.name) ||
          frozen.includes(rel)
        )
          continue;
        visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) candidates.push(rel);
    }
  };
  for (const path of active) {
    const directory = join(root, path);
    if (existsSync(directory)) visit(directory);
  }
  const removed = candidates.filter((path) => existsSync(join(root, path)));
  for (const path of removed) rmSync(join(root, path), { recursive: true, force: true });
  return removed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--all')) throw new Error('Kullanım: cleanWorkspace.mjs [--all]');
  const removed = cleanWorkspace(process.cwd(), args.includes('--all'));
  console.log(`[clean] ${removed.length} üretilmiş çıktı kaldırıldı.`);
}
