import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Render önbelleğinin CORE parmak izi yalnız audio-synth'in gerçekten
 * yüklediği CORE dosyalarını kapsar: her CORE UI düzenlemesi önbelleği
 * boşa düşürmesin. Kapanış göreli import/export zincirinden çıkarılır;
 * çözülemeyen göreli yol sessizce atlanmaz, hata verir (eksik kapanış bayat
 * PCM demektir).
 */
const CORE_PACKAGE = '@volstudio/core';
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;
const RESOLVE_SUFFIXES = ['', '.ts', '.mts', '.mjs', '/index.ts'];

function listSources(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mts|mjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function specifiers(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((match) => match[1]);
}

function resolveRelative(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`kaynak kapanışı: ${specifier} çözülemedi (${from})`);
}

function exportTarget(coreDir: string, specifier: string): string {
  const exportsMap = (
    JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8')) as {
      exports: Record<string, string | { import: string }>;
    }
  ).exports;
  const key = specifier === CORE_PACKAGE ? '.' : `.${specifier.slice(CORE_PACKAGE.length)}`;
  const entry = exportsMap[key];
  if (entry === undefined) throw new Error(`kaynak kapanışı: ${specifier} CORE'da dışa açık değil`);
  return resolve(coreDir, typeof entry === 'string' ? entry : entry.import);
}

/**
 * `consumerRoot` altındaki kaynakların yüklediği CORE dosyaları, sıralı.
 * CORE içindeki göreli importlar ve CORE'un kendi paket importları izlenir.
 */
export function coreClosure(consumerRoot: string, coreDir: string): string[] {
  const pending: string[] = [];
  for (const file of listSources(consumerRoot)) {
    for (const specifier of specifiers(file)) {
      if (specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`)) {
        pending.push(exportTarget(coreDir, specifier));
      }
    }
  }
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|mts|mjs)$/.test(file)) continue;
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('.')) pending.push(resolveRelative(file, specifier));
      else if (specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`)) {
        pending.push(exportTarget(coreDir, specifier));
      }
    }
  }
  return [...seen].sort();
}
