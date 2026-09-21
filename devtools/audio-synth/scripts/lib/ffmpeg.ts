/**
 * FFmpeg ile çözme ve sürüm okuma — QA betiklerinin ortak yardımcısı.
 *
 * Ölçüm gönderilen biçimin KENDİSİ üzerinde yapılır: Vorbis kayıplıdır ve
 * kaynak mix'te olmayan artefaktlar (kırpma, örnekler arası tepe) encode
 * sırasında oluşabilir; encode öncesini ölçmek bunları kaçırır.
 */
import { spawnSync } from 'node:child_process';

export interface DecodedAudio {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

export function decodeWithFfmpeg(path: string): DecodedAudio {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate,channels',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  if (probe.status !== 0) throw new Error(`ffprobe okuyamadı: ${path}`);
  const [sampleRateRaw, channelsRaw] = probe.stdout.trim().split(/\s+/);
  const sampleRate = Number(sampleRateRaw);
  const numChannels = Number(channelsRaw);
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-'], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`ffmpeg çözme hatası: ${path}`);
  const raw = res.stdout;
  const frames = Math.floor(raw.length / 4 / numChannels);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch][i] = raw.readFloatLE((i * numChannels + ch) * 4);
    }
  }
  return { channels, sampleRate };
}

/** `ffmpeg -version` ilk satırı — rapora araç sürümü olarak yazılır. */
export function ffmpegVersion(): string {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' });
  return res.status === 0 ? (res.stdout.split('\n')[0] ?? '').trim() : 'bilinmiyor';
}

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
