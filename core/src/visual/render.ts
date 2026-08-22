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
import { generatePalette } from './color/generate';
import { applyDither, resolveDitherMatrix } from './color/dither';
import { buildShadeTables, quantizeToRgba, type ShadeTables } from './color/quantize';
import { computeNormals, type NormalChannel } from './shade/normal';
import { computeShade } from './shade/lighting';
import { computeAo } from './shade/ao';
import { computeOutline } from './shade/outline';
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
import type { EdgeMode } from './field/sample';
import { createUnitSpace, type UnitSpace } from './field/space';
import type { FieldNode, LayerSpec, LayerStack, PaletteSpec, SpriteDoc } from './types';
import { MAX_STACK_DEPTH, validateSpriteDoc } from './validate';

/** Katman varsayılanları — §2'de opsiyonel olan her alanın karşılığı. */
const DEFAULT_BLEND = 'over';
const DEFAULT_HEIGHT_BLEND = 'max';
const DEFAULT_OPACITY = 1;
const DEFAULT_MATERIAL = 0;
const DEFAULT_MATERIAL_THRESHOLD = 0.5;

/** Gölgeleme varsayılanları — §2'nin `shade` örneğiyle aynı. */
const DEFAULT_LIGHT: readonly [number, number, number] = [-0.55, -0.7, 0.45];
const DEFAULT_LIGHT_STRENGTH = 0.6;
const DEFAULT_AMBIENT = 0.35;
const DEFAULT_RIM = 0.15;
const DEFAULT_RELIEF = 1;

const DEFAULT_OUTLINE_MODE = 'outside';
const DEFAULT_OUTLINE_COLOR = 0;
const DEFAULT_DITHER_AMOUNT = 0.15;

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
  /** Nicemlemeye giren 0..1 aydınlık; `shade` yoksa yüksekliğin kendisi. */
  readonly shade: Float32Array;
  /** `shade` yapılandırması yoksa null — normal hiç hesaplanmaz. */
  readonly normal: NormalChannel | null;
  /** Dış çizgi maskesi; `post.outline` yoksa null. */
  readonly outline: Uint8Array | null;
  readonly palette: ResolvedPalette;
  /** Ezmeler uygulandıktan SONRAKİ belge — ölçüm bunu okur. */
  readonly doc: SpriteDoc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLayerStack(mask: FieldNode | LayerStack): mask is LayerStack {
  return Array.isArray((mask as LayerStack).layers);
}

/** Palet ya doğrudan veri ya da sentez isteğidir (§7.1). */
export function resolvePaletteSpec(spec: PaletteSpec): ResolvedPalette {
  if (spec.generate) {
    const generated = generatePalette(spec.generate);
    return resolvePalette({ colors: generated.colors, ramps: generated.ramps });
  }
  return resolvePalette({ colors: spec.colors ?? [], ramps: spec.ramps ?? [] });
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

function createChannels(count: number): RenderChannels {
  return {
    coverage: new Float32Array(count),
    height: new Float32Array(count),
    material: new Uint8Array(count),
  };
}

function renderLayer(
  layer: LayerSpec,
  doc: SpriteDoc,
  space: UnitSpace,
  pool: FieldBufferPool,
  accumulator: RenderChannels,
  depth: number,
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
      if (isLayerStack(layer.mask)) {
        const nested = renderStack(layer.mask.layers, doc, space, pool, depth + 1);
        for (let i = 0; i < pixelCount; i++) layerCoverage.data[i] *= nested.coverage[i];
      } else {
        const mask = pool.acquire(width, height);
        try {
          evaluateInto(
            mask,
            compileCoverage(layer.mask, `${layer.id}/mask`, context, space),
            space,
          );
          for (let i = 0; i < pixelCount; i++) layerCoverage.data[i] *= mask.data[i];
        } finally {
          pool.release(mask);
        }
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

    // İkinci malzeme: aşınma, pas, damar. Basit durum basit kalsın diye
    // opsiyoneldir; verilmezse katman tek rampa yazar.
    let materialSelector: FieldBuffer | null = null;
    if (layer.materialMask && layer.materialAlt !== undefined) {
      materialSelector = pool.acquire(width, height);
      evaluateInto(
        materialSelector,
        compileCoverage(layer.materialMask, `${layer.id}/materialMask`, context, space),
        space,
      );
    }

    const blend = layer.blend ?? DEFAULT_BLEND;
    const heightBlend = layer.heightBlend ?? DEFAULT_HEIGHT_BLEND;
    const opacity = layer.opacity ?? DEFAULT_OPACITY;
    const material = layer.material ?? DEFAULT_MATERIAL;
    const materialAlt = layer.materialAlt ?? material;
    const materialThreshold = layer.materialThreshold ?? 0.5;
    const threshold = layer.materialThresholdCoverage ?? DEFAULT_MATERIAL_THRESHOLD;

    try {
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
        if (coverage > threshold) {
          accumulator.material[i] =
            materialSelector && materialSelector.data[i] > materialThreshold
              ? materialAlt
              : material;
        }
      }
    } finally {
      if (materialSelector) pool.release(materialSelector);
    }
  } finally {
    releaseCompiled(context);
    pool.release(layerHeight);
    pool.release(layerCoverage);
  }
}

