#!/usr/bin/env node
/**
 * Ses doğrulama kapısı — üç ayrı işi ayrı söyler.
 *
 * 1. Reçete tazeliği: AKTİF paketlerde `audio:generate`/`generate:audio`
 *    yeniden koşulur; üretim deterministik olduğu için çıktının asset ağacıyla
 *    bit-exact eşleşmesi "reçete ↔ asset taze" demektir.
 * 2. Ölçüm çekirdeği: `audio:reference-check` tanımlayan aktif paketlerde
 *    analizör, kodek sonrası fixture'larda referans araçla (FFmpeg ebur128)
 *    çapraz denetlenir.
 * 3. Sevk edilen ses: AKTİF paketlerin `public/assets/audio` ağacı kodek
 *    sonrası ölçülür ve sınıf politikasına tabi tutulur. Frozen ağaçta
 *    politika uygulanmaz — değiştirilemeyen bir varlığın ihlali kapıyı kalıcı
 *    kilitlerdi; tarihî ölçümü DESIGN'da taban çizgisi olarak durur.
 * 4. Production provenance: `audio:production-check` tanımlayan aktif
 *    paketlerde her `AudioAssetManifestV1` yalnız kendisinden doğrulanır —
 *    gömülü program yeniden render edilir (PCM kimliği), dosya çözülüp
 *    politikaya tabi tutulur, güncel araç zinciriyle yeniden kodlanıp fark
 *    sınıflanır (yalnız kodlayıcı değişikliği ses değişikliğinden ayrılır).
 *
 * Bütün workspace'lerin (frozen dahil) izlenen ses dosyalarının diff'siz
 * olduğu ayrıca doğrulanır — bu ASSET BÜTÜNLÜĞÜDÜR, üretim kanıtı değildir.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

const root = process.cwd();
const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
const QA_SCRIPT = join(root, 'devtools/audio-synth/scripts/audio-qa.ts');

function manifestOf(pkg) {
  const manifestPath = join(root, pkg.path, 'package.json');
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
}

const active = lifecycle.workspaces.filter((pkg) => pkg.status === 'active');

let regenerated = 0;
for (const pkg of active) {
  const scripts = manifestOf(pkg)?.scripts ?? {};
  const script = scripts['audio:generate']
    ? 'audio:generate'
    : scripts['generate:audio']
    ? 'generate:audio'
    : null;
  if (script) {
    console.log(`[audio-verify] ${pkg.packageName}: ses reçetesi yeniden koşuluyor (${script})...`);
    execFileSync('pnpm', ['--filter', pkg.packageName, script], { cwd: root, stdio: 'inherit' });
    regenerated++;
  }
}

let referenceChecked = 0;
for (const pkg of active) {
  if (!manifestOf(pkg)?.scripts?.['audio:reference-check']) continue;
  console.log(
    `[audio-verify] ${pkg.packageName}: ölçüm çekirdeği referansla çapraz denetleniyor...`,
  );
  execFileSync('pnpm', ['--filter', pkg.packageName, 'audio:reference-check'], {
    cwd: root,
    stdio: 'inherit',
  });
  referenceChecked++;
}

let productionChecked = 0;
for (const pkg of active) {
  if (!manifestOf(pkg)?.scripts?.['audio:production-check']) continue;
  console.log(`[audio-verify] ${pkg.packageName}: production manifest'leri doğrulanıyor...`);
  execFileSync('pnpm', ['--filter', pkg.packageName, 'audio:production-check'], {
    cwd: root,
    stdio: 'inherit',
  });
  productionChecked++;
}

const activeAudioDirs = active
  .map((pkg) => join(root, pkg.path, 'public/assets/audio'))
  .filter((dir) => existsSync(dir));
for (const dir of activeAudioDirs) {
  console.log(`[audio-verify] ${relative(root, dir)}: kodek sonrası sınıf politikası...`);
  execFileSync('pnpm', ['exec', 'tsx', QA_SCRIPT, dir, '--policy'], {
    cwd: root,
    stdio: 'inherit',
  });
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

console.log(
  `[audio-verify] reçete tazeliği: ${regenerated} aktif paket; ölçüm çekirdeği referans ` +
    `denetimi: ${referenceChecked} paket; production manifest doğrulaması: ${productionChecked} ` +
    `paket; kodek sonrası politika: ${activeAudioDirs.length} ` +
    `aktif ses ağacı; bütünlük: ${audioDirs.length} ağaç diff'siz. ` +
    "Frozen sesin üretim kanıtı freezeTag'dedir.",
);
