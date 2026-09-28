import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandProgram } from '@volstudio/audio-synth/music/score';
import { renderScoreRaw } from '@volstudio/audio-synth/music/render';
import { encodeWav } from '@volstudio/audio-synth/writer';
import type { MusicProgramV1 } from '@volstudio/audio-synth/music/programTypes';
import { validateScoreStructure } from './scoreRules';
import { arcadeSignal } from './scores/arcade-signal';
import { eventHorizon } from './scores/event-horizon';
import { surgeProtocol } from './scores/surge-protocol';
import { sovereign } from './scores/sovereign';
import { terminalEcho } from './scores/terminal-echo';
import { firstLight } from './scores/first-light';
import { nullDrift } from './scores/null-drift';
import { deepCurrent } from './scores/deep-current';

/**
 * Tek parçayı dinleme için render eder: form kapısı → render → WAV + OGG.
 * Çıktı git dışında bir dinleme ağacına yazılır; ürün asset'i değildir.
 * Kullanım: tsx scripts/audio-v2/preview.ts hollow-signal [--out <dizin>]
 */

const scores: Record<string, MusicProgramV1> = {
  'arcade-signal': arcadeSignal,
  'event-horizon': eventHorizon,
  'surge-protocol': surgeProtocol,
  sovereign,
  'terminal-echo': terminalEcho,
  'first-light': firstLight,
  'null-drift': nullDrift,
  'deep-current': deepCurrent,
};

const id = process.argv[2];
if (!id || !(id in scores)) {
  console.error(`kullanım: tsx preview.ts <${Object.keys(scores).join('|')}> [--out <dizin>]`);
  process.exit(1);
}

const program = scores[id];
const issues = validateScoreStructure(program);
if (issues.length) {
  console.error(`[form kapısı] ${id} reddedildi:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const score = expandProgram(program);
const render = renderScoreRaw(score, { playback: program.playback });
const wav = encodeWav({
  channels: render.channels,
  sampleRate: render.sampleRate,
  duration: render.durationSeconds,
});

const outArg = process.argv.indexOf('--out');
const root = resolve(
  process.cwd(),
  outArg >= 0 ? process.argv[outArg + 1] : '../../.claude/listen-vol-hell',
);
mkdirSync(root, { recursive: true });

const wavPath = resolve(root, `${id}.wav`);
const oggPath = resolve(root, `${id}.ogg`);
writeFileSync(wavPath, wav);
// Dinleme kopyası hedef ses düzeyine normalize edilir; ürün mastering'i
// yayın kapısında ayrıca koşar, bu yalnız kulakla kıyas içindir.
execFileSync('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-i',
  wavPath,
  '-af',
  'loudnorm=I=-18:TP=-1.5:LRA=11',
  '-c:a',
  'libvorbis',
  '-q:a',
  '6',
  oggPath,
]);

const summary = {
  id,
  title: program.title,
  bars: program.bars,
  bpm: program.tempo.bpm,
  seconds: Number(render.durationSeconds.toFixed(2)),
  notes: score.events.length,
  sections: program.sections.map(
    (section) => `${section.id}:${section.bars[0]}-${section.bars[1]}@${section.targetEnergy}`,
  ),
  out: { wav: wavPath, ogg: oggPath },
};
writeFileSync(resolve(root, `${id}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
