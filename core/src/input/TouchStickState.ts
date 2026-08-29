import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import { createIdleActions, type InputState } from './InputState';
import type { VirtualActionSource } from './VirtualActionSource';
import { INPUT } from '../constants';

export interface Stick {
  pointerId: number;
  base: Vector2;
  /** Ham (clamp edilmemiş) pointer pozisyonu. Clamp yalnızca getRaw()'da uygulanır. */
  current: Vector2;
  isRight: boolean;
}

/** Sağ stick'in "itildi" durumunu hangi eyleme bağlayacağını belirten ayarlar. */
export interface TouchStickOptions<TAction extends string> {
  /** Diagnostics'te görünecek sağlayıcı kimliği. Varsayılan `'touch'`. */
  id?: string;
  /**
   * Tanınan tüm eylemler — üretilen `actions` kaydı bu kümenin tamamını
   * doldurur (basılı olmayanlar `false`).
   */
  actions: readonly TAction[];
  /**
   * Sağ stick deadzone'u aştığında basılı sayılacak eylem.
   *
   * Verilmezse sağ stick YALNIZCA nişan üretir, hiçbir eylemi tetiklemez —
   * "nişan al + otomatik ateş" deseni her oyunun tercihi değildir.
   */
  aimStickAction?: TAction;
  /**
   * Sağ stick yalnız dokunulduğunda da eylemi basılı sayar. Aim deadzone
   * içinde sıfır kalır; çağıran isterse otomatik hedef seçebilir.
   */
  aimStickActivatesOnTouch?: boolean;
  /**
   * Ekran üstü düğmelerin yazdığı eylem kaynağı.
   *
   * Verilirse düğme basımları stick durumuyla AYNI karede birleşir; ayrıca
   * yalnızca düğmeye basılıyken de sağlayıcı aktif sayılır (bkz. `isActive`),
   * yoksa hareket etmeden basılan bir düğme `InputManager` tarafından PC'ye
   * düşer ve yutulurdu.
   */
  actionSource?: VirtualActionSource<TAction>;
  deadZone?: number;
  maxRadius?: number;
}

/**
 * Çift joystick (sol hareket, sağ nişan) durum makinesi, Phaser'dan tamamen
 * bağımsız — Phaser.Scene kurmadan test edilebilir (bkz. TouchController.ts).
 *
 * Sağ stick'in bir EYLEME dönüşüp dönüşmeyeceği `aimStickAction` ile
 * dışarıdan verilir; bu sınıf "ateş" diye bir şey bilmez.
 */
export class TouchStickState<TAction extends string> {
  private leftStick?: Stick;
  private rightStick?: Stick;

  private readonly actions: readonly TAction[];
  private readonly aimStickAction?: TAction;
  private readonly aimStickActivatesOnTouch: boolean;
  private readonly actionSource?: VirtualActionSource<TAction>;
  private readonly deadZone: number;
  public readonly maxRadius: number;

  constructor(options: TouchStickOptions<TAction>) {
    this.actions = options.actions;
    this.aimStickAction = options.aimStickAction;
    this.aimStickActivatesOnTouch = options.aimStickActivatesOnTouch ?? false;
    this.actionSource = options.actionSource;
    this.deadZone = options.deadZone ?? INPUT.DEAD_ZONE_RATIO;
    this.maxRadius = options.maxRadius ?? INPUT.STICK_MAX_RADIUS;
  }

  get isActive(): boolean {
    return (
      this.leftStick !== undefined ||
      this.rightStick !== undefined ||
      this.actionSource?.hasPressed === true
    );
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

  /** Dalga/sahne sınırında parmaklar hâlâ ekranda olsa bile yönü bırakır. */
  reset(): void {
    this.leftStick = undefined;
    this.rightStick = undefined;
    this.actionSource?.clear();
  }

  getState(): InputState<TAction> {
    const leftRaw = this.getRaw(this.leftStick);
    const rightRaw = this.getRaw(this.rightStick);

    const actions = createIdleActions(this.actions);
    if (this.aimStickAction !== undefined) {
      actions[this.aimStickAction] =
        this.rightStick !== undefined &&
        (this.aimStickActivatesOnTouch || rightRaw.length() / this.maxRadius > this.deadZone);
    }
    // Düğmeler stick'ten SONRA yazılır: aynı eyleme hem nişan çubuğu hem
    // düğme bağlıysa, düğme basımı nişan çubuğunun `false`unu ezebilmeli.
    this.actionSource?.applyTo(actions);

    return {
      move: normalizeAnalog(leftRaw, this.deadZone, this.maxRadius),
      aim: normalizeDirection(rightRaw, this.deadZone, this.maxRadius),
      actions,
    };
  }

  /** Görsel çizim için clamp edilmiş mutlak pozisyon (stick.base + getRaw()). */
  getClampedPosition(stick: Stick): Vector2 {
    return stick.base.add(this.getRaw(stick));
  }

  /** Görsel katmanın otomatik-hedef ve manuel-yön kiplerini ayırması için. */
  hasDirectionalInput(stick: Stick): boolean {
    return this.getRaw(stick).length() / this.maxRadius > this.deadZone;
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
