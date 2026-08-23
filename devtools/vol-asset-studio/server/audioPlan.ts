import type { AudioEditOperation, VolAudioDocumentV1 } from '../shared/audio.js';
import { AssetStudioError } from './errors.js';

export interface AudioPlanContext {
  sampleRate: number;
  channelCount: number;
  frameCount: number;
}

export interface CompiledAudioPlan {
  /** FFmpeg filtergraph; boşsa yalnız yeniden kodlama yapılır. */
  filters: string[];
  /** Trim uygulandıysa çıktının frame sayısı. */
  frameCount: number;
  channelCount: number;
  sampleRate: number;
}

function requireFrame(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    throw new AssetStudioError('invalid_request', 400, { field });
  }
  return Math.trunc(value);
}

function requireFinite(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new AssetStudioError('invalid_request', 400, { field });
  }
  return value;
}

/** FFmpeg argümanına girecek sayıyı güvenli biçimde biçimlendirir. */
function num(value: number): string {
  // Bilimsel gösterim (1e-7) FFmpeg tarafından ayrıştırılamaz.
  return value.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/**
 * Düzenleme tarifini FFmpeg filtergraph'ına DETERMİNİSTİK olarak derler.
 *
 * Derleme saf bir fonksiyondur: aynı tarif ve aynı kaynak her zaman aynı
 * filtre dizisini üretir. Bu, "aynı planı iki kez uygulayınca aynı bayt
 * çıkmalı" garantisinin ön koşuludur ve testte doğrulanır.
 *
 * Hiçbir kullanıcı dizesi doğrudan argümana girmez; her değer tipe ve aralığa
 * göre doğrulanıp yeniden biçimlendirilir. FFmpeg `shell: false` ile
 * çağrıldığı için kabuk enjeksiyonu zaten mümkün değildir, fakat bozuk bir
 * sayı filtergraph'ı sessizce anlamsız kılardı.
 */
export function compileAudioPlan(
  operations: readonly AudioEditOperation[],
  context: AudioPlanContext,
): CompiledAudioPlan {
  const filters: string[] = [];
  let frameCount = context.frameCount;
  let channelCount = context.channelCount;
  let sampleRate = context.sampleRate;

  operations.forEach((operation, index) => {
    const field = `operations.${index}`;
    switch (operation.kind) {
      case 'trim': {
        const start = requireFrame(operation.startFrame, `${field}.startFrame`, frameCount);
        const end = requireFrame(operation.endFrame, `${field}.endFrame`, frameCount);
        if (end <= start) {
          throw new AssetStudioError('invalid_request', 400, { field: `${field}.endFrame` });
        }
        // `atrim` örnek cinsinden çalışır; saniyeye çevirmek yuvarlama
        // hatasıyla sınırı bir örnek kaydırıp tık sesi üretirdi.
        filters.push(`atrim=start_sample=${start}:end_sample=${end}`, 'asetpts=N/SR/TB');
        frameCount = end - start;
        break;
      }
      case 'gain': {
        const decibels = requireFinite(operation.decibels, `${field}.decibels`, -60, 24);
        filters.push(`volume=${num(decibels)}dB`);
        break;
      }
      case 'fadeIn':
      case 'fadeOut': {
        const start = requireFrame(operation.startFrame, `${field}.startFrame`, frameCount);
        const duration = requireFrame(
          operation.durationFrames,
          `${field}.durationFrames`,
          frameCount,
        );
        if (duration < 1) {
          throw new AssetStudioError('invalid_request', 400, { field: `${field}.durationFrames` });
        }
        const curve =
          operation.curve === 'exponential'
            ? 'exp'
            : operation.curve === 'logarithmic'
            ? 'log'
            : 'tri';
        filters.push(
          `afade=t=${
            operation.kind === 'fadeIn' ? 'in' : 'out'
          }:start_sample=${start}:nb_samples=${duration}:curve=${curve}`,
        );
        break;
      }
      case 'normalize': {
        if (operation.mode === 'peak') {
          const target = requireFinite(operation.target, `${field}.target`, -60, 0);
          // `dynaudnorm` içeriği ezer; peak normalize sabit kazançtır ve
          // dinamikleri korur.
          filters.push(`alimiter=limit=${num(dbToLinear(target))}`);
        } else {
          const target = requireFinite(operation.target, `${field}.target`, -70, -5);
          filters.push(`loudnorm=I=${num(target)}:TP=-1.5:LRA=11:linear=true`);
        }
        break;
      }
      case 'reverse':
        filters.push('areverse');
        break;
      case 'channels': {
        if (operation.target !== 1 && operation.target !== 2) {
          throw new AssetStudioError('invalid_request', 400, { field: `${field}.target` });
        }
        if (operation.swap === true && operation.target === 2) {
          filters.push('pan=stereo|c0=c1|c1=c0');
        }
        filters.push(`aformat=channel_layouts=${operation.target === 1 ? 'mono' : 'stereo'}`);
        channelCount = operation.target;
        break;
      }
      case 'resample': {
        const rate = requireFinite(operation.sampleRate, `${field}.sampleRate`, 8000, 192_000);
        const rounded = Math.round(rate);
        filters.push(`aresample=${rounded}:resampler=soxr`);
        frameCount = Math.round((frameCount * rounded) / sampleRate);
        sampleRate = rounded;
        break;
      }
      case 'highpass':
      case 'lowpass': {
        const frequency = requireFinite(operation.frequency, `${field}.frequency`, 10, 20_000);
        filters.push(`${operation.kind}=f=${num(frequency)}`);
        break;
      }
      case 'eq': {
        const frequency = requireFinite(operation.frequency, `${field}.frequency`, 20, 20_000);
        const gainDb = requireFinite(operation.gainDb, `${field}.gainDb`, -24, 24);
        const q = requireFinite(operation.q, `${field}.q`, 0.1, 20);
        filters.push(`equalizer=f=${num(frequency)}:width_type=q:w=${num(q)}:g=${num(gainDb)}`);
        break;
      }
      case 'compressor': {
        const threshold = requireFinite(operation.thresholdDb, `${field}.thresholdDb`, -60, 0);
        const ratio = requireFinite(operation.ratio ?? 4, `${field}.ratio`, 1, 20);
        const attack = requireFinite(operation.attackMs ?? 20, `${field}.attackMs`, 0.01, 2000);
        const release = requireFinite(operation.releaseMs ?? 250, `${field}.releaseMs`, 0.01, 9000);
        filters.push(
          `acompressor=threshold=${num(dbToLinear(threshold))}:ratio=${num(ratio)}:attack=${num(
            attack,
          )}:release=${num(release)}`,
        );
        break;
      }
      case 'limiter': {
        const threshold = requireFinite(operation.thresholdDb, `${field}.thresholdDb`, -60, 0);
        const release = requireFinite(operation.releaseMs ?? 50, `${field}.releaseMs`, 1, 9000);
        filters.push(`alimiter=limit=${num(dbToLinear(threshold))}:release=${num(release / 1000)}`);
        break;
      }
      default: {
        const exhaustive: never = operation;
        throw new AssetStudioError('invalid_request', 400, {
          field,
          kind: (exhaustive as { kind?: string }).kind,
        });
      }
    }
  });

  return { filters, frameCount, channelCount, sampleRate };
}

function dbToLinear(decibels: number): number {
  return Math.min(1, Math.max(0, 10 ** (decibels / 20)));
}

/** Belgeyi doğrular ve derlenmiş planı döner. */
export function compileAudioDocument(
  document: VolAudioDocumentV1,
  context: AudioPlanContext,
): CompiledAudioPlan {
  if (document.schemaVersion !== 1) {
    throw new AssetStudioError('configuration_invalid', 400, { field: 'schemaVersion' });
  }
  if (!Array.isArray(document.operations)) {
    throw new AssetStudioError('invalid_request', 400, { field: 'operations' });
  }
  const plan = compileAudioPlan(document.operations, context);
  if (document.loop !== undefined) {
    const { startFrame, endFrame, crossfadeFrames } = document.loop;
    if (
      !Number.isFinite(startFrame) ||
      !Number.isFinite(endFrame) ||
      endFrame <= startFrame ||
      endFrame > plan.frameCount ||
      !Number.isFinite(crossfadeFrames) ||
      crossfadeFrames < 0 ||
      crossfadeFrames > endFrame - startFrame
    ) {
      throw new AssetStudioError('invalid_request', 400, { field: 'loop' });
    }
  }
  if (document.output.format !== 'ogg' && document.output.format !== 'wav') {
    throw new AssetStudioError('unsupported_format', 415, { field: 'output.format' });
  }
  return plan;
}

/** Derlenmiş plandan FFmpeg argüman listesi kurar; hepsi allow-listelidir. */
export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  plan: CompiledAudioPlan,
  output: VolAudioDocumentV1['output'],
): string[] {
  const args = ['-hide_banner', '-nostdin', '-y', '-i', inputPath];
  if (plan.filters.length > 0) args.push('-af', plan.filters.join(','));
  if (output.format === 'ogg') {
    const quality = Math.max(-1, Math.min(10, output.vorbisQuality ?? 5));
    args.push('-c:a', 'libvorbis', '-q:a', num(quality));
  } else {
    args.push('-c:a', 'pcm_s16le');
  }
  if (output.sampleRate !== undefined) {
    args.push('-ar', String(Math.round(output.sampleRate)));
  }
  args.push('-map_metadata', '-1', outputPath);
  return args;
}
