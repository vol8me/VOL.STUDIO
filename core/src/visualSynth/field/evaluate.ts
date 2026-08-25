/**
 * Alan derleyicisi — D4'ün iki aşamasını tek ağaçta birleştirir.
 *
 * **Aşama 1 (fonksiyonel).** Üreteç ∘ alan-uzayı zinciri her çıktı pikseli
 * için TEK SEFERDE değerlendirilir: koordinat dönüştürülür, üreteç dönüşmüş
 * koordinatta okunur. Döndürme, aynalama, kutupsal — hepsi TAMdır, ara
 * raster yoktur.
 *
 * **Aşama 2 (tamponlu).** Komşuluk filtreleri, `warp` ve `scatter` komşu
 * piksel okur; girdilerini hedef çözünürlükte bir tampona yazar ve sonucu
 * oradan örneklerler. Bunlar ağacın DÜĞÜMÜDÜR, ayrı bir katman adımı değil:
 * böylece `source`, `mask`, `height` ve hatta `warp`ın kendi `by` alanı
 * içinde de kullanılabilirler. Ayrı bir katman dizisi olsaydı filtre yalnızca
 * kapsamaya uygulanabilir, maskenin ya da yüksekliğin bulanıklaştırılması
 * ifade edilemezdi.
 *
 * Derleme belge başına bir kez koşar: açı-radyan dönüşümü, tohum türetimi,
 * kafes kurulumu ve tampon doldurma burada olur; piksel başına kalan iş
 * yalnızca kapanış çağrılarıdır.
 */

import { seedFromString } from '../../random/random';
import type { DomainOp, FieldNode, Vec2 } from '../types';
import {
  angularGradientField,
  constantField,
  diamondGradientField,
  linearGradientField,
  radialGradientField,
} from './generators';
import { fbmField, simplexNoiseField, valueNoiseField, worleyNoiseField } from './noise';
import {
  arcSdfField,
  boxSdfField,
  capsuleSdfField,
  circleSdfField,
  lineSdfField,
  pathSdfField,
  polygonSdfField,
  roundBoxSdfField,
  starSdfField,
} from './sdf';
import {
  checkerPatternField,
  dotsPatternField,
  gridPatternField,
  hexPatternField,
  stripesPatternField,
} from './patterns';
import {
  mirrorInverse,
  polarInverse,
  repeatInverse,
  rotateInverse,
  scaleInverse,
  skewInverse,
  translateInverse,
} from './domain';
import {
  absField,
  addFields,
  clampField,
  curveField,
  invertField,
  maxFields,
  minFields,
  mixFields,
  mulFields,
  overlayFields,
  remapField,
  screenFields,
  smoothIntersectionFields,
  smoothSubFields,
  smoothUnionFields,
  smoothstepField,
  stepField,
  subFields,
} from './combine';
import { boxBlur, dilate, edgeMagnitude, erode, gaussBlur, sharpen } from './filter';
import { signedDistanceField } from './distance';
import { createWarpField } from './warp';
import { renderScatter } from './scatter';
import { createLattice } from './lattice';
import { toCoverageFn } from './coverage';
import { createBufferSampler, type EdgeMode } from './sample';
import type { FieldBuffer, FieldBufferPool } from './buffer';
import type { UnitSpace } from './space';
import type { FieldFn } from './fn';

const DEG_TO_RAD = Math.PI / 180;
const ORIGIN: Vec2 = [0, 0];

export interface CompileContext {
  readonly rootSeed: number;
  readonly space: UnitSpace;
  readonly pool: FieldBufferPool;
  readonly tileable: boolean;
  readonly antialias: boolean;
  /** Tamponlu düğümlerin tuttuğu tamponlar; katman bitince iade edilir. */
  readonly acquired: FieldBuffer[];
}

export function createCompileContext(
  space: UnitSpace,
  pool: FieldBufferPool,
  rootSeed: number,
  tileable: boolean,
  antialias: boolean,
): CompileContext {
  return { space, pool, rootSeed, tileable, antialias, acquired: [] };
}

/** Derleme sırasında tutulan tamponları TERS SIRADA iade eder. */
export function releaseCompiled(context: CompileContext): void {
  for (let i = context.acquired.length - 1; i >= 0; i--) {
    context.pool.release(context.acquired[i]);
  }
  context.acquired.length = 0;
}

/**
 * Düğüm tohumu — D5.
 *
 * `kökTohum ⊕ hash(düğümYolu)`. Yol katman KİMLİĞİYLE başlar, indeksiyle
 * değil: listenin başına bir katman eklemek diğerlerinin tohumunu
 * kaydırırsa "şu parçayı biraz değiştir" isteği ilgisiz katmanları da
 * değiştirir ve fark gözden geçirilemez olur.
 */
