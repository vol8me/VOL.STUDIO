/**
 * SVG karmaşıklık ölçümü. Yer tutucu bir şekil gerçek bir sprite gibi görünüp ölçümü yanıltır; bu
 * yüzden yük tarafı varlıkların ne kadar iş içerdiğini söyler ve testler tabanı bunun üstünde tutar.
 * Ayrıştırıcı yoktur (DOM'suz çalışır): etiketleri ve yol komutlarını sayar.
 */

export interface SvgComplexity {
  readonly bytes: number;
  /** Etiket sayısı (yorum, bildirim ve kapanış etiketleri hariç). */
  readonly elements: number;
  readonly paths: number;
  /** Tüm `d` özniteliklerindeki yol komutu (M, L, C, A, Z...) sayısı. */
  readonly pathCommands: number;
  readonly gradients: number;
  readonly filters: number;
  readonly masks: number;
  readonly clipPaths: number;
}

const PATH_COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/g;

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

export function measureSvg(source: string): SvgComplexity {
  const body = source.replace(/<!--[\s\S]*?-->/g, '');
  let pathCommands = 0;
  for (const match of body.matchAll(/<path\b[^>]*?\sd\s*=\s*"([^"]*)"/g))
    pathCommands += count(match[1], PATH_COMMAND);
  return {
    bytes: new TextEncoder().encode(source).length,
    elements: count(body, /<[A-Za-z][\w:-]*/g),
    paths: count(body, /<path\b/g),
    pathCommands,
    gradients: count(body, /<(?:linear|radial)Gradient\b/g),
    filters: count(body, /<filter\b/g),
    masks: count(body, /<mask\b/g),
    clipPaths: count(body, /<clipPath\b/g),
  };
}
