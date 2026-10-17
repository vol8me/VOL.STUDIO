import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import { createIdleActions, type InputState } from './InputState';
import type { VirtualActionSource } from './VirtualActionSource';
import type { VirtualStick, VirtualStickSource } from './VirtualStickSource';
import { INPUT } from '../constants';

export interface Stick {
  pointerId: number;
  base: Vector2;
  /** Ham (clamp edilmemiş) pointer pozisyonu. Clamp `writeRaw` içinde uygulanır. */
  current: Vector2;
  isRight: boolean;
}

/** Sağ stick'in "itildi" durumunu hangi eyleme bağlayacağını belirten ayarlar. */
export interface StickActionGate {
  /** Eylemin basılı sayılması için gereken ham sapma oranı (0-1). */
  enter: number;
  /** Eylemin bırakılmış sayılması için gereken ham sapma oranı (0-1). */
  exit: number;
}

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
   * Sağ stick yalnızca dokunulduğunda da eylemi basılı sayar. Aim deadzone
   * içinde kalır; çağıran isterse otomatik hedef seçebilir.
   */
  aimStickActivatesOnTouch?: boolean;
  /**
   * Sağ stick'in ham sapması için giriş/çıkış eşiği. Verilirse
   * `aimStickActivatesOnTouch` ve deadzone eşiği GEÇERSİZ sayılır: eylem
   * yalnız `enter`/`exit` oranlarına bakar.
   *
   * Histerezis çubuğun kendi durumundadır, çağıranın karesinde değil: eşik
   * render karesinde örneklenip oynanış tick'inde tüketiliyorsa kısa bir
   * sapma, üretmediği tick'te kaybolur.
   */
  aimStickGate?: StickActionGate;
  /**
   * Ekran üstü düğmelerin yazdığı eylem kaynağı.
   *
   * Verilirse düğme basımları stick durumuyla AYNI karede birleşir; ayrıca
   * yalnızca düğmeye basılıyken de sağlayıcı aktif sayılır (bkz. `isActive`),
   * yoksa hareket etmeden basılan bir düğme `InputManager` tarafından PC'ye
   * düşer ve yutulurdu.
   */
  actionSource?: VirtualActionSource<TAction>;
  /**
   * Ekran üstü sabit joystick'lerin eksen kaynağı. Serbest çubuk o yarıda
   * yokken kaynağın değeri kullanılır; ölü bölge ve normalizasyon aynıdır.
   */
  stickSource?: VirtualStickSource;
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
  private readonly aimStickGate?: StickActionGate;
  private readonly actionSource?: VirtualActionSource<TAction>;
  private readonly stickSource?: VirtualStickSource;
  private readonly deadZone: number;
  public readonly maxRadius: number;
  /**
   * Yeniden kullanılan vektör tamponları — dokunmatik SICAK YOL.
   *
   * Ham vektör kare başına en az dört kez okunur (`getState` iki stick için,
   * çizim katmanı konum ve yön için) ve `onPointerMove` her olayda bir kez
   * daha yazar. Her okumada yeni `Vector2` ayırmak mobilde oynanış boyunca
   * sürekli küçük çöp üretir ve GC duraklamasına dönüşür.
   *
   * Tamponlar SENKRON okunur: dönen vektör bir SONRAKİ çağrıya kadar
   * geçerlidir, çağıran onu saklamaz.
   */
  private readonly leftRawBuf: Vector2 = Vector2.zero();
  private readonly rightRawBuf: Vector2 = Vector2.zero();
  private readonly scratchRawBuf: Vector2 = Vector2.zero();
  private readonly clampedBuf: Vector2 = Vector2.zero();
  /** Eylemin `aimStickGate` eşiğine göre basılı sayılıp sayılmadığı. */
  private aimStickEngaged = false;

  constructor(options: TouchStickOptions<TAction>) {
    this.actions = options.actions;
    this.aimStickAction = options.aimStickAction;
    this.aimStickActivatesOnTouch = options.aimStickActivatesOnTouch ?? false;
    this.aimStickGate = options.aimStickGate;
    this.actionSource = options.actionSource;
    this.stickSource = options.stickSource;
    this.deadZone = options.deadZone ?? INPUT.DEAD_ZONE_RATIO;
    this.maxRadius = options.maxRadius ?? INPUT.STICK_MAX_RADIUS_PX;
  }

  get isActive(): boolean {
    return (
      this.leftStick !== undefined ||
      this.rightStick !== undefined ||
      this.actionSource?.hasPressed === true ||
      this.stickSource?.hasInput === true
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
    // `base` ve `current` AYRI nesneler olmalı: `updateStick` `current`i
    // yerinde günceller (allocation'sız sıcak yol) ve tek nesne paylaşılsaydı
    // parmağın her hareketi stick'in TABANINI da sürükler, joystick ekranda
    // kayardı. Dokunuş başına iki küçük ayırma, kare başına dörtten ucuzdur.
    if (isRightSide) {
      if (this.rightStick) {
        return;
      }
      this.rightStick = {
        pointerId,
        base: new Vector2(x, y),
        current: new Vector2(x, y),
        isRight: true,
      };
      return;
    }

    if (this.leftStick) {
      return;
    }
    this.leftStick = {
      pointerId,
      base: new Vector2(x, y),
      current: new Vector2(x, y),
      isRight: false,
    };
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
    this.aimStickEngaged = false;
    this.actionSource?.clear();
    this.stickSource?.clear();
  }

  getState(): InputState<TAction> {
    const leftRaw = this.writeRaw(this.leftRawBuf, this.leftStick);
    const rightRaw = this.writeRaw(this.rightRawBuf, this.rightStick);
    const source = this.stickSource;
    if (source && !this.leftStick && source.isHeld('move')) this.writeSource('move', leftRaw);
    const aimFromSource = source !== undefined && !this.rightStick && source.isHeld('aim');
    if (aimFromSource) this.writeSource('aim', rightRaw);

    const actions = createIdleActions(this.actions);
    if (this.aimStickAction !== undefined) {
      actions[this.aimStickAction] = this.resolveAimAction(
        this.rightStick !== undefined || aimFromSource,
        rightRaw.length() / this.maxRadius,
      );
    }
    // Düğmeler stick'ten SONRA yazılır: aynı eyleme hem nişan çubuğu hem
    // düğme bağlıysa, düğme basımı nişan çubuğunun `false`unu ezebilmeli.
    const heldActions = { ...actions };
    const pressedActions = createIdleActions(this.actions);
    this.actionSource?.applyTo(actions, heldActions, pressedActions);

    return {
      move: normalizeAnalog(leftRaw, this.deadZone, this.maxRadius),
      aim: normalizeDirection(rightRaw, this.deadZone, this.maxRadius),
      actions,
      heldActions,
      pressedActions,
    };
  }

  /** Görsel çizim için clamp edilmiş mutlak pozisyon (`stick.base` + ham vektör). */
  getClampedPosition(stick: Stick): Vector2 {
    const raw = this.writeRaw(this.scratchRawBuf, stick);
    this.clampedBuf.x = stick.base.x + raw.x;
    this.clampedBuf.y = stick.base.y + raw.y;
    return this.clampedBuf;
  }

  /** Görsel katmanın otomatik-hedef ve manuel-yön kiplerini ayırması için. */
  hasDirectionalInput(stick: Stick): boolean {
    const raw = this.writeRaw(this.scratchRawBuf, stick);
    return Math.hypot(raw.x, raw.y) / this.maxRadius > this.deadZone;
  }

  /** Kaynak değeri (-1..1) serbest çubuğun ham uzayına (piksel) çevirir. */
  private writeSource(stick: VirtualStick, out: Vector2): void {
    this.stickSource?.write(stick, out);
    out.x *= this.maxRadius;
    out.y *= this.maxRadius;
  }

  private resolveAimAction(touched: boolean, deflection: number): boolean {
    const gate = this.aimStickGate;
    if (!touched) {
      this.aimStickEngaged = false;
      return false;
    }
    this.aimStickEngaged = gate
      ? deflection >= (this.aimStickEngaged ? gate.exit : gate.enter)
      : this.aimStickActivatesOnTouch || deflection > this.deadZone;
    return this.aimStickEngaged;
  }

  private updateStick(stick: Stick | undefined, pointerId: number, x: number, y: number): void {
    if (!stick || stick.pointerId !== pointerId) {
      return;
    }
    // Yeni vektör yerine mevcut olanın alanları yazılır; `current` bu
    // sınıfın dışına sızmaz, paylaşılan referans riski yok.
    stick.current.x = x;
    stick.current.y = y;
  }

  /**
   * `stick.base -> stick.current` vektörünü maxRadius'a clamp ederek VERİLEN
   * tampona yazar. Allocation yapmaz; sonuç bir sonraki çağrıya kadar geçerli.
   */
  private writeRaw(out: Vector2, stick: Stick | undefined): Vector2 {
    if (!stick) {
      out.x = 0;
      out.y = 0;
      return out;
    }

    out.x = stick.current.x - stick.base.x;
    out.y = stick.current.y - stick.base.y;
    const len = Math.hypot(out.x, out.y);
    if (len > this.maxRadius) {
      const scale = this.maxRadius / len;
      out.x *= scale;
      out.y *= scale;
    }
    return out;
  }
}
