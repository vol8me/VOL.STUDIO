import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hashCanonical, type Sha256 } from './canonical';
import { ProtocolError } from './errors';

/**
 * Kodlama/çözme araç zinciri. Ölçüm gönderilen biçimin KENDİSİ üzerinde
 * yapılır: Vorbis kayıplıdır ve kaynakta olmayan tepe/kırpma encode
 * sırasında oluşabilir.
 */
export interface DecodedAudio {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

/** `label` hatada gösterilen (repo-göreli) addır; host yolu mesaja sızmaz. */
export function decodeWithFfmpeg(path: string, label = path): DecodedAudio {
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
  if (probe.status !== 0) throw new ProtocolError('toolchain', 'ffprobe okuyamadı', label);
  const [sampleRateRaw, channelsRaw] = probe.stdout.trim().split(/\s+/);
  const sampleRate = Number(sampleRateRaw);
  const numChannels = Number(channelsRaw);
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-'], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (res.status !== 0) throw new ProtocolError('toolchain', 'ffmpeg çözme hatası', label);
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

function versionOutput(): string | null {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' });
  return res.status === 0 ? res.stdout : null;
}

/** `ffmpeg -version` ilk satırı — QA raporları bunu yazar. */
export function ffmpegVersion(): string {
  return (versionOutput()?.split('\n')[0] ?? 'bilinmiyor').trim();
}

/** Vorbis kodlamasının manifest'e yazılan argümanları — `writeOgg` ile aynı olmalı. */
export const OGG_ENCODER_SETTINGS = {
  codec: 'libvorbis',
  quality: 4,
  arguments: ['-f', 'f32le', '-c:a', 'libvorbis', '-q:a', '4', '-bitexact'],
} as const;

export interface EncoderToolchain {
  readonly tool: 'ffmpeg';
  readonly version: string;
  readonly libraries: Readonly<Record<string, string>>;
  readonly codec: string;
  readonly quality: number;
  readonly arguments: readonly string[];
  /**
   * libvorbis sürümü FFmpeg tarafından raporlanmaz (`-bitexact` vendor
   * dizesini de düşürür); aynı FFmpeg + farklı libvorbis aynı parmak izini
   * verebilir. Bu bilinen bir körlüktür, gizlenmez.
   */
  readonly unreported: readonly string[];
  readonly fingerprint: Sha256;
}

/** Çalışan araç zincirini okur; FFmpeg yoksa `toolchain` hatası. */
export function readEncoderToolchain(): EncoderToolchain {
  const output = versionOutput();
  if (output === null) throw new ProtocolError('toolchain', 'FFmpeg bulunamadı');
  const lines = output.split('\n');
  const libraries: Record<string, string> = {};
  for (const line of lines) {
    const match = /^(libavcodec|libavformat|libavutil)\s+([\d. ]+?)\s+\//.exec(line.trim());
    if (match) libraries[match[1]] = match[2].replace(/\s+/g, '');
  }
  const base = {
    tool: 'ffmpeg' as const,
    version: (lines[0] ?? '').trim(),
    libraries,
    codec: OGG_ENCODER_SETTINGS.codec,
    quality: OGG_ENCODER_SETTINGS.quality,
    arguments: [...OGG_ENCODER_SETTINGS.arguments],
    unreported: ['libvorbis'],
  };
  return { ...base, fingerprint: hashCanonical(base) };
}

export function fileBytes(path: string): Buffer {
  return readFileSync(path);
}
