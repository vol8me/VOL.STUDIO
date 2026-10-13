import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Çalışma zamanında tek örnek olması gereken paketler. Colyseus sunucusu `network`ün `@colyseus/core`
 * kopyasında kurulur, odalar ve `matchMaker` oyunun kopyasından gelir; iki paket farklı sürüm
 * bildirirse pnpm iki kopya kurar, eşleştirici ikiye bölünür ve hiçbir yerde hata çıkmaz.
 * Phaser için de aynı: CORE ile oyun aynı örneği paylaşmalıdır.
 */
export const SINGLE_INSTANCE_PACKAGES = [
  '@colyseus/core',
  '@colyseus/schema',
  '@colyseus/sdk',
  '@colyseus/ws-transport',
  'phaser',
];

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function workspaceManifests(root) {
  const dirs = ['core', 'tauri-v2', 'network'];
  for (const group of ['games', 'devtools']) {
    if (!existsSync(join(root, group))) continue;
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(`${group}/${entry.name}`);
    }
  }
  return dirs
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .map((dir) => ({
      dir,
      manifest: JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')),
    }));
}

/** Aynı paket için workspace paketleri arasında birden çok sürüm belirteci varsa sorunları döndürür. */
export function validateSingleInstance(root, packages = SINGLE_INSTANCE_PACKAGES) {
  const problems = [];
  const manifests = workspaceManifests(root);
  for (const name of packages) {
    const specifiers = new Map();
    for (const { dir, manifest } of manifests) {
      for (const field of FIELDS) {
        const specifier = manifest[field]?.[name];
        if (specifier === undefined) continue;
        specifiers.set(specifier, [...(specifiers.get(specifier) ?? []), dir]);
      }
    }
    if (specifiers.size > 1) {
      const detail = [...specifiers]
        .map(([specifier, dirs]) => `"${specifier}" (${[...new Set(dirs)].join(', ')})`)
        .join(' ≠ ');
      problems.push(`${name} paketlerde farklı sürüm belirtiyor: ${detail}.`);
    }
  }
  return problems;
}
