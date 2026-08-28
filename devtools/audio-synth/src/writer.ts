import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import type { SynthesisResult } from './types';
import { createRandom } from '@volstudio/core/random';

/** Dither gürültüsü için sabit seed — üretim tekrarlanabilir kalmalı. */
const DITHER_SEED = 0x0d17;

const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/**
 * SynthesisResult içeriğini 16-bit PCM WAV dosyasına yazar. Mono veya stereo.
 *
 * `targetGain` varsayılanı 1.0'dır; headroom kararı tek yerde (normalize) kalır.
 */
export function writeWav(filePath: string, result: SynthesisResult, targetGain = 1): void {
  const { channels, sampleRate } = result;
  const numChannels = channels.length;
  const sampleCount = channels[0]?.length ?? 0;

  const dataSize = sampleCount * numChannels * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(numChannels * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // TPDF dither: iki bağımsız düzgün dağılımın toplamı. Kuantizasyon hatasını
  // sinyalden bağımsız hale getirir; sönümlenen kuyruklardaki basamaklanmayı
  // duyulmaz bir gürültü tabanına çevirir. Deterministik olması için sabit
  // seed'li PRNG kullanılır — asset üretimi tekrarlanabilir kalmalı.
  const dither = createRandom(DITHER_SEED);
  const LSB = 1 / 32768;

  for (let i = 0; i < sampleCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = result.channels[ch]?.[i] ?? 0;
      const noise = (dither.next() - dither.next()) * LSB;
      const clamped = Math.max(-1, Math.min(1, raw * targetGain + noise));
      // Math.round, pozitif değerlerdeki sistematik aşağı yuvarlama sapmasını önler.
      const intVal = Math.max(-32768, Math.min(32767, Math.round(clamped * 32767)));
      const offset = 44 + (i * numChannels + ch) * BYTES_PER_SAMPLE;
      buffer.writeInt16LE(intVal, offset);
    }
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}

export interface OggOptions {
  /** Vorbis kalite seviyesi (0-10). Varsayılan 4 (~128kbps). */
  quality?: number;
  /** Final gain (0-1). Varsayılan 1 — headroom kararı normalize adımında kalır. */
  targetGain?: number;
}

/** `ensureFfmpeg()` sonucu process başına bir kez saklanır — bkz. aşağıdaki not. */
let ffmpegAvailable: boolean | undefined;

/**
 * FFmpeg yoksa `writeOgg` çağrılmadan önce net bir hata fırlatır.
 * `writeWav` bu kontrolden etkilenmez.
 *
 * Sonuç process başına memoize edilir.
 */
export function ensureFfmpeg(): void {
  if (ffmpegAvailable) return;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    // ffmpegAvailable bilinçli olarak false'a ayarlanmaz: bu dal her
    // çağrıda yeniden denenir (yalnızca başarı memoize edilir), böylece
    // FFmpeg sonradan kurulursa aynı process içinde bir sonraki çağrı onu
    // görür.
    throw new Error(
      'FFmpeg bulunamadı. OGG encode için gerekli.\n' +
        'Kurulum:\n' +
        '  Windows: winget install ffmpeg\n' +
        '  macOS: brew install ffmpeg\n' +
        '  Linux: sudo apt install ffmpeg',
    );
  }
}

/**
 * Yalnızca testler için: `ensureFfmpeg()` memoization'ını sıfırlar.
 * Modül düzeyindeki `ffmpegAvailable` bir kez `true` olduktan sonra process
 * ömrü boyunca kalır — "FFmpeg bulunamadı" senaryosunu doğrulayan bir test,
 * aynı dosyada ondan önce başarılı bir `ensureFfmpeg()` çağrısı çalışmışsa
 * (ör. test sırası değişirse) sessizce yanlış geçer. Bu fonksiyon testi test
 * sırasından bağımsız hale getirir.
 */
export function resetFfmpegCache(): void {
  ffmpegAvailable = undefined;
}

