/**
 * Değerlendirme boru hattı — §3. Çekirdeğin **tek giriş noktası**.
 *
 * DOM tanımaz (D8): `Canvas`, `ImageData`, `window` geçmez. Node'da ve
 * tarayıcıda aynı çalışır; PNG yazma ayrı bir alt-yolda yaşar.
 *
 * Boru hattı sırası ve her adımın gerekçesi belgede yazılıdır; buradaki
 * kod o sırayı birebir izler.
 */

import { resolvePalette, type ResolvedPalette } from './color/palette';
import { quantizeToRgba } from './color/quantize';
import { blendCoverage, blendHeight } from './field/blend';
import { FieldBufferPool, type FieldBuffer } from './field/buffer';
import { toCoverageFn } from './field/coverage';
import {
  applyDomainChain,
  compileField,
  createCompileContext,
  evaluateInto,
  releaseCompiled,
  type CompileContext,
} from './field/evaluate';
import type { FieldFn } from './field/fn';
import { createUnitSpace, type UnitSpace } from './field/space';
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

/** Bir katman alanını derleyip kapsamaya çeviren yardımcı. */
function compileCoverage(
  node: FieldNode,
  path: string,
  context: CompileContext,
  space: UnitSpace,
): FieldFn {
  return toCoverageFn(compileField(node, path, context), node, space, context.antialias);
}

function renderLayer(
  layer: LayerSpec,
  doc: SpriteDoc,
  space: UnitSpace,
  pool: FieldBufferPool,
  accumulator: RenderChannels,
): void {
  const { width, height } = space;
  const pixelCount = width * height;

  // Derleme bağlamı KATMAN BAŞINA kurulur ve katman bitince tamponlarını
  // iade eder: tamponlu düğümlerin (filtre, warp, scatter) tuttuğu bellek
  // belgenin tamamı boyunca değil, yalnızca kendi katmanı boyunca yaşar (D7).
  const context = createCompileContext(
    space,
    pool,
    doc.seed,
    doc.tileable ?? false,
    doc.antialias ?? false,
  );

  const layerCoverage = pool.acquire(width, height);
  const layerHeight = pool.acquire(width, height);

  try {
    // (a) üreteç ∘ domain zinciri — fonksiyonel, ara raster yok.
    const sourceFn = applyDomainChain(
      compileCoverage(layer.source, `${layer.id}/source`, context, space),
      layer.domain,
    );
    evaluateInto(layerCoverage, sourceFn, space);

    // (b) maske. Maske ŞEKİLDİR, opaklık değil: bu yüzden kapsamayı çarpar
    //     ve malzeme eşiği maskelenmiş kapsamayı sınar. Aksi halde maskeyle
    //     gizlenen bölge altındaki katmanın rengini bu katmanın rampasıyla
    //     ezerdi — görünmeyen bir katmanın görünür yan etkisi.
    if (layer.mask) {
      const mask = pool.acquire(width, height);
      try {
        evaluateInto(mask, compileCoverage(layer.mask, `${layer.id}/mask`, context, space), space);
        for (let i = 0; i < pixelCount; i++) layerCoverage.data[i] *= mask.data[i];
      } finally {
        pool.release(mask);
      }
    }

    // (c) komşuluk filtreleri ağacın DÜĞÜMÜDÜR (bkz. `field/evaluate.ts`),
    //     ayrı bir katman adımı değil; burada yapılacak iş kalmaz.

    // (e) ayrı yükseklik alanı; yoksa kapsama kullanılır. Ayrı olabilmesi
    //     gerekir, yoksa "düz siluet, dokulu yüzey" ifade edilemez.
    if (layer.height) {
      evaluateInto(
        layerHeight,
        compileCoverage(layer.height, `${layer.id}/height`, context, space),
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
    releaseCompiled(context);
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

  // Tur 1–2'de gölge YÜKSEKLİĞİN KENDİSİDİR. Tur 3 buraya Lambert + ambient +
  // rim + AO koyacak; nicemleyicinin sözleşmesi değişmez, `shade`in kaynağı
  // değişir. Aradaki özdeşlik, yükseklik kanalını bugünden ölçülebilir yapar.
  const shade = channels.height;

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  quantizeToRgba(channels.coverage, shade, channels.material, palette, rgba);

  return { width, height, rgba, channels, palette, doc };
}

export type { FieldBuffer };
