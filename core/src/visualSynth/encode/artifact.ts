/**
 * Görsel belgeden varlık üretmenin tek çıktı hattı — Node-only.
 *
 * Ayrı tüketiciler (CLI, sunucu) aynı belgeyi kendi render/ölçüm/kodlama
 * adımlarıyla yürütürse zamanla ayrışırlar. Bu fonksiyon üç adımı atomik bir
 * ürün çıktısında birleştirir; tarayıcı istemcileri ise Node bağımlılıklarını
 * paketine almamak için yalnızca sunucuya belge gönderir.
 */
import { measureSprite, type QaReport } from '../qa';
import { renderSprite, type RenderResult } from '../render';
import { encodePng } from './png';

export interface VisualArtifactOptions {
  readonly size?: readonly [number, number];
  readonly seed?: number;
}

export interface VisualArtifact {
  readonly result: RenderResult;
  readonly png: Buffer;
  readonly report: QaReport;
}

/** Doğrulama → render → QA → PNG zincirini tek kez yürütür. */
export function createVisualArtifact(
  doc: unknown,
  options: VisualArtifactOptions = {},
): VisualArtifact {
  const result = renderSprite(doc, options);
  return {
    result,
    report: measureSprite(result),
    png: encodePng(result.width, result.height, result.rgba),
  };
}
