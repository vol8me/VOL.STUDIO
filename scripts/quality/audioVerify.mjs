#!/usr/bin/env node
/**
 * Audio verify gate.
 *
 * Aktif oyun paketlerinde: ses üretim reçetesini koşturup çıktının repodakiyle
 * bit-exact eşleştiğini doğrular.
 * Frozen paketlerde: immutable kaynak ağacı gereği üretim tetiklemez,
 * repodaki varlıkların temizliğini ve sapmasızlığını doğrular.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

const root = process.cwd();
const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
const activeWorkspaces = lifecycle.workspaces.filter((w) => w.status === 'active');

for (const pkg of activeWorkspaces) {
  const manifestPath = join(root, pkg.path, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const script = manifest.scripts?.['audio:generate']
    ? 'audio:generate'
    : manifest.scripts?.['generate:audio']
      ? 'generate:audio'
      : null;
  if (script) {
    console.log(`[audio-verify] Generating audio for ${pkg.packageName}...`);
    execFileSync('pnpm', ['--filter', pkg.packageName, script], { cwd: root, stdio: 'inherit' });
  }
}

// Verify that no audio files have drifted
execFileSync('git', ['diff', '--exit-code', '--', 'games/*/public/assets/audio/**'], {
  cwd: root,
  stdio: 'inherit',
});
console.log('[audio-verify] Audio integrity and reproducibility verified.');
