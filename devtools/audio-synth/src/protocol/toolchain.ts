import { spawnSync } from 'node:child_process';
import { hashCanonical, type Sha256 } from '../kernel/canonical';
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

/** Takılan bir FFmpeg yayını ve doğrulamayı sonsuza bekletemez. */
export const FFMPEG_TIMEOUT_MS = 120_000;

/** ffprobe çıktısı: iki pozitif tam sayı (örnek oranı, kanal sayısı). */
export function parseProbeOutput(
  stdout: string,
): { sampleRate: number; numChannels: number } | null {
  const [rateRaw, channelsRaw, ...rest] = stdout.trim().split(/\s+/);
  const sampleRate = Number(rateRaw);
  const numChannels = Number(channelsRaw);
  if (rest.length > 0 || !Number.isInteger(sampleRate) || !Number.isInteger(numChannels))
    return null;
  return sampleRate > 0 && numChannels > 0 ? { sampleRate, numChannels } : null;
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
    { encoding: 'utf8', timeout: FFMPEG_TIMEOUT_MS },
  );
  if (probe.status !== 0) throw new ProtocolError('toolchain', 'ffprobe okuyamadı', label);
  const stream = parseProbeOutput(probe.stdout);
  if (!stream) throw new ProtocolError('toolchain', 'dosyada çözülebilir ses akışı yok', label);
  const { sampleRate, numChannels } = stream;
  // ffprobe'un okuduğu akış (`a:0`) çözülen akışla aynı olmalı.
  const res = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-'],
    {
      maxBuffer: 1024 * 1024 * 1024,
      timeout: FFMPEG_TIMEOUT_MS,
    },
  );
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

export const OGG_CODEC = 'libvorbis';

/**
 * Vorbis kodlamasının manifest'e yazılan argümanları — `writeOgg` ile aynı
 * olmalı. Kalite asset sınıfının profilinden gelir (`encodeProfiles.ts`).
 */
export function vorbisArguments(quality: number): string[] {
  return ['-f', 'f32le', '-c:a', OGG_CODEC, '-q:a', String(quality), '-bitexact'];
}

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

/**
 * Çalışan araç zincirini verilen kaliteyle okur; FFmpeg yoksa `toolchain`
 * hatası. Parmak izi kaliteyi içerir: aynı FFmpeg ile farklı profil farklı
 * bir kodlayıcıdır.
 */
export function readEncoderToolchain(quality: number): EncoderToolchain {
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
    codec: OGG_CODEC,
    quality,
    arguments: vorbisArguments(quality),
    unreported: ['libvorbis'],
  };
  return { ...base, fingerprint: hashCanonical(base) };
}
