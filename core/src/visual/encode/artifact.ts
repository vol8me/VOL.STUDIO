/**
 * Forge'un tek çıktı hattı — Node-only.
 *
 * CLI ve geliştirme sunucusu aynı belgeyi ayrı ayrı render/ölçüm/kodlama
 * adımlarıyla yürütürse zamanla ayrışır. Bu fonksiyon üç adımı atomik bir
 * ürün çıktısında birleştirir; tarayıcı istemcisi ise Node bağımlılıklarını
 * paketine almamak için yalnızca sunucuya belge gönderir.
 */
import { measureSprite, type QaReport } from '../qa';
import { renderSprite, type RenderResult } from '../render';
import { encodePng } from './png';

export interface ForgeArtifactOptions {
  readonly size?: readonly [number, number];
  readonly seed?: number;
}

export interface ForgeArtifact {
  readonly result: RenderResult;
  readonly png: Buffer;
  readonly report: QaReport;
}

/** Doğrulama → render → QA → PNG zincirini tek kez yürütür. */
export function createForgeArtifact(
  doc: unknown,
  options: ForgeArtifactOptions = {},
): ForgeArtifact {
  const result = renderSprite(doc, options);
  return {
    result,
    report: measureSprite(result),
    png: encodePng(result.width, result.height, result.rgba),
  };
}
