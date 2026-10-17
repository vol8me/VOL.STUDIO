import { deviceBenchmarkCandidates } from './deviceApps.mjs';
import { loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** Tauri şablonunun ve jenerik kabuğun kimlikleri; ürün kimliği olamaz. */
const GENERIC = new Set([
  'com.tauri.dev',
  'com.tauri.app',
  'com.volstudio.game',
  'com.volstudio.app',
]);

/** Paket adının kimlikte aranan biçimi: `@volstudio/vol-test` → `voltest`. */
export function identitySlug(packageName) {
  return packageName
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Veri dizini ve Steam Cloud kökü Tauri kimliğinden türer; kimlik değişirse
 * kayıt yolu değişir. Bu yüzden her aktif uygulamanın kimliği ürüne özgüdür
 * (paket adını taşır), jenerik değildir ve başka uygulamayla çakışmaz.
 */
export function validateAppIdentity(candidates) {
  const problems = [];
  const seen = new Map();
  for (const { name, pkg } of candidates) {
    const id = pkg.toLowerCase();
    if (GENERIC.has(id)) {
      problems.push(`${name}: Tauri kimliği "${pkg}" jenerik; ürüne özgü olmalı.`);
    } else if (!id.replace(/[^a-z0-9]/g, '').includes(identitySlug(name))) {
      problems.push(
        `${name}: Tauri kimliği "${pkg}" paket adını ("${identitySlug(name)}") taşımıyor.`,
      );
    }
    if (seen.has(id)) problems.push(`${name}: Tauri kimliği "${pkg}" ${seen.get(id)} ile aynı.`);
    seen.set(id, name);
  }
  return problems;
}

export function validateRepoAppIdentity(root, lifecycle = loadRepoLifecycle(root)) {
  return lifecycle ? validateAppIdentity(deviceBenchmarkCandidates(root, lifecycle)) : [];
}
