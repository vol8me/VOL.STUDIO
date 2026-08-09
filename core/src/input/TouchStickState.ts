import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import type { InputState } from './InputState';
import { INPUT } from '../constants';

export interface Stick {
  pointerId: number;
  base: Vector2;
  /** Ham (clamp edilmemiş) pointer pozisyonu. Clamp yalnızca getRaw()'da uygulanır. */
  current: Vector2;
  isRight: boolean;
}

/**
 * Çift joystick (sol hareket, sağ nişan/ateş) durum makinesi, Phaser'dan
 * tamamen bağımsız — Phaser.Scene kurmadan test edilebilir (bkz. TouchController.ts).
 */
export class TouchStickState {
  private leftStick?: Stick;
  private rightStick?: Stick;

  constructor(
    private readonly deadZone = INPUT.DEAD_ZONE_RATIO,
    public readonly maxRadius = INPUT.STICK_MAX_RADIUS,
  ) {}

  get isActive(): boolean {
    return this.leftStick !== undefined || this.rightStick !== undefined;
  }

  getLeftStick(): Stick | undefined {
    return this.leftStick;
  }

  getRightStick(): Stick | undefined {
    return this.rightStick;
  }

  /**
   * Yeni dokunuş yalnızca KENDİ ekran yarısındaki boş stick'i doldurur;
   * o yarı zaten doluysa dokunuş yok sayılır.
   */
  onPointerDown(pointerId: number, x: number, y: number, isRightSide: boolean): void {
    const base = new Vector2(x, y);

    if (isRightSide) {
      if (this.rightStick) {
        return;
      }
      this.rightStick = { pointerId, base, current: base, isRight: true };
      return;
    }

    if (this.leftStick) {
      return;
    }
    this.leftStick = { pointerId, base, current: base, isRight: false };
  }

  onPointerMove(pointerId: number, x: number, y: number): void {
    this.updateStick(this.leftStick, pointerId, x, y);
    this.updateStick(this.rightStick, pointerId, x, y);
  }

  onPointerUp(pointerId: number): void {
    if (this.leftStick?.pointerId === pointerId) {
      this.leftStick = undefined;
    }
    if (this.rightStick?.pointerId === pointerId) {
      this.rightStick = undefined;
    }
  }

  getState(): InputState {
    const leftRaw = this.getRaw(this.leftStick);
    const rightRaw = this.getRaw(this.rightStick);

    return {
      move: normalizeAnalog(leftRaw, this.deadZone, this.maxRadius),
      aim: normalizeDirection(rightRaw, this.deadZone, this.maxRadius),
      fire: this.rightStick !== undefined && rightRaw.length() / this.maxRadius > this.deadZone,
      dash: false,
    };
  }

  /** Görsel çizim için clamp edilmiş mutlak pozisyon (stick.base + getRaw()). */
  getClampedPosition(stick: Stick): Vector2 {
    return stick.base.add(this.getRaw(stick));
  }

  private updateStick(stick: Stick | undefined, pointerId: number, x: number, y: number): void {
    if (!stick || stick.pointerId !== pointerId) {
      return;
    }
    stick.current = new Vector2(x, y);
  }

  /** stick.base -> stick.current vektörünü maxRadius'a clamp edilmiş şekilde döndürür. */
  private getRaw(stick: Stick | undefined): Vector2 {
    if (!stick) {
      return Vector2.zero();
    }

    const raw = new Vector2(stick.current.x - stick.base.x, stick.current.y - stick.base.y);
    const len = raw.length();
    if (len > this.maxRadius) {
      return raw.scale(this.maxRadius / len);
    }

    return raw;
  }
}
