import { wrapAngle } from '../math/angle';
import { requireFinitePhysics, requirePositivePhysics } from './validation';

/**
 * Düzlemde katı cisim: konum, yön, doğrusal ve açısal hız. Kuvvet ve itki
 * dünya çerçevesindedir; açı ekran ekseninde (0 sağ, saat yönü artı) ölçülür.
 * Yarı örtük Euler ile ilerler: önce hız, sonra konum.
 */
export class RigidBody {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  angularVelocity = 0;

  constructor(
    readonly mass: number,
    readonly inertia: number,
  ) {
    requirePositivePhysics(mass, 'Kütle');
    requirePositivePhysics(inertia, 'Eylemsizlik');
  }

  /** Dikdörtgen levhanın eylemsizlik momenti: m (a² + b²) / 12. */
  static boxInertia(mass: number, length: number, width: number): number {
    requirePositivePhysics(mass, 'Kütle');
    requirePositivePhysics(length, 'Uzunluk');
    requirePositivePhysics(width, 'Genişlik');
    const inertia = (mass * (length * length + width * width)) / 12;
    requirePositivePhysics(inertia, 'Eylemsizlik');
    return inertia;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Cismin kendi ileri eksenindeki işaretli hız. */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  /** Cismin sağ eksenindeki işaretli hız (yanal kayma). */
  get lateralSpeed(): number {
    return -this.vx * Math.sin(this.angle) + this.vy * Math.cos(this.angle);
  }

  /** Durdurur ve verilen poza yerleştirir. */
  reset(x: number, y: number, angle: number): void {
    requireFinitePhysics(x, 'x');
    requireFinitePhysics(y, 'y');
    requireFinitePhysics(angle, 'angle');
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = wrapAngle(angle);
    this.angularVelocity = 0;
  }

  /**
   * Dünya çerçevesinde bir noktaya itki uygular (kg·birim/s). Nokta kütle
   * merkezinden uzaksa cisim döner.
   */
  applyImpulse(jx: number, jy: number, atX = this.x, atY = this.y): void {
    requireFinitePhysics(jx, 'jx');
    requireFinitePhysics(jy, 'jy');
    requireFinitePhysics(atX, 'atX');
    requireFinitePhysics(atY, 'atY');
    const vx = this.vx + jx / this.mass;
    const vy = this.vy + jy / this.mass;
    const rx = atX - this.x;
    const ry = atY - this.y;
    const angularVelocity = this.angularVelocity + (rx * jy - ry * jx) / this.inertia;
    requireFinitePhysics(vx, 'vx');
    requireFinitePhysics(vy, 'vy');
    requireFinitePhysics(angularVelocity, 'angularVelocity');
    this.vx = vx;
    this.vy = vy;
    this.angularVelocity = angularVelocity;
  }

  /** Dünya çerçevesinde kuvvet ve tork altında `dt` kadar ilerler. */
  integrate(forceX: number, forceY: number, torque: number, dt: number): void {
    requireFinitePhysics(forceX, 'forceX');
    requireFinitePhysics(forceY, 'forceY');
    requireFinitePhysics(torque, 'torque');
    requireFinitePhysics(dt, 'dt');
    if (dt < 0) throw new RangeError('dt negatif olamaz');
    if (dt === 0) return;
    const vx = this.vx + (forceX / this.mass) * dt;
    const vy = this.vy + (forceY / this.mass) * dt;
    const angularVelocity = this.angularVelocity + (torque / this.inertia) * dt;
    const x = this.x + vx * dt;
    const y = this.y + vy * dt;
    const angle = wrapAngle(this.angle + angularVelocity * dt);
    requireFinitePhysics(vx, 'vx');
    requireFinitePhysics(vy, 'vy');
    requireFinitePhysics(angularVelocity, 'angularVelocity');
    requireFinitePhysics(x, 'x');
    requireFinitePhysics(y, 'y');
    requireFinitePhysics(angle, 'angle');
    this.vx = vx;
    this.vy = vy;
    this.angularVelocity = angularVelocity;
    this.x = x;
    this.y = y;
    this.angle = angle;
  }
}
