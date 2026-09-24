import { loopSamples, resample } from './sample';

/**
 * Sampler bölgesinin çalınması: başlangıç ofseti, klasik sampler yeniden
 * örneklemesi (perde = hız) ve loop bölgesiyle doldurma. Akustik programın
 * `source.sampler` düğümü ve müziğin sampler enstrümanı AYNI işlevi çağırır.
 */
export interface ZonePlaybackV1 {
  readonly startSeconds: number;
  readonly loop: {
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly crossfadeSeconds: number;
  } | null;
}

/** Yeniden örnekleme çekirdeğinin kaynak sonunda ihtiyaç duyduğu pay (örnek). */
const KERNEL_MARGIN = 64;

/**
 * Bölgeyi `ratio` perde oranıyla çalar. Loop'lu bölge `length` örneğe kadar
 * doldurulur; loop'suz bölge kaydın kendi uzunluğunda biter. `limit`
 * verilirse loop'suz kayıt yalnız o kadar çıktı için yeniden örneklenir.
 */
export function renderZone(
  zone: ZonePlaybackV1,
  source: Float32Array,
  sourceRate: number,
  ratio: number,
  sampleRate: number,
  length: number,
  limit?: number,
): Float32Array {
  const factor = (sourceRate / sampleRate) * ratio;
  const toOut = (seconds: number) => Math.round((seconds * sourceRate) / factor);
  const start = Math.round(zone.startSeconds * sourceRate);
  const end =
    limit === undefined || zone.loop
      ? source.length
      : Math.min(source.length, start + Math.ceil(limit * factor) + KERNEL_MARGIN);
  const body = resample(source.subarray(start, end), factor);
  if (!zone.loop || body.length >= length) return body;
  const loopStart = toOut(zone.loop.startSeconds - zone.startSeconds);
  const loopEnd = toOut(zone.loop.endSeconds - zone.startSeconds);
  const head = body.subarray(0, loopStart);
  const fade = toOut(zone.loop.crossfadeSeconds);
  const cycle = loopSamples(
    body.slice(loopStart, loopEnd),
    length - head.length,
    true,
    fade > 0,
    fade,
  );
  const rendered = new Float32Array(length);
  rendered.set(head);
  rendered.set(cycle, head.length);
  return rendered;
}
