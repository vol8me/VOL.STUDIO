import type Phaser from 'phaser';
import { Vector2 } from '../math/Vector2';
import {
  computePCInputState,
  isPCInputActive,
  resolvePCActions,
  type PCActionBinding,
  type PointerLikeState,
  type WasdDownState,
} from './PCInputState';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import type { InputSnapshot } from './InputSnapshot';

interface WasdKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/** Hareket tuşları — dört yön için tarayıcı keyCode'ları. */
export interface MoveKeyBindings {
  up: number;
  down: number;
  left: number;
  right: number;
}

/**
 * WASD varsayılanı.
 *
 * Bu bir oyun sözlüğü DEĞİL, klavye yakınsaması: WASD'nin "hareket" demesi
 * eylem adlarının aksine türden bağımsızdır (aynı sebeple sol fare düğmesi
 * "birincil" demektir). Yine de `moveKeys` ile ezilebilir — yeniden atama
 * yapan bir tüketici varsayılanı kullanmak zorunda değil.
 *
 * **Değerler ham `KeyboardEvent.keyCode` sayılarıdır, `Phaser.Input.Keyboard.KeyCodes`
 * DEĞİL.** İki gerekçe:
 * 1. `KeyCodes`'u modül seviyesinde okumak, Phaser'ı mock'layan bir tüketicide
 *    (ör. vol-ui showcase testleri) import anında `Cannot read properties of
 *    undefined` ile patlar — i18next'in modül seviyesinde çağrılmaması ile
 *    aynı sınıf hata.
 * 2. Eşleme SAF VERİ olmalı: bir tuş atama ekranı/kayıt dosyası da aynı
 *    sayıları taşıyacak, enum referansı taşıyamaz.
 *
 * Sayılar `KeyCodes.W/S/A/D` ile birebir aynıdır (standart keyCode değerleri).
 */
export const DEFAULT_MOVE_KEYS: MoveKeyBindings = {
  up: 87, // W
  down: 83, // S
  left: 65, // A
  right: 68, // D
};

export interface PCControllerOptions<TAction extends string> {
  /**
   * Eylem → tuş/düğme eşlemesi. Eylem kümesini TÜKETİCİ tanımlar; CORE
   * hangi eylemlerin var olduğunu bilmez.
   */
  actionBindings: Readonly<Record<TAction, PCActionBinding>>;
  /** Hareket tuşları. Verilmezse `DEFAULT_MOVE_KEYS` (WASD). */
  moveKeys?: MoveKeyBindings;
}

export class PCController<TAction extends string> implements InputProvider<TAction> {
  private readonly keys: WasdKeys;
  /** Eylem tuşları — yalnızca `source: 'key'` bağlantıları için kurulur. */
  private readonly actionKeys = new Map<number, Phaser.Input.Keyboard.Key>();
  private readonly actionBindings: Readonly<Record<TAction, PCActionBinding>>;
  private readonly boundBlur: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    options: PCControllerOptions<TAction>,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard plugin etkin değil');
    }

    const moveKeys = options.moveKeys ?? DEFAULT_MOVE_KEYS;
    this.keys = {
      up: keyboard.addKey(moveKeys.up),
      down: keyboard.addKey(moveKeys.down),
      left: keyboard.addKey(moveKeys.left),
      right: keyboard.addKey(moveKeys.right),
    };

    this.actionBindings = options.actionBindings;
    for (const action of Object.keys(this.actionBindings) as TAction[]) {
      const binding = this.actionBindings[action];
      // Aynı keyCode'a bağlı iki eylem tek bir Key nesnesini paylaşır;
      // addKey'i iki kez çağırmak Phaser'da aynı tuşu iki kez kaydeder.
      if (binding.source === 'key' && !this.actionKeys.has(binding.keyCode)) {
        this.actionKeys.set(binding.keyCode, keyboard.addKey(binding.keyCode));
      }
    }

    this.boundBlur = () => this.resetKeys();
    window.addEventListener('blur', this.boundBlur);
  }

  private resetKeys(): void {
    this.keys.up.reset();
    this.keys.down.reset();
    this.keys.left.reset();
    this.keys.right.reset();
    for (const key of this.actionKeys.values()) {
      key.reset();
    }
  }

  /** activePointer çalışma anında değişebilir; referans saklanmaz. */
  private get pointer(): Phaser.Input.Pointer {
    return this.scene.input.activePointer;
  }

  private get wasdState(): WasdDownState {
    return {
      up: this.keys.up.isDown,
      down: this.keys.down.isDown,
      left: this.keys.left.isDown,
      right: this.keys.right.isDown,
    };
  }

  private get pointerState(): PointerLikeState {
    const pointer = this.pointer;
    return {
      x: pointer.x,
      y: pointer.y,
      isDown: pointer.isDown,
      leftButtonDown: pointer.leftButtonDown(),
      wasTouch: pointer.wasTouch,
    };
  }

  private get actionState(): Record<TAction, boolean> {
    return resolvePCActions(
      this.actionBindings,
      (keyCode) => this.actionKeys.get(keyCode)?.isDown ?? false,
      this.pointerState,
    );
  }

  get isActive(): boolean {
    return isPCInputActive(this.wasdState, this.pointerState, this.actionState);
  }

  getDebugSnapshot(): InputSnapshot {
    const pointer = this.pointerState;
    return {
      activeProvider: 'pc',
      pc: {
        wasd: { ...this.wasdState },
        pointer: { ...pointer },
        actions: this.actionState,
      },
    };
  }

  getState(playerPosition: Vector2): InputState<TAction> {
    const camera = this.scene.cameras.main;
    const target = camera.getWorldPoint(this.pointer.x, this.pointer.y);

    return computePCInputState(
      this.wasdState,
      this.pointerState,
      new Vector2(target.x, target.y),
      playerPosition,
      this.actionState,
    );
  }

  update(_delta: number): void {}

  destroy(): void {
    window.removeEventListener('blur', this.boundBlur);
  }
}
