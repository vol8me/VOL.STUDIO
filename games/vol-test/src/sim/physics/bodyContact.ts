import { clamp } from '@volstudio/core/math/interpolation';
import type { RigidBody } from './RigidBody';
import type { Contact, ContactShape } from './wallContact';

interface Corner {
  x: number;
  y: number;
}

/** Cismin dört köşesi (dünya çerçevesi). */
function corners(body: RigidBody, shape: ContactShape, out: Corner[]): Corner[] {
  const fx = Math.cos(body.angle);
  const fy = Math.sin(body.angle);
  let index = 0;
  for (const along of [1, -1]) {
    for (const across of [1, -1]) {
      const corner = out[index++];
      corner.x = body.x + fx * shape.halfLength * along - fy * shape.halfWidth * across;
      corner.y = body.y + fy * shape.halfLength * along + fx * shape.halfWidth * across;
    }
  }
  return out;
}

/** Köşelerin bir eksen üzerindeki izdüşüm aralığı. */
function project(points: readonly Corner[], ax: number, ay: number): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * ax + point.y * ay;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

const scratchA: Corner[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
const scratchB: Corner[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

/**
 * İki dikdörtgen cisim arasındaki teması ayırıcı eksen testiyle (SAT) bulur
 * ve çözer: en az örtüşen eksen temas normalidir. Cisimler kütle oranında
 * ayrılır; temas noktasında iki cisimli normal itki (sekme) ve sürtünme itkisi
 * uygulanır. Dönen temasın `speed`i yaklaşma hızıdır; 0 ise temas yoktur.
 *
 * Temas noktası: B'nin A'ya en derin giren köşesi, yoksa A'nın B'ye en derin
 * giren köşesi; kenar kenara temasta iki köşenin ortası.
 */
export function resolveBodyContact(
  a: RigidBody,
  shapeA: ContactShape,
  b: RigidBody,
  shapeB: ContactShape,
  out: Contact,
): Contact {
  out.speed = 0;
  const cornersA = corners(a, shapeA, scratchA);
  const cornersB = corners(b, shapeB, scratchB);
  const axes: Array<[number, number]> = [
    [Math.cos(a.angle), Math.sin(a.angle)],
    [-Math.sin(a.angle), Math.cos(a.angle)],
    [Math.cos(b.angle), Math.sin(b.angle)],
    [-Math.sin(b.angle), Math.cos(b.angle)],
  ];

  let overlap = Number.POSITIVE_INFINITY;
  let normalX = 0;
  let normalY = 0;
  for (const [ax, ay] of axes) {
    const [minA, maxA] = project(cornersA, ax, ay);
    const [minB, maxB] = project(cornersB, ax, ay);
    const depth = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (depth <= 0) return out;
    if (depth < overlap) {
      overlap = depth;
      // Normal A'dan B'ye bakar.
      const direction = (b.x - a.x) * ax + (b.y - a.y) * ay >= 0 ? 1 : -1;
      normalX = ax * direction;
      normalY = ay * direction;
    }
  }

  // Temas noktası: normal boyunca karşı cisme en derin giren köşe(ler).
  const deepestPoint = (points: readonly Corner[], sign: number): Corner => {
    let best = Number.NEGATIVE_INFINITY;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const point of points) {
      const value = (point.x * normalX + point.y * normalY) * sign;
      if (value > best + 0.05) {
        best = value;
        sumX = point.x;
        sumY = point.y;
        count = 1;
      } else if (Math.abs(value - best) <= 0.05) {
        sumX += point.x;
        sumY += point.y;
        count++;
      }
    }
    return { x: sumX / count, y: sumY / count };
  };
  const fromB = deepestPoint(cornersB, -1);
  const fromA = deepestPoint(cornersA, 1);
  const point = {
    x: (fromA.x + fromB.x) / 2,
    y: (fromA.y + fromB.y) / 2,
  };

  const inverseA = 1 / a.mass;
  const inverseB = 1 / b.mass;
  const share = overlap / (inverseA + inverseB);
  a.x -= normalX * share * inverseA;
  a.y -= normalY * share * inverseA;
  b.x += normalX * share * inverseB;
  b.y += normalY * share * inverseB;

  const rax = point.x - a.x;
  const ray = point.y - a.y;
  const rbx = point.x - b.x;
  const rby = point.y - b.y;
  const relativeVx = b.vx - b.angularVelocity * rby - (a.vx - a.angularVelocity * ray);
  const relativeVy = b.vy + b.angularVelocity * rbx - (a.vy + a.angularVelocity * rax);
  const normalSpeed = relativeVx * normalX + relativeVy * normalY;
  if (normalSpeed >= 0) return out;

  const restitution = Math.min(shapeA.restitution, shapeB.restitution);
  const crossA = rax * normalY - ray * normalX;
  const crossB = rbx * normalY - rby * normalX;
  const effective =
    inverseA + inverseB + (crossA * crossA) / a.inertia + (crossB * crossB) / b.inertia;
  const j = (-(1 + restitution) * normalSpeed) / effective;
  a.applyImpulse(-normalX * j, -normalY * j, point.x, point.y);
  b.applyImpulse(normalX * j, normalY * j, point.x, point.y);

  const tangentX = -normalY;
  const tangentY = normalX;
  const slideVx = b.vx - b.angularVelocity * rby - (a.vx - a.angularVelocity * ray);
  const slideVy = b.vy + b.angularVelocity * rbx - (a.vy + a.angularVelocity * rax);
  const tangentSpeed = slideVx * tangentX + slideVy * tangentY;
  const tangentA = rax * tangentY - ray * tangentX;
  const tangentB = rbx * tangentY - rby * tangentX;
  const friction = Math.min(shapeA.friction, shapeB.friction);
  const jt = clamp(
    -tangentSpeed /
      (inverseA + inverseB + (tangentA * tangentA) / a.inertia + (tangentB * tangentB) / b.inertia),
    -friction * j,
    friction * j,
  );
  a.applyImpulse(-tangentX * jt, -tangentY * jt, point.x, point.y);
  b.applyImpulse(tangentX * jt, tangentY * jt, point.x, point.y);

  out.speed = -normalSpeed;
  out.x = point.x;
  out.y = point.y;
  out.normalX = normalX;
  out.normalY = normalY;
  return out;
}
