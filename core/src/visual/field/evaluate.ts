/**
 * Aşama 1 derleyicisi — D4'ün fonksiyonel yarısı.
 *
 * Bir katmanın `üreteç ∘ alan-uzayı zinciri` her çıktı pikseli için TEK
 * SEFERDE değerlendirilir: koordinat dönüştürülür, üreteç dönüşmüş
 * koordinatta okunur. Döndürme, aynalama, ölçekleme — hepsi **tam**dır,
 * ara raster yoktur.
 *
 * Derleme belge başına bir kez koşar. Piksel başına kalan iş yalnızca
 * kapanış çağrılarıdır; açı-radyan dönüşümü, tohum türetimi ve merkez
 * varsayılanları burada bir kez çözülür.
 */

import { seedFromString } from '../../random/random';
import type { DomainOp, FieldNode, Vec2 } from '../types';
import {
  boxSdfField,
  circleSdfField,
  constantField,
  linearGradientField,
  radialGradientField,
  valueNoiseField,
} from './generators';
import { rotateInverse, scaleInverse, translateInverse } from './domain';
import {
  addFields,
  maxFields,
  minFields,
  mixFields,
  mulFields,
  smoothstepField,
  stepField,
} from './combine';
import type { FieldFn } from './fn';

const DEG_TO_RAD = Math.PI / 180;
const ORIGIN: Vec2 = [0, 0];

/**
 * Düğüm tohumu — D5.
 *
 * `kökTohum ⊕ hash(düğümYolu)`. Yol katman KİMLİĞİYLE başlar, indeksiyle
 * değil: listenin başına bir katman eklemek diğerlerinin tohumunu
 * kaydırırsa "şu parçayı biraz değiştir" isteği ilgisiz katmanları da
 * değiştirir ve fark gözden geçirilemez olur — D5'in yasakladığı tam olarak
 * budur.
 */
export function deriveNodeSeed(rootSeed: number, path: string): number {
  return (rootSeed ^ seedFromString(path)) | 0;
}

function compileNode(node: FieldNode, path: string, rootSeed: number): FieldFn {
  switch (node.kind) {
    case 'const':
      return constantField(node.value);
    case 'noise.value':
      return valueNoiseField(node.freq, node.seed ?? deriveNodeSeed(rootSeed, path));
    case 'gradient.linear':
      return linearGradientField(node.angle * DEG_TO_RAD, node.from, node.to);
    case 'gradient.radial': {
      const [cx, cy] = node.center ?? ORIGIN;
      return radialGradientField(cx, cy, node.radius);
    }
    case 'sdf.circle': {
      const [cx, cy] = node.center ?? ORIGIN;
      return circleSdfField(cx, cy, node.r);
    }
    case 'sdf.box': {
      const [cx, cy] = node.center ?? ORIGIN;
      return boxSdfField(cx, cy, node.half[0], node.half[1]);
    }
    case 'translate':
      return translateInverse(node.x, node.y, compileNode(node.input, `${path}/input`, rootSeed));
    case 'rotate': {
      const [cx, cy] = node.center ?? ORIGIN;
      return rotateInverse(
        node.angle * DEG_TO_RAD,
        cx,
        cy,
        compileNode(node.input, `${path}/input`, rootSeed),
      );
    }
    case 'scale': {
      const [cx, cy] = node.center ?? ORIGIN;
      return scaleInverse(
        node.x,
        node.y,
        cx,
        cy,
        compileNode(node.input, `${path}/input`, rootSeed),
      );
    }
    case 'add':
    case 'mul':
    case 'min':
    case 'max': {
      const a = compileNode(node.a, `${path}/a`, rootSeed);
      const b = compileNode(node.b, `${path}/b`, rootSeed);
      if (node.kind === 'add') return addFields(a, b);
      if (node.kind === 'mul') return mulFields(a, b);
      if (node.kind === 'min') return minFields(a, b);
      return maxFields(a, b);
    }
    case 'mix':
      return mixFields(
        compileNode(node.a, `${path}/a`, rootSeed),
        compileNode(node.b, `${path}/b`, rootSeed),
        node.t,
      );
    case 'step':
      return stepField(node.edge, compileNode(node.input, `${path}/input`, rootSeed));
    case 'smoothstep':
      return smoothstepField(node.e0, node.e1, compileNode(node.input, `${path}/input`, rootSeed));
    default: {
      // Doğrulama bilinmeyen türü zaten reddeder; buraya düşmek şema ile
      // derleyicinin ayrıştığı anlamına gelir ve sessiz kalmamalıdır.
      const unknown: never = node;
      throw new Error(`Derlenemeyen alan düğümü: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Doğrulanmış bir alan ağacını derler. */
export function compileField(node: FieldNode, path: string, rootSeed: number): FieldFn {
  return compileNode(node, path, rootSeed);
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
      default: {
        const unknown: never = op;
        throw new Error(`Derlenemeyen alan-uzayı işlemi: ${JSON.stringify(unknown)}`);
      }
    }
  }
  return result;
}
