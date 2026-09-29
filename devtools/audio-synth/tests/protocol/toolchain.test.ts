import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProtocolError } from '../../src/protocol/errors';
import { decodeWithFfmpeg, parseProbeOutput } from '../../src/protocol/toolchain';

describe('ffprobe çıktısı', () => {
  it('iki pozitif tam sayı kabul edilir; eksik, fazla ya da sayı olmayan reddedilir', () => {
    expect(parseProbeOutput('48000\n2\n')).toEqual({ sampleRate: 48000, numChannels: 2 });
    expect(parseProbeOutput('')).toBeNull();
    expect(parseProbeOutput('48000\n')).toBeNull();
    expect(parseProbeOutput('48000\nN/A\n')).toBeNull();
    expect(parseProbeOutput('0\n2\n')).toBeNull();
    expect(parseProbeOutput('48000\n2\n44100\n1\n')).toBeNull();
  });
});

describe('decodeWithFfmpeg', () => {
  it('ses akışı olmayan dosya 0 kanallı sonuç yerine açık hata verir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vol-ffmpeg-'));
    try {
      const file = join(dir, 'ses-yok.txt');
      writeFileSync(file, 'ses değil');
      expect(() => decodeWithFfmpeg(file, 'ses-yok.txt')).toThrow(ProtocolError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ebur128 özeti', () => {
  it('sessiz dosyanın -inf tepesi sonsuz olarak okunur; bozuk özet hata verir', async () => {
    const { parseEbur128Summary } = await import('../../scripts/lib/ffmpeg');
    expect(
      parseEbur128Summary('Summary:\n  I: -70.0 LUFS\n  Peak: -inf dBFS\n', 'sessiz.ogg'),
    ).toEqual({ integrated: null, truePeak: Number.NEGATIVE_INFINITY });
    expect(parseEbur128Summary('Summary:\n  I: -18.2 LUFS\n  Peak: -1.5 dBFS\n', 'x')).toEqual({
      integrated: -18.2,
      truePeak: -1.5,
    });
    expect(() => parseEbur128Summary('özet yok', 'x')).toThrow('ebur128 özeti okunamadı');
  });
});
