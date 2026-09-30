#!/usr/bin/env node
/**
 * Linux derlemesini steamrt4 SDK kabında yapar — host glibc'si sonucu etkilemez.
 *
 * Deck'in koştuğu çalışma zamanıyla aynı sürüme sabitlenmiş
 * `steamrt4/sdk:4.0.20260805.254769` imajı kullanılır (glibc 2.41). Rust
 * ikilisi, AppDir ve AppImage kap içinde üretilir; ön yüzün host'ta derlenmiş
 * olması yeterlidir (JS glibc'den bağımsızdır).
 *
 *   node scripts/linux/build-steamrt4.mjs <workspace>
 *
 * Sözleşme: paketteki hiçbir ELF GLIBC_2.41 üstü sürüm
 * istemez; bekçi çıktı AppDir'i üzerinde koşar ve ihlalde derleme düşer.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { checkGlibcCap } from './glibc-cap.mjs';
import { loadRepoLifecycle } from '../quality/workspaceLifecycle.mjs';
import { appImageAppDir, steamrt4TargetDir } from './targets.mjs';
import { syncProbeMetrics } from '../../devtools/deck/scripts/probe-metrics.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

/** Deck'te ölçülen çalışma zamanı sürümü — tek doğruluk kaynağı. */
export const STEAMRT4_SDK_IMAGE =
  'registry.gitlab.steamos.cloud/steamrt/steamrt4/sdk:4.0.20260805.254769';
export const BUILD_IMAGE_TAG = 'volstudio/steamrt4-build:4.0.20260805.254769';
/** Deck'in ölçülen glibc'si; bekçi bunun üstünü reddeder. */
export const GLIBC_CAP = '2.41';

const workspace = process.argv[2];
if (!workspace) {
  console.error('Kullanım: node scripts/linux/build-steamrt4.mjs <workspace-yolu>');
  process.exit(2);
}

const confPath = join(ROOT, workspace, 'src-tauri', 'tauri.conf.json');
if (!existsSync(confPath)) {
  console.error(
    `${workspace}: src-tauri/tauri.conf.json yok — bu workspace bir Tauri uygulaması değil.`,
  );
  process.exit(2);
}
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
const { productName } = conf;

const record = loadRepoLifecycle(ROOT)?.workspaces.find((w) => w.path === workspace);
if (record?.status === 'frozen') {
  console.error(
    `${workspace} frozen (${record.freezeTag}). Frozen ürün HEAD'de paketlenmez; ` +
      "yeniden paketleme freezeTag worktree'sindedir.",
  );
  process.exit(2);
}

// Kapta node/pnpm yoktur: `beforeBuildCommand` taşıyan uygulamaların ön
// yüzünü host'ta derleriz ve kaba `VOL_FRONTEND_PREBUILT=1` geçeriz ki
// `tauri build` o komutu `--config` ile sussun (bkz. steamrt4-build.sh).
const { beforeBuildCommand, frontendDist } = conf.build ?? {};
let frontendPrebuilt = false;
if (beforeBuildCommand) {
  console.log(`[steamrt4] ön yüz host'ta derleniyor: ${beforeBuildCommand}`);
  execFileSync('sh', ['-c', beforeBuildCommand], { cwd: ROOT, stdio: 'inherit' });
  const distDir = join(ROOT, workspace, String(frontendDist ?? '').replace(/^(\.\.\/)+/, ''));
  if (!existsSync(distDir)) {
    console.error(
      `${workspace}: beforeBuildCommand koştu ama ${frontendDist} üretmedi — derleme iptal.`,
    );
    process.exit(1);
  }
  frontendPrebuilt = true;
}

/** Sonda index.html'inde `vendor/` başvurusu varsa node_modules'den kopyala. */
function syncVendorAssets() {
  const web = join(ROOT, workspace, 'web');
  const htmlPath = join(web, 'index.html');
  if (!existsSync(htmlPath)) return;
  const html = readFileSync(htmlPath, 'utf8');
  const require = createRequire(join(ROOT, workspace, 'package.json'));
  for (const match of html.matchAll(/vendor\/([\w.-]+?)\.min\.js/g)) {
    const pkg = match[1];
    // `exports` haritası `./dist/` alt yollarını açmaz (phaser 4.x);
    // dışa açık `package.json` üzerinden paket köküne inilir.
    const source = join(dirname(require.resolve(`${pkg}/package.json`)), 'dist', `${pkg}.min.js`);
    const target = join(web, 'vendor', `${pkg}.min.js`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`[steamrt4] vendor: ${pkg}.min.js kopyalandı`);
  }
}

/**
 * Grafik sürücüsü yığını (GBM/EGL/GL/DRM) pakete GİREMEZ: Deck'te bu
 * kütüphaneleri Steam Linux Runtime sağlar; paketlenen kopya sürücü
 * sürümüyle çakışır. İsim önekleriyle taranır.
 */
