/**
 * Render öncesi yapısal maliyet analizi.
 *
 * Bu modül süre tahmini yapmaz; donanıma, JS motoruna ve çözünürlüğe bağlı
 * olmayan graph gerçeklerini raporlar. Özellikle tamponlu düğümlerin kaç tam
 * çözünürlük tamponu istediğini bilmeden cache/tile optimizasyonu seçmek,
 * bellek sınırlarını görünmezce değiştirmek olurdu.
 */

import { NODE_SCHEMAS } from './schema';
import { MAX_UNIT_RADIUS } from './schema/types';
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
  /** Belgedeki tüm `sdf.path` düğümlerinin toplam segment sayısı (kapalı yol
   *  başına nokta sayısı kadar, açık yolda bir eksik). */
  readonly pathSegmentCount: number;
  /**
   * `sdf.path` maliyet göstergesi: Σ(segment × pikselSayısı). `pathSdfField`
   * her segmenti HER pikselde test eder (bkz. `field/sdf.ts`) — tek bir
   * düğümde 64 nokta şema açısından legaldir ama 2048² bir render'da bu
   * TEK BAŞINA ~8 milyar (63 segment × ~4.2M piksel) mesafe testi demektir.
   * Bu alan implementasyonu değiştirmez, yalnızca maliyeti görünür kılar —
   * tüketici (UI/CLI) bunu bir uyarı eşiğiyle karşılaştırabilir.
   */
  readonly estimatedPathSegmentTests: number;
  /** Kanal + çalışma tamponları için muhafazakâr tepe bellek, bayt. */
  readonly estimatedPeakWorkingBytes: number;
  /** Tahminin nasıl kurulduğunu denetlenebilir biçimde taşır. */
  readonly memoryEstimate: VisualMemoryEstimate;
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

