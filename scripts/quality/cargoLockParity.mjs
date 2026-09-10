import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';

/**
 * TAURİ SÜRÜM EŞİTLİĞİ.
 *
 * Paylaşılan native runtime (`tauri-v2/src-tauri`) bir `rlib`tir ve her oyun
 * onu KENDİ `Cargo.lock`uyla derler. Kilitler birbirinden bağımsız çözülür:
 * bir oyunda `cargo update`, runtime'ı onun kendi kilidinde hiç sınanmamış bir
 * sürümle derletir ve `cargo check --locked` bunu göremez — her kilit kendi
 * içinde tutarlıdır.
 *
 * Ölçüldü: `tauri-plugin-log` ve `tauri-plugin-sql` runtime kilidinde
 * 2.9.0 / 2.4.0, üç oyunda 2.9.1 / 2.4.1 çözülüyordu.
 */
export const WATCHED_CRATES = /^(?:tauri(?:-.+)?|wry|tao)$/;

/** `Cargo.lock` metninden paket adı → sıralı sürüm listesi. */
export function parseLockPackages(text) {
  const packages = new Map();
  for (const match of text.matchAll(/\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g)) {
    const versions = packages.get(match[1]) ?? [];
    versions.push(match[2]);
    packages.set(match[1], versions);
  }
  for (const versions of packages.values()) versions.sort();
  return packages;
}

/**
 * @param root Repo kökü.
 * @param locks Karşılaştırılacak kilitler; verilmezse çalışma ağacındaki hepsi.
 * @returns Sorun listesi; boşsa izlenen her crate her kilitte aynı sürümdedir.
 */
export function validateCargoLockParity(root, locks = workingTreeFiles(root, ['*Cargo.lock'])) {
  const byCrate = new Map();
  for (const lock of locks) {
    for (const [name, versions] of parseLockPackages(readFileSync(join(root, lock), 'utf8'))) {
      if (!WATCHED_CRATES.test(name)) continue;
      const seen = byCrate.get(name) ?? new Map();
      seen.set(lock, versions.join(', '));
      byCrate.set(name, seen);
    }
  }

  const problems = [];
  for (const [name, seen] of [...byCrate].sort(([a], [b]) => a.localeCompare(b))) {
    if (new Set(seen.values()).size <= 1) continue;
    const detail = [...seen].map(([lock, versions]) => `${lock} → ${versions}`).join('; ');
    problems.push(
      `${name} kilitler arasında farklı sürüm çözülüyor (${detail}). ` +
        'Paylaşılan runtime her oyunda aynı Tauri ile derlenmeli: ' +
        '`cargo update -p <crate> --precise <sürüm>` ile hizala.',
    );
  }
  return problems;
}
