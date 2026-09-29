import { join } from 'node:path';

/**
 * Cargo çıktısının yeri. Bütün crate'ler kök workspace'in `target/`ini
 * paylaşır; steamrt4 kabı farklı glibc ve rustc ile derlediği için kendi alt
 * dizinine yazar, host derlemesinin artefaktlarıyla karışmaz.
 */
export const STEAMRT4_TARGET_SUBDIR = 'steamrt4';

export function cargoTargetDir(root, env = process.env) {
  return env.CARGO_TARGET_DIR ?? join(root, 'target');
}

export function steamrt4TargetDir(root) {
  return join(root, 'target', STEAMRT4_TARGET_SUBDIR);
}

/** Tauri'nin AppImage paketlemesinin AppDir'i. */
export function appImageAppDir(targetDir, productName) {
  return join(targetDir, 'release', 'bundle', 'appimage', `${productName}.AppDir`);
}
