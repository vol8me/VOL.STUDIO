/**
 * QA betiklerinin FFmpeg yardımcıları. Çözme ve sürüm okuma publish
 * kapısıyla AYNI implementasyondur (`src/protocol/toolchain`); burada yalnız
 * referans ölçüm (`ebur128`) yaşar.
 */
import { spawnSync } from 'node:child_process';

import { FFMPEG_TIMEOUT_MS } from '../../src/protocol/toolchain';

export { decodeWithFfmpeg, ffmpegVersion } from '../../src/protocol/toolchain';
export type { DecodedAudio } from '../../src/protocol/toolchain';

/**
 * Referans ölçüm: FFmpeg `ebur128` (BS.1770 kapılı integrated, 4× true peak).
 * Kısa sinyalde integrated −70 döner; bu "tanımsız" olarak `null`a çevrilir.
 */
export function ffmpegEbur128(path: string): { integrated: number | null; truePeak: number } {
  const res = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      path,
      '-filter_complex',
      'ebur128=peak=true',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS },
  );
  if (res.error || typeof res.stderr !== 'string') {
    throw new Error(`ffmpeg başlatılamadı: ${res.error?.message ?? 'çıktı yok'}`);
  }
  return parseEbur128Summary(res.stderr, path);
}

/** `ebur128` özetini okur; sessiz dosyanın tepesi `-inf` → `-Infinity`. */
export function parseEbur128Summary(
  stderr: string,
  path: string,
): { integrated: number | null; truePeak: number } {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peakRaw = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1];
  const truePeak = peakRaw === '-inf' ? Number.NEGATIVE_INFINITY : Number(peakRaw);
  if (!Number.isFinite(integrated) || Number.isNaN(truePeak)) {
    throw new Error(`ebur128 özeti okunamadı: ${path}`);
  }
  return { integrated: integrated <= -70 ? null : integrated, truePeak };
}
