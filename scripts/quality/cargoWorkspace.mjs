import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/**
 * TEK RUST WORKSPACE.
 *
 * Paylaşılan kabuk, eklentiler ve onları tüketen uygulamalar kökteki tek
 * `Cargo.lock` ile derlenir: bir crate'te `cargo update` başka bir crate'in hiç
 * sınanmamış bir sürümle derlenmesine yol açamaz. Aktif her crate kök
 * workspace'in üyesidir, kendi kilidi yoktur ve profil taşımaz (üyedeki
 * profil workspace'te sessizce yok sayılır). Frozen ağaçlar kendi kilidiyle
 * donar ve bu kuralın dışındadır.
 */

/** `members = [...]` dizisi; tek segment `*` jokeri desteklenir. */
export function workspaceMembers(manifestText) {
  const block = /^\[workspace\][\s\S]*?^members\s*=\s*\[([\s\S]*?)\]/m.exec(manifestText);
  if (!block) return null;
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

export function matchesMember(crateDir, pattern) {
  const regex = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]+')}$`,
  );
  return regex.test(crateDir);
}

export function validateCargoWorkspace(
  root,
  manifests = workingTreeFiles(root, ['*Cargo.toml']),
  locks = workingTreeFiles(root, ['*Cargo.lock']),
  lifecycle = loadRepoLifecycle(root),
) {
  if (!manifests.includes('Cargo.toml')) return ['Kökte Rust workspace (Cargo.toml) yok.'];
  const rootText = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const members = workspaceMembers(rootText);
  if (!members) return ['Kök Cargo.toml bir `[workspace]` ve `members` listesi taşımıyor.'];

  const problems = [];
  for (const lock of excludingFrozenPaths(locks, lifecycle)) {
    if (lock !== 'Cargo.lock') {
      problems.push(`${lock}: aktif crate kendi kilidini taşımaz; tek kilit kökteki Cargo.lock.`);
    }
  }
  for (const manifest of excludingFrozenPaths(manifests, lifecycle)) {
    if (manifest === 'Cargo.toml') continue;
    const crateDir = dirname(manifest);
    if (!members.some((pattern) => matchesMember(crateDir, pattern))) {
      problems.push(`${manifest}: kök workspace üyesi değil (members listesine ekle).`);
    }
    if (/^\[profile\./m.test(readFileSync(join(root, manifest), 'utf8'))) {
      problems.push(`${manifest}: profil yalnız kök Cargo.toml'da tanımlanır.`);
    }
  }
  return problems;
}
