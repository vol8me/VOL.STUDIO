import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWav } from '../src/audio/synth/writer';
import { ProceduralStemGenerator } from '../src/audio/music/procedural';
import type { ProceduralStemOptions } from '../src/audio/music/types';
import type { SynthesisResult } from '../src/audio/synth/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDirArg = process.argv[2];

if (!outDirArg) {
  console.error('Kullanım: tsx scripts/generate-music.ts <out-dir>');
  process.exit(1);
}

const outDir = resolve(outDirArg);

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

interface GenerateSpec {
  name: string;
  render: (opts: ProceduralStemOptions) => SynthesisResult;
  options: ProceduralStemOptions;
}

const generator = new ProceduralStemGenerator();

const specs: GenerateSpec[] = [
  {
    name: 'menu-ambient-pad',
    render: (opts) => generator.renderPad(opts),
    options: { duration: 16, frequency: 175, wave: ['sine', 'triangle'], gain: 0.85 },
  },
  {
    name: 'combat-bass',
    render: (opts) => generator.renderBass(opts),
    options: { duration: 8, frequency: 60, wave: 'sawtooth', gain: 0.8 },
  },
  {
    name: 'combat-drone',
    render: (opts) => generator.renderDrone(opts),
    options: { duration: 16, frequency: 110, wave: 'sawtooth', gain: 0.7 },
  },
  {
    name: 'boss-pad',
    render: (opts) => generator.renderPad(opts),
    options: { duration: 16, frequency: 140, wave: ['sine', 'sawtooth'], gain: 0.75 },
  },
  {
    name: 'exploration-ambience',
    render: (opts) => generator.renderAmbientNoise(opts as Omit<ProceduralStemOptions, 'wave'>),
    options: { duration: 20, frequency: 80, gain: 0.6 },
  },
];

for (const spec of specs) {
  const result = spec.render(spec.options);
  const outPath = join(outDir, `${spec.name}.wav`);
  writeWav(outPath, result);
  console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}

console.log(`\nAll music stems written to ${outDir}`);
