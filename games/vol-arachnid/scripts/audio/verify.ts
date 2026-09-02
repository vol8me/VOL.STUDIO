/** Gönderilen VOL.ARACHNID OGG'leri için başarısız olabilen kalite sözleşmesi. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ARACHNID_AMBIENCE_DURATION_SECONDS } from '../../src/config/audio';

interface DecodedAudio {
  channels: [Float32Array, Float32Array];
  sampleRate: number;
}

interface Measurements {
  peak: number;
  rms: number;
  dc: number;
  correlation: number;
}

const EXPECTED_DURATIONS: Readonly<Record<string, number>> = {
  'sfx/step-1.ogg': 0.18,
  'sfx/step-2.ogg': 0.18,
  'sfx/step-3.ogg': 0.18,
  'sfx/step-4.ogg': 0.18,
  'sfx/dash-launch.ogg': 0.44,
  'sfx/dash-land.ogg': 0.62,
  'sfx/wall-impact.ogg': 0.78,
  'ambience/hollow.ogg': ARACHNID_AMBIENCE_DURATION_SECONDS,
};

function decode(path: string): DecodedAudio {
  // Önce dosyanın varlığını açık bir ENOENT ile bildir; ffprobe'un genel
  // hatası eksik asset'in adını saklamasın.
  readFileSync(path);
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=sample_rate,channels',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  if (probe.status !== 0) throw new Error(`ffprobe okuyamadı: ${path}`);
  const [sampleRateRaw, channelCountRaw] = probe.stdout.trim().split(/\s+/);
  const sampleRate = Number(sampleRateRaw);
  const channelCount = Number(channelCountRaw);
  if (channelCount !== 2) throw new Error(`${path}: stereo değil (${channelCount} kanal)`);

  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-'], {
    maxBuffer: 1024 * 1024 * 512,
  });
  if (decoded.status !== 0) throw new Error(`ffmpeg çözemedi: ${path}`);
  const frameCount = Math.floor(decoded.stdout.length / 4 / channelCount);
  const channels: [Float32Array, Float32Array] = [
    new Float32Array(frameCount),
    new Float32Array(frameCount),
  ];
  for (let frame = 0; frame < frameCount; frame++) {
    channels[0][frame] = decoded.stdout.readFloatLE(frame * 8);
    channels[1][frame] = decoded.stdout.readFloatLE(frame * 8 + 4);
  }
  return { channels, sampleRate };
}

function measure(audio: DecodedAudio): Measurements {
  const [left, right] = audio.channels;
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let cross = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index++) {
    const leftSample = left[index]!;
    const rightSample = right[index]!;
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
    sumSquares += (leftSample * leftSample + rightSample * rightSample) * 0.5;
    sum += (leftSample + rightSample) * 0.5;
    cross += leftSample * rightSample;
    leftSquares += leftSample * leftSample;
    rightSquares += rightSample * rightSample;
  }
  return {
    peak,
    rms: Math.sqrt(sumSquares / left.length),
    dc: sum / left.length,
    correlation: cross / Math.max(Number.EPSILON, Math.sqrt(leftSquares * rightSquares)),
  };
}

function windowRms(audio: DecodedAudio, start: number, length: number): number {
  const [left, right] = audio.channels;
  const end = Math.min(left.length, start + length);
  let sum = 0;
  for (let index = start; index < end; index++) {
    sum += (left[index]! ** 2 + right[index]! ** 2) * 0.5;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const rootArg = process.argv[2];
if (!rootArg) throw new Error('Kullanım: tsx scripts/audio/verify.ts <audio-dizini>');
const root = resolve(rootArg);
const measured = new Map<string, Measurements>();

for (const [relativePath, expectedDuration] of Object.entries(EXPECTED_DURATIONS)) {
  const audio = decode(resolve(root, relativePath));
  const duration = audio.channels[0].length / audio.sampleRate;
  const metrics = measure(audio);
  measured.set(relativePath, metrics);

  assert(
    audio.sampleRate === 48_000,
    `${relativePath}: örnek oranı ${audio.sampleRate}, 48000 değil`,
  );
  assert(
    Math.abs(duration - expectedDuration) <= 0.025,
    `${relativePath}: süre ${duration.toFixed(3)} s, beklenen ${expectedDuration.toFixed(3)} s`,
  );
  assert(metrics.peak < 0.98, `${relativePath}: headroom yok (${metrics.peak.toFixed(3)})`);
  assert(metrics.peak > 0.08, `${relativePath}: neredeyse sessiz (${metrics.peak.toFixed(3)})`);
  assert(
    Math.abs(metrics.dc) < 0.002,
    `${relativePath}: DC sapması ${metrics.dc.toExponential(2)}`,
  );
  assert(metrics.correlation < 0.995, `${relativePath}: stereo alan fiilen mono`);
}

const stepPeak = Math.max(
  ...[1, 2, 3, 4].map((index) => measured.get(`sfx/step-${index}.ogg`)!.peak),
);
const launchPeak = measured.get('sfx/dash-launch.ogg')!.peak;
const landPeak = measured.get('sfx/dash-land.ogg')!.peak;
const wallPeak = measured.get('sfx/wall-impact.ogg')!.peak;
assert(stepPeak < launchPeak, 'Ses hiyerarşisi bozuk: adım, atılım kalkışından yüksek');
assert(launchPeak < landPeak, 'Ses hiyerarşisi bozuk: kalkış, inişten yüksek');
assert(landPeak < wallPeak, 'Ses hiyerarşisi bozuk: iniş, duvar çarpmasından yüksek');

const ambience = decode(resolve(root, 'ambience/hollow.ogg'));
const ambienceMetrics = measured.get('ambience/hollow.ogg')!;
const windowLength = Math.round(0.75 * ambience.sampleRate);
const startRms = windowRms(ambience, 0, windowLength);
const endRms = windowRms(ambience, ambience.channels[0].length - windowLength, windowLength);
const seamJump = Math.max(
  Math.abs(ambience.channels[0][0]! - ambience.channels[0].at(-1)!),
  Math.abs(ambience.channels[1][0]! - ambience.channels[1].at(-1)!),
);
assert(startRms > ambienceMetrics.rms * 0.45, 'Ambiyans loop başında sessizliğe düşüyor');
assert(endRms > ambienceMetrics.rms * 0.45, 'Ambiyans loop sonunda sessizliğe düşüyor');
assert(seamJump < 0.05, `Ambiyans loop dikişi sıçrıyor (${seamJump.toFixed(4)})`);
assert(
  Math.abs(ambienceMetrics.correlation) < 0.95,
  `Ambiyans stereo alanı yetersiz (${ambienceMetrics.correlation.toFixed(3)})`,
);

console.log(
  `Ses sözleşmesi geçti: 8 stereo dosya, 48 kHz, loop seam=${seamJump.toFixed(4)}, ` +
    `ambiyans corr=${ambienceMetrics.correlation.toFixed(3)}`,
);
