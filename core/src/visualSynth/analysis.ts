/**
 * Render öncesi yapısal maliyet analizi.
 *
 * Bu modül süre tahmini yapmaz; donanıma, JS motoruna ve çözünürlüğe bağlı
 * olmayan graph gerçeklerini raporlar. Özellikle tamponlu düğümlerin kaç tam
 * çözünürlük tamponu istediğini bilmeden cache/tile optimizasyonu seçmek,
 * bellek sınırlarını görünmezce değiştirmek olurdu.
 */

import { NODE_SCHEMAS } from './schema';
import type { FieldNode, LayerSpec, LayerStack } from './types';
import { validateSpriteDoc } from './validate';

export interface VisualSpriteAnalysis {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly layerCount: number;
  readonly maxStackDepth: number;
  readonly fieldNodeCount: number;
  readonly maxFieldDepth: number;
  readonly bufferedNodeCount: number;
  /** Scatter iki, diğer tamponlu düğümler bir alan tamponu ister. */
  readonly requiredFullResolutionBuffers: number;
  readonly maxLayerBufferCount: number;
  readonly layersWithBufferedNodes: number;
  readonly scatterNodeCount: number;
  readonly requestedScatterCount: number;
  readonly bufferedByKind: Readonly<Record<string, number>>;
  /** Kanal + çalışma tamponları için yaklaşık tepe bellek, bayt. */
  readonly estimatedPeakWorkingBytes: number;
  /**
   * Bölge render'ı için güvenlik sözleşmesi.
   *
   * `haloPixels: null`, mevcut sürümün o graph için sonlu ve doğrulanmış bir
   * halo hesabı olmadığını anlatır; bunu tahminle doldurmak cache/tile
   * çıktısını bozabilir. `region` kipinde halo tam olarak sıfırdır.
   */
  readonly regionSupport: RegionRenderSupport;
  readonly flags: {
    readonly tileable: boolean;
    readonly antialias: boolean;
    readonly shade: boolean;
    readonly outline: boolean;
    readonly dither: boolean;
    readonly glow: boolean;
  };
}

export interface RegionRenderSupport {
  readonly mode: 'region' | 'fullFrame';
  readonly haloPixels: number | null;
  /** Makinece kararlı engel kodları; UI bunları kendi diline çevirir. */
  readonly blockers: readonly string[];
}

interface MutableAnalysis {
  layerCount: number;
  maxStackDepth: number;
  fieldNodeCount: number;
  maxFieldDepth: number;
  bufferedNodeCount: number;
  requiredFullResolutionBuffers: number;
  maxLayerBufferCount: number;
  layersWithBufferedNodes: number;
  scatterNodeCount: number;
  requestedScatterCount: number;
  bufferedByKind: Record<string, number>;
}

interface FieldStats {
  bufferedNodeCount: number;
  requiredFullResolutionBuffers: number;
}

function isLayerStack(value: unknown): value is LayerStack {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'layers' in value &&
      Array.isArray((value as { layers?: unknown }).layers),
  );
}

function fieldChildren(node: FieldNode): readonly FieldNode[] {
  const schema = NODE_SCHEMAS[node.kind];
  const children: FieldNode[] = [];
  for (const parameter of schema.params) {
    if (parameter.type !== 'field') continue;
    const child = (node as unknown as Record<string, unknown>)[parameter.name];
    if (child && typeof child === 'object') children.push(child as FieldNode);
  }
  return children;
}

function bufferCount(kind: FieldNode['kind']): number {
  if (kind === 'scatter') return 2;
  return NODE_SCHEMAS[kind].category === 'buffered' ? 1 : 0;
}

function visitField(
  node: FieldNode,
  depth: number,
  analysis: MutableAnalysis,
  fieldStats: FieldStats,
): void {
  analysis.fieldNodeCount++;
  analysis.maxFieldDepth = Math.max(analysis.maxFieldDepth, depth);

  const buffers = bufferCount(node.kind);
  if (buffers > 0) {
    fieldStats.bufferedNodeCount++;
    fieldStats.requiredFullResolutionBuffers += buffers;
    analysis.bufferedNodeCount++;
    analysis.requiredFullResolutionBuffers += buffers;
    analysis.bufferedByKind[node.kind] = (analysis.bufferedByKind[node.kind] ?? 0) + 1;
  }
  if (node.kind === 'scatter') {
    analysis.scatterNodeCount++;
    analysis.requestedScatterCount += node.count;
  }

  for (const child of fieldChildren(node)) visitField(child, depth + 1, analysis, fieldStats);
}

function visitLayer(layer: LayerSpec, stackDepth: number, analysis: MutableAnalysis): void {
  const fieldStats: FieldStats = {
    bufferedNodeCount: 0,
    requiredFullResolutionBuffers: 0,
  };

  visitField(layer.source, 1, analysis, fieldStats);
  if (layer.mask && isLayerStack(layer.mask)) {
    visitStack(layer.mask, stackDepth + 1, analysis);
  } else if (layer.mask) {
    visitField(layer.mask, 1, analysis, fieldStats);
  }
  if (layer.height) visitField(layer.height, 1, analysis, fieldStats);
  if (layer.materialMask && layer.materialAlt !== undefined) {
    visitField(layer.materialMask, 1, analysis, fieldStats);
  }

  // Bu iki ek tampon, compile context'ten değil doğrudan katman biriktirme
  // adımından gelir: maske ve alternatif malzeme seçicisi.
  if (layer.mask && !isLayerStack(layer.mask)) fieldStats.requiredFullResolutionBuffers++;
  if (layer.materialMask && layer.materialAlt !== undefined)
    fieldStats.requiredFullResolutionBuffers++;

  analysis.maxLayerBufferCount = Math.max(
    analysis.maxLayerBufferCount,
    fieldStats.requiredFullResolutionBuffers,
  );
  if (fieldStats.bufferedNodeCount > 0) analysis.layersWithBufferedNodes++;
}

