import { requiredAt } from '../../collections/requiredAt';
/**
 * Kullanıcının algıladığı tek karakter (grafem kümesi) sınırları. İmleç hareketi ve geri silme KOD NOKTASINA değil
 * kümeye göre olmalıdır: "e" + birleştirici vurgu, bayrak, ZWJ'li aile emojisi ve ten tonu tek tuşla silinir ve imleç
 * tek adımda geçer; kod noktası yürüyüşü bunları ortadan bölüp geçersiz/yarım metin bırakır.
 */
export type GraphemeSplitter = (text: string) => string[];

/** Birleştirici işaret, varyasyon seçici, ten tonu ve etiket karakterleri: kümenin ÖNCEKİ karaktere bağlanan parçaları. */
const EXTEND = /^[\p{M}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]$/u;
const REGIONAL_INDICATOR = /^[\u{1F1E6}-\u{1F1FF}]$/u;
const ZWJ = String.fromCodePoint(0x200d);

/**
 * `Intl.Segmenter` yoksa (eski WebView/WebKitGTK) kullanılan yedek: kod noktası + bağlanan parçalar, bölgesel gösterge
 * çifti (bayrak), ZWJ dizisi ve CRLF. UAX #29'un tamamı DEĞİLDİR (Hangul jamo dizileri ve bazı Hint yazıları kod noktası
 * düzeyinde kalır); `Intl.Segmenter` varsa o kullanılır.
 */
export function splitGraphemesFallback(text: string): string[] {
  const points = Array.from(text);
  const clusters: string[] = [];
  let index = 0;
  while (index < points.length) {
    let cluster = requiredAt(points, index++);
    if (cluster === '\r' && points[index] === '\n') {
      clusters.push(cluster + points[index++]);
      continue;
    }
    if (
      REGIONAL_INDICATOR.test(cluster) &&
      index < points.length &&
      REGIONAL_INDICATOR.test(requiredAt(points, index))
    ) {
      cluster += requiredAt(points, index++);
    }
    while (index < points.length) {
      const next = requiredAt(points, index);
      if (EXTEND.test(next)) {
        cluster += next;
        index += 1;
      } else if (next === ZWJ && index + 1 < points.length) {
        cluster += next + points[index + 1];
        index += 2;
      } else {
        break;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function createSegmenterSplitter(): GraphemeSplitter | null {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter !== 'function') return null;
  const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
  return (text) => Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Metni grafem kümelerine böler; birleştirildiğinde özgün metni verir. */
export const splitGraphemes: GraphemeSplitter = createSegmenterSplitter() ?? splitGraphemesFallback;

/** Metnin SON kümesinin UTF-16 uzunluğu (geri silme ve sola adım); boş metinde 0. */
export function lastGraphemeLength(text: string): number {
  const clusters = splitGraphemes(text);
  return clusters.length === 0 ? 0 : requiredAt(clusters, clusters.length - 1).length;
}

/** Metnin İLK kümesinin UTF-16 uzunluğu (sağa adım); boş metinde 0. */
export function firstGraphemeLength(text: string): number {
  return splitGraphemes(text)[0]?.length ?? 0;
}

/** HTML uzunluk sınırı UTF-16 birimidir; kesim vekil çiftin yarısını bırakmaz. */
export function fitToRoom(text: string, room: number): string {
  const cut = text.slice(0, Math.max(0, room));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
