import { clamp } from '../math/interpolation';
import type { RigidBody } from './RigidBody';
import { requireFinitePhysics, validateBodyState, validateContactShape } from './validation';

/** Düz duvar: iç normali ve konumu. Nokta içerideyse `x·nx + y·ny - offset ≥ 0`. */
export interface Wall {
  readonly nx: number;
  readonly ny: number;
  readonly offset: number;
}

/** Dikdörtgen ayak izi (yarı boy, yarı en) ve temas malzemesi. */
export interface ContactShape {
  readonly halfLength: number;
  readonly halfWidth: number;
  /** Sekme katsayısı [0, 1] ve Coulomb sürtünmesi. */
  readonly restitution: number;
  readonly friction: number;
}

/** Bir adımdaki en sert temas; `speed` 0 ise temas yoktur. */
export interface Contact {
  speed: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

export function createContact(): Contact {
  return { speed: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
}

/** Bu derinlik farkı içindeki köşeler aynı yüzün temasıdır (birim). */
const FACE_TOLERANCE = 0.05;

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Cismin köşelerini düz duvarlara karşı çözer. Her duvar için en derin köşe
 * dışarı itilir; köşe duvara doğru ilerliyorsa normal itki (sekme) ve
 * sürtünme itkisi uygulanır. Açılı çarpma cismi döndürür. Dönen temas, bu
 * çağrıdaki en yüksek normal hızlı çarpmadır.
 */
export function resolveWallContacts(
  body: RigidBody,
  walls: readonly Wall[],
  shape: ContactShape,
  out: Contact,
): Contact {
  validateContactShape(shape);
  validateBodyState(body);
  for (const wall of walls) {
    requireFinitePhysics(wall.nx, 'Duvar nx');
    requireFinitePhysics(wall.ny, 'Duvar ny');
    requireFinitePhysics(wall.offset, 'Duvar offset');
    if (Math.abs(Math.hypot(wall.nx, wall.ny) - 1) > 1e-10)
      throw new RangeError('Duvar normali birim vektör olmalı');
  }
  const bx = body.x,
    by = body.y,
    vx = body.vx,
    vy = body.vy;
  const angle = body.angle,
    angularVelocity = body.angularVelocity;
  const speed = out.speed,
    x = out.x,
    y = out.y,
    nx = out.normalX,
    ny = out.normalY;
  try {
    resolveContacts(body, walls, shape, out);
    validateBodyState(body);
    requireFinitePhysics(out.speed, 'Temas hızı');
    if (out.speed > 0) {
      requireFinitePhysics(out.x, 'Temas x');
      requireFinitePhysics(out.y, 'Temas y');
      requireFinitePhysics(out.normalX, 'Temas normalX');
      requireFinitePhysics(out.normalY, 'Temas normalY');
    }
    return out;
  } catch (error) {
    body.x = bx;
    body.y = by;
    body.vx = vx;
    body.vy = vy;
    body.angle = angle;
    body.angularVelocity = angularVelocity;
    out.speed = speed;
    out.x = x;
    out.y = y;
    out.normalX = nx;
    out.normalY = ny;
    throw error;
  }
}

function resolveContacts(
  body: RigidBody,
  walls: readonly Wall[],
  shape: ContactShape,
  out: Contact,
): Contact {
  out.speed = 0;
  const fx = Math.cos(body.angle);
  const fy = Math.sin(body.angle);
  for (const wall of walls) {
    let deepest = 0;
    for (const [along, across] of CORNERS) {
      const px = body.x + fx * shape.halfLength * along - fy * shape.halfWidth * across;
      const py = body.y + fy * shape.halfLength * along + fx * shape.halfWidth * across;
      deepest = Math.min(deepest, px * wall.nx + py * wall.ny - wall.offset);
    }
    if (deepest >= 0) continue;

    // Temas noktası en derin köşelerin ortasıdır: kenar duvara paralelse iki
    // köşe eşit derindir ve itki yüzün ortasına düşer (sahte dönme yok).
    let cornerX = 0;
    let cornerY = 0;
    let count = 0;
    for (const [along, across] of CORNERS) {
      const px = body.x + fx * shape.halfLength * along - fy * shape.halfWidth * across;
      const py = body.y + fy * shape.halfLength * along + fx * shape.halfWidth * across;
      if (px * wall.nx + py * wall.ny - wall.offset > deepest + FACE_TOLERANCE) continue;
      cornerX += px;
      cornerY += py;
      count++;
    }
    cornerX /= count;
    cornerY /= count;

    body.x -= wall.nx * deepest;
    body.y -= wall.ny * deepest;
    cornerX -= wall.nx * deepest;
    cornerY -= wall.ny * deepest;
    const rx = cornerX - body.x;
    const ry = cornerY - body.y;
    const contactVx = body.vx - body.angularVelocity * ry;
    const contactVy = body.vy + body.angularVelocity * rx;
    const normalSpeed = contactVx * wall.nx + contactVy * wall.ny;
    if (normalSpeed >= 0) continue;

    const crossN = rx * wall.ny - ry * wall.nx;
    const j =
      (-(1 + shape.restitution) * normalSpeed) / (1 / body.mass + (crossN * crossN) / body.inertia);
    body.applyImpulse(wall.nx * j, wall.ny * j, cornerX, cornerY);

    // Sürtünme, normal itkiden SONRAKİ temas hızıyla hesaplanır; eski hız
    // kullanılırsa itki enerji ekleyebilir.
    const tx = -wall.ny;
    const ty = wall.nx;
    const slideVx = body.vx - body.angularVelocity * ry;
    const slideVy = body.vy + body.angularVelocity * rx;
    const tangentSpeed = slideVx * tx + slideVy * ty;
    const crossT = rx * ty - ry * tx;
    const jt = clamp(
      -tangentSpeed / (1 / body.mass + (crossT * crossT) / body.inertia),
      -shape.friction * j,
      shape.friction * j,
    );
    body.applyImpulse(tx * jt, ty * jt, cornerX, cornerY);

    if (-normalSpeed > out.speed) {
      out.speed = -normalSpeed;
      out.x = cornerX;
      out.y = cornerY;
      out.normalX = wall.nx;
      out.normalY = wall.ny;
    }
  }
  return out;
}