const BANNED_DRIVER_LIBS = ['libgbm', 'libEGL', 'libGL', 'libdrm'];

function findBannedDriverLibs(dir) {
  const found = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (BANNED_DRIVER_LIBS.some((lib) => entry.name.startsWith(`${lib}.so`))) {
        found.push(path.replace(`${ROOT}/`, ''));
      }
    }
  };
  walk(dir);
  return found;
}

/** OGG çözümleme zinciri gerçek bir dosya ister; yoksa küçük bir ses üretilir. */
function ensureProbeAudio() {
  // Yalnız sonda uygulaması bu dosyayı tüketir (web/ dizini ona özgüdür);
  // gerçek oyunlarda üretilmiş artık bırakmaz.
  if (!existsSync(join(ROOT, workspace, 'web'))) return;
  const audioDir = join(ROOT, workspace, 'public', 'assets', 'audio');
  const probe = join(audioDir, 'probe.ogg');
  if (existsSync(probe)) return;
  try {
    mkdirSync(audioDir, { recursive: true });
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.5',
        // Stereo ZORUNLU: decode doğrulaması `deinterleave`'in iki src
        // pad'ini de bağlar; mono dosyada src_1 bağsız kalır ve
        // gst-launch EOS'a ulaşmadan asılı kalır.
        '-ac',
        '2',
        '-q:a',
        '4',
        probe,
      ],
      { stdio: 'pipe' },
    );
    console.log("[steamrt4] ölçüm OGG'si üretildi: public/assets/audio/probe.ogg");
  } catch {
    console.warn('[steamrt4] ffmpeg yok — OGG zincir sondası atlanacak.');
  }
}

function imageExists(tag) {
  try {
    execFileSync('podman', ['image', 'exists', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

syncVendorAssets();
if (existsSync(join(ROOT, workspace, 'web', 'probe.js'))) {
  syncProbeMetrics(ROOT, join(ROOT, workspace, 'web'));
}
ensureProbeAudio();

if (!imageExists(BUILD_IMAGE_TAG)) {
  console.log(`[steamrt4] derleme imajı kuruluyor: ${BUILD_IMAGE_TAG}`);
  execFileSync(
    'podman',
    ['build', '-t', BUILD_IMAGE_TAG, '-f', join(ROOT, 'scripts', 'linux', 'steamrt4.Containerfile'), ROOT],
    { stdio: 'inherit' },
  );
}

// Crate önbelleği adlı birimde tutulur; AppImage araç önbelleği host'tan paylaşılır.
execFileSync(
  'podman',
  [
    'run',
    '--rm',
    '-v',
    `${ROOT}:/work:Z`,
    '-v',
    'volstudio-cargo-registry:/root/.cargo/registry',
    '-v',
    'volstudio-cargo-git:/root/.cargo/git',
    '-v',
    // SELinux etiketi (z) gerekli: etiketsiz host dizini kabin içinde
    // yazılamaz ve `tauri build` AppRun indirmesinde EACCES ile düşer.
    `${process.env.HOME}/.cache/tauri:/root/.cache/tauri:z`,
    // İsteğe bağlı cargo feature'ları (örn. steamworks) kabıa geçer.
    ...(process.env.VOL_CARGO_FEATURES
      ? ['-e', `VOL_CARGO_FEATURES=${process.env.VOL_CARGO_FEATURES}`]
      : []),
    // Ön yüz host'ta derlendiyse kap `beforeBuildCommand`'i `--config` ile sussun.
    ...(frontendPrebuilt ? ['-e', 'VOL_FRONTEND_PREBUILT=1'] : []),
    BUILD_IMAGE_TAG,
    'bash',
    'scripts/linux/steamrt4-build.sh',
    workspace,
  ],
  { stdio: 'inherit' },
);

const appDir = appImageAppDir(steamrt4TargetDir(ROOT), productName);
if (!existsSync(appDir)) {
  console.error(`[steamrt4] AppDir üretilemedi: ${appDir}`);
  process.exit(1);
}

const { files, offenders } = checkGlibcCap(appDir, GLIBC_CAP);
if (offenders.length > 0) {
  console.error(`[glibc] ${offenders.length} ELF, GLIBC_${GLIBC_CAP} üstü sürüm istiyor:`);
  for (const { path, needs } of offenders.slice(0, 10)) {
    console.error(`  ${path.replace(`${ROOT}/`, '')} → ${needs.join(', ')}`);
  }
  process.exit(1);
}
console.log(`[glibc] ${files} ELF tarandı — hepsi ≤ GLIBC_${GLIBC_CAP}.`);

const banned = findBannedDriverLibs(appDir);
if (banned.length > 0) {
  console.error(`[steamrt4] Sürücü yığını paketlenemez (host/SLR4 sağlar): ${banned.join(', ')}`);
  process.exit(1);
}
console.log(`[steamrt4] AppDir hazır: ${appDir}`);
