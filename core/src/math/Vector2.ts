export class Vector2 {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vector2 {
    const len = this.length();
    return Number.isFinite(len) && len > 0 ? this.scale(1 / len) : new Vector2();
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  static one(): Vector2 {
    return new Vector2(1, 1);
  }

  /** Yerinde günceller — yeni obje yaratmaz (GC-friendly). */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** Başka bir vektörün değerlerini kopyalar. */
  copyFrom(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  /** Yerinde ölçekler — yeni obje yaratmaz. */
  scaleInPlace(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  /** Yerinde normalize eder — yeni obje yaratmaz. */
  normalizeInPlace(): this {
    const len = this.length();
    if (Number.isFinite(len) && len > 0) {
      this.x /= len;
      this.y /= len;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  /** Sıfırlar (0,0) — havuz kullanımında reset için. */
  reset(): this {
    this.x = 0;
    this.y = 0;
    return this;
  }
}
