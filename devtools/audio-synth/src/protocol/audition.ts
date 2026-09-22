import type { ProgramRender } from '../program/render';
import { writeWav } from '../writer';
import { ProtocolError } from './errors';
import { resolveInside, toRepoRelative } from './fs';

/** Git'e girmeyen yerel çıktı kökü (`devtools/*\/export/` yok sayılır). */
export const EXPORT_ROOT = 'devtools/audio-synth/export';

/**
 * Dinleme kopyası yazan TEK yol (job render'ı, arama adayları, canary'ler).
 * Yol `EXPORT_ROOT` altında olmak zorundadır: dinleme kopyası hiçbir zaman
 * publish hedefine, job ya da arama ağacına düşmez. 16-bit WAV kanonik
 * kimlik taşımaz — kimlik her zaman programdan yeniden render edilen PCM'dir.
 */
export function writeAuditionCopy(
  repoRoot: string,
  relative: string,
  render: ProgramRender,
): string {
  if (!relative.startsWith(`${EXPORT_ROOT}/`)) {
    throw new ProtocolError(
      'path',
      `dinleme kopyası yalnız ${EXPORT_ROOT}/ altına yazılır`,
      relative,
    );
  }
  const file = resolveInside(repoRoot, relative, 'audition');
  writeWav(file, render);
  return toRepoRelative(repoRoot, file);
}
