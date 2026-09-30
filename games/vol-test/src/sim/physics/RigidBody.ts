import { wrapAngle } from '../angle';

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
    if (!(mass > 0 && inertia > 0)) {
      throw new RangeError(`Kütle ve eylemsizlik pozitif olmalı: ${mass}, ${inertia}`);
    }
  }

  /** Dikdörtgen levhanın eylemsizlik momenti: m (a² + b²) / 12. */
  static boxInertia(mass: number, length: number, width: number): number {
    return (mass * (length * length + width * width)) / 12;
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
    this.vx += jx / this.mass;
    this.vy += jy / this.mass;
    const rx = atX - this.x;
    const ry = atY - this.y;
    this.angularVelocity += (rx * jy - ry * jx) / this.inertia;
  }

  /** Dünya çerçevesinde kuvvet ve tork altında `dt` kadar ilerler. */
  integrate(forceX: number, forceY: number, torque: number, dt: number): void {
    this.vx += (forceX / this.mass) * dt;
    this.vy += (forceY / this.mass) * dt;
    this.angularVelocity += (torque / this.inertia) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = wrapAngle(this.angle + this.angularVelocity * dt);
  }
}