export function deriveNodeSeed(rootSeed: number, path: string): number {
  return (rootSeed ^ seedFromString(path)) | 0;
}

/** Aşama 1: derlenmiş alanı hedef çözünürlükte tampona yazar. */
export function evaluateInto(buffer: FieldBuffer, field: FieldFn, space: UnitSpace): void {
  const { width, height, data } = buffer;
  for (let py = 0; py < height; py++) {
    const y = space.unitY(py);
    const row = py * width;
    for (let px = 0; px < width; px++) {
      data[row + px] = field(space.unitX(px), y);
    }
  }
}

function edgeMode(context: CompileContext): EdgeMode {
  return context.tileable ? 'wrap' : 'clamp';
}

/** Birim yarıçapı piksele çevirir — filtreler tampon üzerinde çalışır. */
function toPixelRadius(space: UnitSpace, unitRadius: number): number {
  return Math.round((unitRadius * space.short) / 2);
}

function materialize(field: FieldFn, context: CompileContext): FieldBuffer {
  const buffer = context.pool.acquire(context.space.width, context.space.height);
  context.acquired.push(buffer);
  evaluateInto(buffer, field, context.space);
  return buffer;
}

function compileNode(node: FieldNode, path: string, context: CompileContext): FieldFn {
  const { space, rootSeed, tileable } = context;
  const child = (name: string, target: FieldNode): FieldFn =>
    compileNode(target, `${path}/${name}`, context);

  switch (node.kind) {
    /* ── üreteçler: sabit ve gradyanlar ──────────────────────────────── */
    case 'const':
      return constantField(node.value);
    case 'gradient.linear':
      return linearGradientField(node.angle * DEG_TO_RAD, node.from, node.to);
    case 'gradient.radial': {
      const [cx, cy] = node.center ?? ORIGIN;
      return radialGradientField(cx, cy, node.radius);
    }
    case 'gradient.angular': {
      const [cx, cy] = node.center ?? ORIGIN;
      return angularGradientField(cx, cy, (node.offset ?? 0) * DEG_TO_RAD);
    }
    case 'gradient.diamond': {
      const [cx, cy] = node.center ?? ORIGIN;
      return diamondGradientField(cx, cy, node.size);
    }

    /* ── üreteçler: gürültü ──────────────────────────────────────────── */
    case 'noise.value':
      return valueNoiseField(
        createLattice(space, node.freq, tileable),
        node.seed ?? deriveNodeSeed(rootSeed, path),
      );
    case 'noise.simplex':
      return simplexNoiseField(node.freq, node.seed ?? deriveNodeSeed(rootSeed, path));
    case 'noise.worley':
      return worleyNoiseField(
        createLattice(space, node.freq, tileable),
        node.mode ?? 'F1',
        node.seed ?? deriveNodeSeed(rootSeed, path),
      );
    case 'noise.fbm':
      // Döşenebilir belgede oktavlar arası döndürme KAPALIDIR: döndürme
      // periyodikliği bozar, dolayısıyla §5.1 ile döşeme aynı anda elde
      // edilemez ve takas döşemenin lehine çözülmüştür.
      return fbmField(
        child('base', node.base),
        node.octaves,
        node.lacunarity ?? 2,
        node.gain ?? 0.5,
        !tileable,
      );

    /* ── üreteçler: işaretli mesafe alanları ─────────────────────────── */
    case 'sdf.circle': {
      const [cx, cy] = node.center ?? ORIGIN;
      return circleSdfField(cx, cy, node.r);
    }
    case 'sdf.box': {
      const [cx, cy] = node.center ?? ORIGIN;
      return boxSdfField(cx, cy, node.half[0], node.half[1]);
    }
    case 'sdf.roundBox': {
      const [cx, cy] = node.center ?? ORIGIN;
      return roundBoxSdfField(cx, cy, node.half[0], node.half[1], node.r);
    }
    case 'sdf.polygon': {
      const [cx, cy] = node.center ?? ORIGIN;
      return polygonSdfField(cx, cy, node.n, node.r, (node.rotation ?? 0) * DEG_TO_RAD);
    }
    case 'sdf.star': {
      const [cx, cy] = node.center ?? ORIGIN;
      return starSdfField(
        cx,
        cy,
        node.n,
        node.rOuter,
        node.rInner,
        (node.rotation ?? 0) * DEG_TO_RAD,
      );
    }
    case 'sdf.line':
      return lineSdfField(node.a[0], node.a[1], node.b[0], node.b[1], node.thickness);
    case 'sdf.capsule':
      return capsuleSdfField(node.a[0], node.a[1], node.b[0], node.b[1], node.r);
    case 'sdf.arc': {
      const [cx, cy] = node.center ?? ORIGIN;
      return arcSdfField(
        cx,
        cy,
        node.r,
        node.thickness,
        node.from * DEG_TO_RAD,
        node.to * DEG_TO_RAD,
      );
    }
    case 'sdf.path':
      return pathSdfField(node.points, node.r, node.closed ?? false);

    /* ── üreteçler: desenler ─────────────────────────────────────────── */
    case 'pattern.checker':
      return checkerPatternField(node.size);
    case 'pattern.stripes':
      return stripesPatternField(node.freq, (node.angle ?? 0) * DEG_TO_RAD, node.duty ?? 0.5);
    case 'pattern.dots':
      return dotsPatternField(node.freq, node.r);
    case 'pattern.grid':
      return gridPatternField(node.freq, node.thickness);
    case 'pattern.hex':
      return hexPatternField(node.freq);

    /* ── alan-uzayı işlemleri ────────────────────────────────────────── */
    case 'translate':
      return translateInverse(node.x, node.y, child('input', node.input));
    case 'rotate': {
      const [cx, cy] = node.center ?? ORIGIN;
      return rotateInverse(node.angle * DEG_TO_RAD, cx, cy, child('input', node.input));
    }
    case 'scale': {
      const [cx, cy] = node.center ?? ORIGIN;
      return scaleInverse(node.x, node.y, cx, cy, child('input', node.input));
    }
    case 'skew':
      return skewInverse(node.x, node.y, child('input', node.input));
    case 'mirror':
      return mirrorInverse(node.axis, node.count ?? 6, child('input', node.input));
    case 'repeat': {
      const [cx, cy] = node.center ?? ORIGIN;
      return repeatInverse(node.count, node.mode ?? 'tile', cx, cy, child('input', node.input));
    }
    case 'polar': {
      const [cx, cy] = node.center ?? ORIGIN;
      return polarInverse(cx, cy, node.inverse ?? false, child('input', node.input));
    }

    /* ── tamponlu düğümler ───────────────────────────────────────────── */
    case 'warp': {
      const by = materialize(child('by', node.by), context);
      return createWarpField(
        by,
        child('input', node.input),
        space,
        node.amount,
        node.sample ?? 'bilinear',
        edgeMode(context),
      );
    }
    case 'scatter': {
      const source = materialize(
        toCoverageFn(child('source', node.source), node.source, space, context.antialias),
        context,
      );
      const target = context.pool.acquire(space.width, space.height);
      context.acquired.push(target);
      renderScatter(source, target.data, space, {
        count: node.count,
        seed: node.seed ?? deriveNodeSeed(rootSeed, path),
        jitter: node.jitter ?? 0.5,
        rotJitter: (node.rotJitter ?? 0) * DEG_TO_RAD,
        scaleJitter: node.scaleJitter ?? 0,
        distribution: node.distribution ?? 'grid',
        minDistance: node.minDistance,
        tileable,
      });
      return createBufferSampler(target, space, 'nearest', edgeMode(context));
    }
    case 'blur': {
      const buffer = materialize(child('input', node.input), context);
      const radius = toPixelRadius(space, node.radius);
      if ((node.mode ?? 'box') === 'gauss') {
        gaussBlur(buffer.data, space.width, space.height, radius, edgeMode(context));
      } else {
        boxBlur(buffer.data, space.width, space.height, radius, edgeMode(context));
      }
      return createBufferSampler(buffer, space, 'bilinear', edgeMode(context));
    }
    case 'sharpen': {
      const buffer = materialize(child('input', node.input), context);
      sharpen(
        buffer.data,
        space.width,
        space.height,
        toPixelRadius(space, node.radius ?? 0.02),
        node.amount,
        edgeMode(context),
      );
      return createBufferSampler(buffer, space, 'bilinear', edgeMode(context));
    }
    case 'dilate': {
      const buffer = materialize(child('input', node.input), context);
      dilate(
        buffer.data,
        space.width,
        space.height,
        toPixelRadius(space, node.radius),
        edgeMode(context),
      );
      return createBufferSampler(buffer, space, 'nearest', edgeMode(context));
    }
    case 'erode': {
      const buffer = materialize(child('input', node.input), context);
      erode(
        buffer.data,
        space.width,
        space.height,
        toPixelRadius(space, node.radius),
        edgeMode(context),
      );
      return createBufferSampler(buffer, space, 'nearest', edgeMode(context));
    }
    case 'edge': {
      const buffer = materialize(child('input', node.input), context);
      edgeMagnitude(buffer.data, space.width, space.height, edgeMode(context));
      return createBufferSampler(buffer, space, 'bilinear', edgeMode(context));
    }
    case 'distance': {
      // Girdi önce KAPSAMAYA çevrilir: eşik "içeride mi" sorusudur ve bir
      // SDF'nin ham mesafesinde 0.5 eşiği anlamsız olurdu.
      const buffer = materialize(
        toCoverageFn(child('input', node.input), node.input, space, context.antialias),
        context,
      );
      const signed = signedDistanceField(
        buffer.data,
        space.width,
        space.height,
        node.threshold ?? 0.5,
        tileable,
      );
      // Piksel cinsinden çıkan mesafe BİRİM uzaya çevrilir; aksi hâlde aynı
      // belge iki çözünürlükte iki farklı şekil verirdi.
      const scale = space.pixelUnit;
      for (let i = 0; i < signed.length; i++) buffer.data[i] = signed[i] * scale;
      return createBufferSampler(buffer, space, 'bilinear', edgeMode(context));
    }

    /* ── birleştiriciler ─────────────────────────────────────────────── */
    case 'add':
    case 'sub':
    case 'mul':
    case 'min':
    case 'max':
    case 'screen':
    case 'overlay': {
      const a = child('a', node.a);
      const b = child('b', node.b);
      switch (node.kind) {
        case 'add':
          return addFields(a, b);
        case 'sub':
          return subFields(a, b);
        case 'mul':
          return mulFields(a, b);
        case 'min':
          return minFields(a, b);
        case 'max':
          return maxFields(a, b);
        case 'screen':
          return screenFields(a, b);
        default:
          return overlayFields(a, b);
      }
    }
    case 'sdf.smoothUnion':
      return smoothUnionFields(child('a', node.a), child('b', node.b), node.k);
    case 'sdf.smoothSub':
      return smoothSubFields(child('a', node.a), child('b', node.b), node.k);
    case 'sdf.smoothIntersection':
      return smoothIntersectionFields(child('a', node.a), child('b', node.b), node.k);
    case 'mix':
      return mixFields(child('a', node.a), child('b', node.b), node.t);
    case 'step':
      return stepField(node.edge, child('input', node.input));
    case 'smoothstep':
      return smoothstepField(node.e0, node.e1, child('input', node.input));
    case 'remap':
      return remapField(
        node.inMin,
        node.inMax,
        node.outMin,
        node.outMax,
        child('input', node.input),
      );
    case 'curve':
      return curveField(node.points, child('input', node.input));
    case 'clamp':
      return clampField(node.min, node.max, child('input', node.input));
    case 'abs':
      return absField(child('input', node.input));
    case 'invert':
      return invertField(child('input', node.input));

    default: {
      // Doğrulama bilinmeyen türü zaten reddeder; buraya düşmek şema ile
      // derleyicinin ayrıştığı anlamına gelir ve sessiz kalmamalıdır.
      const unknown: never = node;
      throw new Error(`Derlenemeyen alan düğümü: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Doğrulanmış bir alan ağacını derler. */
export function compileField(node: FieldNode, path: string, context: CompileContext): FieldFn {
  return compileNode(node, path, context);
}

/**
 * Katmanın `domain` zincirini kaynağa uygular.
 *
 * `[A, B]` ≡ `B(A(source))`: dizideki sıra şekle uygulanma sırasıdır, ters
 * eşleme sırası ise kapanışların iç içe geçmesinden kendiliğinden doğar
 * (§5.7). Ayrı bir sıra yönetimi yok.
 */
export function applyDomainChain(source: FieldFn, ops: readonly DomainOp[] | undefined): FieldFn {
  let result = source;
  for (const op of ops ?? []) {
    switch (op.kind) {
      case 'translate':
        result = translateInverse(op.x, op.y, result);
        break;
      case 'rotate': {
        const [cx, cy] = op.center ?? ORIGIN;
        result = rotateInverse(op.angle * DEG_TO_RAD, cx, cy, result);
        break;
      }
      case 'scale': {
        const [cx, cy] = op.center ?? ORIGIN;
        result = scaleInverse(op.x, op.y, cx, cy, result);
        break;
      }
      case 'skew':
        result = skewInverse(op.x, op.y, result);
        break;
      case 'mirror':
        result = mirrorInverse(op.axis, op.count ?? 6, result);
        break;
      case 'repeat': {
        const [cx, cy] = op.center ?? ORIGIN;
        result = repeatInverse(op.count, op.mode ?? 'tile', cx, cy, result);
        break;
      }
      case 'polar': {
        const [cx, cy] = op.center ?? ORIGIN;
        result = polarInverse(cx, cy, op.inverse ?? false, result);
        break;
      }
      default: {
        const unknown: never = op;
        throw new Error(`Derlenemeyen alan-uzayı işlemi: ${JSON.stringify(unknown)}`);
      }
    }
  }
  return result;
}
