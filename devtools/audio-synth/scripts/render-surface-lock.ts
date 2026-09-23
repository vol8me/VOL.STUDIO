/**
 * `audio:surface-lock` — registry'nin render yüzeyi kilidini yeniler.
 *
 * Kilit, her düğümün sürümünü ve render izdüşümünün özetini tutar. Betik
 * AYNI SÜRÜMDE değişen bir sözleşmeyi kilide yazmayı REDDEDER: parametre
 * alanı ya da varsayılanı değişen bir düğüm sürümünü artırmalıdır, yoksa
 * "aynı program + tohum + sürüm = aynı PCM" sözü sessizce bozulur.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PROGRAM_REGISTRY } from '../src/program/catalog';
import { nodeSurface } from '../src/program/surface';
import { RENDER_SURFACE_LOCK_PATH, type RenderSurfaceLockV1 } from '../src/program/surfaceLock';

const lockFile = new URL(`../${RENDER_SURFACE_LOCK_PATH}`, import.meta.url);
const previous: RenderSurfaceLockV1 | null = existsSync(lockFile)
  ? (JSON.parse(readFileSync(lockFile, 'utf8')) as RenderSurfaceLockV1)
  : null;

const nodes: Record<
  string,
  { version: number; hash: RenderSurfaceLockV1['nodes'][string]['hash'] }
> = {};
const violations: string[] = [];
for (const entry of PROGRAM_REGISTRY.entries()) {
  const surface = nodeSurface(entry.id);
  const locked = previous?.nodes[entry.id];
  if (locked && locked.version === surface.version && locked.hash !== surface.hash) {
    violations.push(`${entry.id}@${surface.version}: sözleşme değişti ama sürüm artmadı`);
  }
  nodes[entry.id] = { version: surface.version, hash: surface.hash };
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\nKilit yazılmadı; önce düğüm sürümünü artır.\n`);
  process.exitCode = 1;
} else {
  const lock: RenderSurfaceLockV1 = { schema: 'RenderSurfaceLockV1', nodes };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`${Object.keys(nodes).length} düğüm kilitlendi.`);
}