function visitStack(stack: LayerStack, stackDepth: number, analysis: MutableAnalysis): void {
  analysis.maxStackDepth = Math.max(analysis.maxStackDepth, stackDepth);
  for (const layer of stack.layers) {
    analysis.layerCount++;
    visitLayer(layer, stackDepth, analysis);
  }
}

/** Belgeyi doğrular ve renderer'ın full-resolution çalışma maliyetini raporlar. */
export function analyzeSpriteDoc(input: unknown): VisualSpriteAnalysis {
  const doc = validateSpriteDoc(input);
  const analysis: MutableAnalysis = {
    layerCount: 0,
    maxStackDepth: 0,
    fieldNodeCount: 0,
    maxFieldDepth: 0,
    bufferedNodeCount: 0,
    requiredFullResolutionBuffers: 0,
    maxLayerBufferCount: 0,
    layersWithBufferedNodes: 0,
    scatterNodeCount: 0,
    requestedScatterCount: 0,
    bufferedByKind: {},
  };

  visitStack({ layers: doc.layers }, 0, analysis);

  const [width, height] = doc.size;
  const pixelCount = width * height;
  // 9 B/piksel biriktirici + 8 B/piksel aktif katman + alan tamponları.
  // İç içe bir maske yığını `renderStack` içinde REKÜRSİF çağrılır (bkz.
  // render.ts renderLayer): üst katman kendi `layerCoverage`/`layerHeight`
  // ve alan tamponlarını serbest bırakmadan alt yığının render'ı biter,
  // yani her stack derinliği kendi biriktiricisini VE kendi katman
  // tamponlarını eş zamanlı canlı tutar — ikisi de derinlikle çarpılmalı.
  // `maxLayerBufferCount` belgedeki EN YOĞUN tek katmanın rakamıdır; onu her
  // derinlik seviyesinde tekrarlamak üstten bir tahmindir ama derinliği hiç
  // saymamaktan daha güvenlidir. Çıktı ve post/ışık kanalları da hesaba
  // katılır; bu nedenle inspector'daki rakam yalnız graph maliyetini değil,
  // render sonucunun yaşayacağı temel tamponları da görünür kılar. Bu bir
  // üstten tahmindir, kesin RSS iddiası değildir.
  const stackMultiplier = Math.max(1, analysis.maxStackDepth + 1);
  const channelBytes = 9 * stackMultiplier;
  const layerBytes = (8 + analysis.maxLayerBufferCount * 4) * stackMultiplier;
  const outputBytes = 4; // RGBA
  const shadingBytes = doc.shade === undefined ? 0 : 16 + (doc.shade.ao === undefined ? 0 : 8);
  const outlineBytes = doc.post?.outline && doc.post.outline.px > 0 ? 1 : 0;
  const glowBytes = doc.post?.glow && doc.post.glow.radius > 0 ? 4 : 0;
  const estimatedPeakWorkingBytes =
    pixelCount *
    (channelBytes + layerBytes + outputBytes + shadingBytes + outlineBytes + glowBytes);
  const blockers = Object.keys(analysis.bufferedByKind)
    .sort()
    .map((kind) => `buffered:${kind}`);
  if (doc.shade !== undefined) blockers.push('shade');
  if (doc.post?.outline && doc.post.outline.px > 0) blockers.push('post:outline');
  if (doc.post?.dither && doc.post.dither.kind !== 'none') blockers.push('post:dither');
  if (doc.post?.glow && doc.post.glow.radius > 0 && doc.post.glow.strength > 0) {
    blockers.push('post:glow');
  }
  const regionSupport: RegionRenderSupport =
    blockers.length === 0
      ? { mode: 'region', haloPixels: 0, blockers: [] }
      : { mode: 'fullFrame', haloPixels: null, blockers };

  return {
    width,
    height,
    pixelCount,
    layerCount: analysis.layerCount,
    maxStackDepth: analysis.maxStackDepth,
    fieldNodeCount: analysis.fieldNodeCount,
    maxFieldDepth: analysis.maxFieldDepth,
    bufferedNodeCount: analysis.bufferedNodeCount,
    requiredFullResolutionBuffers: analysis.requiredFullResolutionBuffers,
    maxLayerBufferCount: analysis.maxLayerBufferCount,
    layersWithBufferedNodes: analysis.layersWithBufferedNodes,
    scatterNodeCount: analysis.scatterNodeCount,
    requestedScatterCount: analysis.requestedScatterCount,
    bufferedByKind: analysis.bufferedByKind,
    estimatedPeakWorkingBytes,
    regionSupport,
    flags: {
      tileable: doc.tileable === true,
      antialias: doc.antialias === true,
      shade: doc.shade !== undefined,
      outline: Boolean(doc.post?.outline && doc.post.outline.px > 0),
      dither: Boolean(doc.post?.dither && doc.post.dither.kind !== 'none'),
      glow: Boolean(doc.post?.glow && doc.post.glow.radius > 0 && doc.post.glow.strength > 0),
    },
  };
}
