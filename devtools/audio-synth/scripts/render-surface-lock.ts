/**
 * `audio:surface-lock` — registry'nin render yüzeyi kilidini yeniler.
 *
 * Kilit, her (düğüm, sürüm) çiftinin render izdüşümü özetini tutar;
 * dondurulmuş eski sürümler de ayrı anahtarla izlenir. Betik AYNI SÜRÜMDE
 * değişen bir sözleşmeyi kilide yazmayı REDDEDER: parametre alanı ya da
 * varsayılanı değişen bir düğüm sürümünü artırmalıdır, yoksa "aynı program
 * + tohum + sürüm = aynı PCM" sözü sessizce bozulur.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PROGRAM_REGISTRY } from '../src/program/catalog';
import { nodeSurface } from '../src/program/surface';
import { RENDER_SURFACE_LOCK_PATH, type RenderSurfaceLockV2 } from '../src/program/surfaceLock';
import type { Sha256 } from '../src/kernel/canonical';

const lockFile = new URL(`../${RENDER_SURFACE_LOCK_PATH}`, import.meta.url);
const previous: RenderSurfaceLockV2 | null = existsSync(lockFile)
  ? (JSON.parse(readFileSync(lockFile, 'utf8')) as RenderSurfaceLockV2)
  : null;

const nodes: Record<string, { version: number; hash: Sha256 }> = {};
const violations: string[] = [];
for (const entry of PROGRAM_REGISTRY.entries()) {
  const surface = nodeSurface(entry.id, entry.version);
  const key = `${surface.id}@${surface.version}`;
  const locked = previous?.nodes[key] ?? previous?.nodes[entry.id];
  if (locked && locked.version === surface.version && locked.hash !== surface.hash) {
    violations.push(`${key}: sözleşme değişti ama sürüm artmadı`);
  }
  nodes[key] = { version: surface.version, hash: surface.hash };
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\nKilit yazılmadı; önce düğüm sürümünü artır.\n`);
  process.exitCode = 1;
} else {
  const lock: RenderSurfaceLockV2 = { schema: 'RenderSurfaceLockV2', nodes };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`${Object.keys(nodes).length} düğüm kilitlendi.`);
}
