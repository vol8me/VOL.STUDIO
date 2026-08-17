/**
 * Müzik üretim girişi — tüm müzik parçalarını render edip OGG yazar.
 *
 * Kullanım: tsx scripts/audio/generate-music.ts <çıkış-dizini>
 * Örnek:    tsx scripts/audio/generate-music.ts public/assets/audio/music
 *
 * `bpm` ve `beats` değerleri src/config/music.ts ile BİREBİR eşleşmelidir;
 * uyumsuzluk loop sınırında duyulur hataya dönüşür.
 */

import { resolve } from 'node:path';
import { writeMixOgg } from './lib/mix';
import type { TrackDef } from './lib/track';
import { hollowSignal } from './music/menu-hollow-signal';
import { eventHorizon } from './music/menu-event-horizon';
import { surgeProtocol } from './music/combat-surge-protocol';
import { sovereign } from './music/boss-sovereign';
import { terminalEcho } from './music/death-terminal-echo';
import { firstLight } from './music/victory-first-light';

const TRACKS: TrackDef[] = [
  hollowSignal,
  eventHorizon,
  surgeProtocol,
  sovereign,
  terminalEcho,
  firstLight,
];

const outDir = process.argv[2];
if (!outDir) {
  console.error('Kullanım: tsx scripts/audio/generate-music.ts <çıkış-dizini>');
  process.exit(1);
}

for (const track of TRACKS) {
  const started = Date.now();
  const mix = track.build();
  const path = resolve(outDir, track.file);
  writeMixOgg(path, mix);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const length = ((track.beats * 60) / track.bpm).toFixed(1);
  console.log(
    `[music] ${track.id.padEnd(16)} ${length.padStart(5)}s ${track.bpm} BPM ` +
      `${track.loop ? 'loop' : 'tek '} → ${track.file} (${elapsed}s)`,
  );
}
