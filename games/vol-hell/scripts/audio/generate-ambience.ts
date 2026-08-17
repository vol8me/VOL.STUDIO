/**
 * Ambiyans üretim girişi — oynanış zemin katmanlarını render edip OGG yazar.
 *
 * Kullanım: tsx scripts/audio/generate-ambience.ts <çıkış-dizini>
 * Örnek:    tsx scripts/audio/generate-ambience.ts public/assets/audio/ambience
 *
 * Ambiyans müzikten AYRI bir dizinde yaşar; bu ayrım kasıtlıdır —
 * ambiyans parçaları ölçüsüz ve melodisizdir, müzik değildir.
 */

import { resolve } from 'node:path';
import { writeMixOgg } from './lib/mix';
import type { TrackDef } from './lib/track';
import { nullDrift } from './ambience/null-drift';
import { deepCurrent } from './ambience/deep-current';

const TRACKS: TrackDef[] = [nullDrift, deepCurrent];

const outDir = process.argv[2];
if (!outDir) {
  console.error('Kullanım: tsx scripts/audio/generate-ambience.ts <çıkış-dizini>');
  process.exit(1);
}

for (const track of TRACKS) {
  const started = Date.now();
  const mix = track.build();
  const path = resolve(outDir, track.file);
  writeMixOgg(path, mix);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[ambience] ${track.id.padEnd(14)} ${mix.duration.toFixed(0)}s loop → ${
      track.file
    } (${elapsed}s)`,
  );
}
