import { spawnSync } from './quality/command.mjs';
import { checkNativeLink } from './quality/nativeLink.mjs';
import { checkAndroidToolchain } from './quality/androidToolchain.mjs';
import { resolve } from 'node:path';
import { nodeRuntimeProblem } from './quality/nodeRuntime.mjs';
import { bashShell, bashShellWarning } from './quality/gitBash.mjs';
import { listWorkspacePackages, loadRepoLifecycle } from './quality/workspaceLifecycle.mjs';
import { selectActivePackages } from './quality/runActive.mjs';
import { checkPlaywrightRuntime } from './quality/playwrightRuntime.mjs';

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

function checkBash() {
  const shell = bashShell();
  if (!shell.ok) {
    failures.push(shell.problem);
    console.error(`bash: SORUN — ${shell.problem}`);
    return;
  }
  console.log(`bash: ${shell.path} (${shell.source})`);
  // Gölge kapıyı düşürmez: kabuk Git kurulumuna sabitli. Yine de PATH'te
  // durması ileride başka bir çağıranı Linux'a düşürebileceği için raporlanır.
  const warning = bashShellWarning();
  if (warning) console.error(`bash: UYARI — ${warning}`);
}

function checkNativeLinker() {
  if (process.platform !== 'win32') return;
  const result = checkNativeLink();
  if (result.ok) {
    console.log(`MSVC: ${result.output}`);
    return;
  }
  failures.push(
    `MSVC: Rust link probu başarısız. C++ Build Tools ve Windows SDK kurulumunu kontrol et. ${result.output}`,
  );
  console.error('MSVC: Rust link probu BAŞARISIZ');
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
checkBash();
command(
  'pnpm',
  'pnpm',
  ['--version'],
  'corepack enable && corepack prepare pnpm@11.18.0 --activate',
);
command('Rust', 'rustc', ['--version'], 'https://rustup.rs üzerinden Rust kur.');
command('Cargo', 'cargo', ['--version'], 'https://rustup.rs üzerinden Cargo kur.');
checkNativeLinker();
checkJust();
command('FFmpeg', 'ffmpeg', ['-version'], 'Dağıtım paket yöneticisinden ffmpeg kur.');
checkCargoAudit();

if (process.argv.includes('--android')) {
  const android = checkAndroidToolchain();
  failures.push(...android.problems.map((problem) => `Android: ${problem}`));
  console.log(`Android toolchain: ${android.problems.length ? 'SORUN' : 'OK'}`);
}

// GTK/WebKit derleme bağımlılıkları yalnız Linux'ta gerekir; Windows ve macOS
// WebView2/WebKit'i işletim sistemi sağlar. Bu denetim Linux dışında koşsaydı
// ya eksik diye kırmızı verir ya da — WSL'in `pkg-config`'i görünürken —
// Linux'un yeşilini Windows'a yazardı.
if (process.platform === 'linux') {
  const tauri = spawnSync('pkg-config', ['--exists', 'gtk+-3.0', 'webkit2gtk-4.1']);
  if (tauri.status === 0) {
    console.log('Tauri sistem deps: OK');
  } else {
    failures.push(
      'Tauri sistem deps: eksik. Fedora için gtk3-devel ve webkit2gtk4.1-devel; Debian/Ubuntu için libgtk-3-dev ve libwebkit2gtk-4.1-dev kur.',
    );
    console.error('Tauri sistem deps: YOK');
  }
} else {
  console.log(`Tauri sistem deps: Linux dışında gerekmiyor (${process.platform})`);
}

const root = resolve(import.meta.dirname, '..');
const lifecycle = loadRepoLifecycle(root);
for (const workspace of selectActivePackages(lifecycle, listWorkspacePackages(root))) {
  if (!workspace.scripts?.['test:e2e']) continue;
  const result = checkPlaywrightRuntime(workspace.name);
  if (result.ok) console.log(`Playwright (${workspace.name}): Chromium + WebKit OK`);
  else {
    failures.push(`Playwright (${workspace.name}): ${result.output}`);
    console.error(`Playwright (${workspace.name}): YOK`);
  }
}

if (failures.length > 0) {
  console.error('\n[doctor] Ortam sorunları:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[doctor] OK');
}
