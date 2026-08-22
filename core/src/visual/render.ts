/**
 * Değerlendirme boru hattı — §3. Çekirdeğin **tek giriş noktası**.
 *
 * DOM tanımaz (D8): `Canvas`, `ImageData`, `window` geçmez. Node'da ve
 * tarayıcıda aynı çalışır; PNG yazma ayrı bir alt-yolda yaşar.
 *
 * Boru hattı sırası ve her adımın gerekçesi belgede yazılıdır; buradaki
 * kod o sırayı birebir izler.
 */

import { clamp01 } from '../math/interpolation';
import { resolvePalette, type ResolvedPalette } from './color/palette';
import { quantizeToRgba } from './color/quantize';
import { blendCoverage, blendHeight } from './field/blend';
import { FieldBufferPool, type FieldBuffer } from './field/buffer';
import { applyDomainChain, compileField } from './field/evaluate';
import type { FieldFn } from './field/fn';
import { createUnitSpace, type UnitSpace } from './field/space';
import { resolveFieldDomain } from './schema';
import type { FieldNode, LayerSpec, SpriteDoc } from './types';
import { validateSpriteDoc } from './validate';

/** Katman varsayılanları — §2'de opsiyonel olan her alanın karşılığı. */
const DEFAULT_BLEND = 'over';
const DEFAULT_HEIGHT_BLEND = 'max';
const DEFAULT_OPACITY = 1;
const DEFAULT_MATERIAL = 0;
const DEFAULT_MATERIAL_THRESHOLD = 0.5;

export interface RenderOptions {
  /** Belgenin `size` alanını ezer — aynı belgeden farklı çözünürlük (D2). */
  size?: readonly [number, number];
  /** Belgenin `seed` alanını ezer — aynı belgeden varyant. */
  seed?: number;
  /** Tampon havuzu; verilmezse render'a özel bir havuz kullanılır (D7). */
  pool?: FieldBufferPool;
}

export interface RenderChannels {
  /** 0..1 kapsama — şeffaflık, silüet, dış çizgi kaynağı. */
  readonly coverage: Float32Array;
  /** 0..1 yükseklik — normal, ışık, AO'nun kaynağı. */
  readonly height: Float32Array;
  /** Rampa kimliği. */
  readonly material: Uint8Array;
}