/**
 * Katman yığınını biriktiriciye çizer (D10).
 *
 * Alt-yığınlar KENDİ biriktiricisini ayırır; D7'nin bütçesi bunu seviye
 * başına 9 MB olarak sayar. Havuzdan almazlar çünkü ömürleri iç içedir ve
 * havuz iade sırasını değil sahipliği izler.
 */
function renderStack(
  layers: readonly LayerSpec[],
  doc: SpriteDoc,
  space: UnitSpace,
  pool: FieldBufferPool,
  depth: number,
): RenderChannels {
  if (depth > MAX_STACK_DEPTH) {
    throw new Error(`Görsel: katman yığını ${MAX_STACK_DEPTH} seviyeden derin olamaz`);
  }
  const channels = createChannels(space.width * space.height);
  for (const layer of layers) renderLayer(layer, doc, space, pool, channels, depth);
  return channels;
}

/**
 * §3 adım 4 — biçimlendirme.
 *
 * `shade` verilmezse gölge YÜKSEKLİĞİN KENDİSİdir. Bu bir yer tutucu değil,
 * bilinçli bir varsayılan: ışık modeli olmadan da yükseklik kanalı görünür
 * kalır ve basit belgeler basit yazılır.
 */
function computeShading(
  doc: SpriteDoc,
  space: UnitSpace,
  channels: RenderChannels,
  edge: EdgeMode,
): { shade: Float32Array; normal: NormalChannel | null } {
  const spec = doc.shade;
  if (!spec) return { shade: channels.height, normal: null };

  const count = space.width * space.height;
  const normal = computeNormals(
    channels.height,
    space.width,
    space.height,
    spec.relief ?? DEFAULT_RELIEF,
    space.pixelUnit,
    edge,
  );

  const shade = computeShade(normal, count, {
    light: spec.light ?? DEFAULT_LIGHT,
    strength: spec.strength ?? DEFAULT_LIGHT_STRENGTH,
    ambient: spec.ambient ?? DEFAULT_AMBIENT,
    rim: spec.rim ?? DEFAULT_RIM,
  });

  if (spec.ao) {
    const radiusPx = Math.round((spec.ao.radius * space.short) / 2);
    const occlusion = computeAo(
      channels.height,
      space.width,
      space.height,
      radiusPx,
      spec.ao.strength,
      edge,
    );
    for (let i = 0; i < count; i++) shade[i] *= 1 - occlusion[i];
  }

  return { shade, normal };
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
  const palette = resolvePaletteSpec(doc.palette);
  const pool = options.pool ?? new FieldBufferPool();
  const edge: EdgeMode = doc.tileable ? 'wrap' : 'clamp';
  const pixelCount = width * height;

  const channels = renderStack(doc.layers, doc, space, pool, 0);
  const { shade, normal } = computeShading(doc, space, channels, edge);

  // (5) DIŞ ÇİZGİ — maske silüeti büyütebilir, bu yüzden kapsamaya da yazılır.
  let outline: Uint8Array | null = null;
  const outlineSpec = doc.post?.outline;
  if (outlineSpec && outlineSpec.px > 0) {
    outline = computeOutline(
      channels.coverage,
      width,
      height,
      outlineSpec.px,
      outlineSpec.mode ?? DEFAULT_OUTLINE_MODE,
      edge,
    );
    for (let i = 0; i < pixelCount; i++) if (outline[i] === 1) channels.coverage[i] = 1;
  }

  // (6) DITHER — gölgeye piksel konumundan gelen küçük bir sapma ekler.
  const ditherSpec = doc.post?.dither;
  if (ditherSpec && ditherSpec.kind !== 'none') {
    const matrix = resolveDitherMatrix(ditherSpec.kind);
    if (matrix) {
      applyDither(shade, width, height, matrix, ditherSpec.amount ?? DEFAULT_DITHER_AMOUNT);
    }
  }

  // (7) NİCEMLE — boru hattının son renk işlemi (D6).
  const tables: ShadeTables = buildShadeTables(palette, doc.post?.quantize?.mode ?? 'ramp');
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  quantizeToRgba(channels.coverage, shade, channels.material, palette, rgba, {
    tables,
    outline: outline
      ? { mask: outline, colorIndex: outlineSpec?.colorIndex ?? DEFAULT_OUTLINE_COLOR }
      : null,
  });

  return { width, height, rgba, channels, shade, normal, outline, palette, doc };
}

export type { FieldBuffer, NormalChannel };
