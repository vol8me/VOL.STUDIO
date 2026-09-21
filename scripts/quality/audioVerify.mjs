#!/usr/bin/env node
/**
 * Ses doğrulama kapısı — iki ayrı işi ayrı söyler.
 *
 * AKTIF paketlerde `audio:generate`/`generate:audio` reçetesi yeniden koşulur:
 * üretim deterministik olduğu için çıktının asset ağacıyla bit-exact
 * eşleşmesi "reçete ↔ asset taze" demektir (reproducibility).
 *
 * Bütün workspace'lerin (frozen dahil) `public/assets/audio` ağacında izlenen
 * dosyaların diff'siz olduğu doğrulanır — bu ASSET BÜTÜNLÜĞÜDÜR, üretimin
 * tekrar koşulduğunu kanıtlamaz. Frozen sesin tarihsel üretim kanıtı
 * `freezeTag`indedir; rutin kapı frozen ağaçta üretim tetiklemez.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

const root = process.cwd();
const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));

let regenerated = 0;
for (const pkg of lifecycle.workspaces) {
  if (pkg.status !== 'active') continue;
  const manifestPath = join(root, pkg.path, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const script = manifest.scripts?.['audio:generate']
    ? 'audio:generate'
    : manifest.scripts?.['generate:audio']
      ? 'generate:audio'
      : null;
  if (script) {
    console.log(`[audio-verify] ${pkg.packageName}: ses reçetesi yeniden koşuluyor (${script})...`);
    execFileSync('pnpm', ['--filter', pkg.packageName, script], { cwd: root, stdio: 'inherit' });
    regenerated++;
  }
}

// İzlenen ses asset'leri diff'siz olmalı: üretim koşulan paketlerde sapma
// bayat/elle-düzeltilmiş çıktı demektir; frozen ağaçlarda sapma zaten freeze
// bekçisinin de konusudur — burada tekrar görülmesi bütünlük kanıtıdır.
const audioDirs = lifecycle.workspaces
  .map((pkg) => `${pkg.path}/public/assets/audio`)
  .filter((dir) => existsSync(join(root, dir)));

if (audioDirs.length > 0) {
  execFileSync('git', ['diff', '--exit-code', '--', ...audioDirs], {
    cwd: root,
    stdio: 'inherit',
  });
}

if (regenerated > 0) {
  console.log(
    `[audio-verify] ${regenerated} aktif pakette reçete↔asset eşleşmesi doğrulandı; ` +
      `${audioDirs.length} asset ağacı diff'siz.`,
  );
} else {
  console.log(
    `[audio-verify] Aktif ses üreticisi yok; ${audioDirs.length} asset ağacında ` +
      'yalnız bütünlük doğrulandı (diff\'siz). Frozen sesin üretim kanıtı freezeTag\'dedir.',
  );
}
