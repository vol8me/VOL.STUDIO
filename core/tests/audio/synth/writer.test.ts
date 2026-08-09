import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeWav } from '@volstudio/core/audio/synth/writer';
import { synth } from '@volstudio/core/audio/synth';

const TEST_DIR = join(tmpdir(), 'vol-synth-test');

describe('WAV writer', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('mono WAV dosyası yazar ve başlık geçerlidir', () => {
    const outPath = join(TEST_DIR, 'test-mono.wav');
    const result = synth(0.05, { wave: 'sine', frequency: 440 });
    writeWav(outPath, result);

    const header = readFileSync(outPath).subarray(0, 44);
    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
    expect(header.toString('ascii', 8, 12)).toBe('WAVE');
    expect(header.toString('ascii', 12, 16)).toBe('fmt ');
    expect(header.readUInt16LE(20)).toBe(1); // PCM
    expect(header.readUInt16LE(22)).toBe(1); // mono
    expect(header.readUInt32LE(24)).toBe(44100);
    expect(header.readUInt16LE(34)).toBe(16); // bits per sample
    expect(header.toString('ascii', 36, 40)).toBe('data');
  });

  it('stereo WAV dosyası yazar', () => {
    const outPath = join(TEST_DIR, 'test-stereo.wav');
    const result = synth(0.05, { wave: 'sine', frequency: 440, pan: -0.5 });
    expect(result.channels).toHaveLength(2);
    writeWav(outPath, result);

    const header = readFileSync(outPath).subarray(0, 44);
    expect(header.readUInt16LE(22)).toBe(2); // stereo
  });
});
