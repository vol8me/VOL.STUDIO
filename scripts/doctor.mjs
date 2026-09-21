import { spawnSync } from 'node:child_process';

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

command('Node', 'node', ['--version'], 'Node 20.19+ veya 22.12+ kur.');
command(
  'pnpm',
  'pnpm',
  ['--version'],
  'corepack enable && corepack prepare pnpm@11.18.0 --activate',
);
command('Rust', 'rustc', ['--version'], 'https://rustup.rs üzerinden Rust kur.');
command('Cargo', 'cargo', ['--version'], 'https://rustup.rs üzerinden Cargo kur.');
command('just', 'just', ['--version'], 'pnpm install ile exact rust-just paketini kur.');
command('FFmpeg', 'ffmpeg', ['-version'], 'Dağıtım paket yöneticisinden ffmpeg kur.');
command(
  'cargo-audit',
  'cargo-audit',
  ['--version'],
  '`cargo install cargo-audit --locked` komutunu çalıştır.',
);

const tauri = spawnSync('pkg-config', ['--exists', 'gtk+-3.0', 'webkit2gtk-4.1']);
if (tauri.status === 0) {
  console.log('Tauri sistem deps: OK');
} else {
  failures.push(
    'Tauri sistem deps: eksik. Fedora için gtk3-devel ve webkit2gtk4.1-devel; Debian/Ubuntu için libgtk-3-dev ve libwebkit2gtk-4.1-dev kur.',
  );
  console.error('Tauri sistem deps: YOK');
}

if (failures.length > 0) {
  console.error('\n[doctor] Ortam sorunları:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[doctor] OK');
}
