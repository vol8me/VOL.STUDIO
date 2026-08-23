import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export interface FixtureProject {
  repoRoot: string;
  assetsRoot: string;
  pngPath: string;
  wavPath: string;
  /** Repo DIŞINDA, teste özel artefakt cache kökü. */
  cacheRoot: string;
  cleanup(): Promise<void>;
}

function createWav(): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 800;
  const dataLength = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const value = Math.round(Math.sin((sample / sampleRate) * Math.PI * 2 * 440) * 8_000);
    buffer.writeInt16LE(value, 44 + sample * 2);
  }
  return buffer;
}

export async function createFixtureProject(): Promise<FixtureProject> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'vol-asset-project-'));
  // Cache repo dışında yaşar ve testler kullanıcının gerçek cache
  // dizinine yazmamalıdır; her fixture kendi kökünü alır.
  const cacheRoot = await mkdtemp(join(tmpdir(), 'vol-asset-cache-'));
  const assetsRoot = join(repoRoot, 'assets');
  await mkdir(assetsRoot);
  const pngPath = join(assetsRoot, 'car.png');
  const wavPath = join(assetsRoot, 'tone.wav');
  await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#ff5500ff' },
  })
    .png()
    .toFile(pngPath);
  await writeFile(join(assetsRoot, 'car.json'), '{"kind":"fixture"}\n');
  await writeFile(wavPath, createWav());
  await writeFile(
    join(repoRoot, 'asset-studio.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: 'Fixture Repo',
        roots: [
          {
            id: 'assets',
            path: 'assets',
            role: 'source',
            kinds: ['image', 'audio', 'metadata'],
          },
        ],
        ignore: ['**/ignored/**'],
      },
      null,
      2,
    )}\n`,
  );
  return {
    repoRoot,
    assetsRoot,
    pngPath,
    wavPath,
    cacheRoot,
    cleanup: async () => {
      await rm(repoRoot, { recursive: true, force: true });
      await rm(cacheRoot, { recursive: true, force: true });
    },
  };
}
