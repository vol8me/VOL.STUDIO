import Phaser from 'phaser';
import { Vector2 } from '../math/Vector2';
import {
  computePCInputState,
  isPCInputActive,
  type PointerLikeState,
  type WasdDownState,
  type ExtraKeysState,
} from './PCInputState';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';

interface WasdKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

export class PCController implements InputProvider {
  private readonly keys: WasdKeys;
  private readonly dashKey: Phaser.Input.Keyboard.Key;
  private readonly boundBlur: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard plugin etkin değil');
    }

    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.dashKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.boundBlur = () => this.resetKeys();
    window.addEventListener('blur', this.boundBlur);
  }

  private resetKeys(): void {
    this.keys.up.reset();
    this.keys.down.reset();
    this.keys.left.reset();
    this.keys.right.reset();
    this.dashKey.reset();
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

  private get extraKeysState(): ExtraKeysState {
    return { dash: this.dashKey.isDown };
  }

  get isActive(): boolean {
    return isPCInputActive(this.wasdState, this.pointerState, this.extraKeysState);
  }

  getState(playerPosition: Vector2): InputState {
    const camera = this.scene.cameras.main;
    const target = camera.getWorldPoint(this.pointer.x, this.pointer.y);

    return computePCInputState(
      this.wasdState,
      this.pointerState,
      new Vector2(target.x, target.y),
      playerPosition,
      this.extraKeysState,
    );
  }

  update(_delta: number): void {}

  destroy(): void {
    window.removeEventListener('blur', this.boundBlur);
  }
}
