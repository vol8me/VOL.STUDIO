/**
 * QA betiklerinin FFmpeg yardımcıları. Çözme ve sürüm okuma publish
 * kapısıyla AYNI implementasyondur (`src/protocol/toolchain`); burada yalnız
 * referans ölçüm (`ebur128`) yaşar.
 */
import { spawnSync } from 'node:child_process';

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
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const summary = res.stderr.slice(res.stderr.lastIndexOf('Summary:'));
  const integrated = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(integrated) || Number.isNaN(truePeak)) {
    throw new Error(`ebur128 özeti okunamadı: ${path}`);
  }
  return { integrated: integrated <= -70 ? null : integrated, truePeak };
}
