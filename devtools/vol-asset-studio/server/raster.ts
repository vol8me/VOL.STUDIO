import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { AssetStudioError } from './errors.js';

export interface DecodedRaster {
  width: number;
  height: number;
  /** 8-bit sRGB, unpremultiplied RGBA. */
  rgba: Buffer;
  /** Kaynağın ilk normalize kaydında KAYBOLACAK metadata'sı. */
  strippedMetadata: string[];
}

export interface RasterLimits {
  maxImagePixels: number;
  maxEdge?: number;
}

const DEFAULT_MAX_EDGE = 8192;

/**
 * Herhangi bir raster girdiyi editörün tek iç biçimine indirger.
 *
 * Editör yalnız 8-bit sRGB unpremultiplied RGBA tanır. Kaynak 16-bit, CMYK,
 * gri tonlamalı, paletli ya da alfasız olabilir; hepsi burada normalize edilir
 * ki araçlar tek bir piksel modeliyle çalışsın.
 *
 * EXIF yönelimi DECODE sırasında uygulanır: uygulanmazsa kullanıcı düz
 * gördüğü görüntüyü düzenler, kaydedince görüntü dönerdi.
 */
export async function decodeRaster(input: Buffer, limits: RasterLimits): Promise<DecodedRaster> {
  const maxEdge = limits.maxEdge ?? DEFAULT_MAX_EDGE;
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: limits.maxImagePixels }).metadata();
  } catch (error) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'image' }, { cause: error });
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'image', reason: 'no_dimensions' });
  }
  // EXIF yönelimi 90°/270° ise nihai kenarlar takas olur; sınır kontrolü
  // kullanıcının GÖRECEĞİ boyuta uygulanmalıdır.
  const rotated = (metadata.orientation ?? 1) >= 5;
  const finalWidth = rotated ? height : width;
  const finalHeight = rotated ? width : height;
  if (finalWidth > maxEdge || finalHeight > maxEdge) {
    throw new AssetStudioError('asset_too_large', 413, {
      kind: 'image',
      maxEdge,
      size: [finalWidth, finalHeight],
    });
  }
  if (finalWidth * finalHeight > limits.maxImagePixels) {
    throw new AssetStudioError('asset_too_large', 413, {
      kind: 'image',
      maxImagePixels: limits.maxImagePixels,
    });
  }

  let raw: { data: Buffer; info: OutputInfo };
  try {
    raw = await sharp(input, { limitInputPixels: limits.maxImagePixels })
      .rotate()
      .toColorspace('srgb')
      .ensureAlpha()
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'image' }, { cause: error });
  }

  if (raw.info.channels !== 4) {
    throw new AssetStudioError('decode_failed', 422, {
      kind: 'image',
      reason: 'unexpected_channels',
      channels: raw.info.channels,
    });
  }

  return {
    width: raw.info.width,
    height: raw.info.height,
    rgba: raw.data,
    strippedMetadata: collectStrippedMetadata(metadata),
  };
}

/**
 * RGBA tamponunu deterministik PNG'ye kodlar.
 *
 * `compressionLevel` ve `effort` sabittir: aynı piksellerin her kaydında aynı
 * baytların çıkması, "dosya değişti mi" sorusunu içerik hash'iyle
 * yanıtlayabilmenin ön koşuludur. Sharp varsayılanları sürümle değişebildiği
 * için burada açıkça sabitlenir.
 */
export async function encodeRasterPng(
  width: number,
  height: number,
  rgba: Buffer,
): Promise<Buffer> {
  if (rgba.length !== width * height * 4) {
    throw new AssetStudioError('invalid_request', 400, {
      field: 'rgba',
      expected: width * height * 4,
      received: rgba.length,
    });
  }
  try {
    return await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9, effort: 7, palette: false })
      .toBuffer();
  } catch (error) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'image' }, { cause: error });
  }
}

/** İlk normalize kaydında düşecek metadata alanlarını adlandırır. */
function collectStrippedMetadata(metadata: Metadata): string[] {
  const stripped: string[] = [];
  if (metadata.icc !== undefined) stripped.push('icc');
  if (metadata.exif !== undefined) stripped.push('exif');
  if (metadata.xmp !== undefined) stripped.push('xmp');
  if (metadata.iptc !== undefined) stripped.push('iptc');
  if (metadata.density !== undefined && metadata.density !== 72) stripped.push('density');
  return stripped;
}