export interface RenderResult {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bayt, sRGB + alfa. */
  readonly rgba: Uint8ClampedArray;
  readonly channels: RenderChannels;
  readonly palette: ResolvedPalette;
  /** Ezmeler uygulandıktan SONRAKİ belge — ölçüm bunu okur. */
  readonly doc: SpriteDoc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bir alanı KAPSAMAYA çevirir — §5.8'in tek uygulandığı yer.
 *
 * `unit` alan zaten kapsamadır, kelepçelenir. `signed` alan işaretli
 * mesafedir ve eşikten geçer:
 *
 * - `antialias: false` → `d <= 0 ? 1 : 0`. Keskin piksel; düşük çözünürlükte
 *   istenen budur.
 * - `antialias: true`  → yarım piksel genişliğinde yumuşak geçiş. Genişlik
 *   BİRİM UZAYDA SABİT OLAMAZ: 1024²'de yumuşak olan bir genişlik 32²'de
 *   şeklin tamamını yutar. Bu yüzden piksel boyutundan türetilir.
 *
 * `antialias`ın tüm varlık sebebi çözünürlüğe bağlı kenar davranışıdır;
 * piksel biriminin buraya sızması D2'ye aykırı değil, D2'nin kendisidir.
 */
function toCoverageFn(
  field: FieldFn,
  node: FieldNode,
  space: UnitSpace,
  antialias: boolean,
): FieldFn {
  if (resolveFieldDomain(node) === 'unit') {
    return (x, y) => clamp01(field(x, y));
  }
  if (!antialias) {
    return (x, y) => (field(x, y) <= 0 ? 1 : 0);
  }
  const half = space.pixelUnit / 2;
  const span = 1 / (2 * half);
  return (x, y) => {
    const t = clamp01((field(x, y) + half) * span);
    // Azalan yumuşatma: mesafe −half iken 1 (tam içeride), +half iken 0.
    return 1 - t * t * (3 - 2 * t);
  };
}

/** Bir katman alanını derleyip kapsamaya çeviren yardımcı. */
function compileCoverage(
  node: FieldNode,
  path: string,
  seed: number,
  space: UnitSpace,
  antialias: boolean,
): FieldFn {
  return toCoverageFn(compileField(node, path, seed), node, space, antialias);
}

/** Aşama 1: derlenmiş alanı hedef çözünürlükte tampona yazar (yeniden örnekleme YOK). */
function evaluateInto(buffer: FieldBuffer, field: FieldFn, space: UnitSpace): void {
  const { width, height, data } = buffer;
  for (let py = 0; py < height; py++) {
    const y = space.unitY(py);
    const row = py * width;
    for (let px = 0; px < width; px++) {
      data[row + px] = field(space.unitX(px), y);
    }
  }
}

function renderLayer(
  layer: LayerSpec,
  doc: SpriteDoc,
  space: UnitSpace,
  pool: FieldBufferPool,
  accumulator: RenderChannels,
): void {
  const antialias = doc.antialias ?? false;
  const { width, height } = space;
  const pixelCount = width * height;

  const layerCoverage = pool.acquire(width, height);
  const layerHeight = pool.acquire(width, height);

  try {
    // (a) üreteç ∘ domain zinciri — fonksiyonel, ara raster yok.
    const sourceFn = applyDomainChain(
      compileCoverage(layer.source, `${layer.id}/source`, doc.seed, space, antialias),
      layer.domain,
    );
    evaluateInto(layerCoverage, sourceFn, space);

    // (b) maske. Maske ŞEKİLDİR, opaklık değil: bu yüzden kapsamayı çarpar
    //     ve malzeme eşiği maskelenmiş kapsamayı sınar. Aksi halde maskeyle
    //     gizlenen bölge altındaki katmanın rengini bu katmanın rampasıyla
    //     ezerdi — görünmeyen bir katmanın görünür bir yan etkisi.
    if (layer.mask) {
      const mask = pool.acquire(width, height);
      try {
        evaluateInto(
          mask,
          compileCoverage(layer.mask, `${layer.id}/mask`, doc.seed, space, antialias),
          space,
        );
        for (let i = 0; i < pixelCount; i++) layerCoverage.data[i] *= mask.data[i];
      } finally {
        pool.release(mask);
      }
    }

    // (c) komşuluk filtreleri — Tur 2.

    // (e) ayrı yükseklik alanı; yoksa kapsama kullanılır. Ayrı olabilmesi
    //     gerekir, yoksa "düz siluet, dokulu yüzey" ifade edilemez.
    if (layer.height) {
      evaluateInto(
        layerHeight,
        compileCoverage(layer.height, `${layer.id}/height`, doc.seed, space, antialias),
        space,
      );
    } else {
      layerHeight.data.set(layerCoverage.data);
    }

    const blend = layer.blend ?? DEFAULT_BLEND;
    const heightBlend = layer.heightBlend ?? DEFAULT_HEIGHT_BLEND;
    const opacity = layer.opacity ?? DEFAULT_OPACITY;
    const material = layer.material ?? DEFAULT_MATERIAL;
    const threshold = layer.materialThresholdCoverage ?? DEFAULT_MATERIAL_THRESHOLD;

    for (let i = 0; i < pixelCount; i++) {
      const coverage = layerCoverage.data[i];
      // (d) opaklık kapsamadan AYRI: `opacity: 0.3` veren bir katman hâlâ
      //     "şekil burada" der, yalnızca daha saydam görünür.
      const alpha = coverage * opacity;

      accumulator.coverage[i] = blendCoverage(blend, accumulator.coverage[i], alpha);
      accumulator.height[i] = blendHeight(
        heightBlend,
        accumulator.height[i],
        layerHeight.data[i] * alpha,
      );
      if (coverage > threshold) accumulator.material[i] = material;
    }
  } finally {
    pool.release(layerHeight);
    pool.release(layerCoverage);
  }
}

/**
 * Belgeyi RGBA'ya çevirir.
 *
 * Girdi `unknown`dur ve İÇERİDE doğrulanır: tek giriş noktasının doğrulamayı
 * atlaması mümkün olmamalı. Doğrulanmış belgeyi elinde tutan çağıran
 * `validateSpriteDoc` sonucunu geçirir; maliyet ihmal edilebilir.
 */
export function renderSprite(input: unknown, options: RenderOptions = {}): RenderResult {
  const merged =
    isRecord(input) && (options.size || options.seed !== undefined)
      ? {
          ...input,
          ...(options.size ? { size: options.size } : {}),
          ...(options.seed !== undefined ? { seed: options.seed } : {}),
        }
      : input;

  const doc = validateSpriteDoc(merged);
  const [width, height] = doc.size;
  const space = createUnitSpace(width, height);
  const palette = resolvePalette(doc.palette);
  const pool = options.pool ?? new FieldBufferPool();

  const pixelCount = width * height;
  const channels: RenderChannels = {
    coverage: new Float32Array(pixelCount),
    height: new Float32Array(pixelCount),
    material: new Uint8Array(pixelCount),
  };

  for (const layer of doc.layers) renderLayer(layer, doc, space, pool, channels);

  // Tur 1'de gölge YÜKSEKLİĞİN KENDİSİDİR. Tur 3 buraya Lambert + ambient +
  // rim + AO koyacak; nicemleyicinin sözleşmesi değişmez, `shade`in kaynağı
  // değişir. Aradaki özdeşlik, yükseklik kanalını bugünden ölçülebilir yapar.
  const shade = channels.height;

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  quantizeToRgba(channels.coverage, shade, channels.material, palette, rgba);

  return { width, height, rgba, channels, palette, doc };
}
