import type { ContactShape } from './wallContact';
import type { RigidBody } from './RigidBody';

export function requireFinitePhysics(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} sonlu olmalı`);
}

export function requirePositivePhysics(value: number, label: string): void {
  requireFinitePhysics(value, label);
  if (value <= 0) throw new RangeError(`${label} pozitif olmalı`);
}

export function validateContactShape(shape: ContactShape): void {
  requirePositivePhysics(shape.halfLength, 'halfLength');
  requirePositivePhysics(shape.halfWidth, 'halfWidth');
  requireFinitePhysics(shape.restitution, 'restitution');
  requireFinitePhysics(shape.friction, 'friction');
  if (shape.restitution < 0 || shape.restitution > 1 || shape.friction < 0) {
    throw new RangeError('Temas malzemesi: restitution [0, 1], friction >= 0 olmalı');
  }
}

export function validateBodyState(body: RigidBody): void {
  requireFinitePhysics(body.x, 'x');
  requireFinitePhysics(body.y, 'y');
  requireFinitePhysics(body.vx, 'vx');
  requireFinitePhysics(body.vy, 'vy');
  requireFinitePhysics(body.angle, 'angle');
  requireFinitePhysics(body.angularVelocity, 'angularVelocity');
}
