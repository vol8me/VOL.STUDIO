import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { nodeRuntimeProblem } from './quality/nodeRuntime.mjs';

const failures = [];

function command(label, executable, args, guidance) {
  const result = spawnSync(executable, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`${label}: bulunamadı. ${guidance}`);
    console.error(`${label}: YOK`);
    return;
  }
  const firstLine = `${result.stdout}${result.stderr}`.trim().split('\n')[0];
  console.log(`${label}: ${firstLine}`);
}

function checkJust() {
  const direct = spawnSync('just', ['--version'], { encoding: 'utf8' });
  if (direct.status === 0) {
    console.log(`just: ${direct.stdout.trim().split('\n')[0]}`);
    return;
  }
  const local = spawnSync('./node_modules/.bin/just', ['--version'], { encoding: 'utf8' });
  if (local.status === 0) {
    console.log(`just: ${local.stdout.trim().split('\n')[0]} (local devDependency)`);
    return;
  }
  failures.push('just: bulunamadı. pnpm install ile exact rust-just paketini kur.');
  console.error('just: YOK');
}

function checkCargoAudit() {
  const direct = spawnSync('cargo-audit', ['--version'], { encoding: 'utf8' });
  if (direct.status === 0) {
    console.log(`cargo-audit: ${direct.stdout.trim().split('\n')[0]}`);
    return;
  }
  const cargoSub = spawnSync('cargo', ['audit', '--version'], { encoding: 'utf8' });
  if (cargoSub.status === 0) {
    console.log(`cargo-audit: ${cargoSub.stdout.trim().split('\n')[0]}`);
    return;
  }
  failures.push('cargo-audit: bulunamadı. `cargo install cargo-audit --locked` komutunu çalıştır.');
  console.error('cargo-audit: YOK');
}

const nodeProblem = nodeRuntimeProblem(resolve(import.meta.dirname, '..'));
console.log(`Node: ${process.versions.node} (.node-version)`);
if (nodeProblem) failures.push(nodeProblem);
command(
  'pnpm',
  'pnpm',
  ['--version'],
  'corepack enable && corepack prepare pnpm@11.18.0 --activate',
);
command('Rust', 'rustc', ['--version'], 'https://rustup.rs üzerinden Rust kur.');
command('Cargo', 'cargo', ['--version'], 'https://rustup.rs üzerinden Cargo kur.');
checkJust();
command('FFmpeg', 'ffmpeg', ['-version'], 'Dağıtım paket yöneticisinden ffmpeg kur.');
checkCargoAudit();

const tauri = spawnSync('pkg-config', ['--exists', 'gtk+-3.0', 'webkit2gtk-4.1']);
if (tauri.status === 0) {
  console.log('Tauri sistem deps: OK');
} else {
  failures.push(
    'Tauri sistem deps: eksik. Fedora için gtk3-devel ve webkit2gtk4.1-devel; Debian/Ubuntu için libgtk-3-dev ve libwebkit2gtk-4.1-dev kur.',
  );
  console.error('Tauri sistem deps: YOK');
}

// E2E WebKit projesi Playwright'ın indirdiği MiniBrowser'ı koşar; eksik paylaşımlı
// kütüphane ancak test anında "browser has been closed" olarak görünür.
function checkPlaywrightWebkit() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache', 'ms-playwright');
  const installs = existsSync(cache)
    ? readdirSync(cache).filter((name) => name.startsWith('webkit-'))
    : [];
  if (installs.length === 0) {
    failures.push(
      'Playwright WebKit: kurulu değil. `pnpm --filter @volstudio/vol-ui exec playwright install webkit`.',
    );
    console.error('Playwright WebKit: YOK');
    return;
  }
  for (const install of installs) {
    const browser = join(cache, install, 'minibrowser-wpe', 'MiniBrowser');
    if (!existsSync(browser)) continue;
    const run = spawnSync(browser, ['--help'], { encoding: 'utf8', timeout: 10_000 });
    const missing = /error while loading shared libraries: (\S+)/.exec(run.stderr ?? '');
    if (missing) {
      failures.push(
        `Playwright WebKit (${install}): ${
          missing[1]
        } yüklenemiyor. Dağıtım bu sürümü sağlamıyorsa kütüphane ${join(
          cache,
          install,
          'minibrowser-wpe',
          'sys',
          'lib',
        )} altına konur.`,
      );
      console.error(`Playwright WebKit (${install}): EKSİK KÜTÜPHANE`);
    } else {
      console.log(`Playwright WebKit (${install}): OK`);
    }
  }
}

checkPlaywrightWebkit();

if (failures.length > 0) {
  console.error('\n[doctor] Ortam sorunları:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[doctor] OK');
}