/**
 * SynthesisResult içeriğini interleaved 32-bit float PCM'e çevirir.
 * `writeWav`'ın aksine 16-bit'e kuantize etmez — dither gerekmez, Vorbis
 * encoder tam çözünürlüklü girdiyi kendi iç temsiline çevirir.
 */
function toInterleavedPcm(result: SynthesisResult, targetGain: number): Buffer {
  const { channels } = result;
  const numChannels = channels.length;
  const sampleCount = channels[0]?.length ?? 0;
  const buffer = Buffer.alloc(sampleCount * numChannels * 4);

  for (let i = 0; i < sampleCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = channels[ch]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw * targetGain));
      buffer.writeFloatLE(clamped, (i * numChannels + ch) * 4);
    }
  }

  return buffer;
}

/**
 * SynthesisResult içeriğini FFmpeg üzerinden OGG Vorbis'e encode eder.
 * Ara WAV dosyası oluşmaz — PCM doğrudan FFmpeg stdin'ine pipe'lanır.
 *
 * Determinizm notu: `writeWav` seed'li PRNG'yle byte-identical çıktı garanti
 * eder; `writeOgg` bunu garanti ETMEZ. libvorbis encode'u FFmpeg/libvorbis
 * sürümüne bağlıdır — farklı geliştirici makinelerinde veya zamanla güncellenen
 * FFmpeg farklı OGG byte'ları üretebilir. WAV, source-of-truth ve diff'lenebilir
 * asset olarak kalmalı; OGG'nin bit-eşitliği beklenmemeli.
 */
export function writeOgg(filePath: string, result: SynthesisResult, opts: OggOptions = {}): void {
  ensureFfmpeg();

  const { quality = 4, targetGain = 1 } = opts;
  const { sampleRate, channels } = result;
  const numChannels = channels.length;
  const pcm = toInterleavedPcm(result, targetGain);

  mkdirSync(dirname(filePath), { recursive: true });

  const args = [
    '-f',
    'f32le',
    '-ar',
    String(sampleRate),
    '-ac',
    String(numChannels),
    '-i',
    'pipe:0',
    '-c:a',
    'libvorbis',
    '-q:a',
    String(quality),
    '-y',
    filePath,
  ];

  // shell: false (varsayılan) + array argümanlar: filePath boşluk/özel karakter
  // içerse bile shell quoting riski olmadan geçer. Bilinçli tercih: shell: true
  // .cmd/.bat shim'li FFmpeg kurulumlarını PATHEXT ile çözerdi ama shell
  // quoting/injection riskini geri getirirdi — ensureFfmpeg() zaten geçtiyse
  // bu satırın ENOENT vermesi son derece nadir (yalnızca shim tabanlı
  // kurulumlarda; winget/resmi build'ler gerçek .exe verir).
  const res = spawnSync('ffmpeg', args, { input: pcm });

  if (res.error) {
    const hint =
      (res.error as NodeJS.ErrnoException).code === 'ENOENT'
        ? ' FFmpeg .cmd/.bat shim üzerinden kuruluysa (bazı paket yöneticileri) bu satır onu bulamayabilir; execSync PATH çözümü farklıdır.'
        : '';
    throw new Error(`FFmpeg çalıştırılamadı (${filePath}): ${res.error.message}.${hint}`);
  }
  if (res.status !== 0) {
    throw new Error(`FFmpeg encode başarısız (${filePath}): ${res.stderr?.toString() ?? ''}`);
  }
}

export type AudioFormat = 'wav' | 'ogg';

/**
 * `writeWav` / `writeOgg` için format seçen ince sarmalayıcı.
 * `opts.quality` yalnızca `format: 'ogg'` iken anlamlıdır — WAV sıkıştırılmamış
 * PCM olduğu için kalite ayarı yok; `format: 'wav'` iken sessizce yok sayılır.
 */
export function writeAudio(
  filePath: string,
  result: SynthesisResult,
  format: AudioFormat,
  opts?: OggOptions,
): void {
  if (format === 'wav') {
    writeWav(filePath, result, opts?.targetGain);
  } else {
    writeOgg(filePath, result, opts);
  }
}