export interface VisualMemoryEstimate {
  /** Sonuçta ve aynı anda canlı olan bilinen typed-array alanı. */
  readonly knownTypedArrayBytes: number;
  /** Filtre, mesafe, outline ve benzeri geçici scratch alanı. */
  readonly transientScratchBytes: number;
  /** JSON graph, teşhis ve JS nesne başlıkları için ayrılan taban. */
  readonly metadataBytes: number;
  /** Bilinmeyen motor/allocator farklarına karşı açık pay. */
  readonly safetyMarginBytes: number;
  /** `known + scratch + metadata + margin`; cache kopyasını içermez. */
  readonly estimatedPeakWorkingBytes: number;
  /**
   * **`'conservative'` yalnızca modelin YAPISINI anlatır (üstten yuvarlama,
   * +%50 pay) — gerçek çalışma zamanı ölçümüyle DOĞRULANMIŞ bir üst sınır
   * değildir.** `--expose-gc` ile zorla ölçülen gerçek yığın artışı, örnek
   * kataloğun 128×128 render'larında bu tahminin ~5–31 katına çıktı (bkz.
   * `core/tests/visualSynth/memoryEstimateAccuracy.test.ts`). En olası
   * açıklama: bu model yalnızca `category: 'buffered'` düğümlerin kalıcı
   * tam-çözünürlük tamponunu sayıyor; tamponsuz düğümlerin render.ts'te
   * gerçekten piksel-piksel akışla mı değerlendirildiği yoksa kendi ara
   * dizisini mi ürettiği doğrulanmadı. Kök neden kanıtlanmadan formül
   * değiştirilmedi (RenderCache/tile uygunluk kararlarını sessizce
   * bozabilirdi) — bu alan tüketiciyi UYARMAK için var, iddiayı savunmak
   * için değil.
   */
  readonly confidence: 'conservative';
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
  pathSegmentCount: number;
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
  if (node.kind === 'sdf.path') {
    // `pathSdfField` (field/sdf.ts): kapalıda nokta sayısı kadar, açıkta bir
    // eksik segment üretir — 0/1 noktalı yollarda segment sayısı 0'dır.
    const segmentCount = node.closed ? node.points.length : Math.max(0, node.points.length - 1);
    analysis.pathSegmentCount += segmentCount;
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
    pathSegmentCount: 0,
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
  // render sonucunun yaşayacağı temel tamponları da görünür kılar.
  const stackMultiplier = Math.max(1, analysis.maxStackDepth + 1);
  const channelBytes = pixelCount * 9 * stackMultiplier;
  const layerBytes = pixelCount * (8 + analysis.maxLayerBufferCount * 4) * stackMultiplier;
  const resultBytes =
    pixelCount *
    (4 + // RGBA çıktısı
      9 + // sonuç kanalları
      (doc.shade === undefined ? 0 : 4) +
      (doc.shade === undefined ? 0 : 12) + // normal x/y/z
      (doc.post?.outline && doc.post.outline.px > 0 ? 1 : 0) +
      (doc.post?.glow && doc.post.glow.radius > 0 ? 4 : 0));
  const knownTypedArrayBytes = channelBytes + layerBytes + resultBytes;

  // Ayrılabilir filtreler piksel başına değil, en uzun satır + padding kadar
  // Float64 scratch ayırır. `MAX_UNIT_RADIUS`, doğrulayıcının gerçek sert
  // tavanıdır; yalnızca `range`e güvenmek bu tahmini yine iyimser bırakırdı.
  const span = Math.max(width, height);
  const short = Math.min(width, height);
  const maxFilterRadius = Math.ceil((MAX_UNIT_RADIUS * short) / 2);
  const filterScratchBytes = 8 * (span + 2 * maxFilterRadius) + 8 * span; // padded + out
  const hasFilter = ['blur', 'sharpen', 'dilate', 'erode'].some(
    (kind) => (analysis.bufferedByKind[kind] ?? 0) > 0,
  );
  const filterCopyBytes = (analysis.bufferedByKind.sharpen ?? 0) > 0 ? pixelCount * 4 : 0;

  // `distance` iki yönlü mesafe dönüşümünde Float64 alanlarını, dönüşüm
  // scratch'lerini ve dış sonucu aynı anda yaşatır. Tileable kipte üç kat
  // satır kopyası kullanıldığı için aynı formülle daha büyük sınır alınır.
  const distanceTransformSpan = doc.tileable ? span * 3 : span;
  const distanceScratchBytes =
    (analysis.bufferedByKind.distance ?? 0) > 0
      ? 8 * (2 * pixelCount + 4 * distanceTransformSpan)
      : 0;

  const aoScratchBytes = doc.shade?.ao === undefined ? 0 : pixelCount * 8 + filterScratchBytes;
  const outlineScratchBytes = doc.post?.outline && doc.post.outline.px > 0 ? pixelCount * 13 : 0;
  const glowScratchBytes =
    doc.post?.glow && doc.post.glow.radius > 0 ? pixelCount * 4 + filterScratchBytes : 0;
  const ditherScratchBytes = doc.post?.dither?.kind === 'blueNoise' ? 256 * 1024 : 0;
  const transientScratchBytes =
    (hasFilter ? filterScratchBytes + filterCopyBytes : 0) +
    distanceScratchBytes +
    aoScratchBytes +
    outlineScratchBytes +
    glowScratchBytes +
    ditherScratchBytes;

  // Typed array'ler JS nesnelerinin tamamı değildir. Graph, teşhis listeleri,
  // Map/Set ve allocator başlıkları için ölçülebilir JSON boyutuna ek olarak
  // düğüm/scatter başına sabit pay ayırıyoruz. Bu değer RSS değil, karar
  // vermeye yarayan muhafazakâr bir bütçedir.
  const serializedBytes =
    JSON.stringify(doc).length * 2 + JSON.stringify(analysis.bufferedByKind).length * 2;
  const metadataBytes =
    64 * 1024 + serializedBytes + analysis.fieldNodeCount * 128 + analysis.scatterNodeCount * 32;
  const subtotal = knownTypedArrayBytes + transientScratchBytes + metadataBytes;
  const safetyMarginBytes = Math.ceil(subtotal * 0.5);
  const estimatedPeakWorkingBytes = subtotal + safetyMarginBytes;
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
    pathSegmentCount: analysis.pathSegmentCount,
    estimatedPathSegmentTests: analysis.pathSegmentCount * pixelCount,
    estimatedPeakWorkingBytes,
    memoryEstimate: {
      knownTypedArrayBytes,
      transientScratchBytes,
      metadataBytes,
      safetyMarginBytes,
      estimatedPeakWorkingBytes,
      confidence: 'conservative',
    },
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
