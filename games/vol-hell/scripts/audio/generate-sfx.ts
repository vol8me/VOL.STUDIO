/**
 * SFX üretim girişi — tarif tablosundaki tüm sesleri OGG olarak yazar.
 *
 * Kullanım: tsx scripts/audio/generate-sfx.ts <çıkış-dizini>
 * Örnek:    tsx scripts/audio/generate-sfx.ts public/assets/audio/sfx
 *
 * Seviye: her ses kendi `peak` hedefine ölçeklenir (tek tepe normalize).
 * Bu SFX için doğrudur — one-shot sesler arası hiyerarşi peak ile kurulur;
 * müzikteki gibi katman dinamiği korunacak bir iç mix yoktur.
 */

import { resolve } from 'node:path';
import type { SynthesisResult } from '@volstudio/core/audio/synth';
import { writeOgg } from '@volstudio/core/audio/synth/writer';
import { SFX_SPECS } from './sfx/specs';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Kullanım: tsx scripts/audio/generate-sfx.ts <çıkış-dizini>');
  process.exit(1);
}

/** Sesi hedef tepeye ölçekler — clip imkânsız, hiyerarşi korunur. */
function scaleToPeak(result: SynthesisResult, peak: number): SynthesisResult {
  let max = 0;
  for (const ch of result.channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i] ?? 0);
      if (a > max) max = a;
    }
  }
  if (max <= 0) return result;
  const scale = peak / max;
  for (const ch of result.channels) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (ch[i] ?? 0) * scale;
    }
  }
  return result;
}

let count = 0;
for (const spec of SFX_SPECS) {
  const result = scaleToPeak(spec.render(), spec.peak);
  const path = resolve(outDir, spec.category, `${spec.name}.ogg`);
  writeOgg(path, result, { quality: 5 });
  count++;
}
console.log(`[sfx] ${count} ses üretildi → ${outDir}`);
