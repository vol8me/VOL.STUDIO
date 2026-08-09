/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync as fsReaddirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Presets, synth, type SynthParams, type Waveform } from '@volstudio/core/audio/synth';
import { writeWav } from '@volstudio/core/audio/synth/writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sounds');

type SoundDef = {
  path: string;
  params: SynthParams;
};

const sounds: SoundDef[] = [
  { path: 'combat/fire.wav', params: Presets.fire() },
  { path: 'combat/enemy-hit.wav', params: Presets.hit(650, 0.08) },
  {
    path: 'combat/enemy-death.wav',
    params: {
      ...Presets.explosion(180, 0.35),
      wave: ['pink', 'sine'] as Waveform[],
      slide: -120,
      envelope: {
        attack: 0.01,
        hold: 0.05,
        decay: 0.15,
        sustain: 0,
        release: 0.25,
        sustainLevel: 0,
      },
      lowpass: { cutoff: 700, slide: -550 },
      gain: 0.8,
    },
  },
  { path: 'combat/bullet-bounce.wav', params: Presets.bulletBounce() },
  { path: 'player/hurt.wav', params: Presets.hurt(140, 0.22) },
  { path: 'player/death.wav', params: Presets.death(220, 0.7) },
  { path: 'player/dash.wav', params: Presets.dash(800, 0.2) },
  { path: 'ui/menu-blip.wav', params: Presets.blip(1200, 0.06) },
  { path: 'ui/pause.wav', params: Presets.pause() },
  { path: 'ui/resume.wav', params: Presets.resume() },
  { path: 'ui/restart.wav', params: Presets.restart() },
];

function cleanOldSounds() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    return;
  }

  function clearWavs(dir: string) {
    for (const entry of fsReaddirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        clearWavs(full);
      } else if (full.endsWith('.wav')) {
        rmSync(full);
      }
    }
  }

  clearWavs(OUT_DIR);
}

function main() {
  cleanOldSounds();

  for (const { path: relPath, params } of sounds) {
    const fullPath = join(OUT_DIR, relPath);
    const result = synth(params.duration, params);
    writeWav(fullPath, result);
    console.log(
      `Generated: ${relPath} (${result.channels[0]?.length ?? 0} samples, ${result.duration.toFixed(
        3,
      )}s)`,
    );
  }

  console.log(`\nAll sounds generated in ${OUT_DIR}`);
}

main();
