import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Git'in gördüğü her Cargo paketi kapıya girer; yeni oyun elle eklenmez. */
export function rustManifests(root) {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '**/Cargo.toml', 'Cargo.toml'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean)
    .sort();
}

export function checkRust(root, run = execFileSync) {
  const manifests = rustManifests(root);
  if (manifests.length === 0) throw new Error('Rust kapısı: Cargo.toml bulunamadı');
  for (const manifest of manifests) {
    console.log(`[rust] ${manifest}`);
    const options = { cwd: resolve(root, dirname(manifest)), stdio: 'inherit' };
    run('cargo', ['check', '--locked'], options);
    run('cargo', ['fmt', '--check'], options);
    run('cargo', ['clippy', '--locked', '--', '-D', 'warnings'], options);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkRust(process.cwd());
}
