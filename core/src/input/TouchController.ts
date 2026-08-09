import Phaser from 'phaser';
import type { Vector2 } from '../math/Vector2';
import { VOL_COLORS } from '../ui/colors';
import { TouchStickState } from './TouchStickState';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import type { InputSnapshot, TouchStickSnapshot } from './InputSnapshot';
import { UI_DEPTH, UI_RATIO, UI_ALPHA, UI_SIZE } from '../constants';

// Graphics.fillStyle sayısal 0xRRGGBB bekler, VOL_COLORS '#rrggbb' string'leri taşır.
function hexColorToNumber(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

const STICK_BASE_COLOR = hexColorToNumber(VOL_COLORS.uiSurface3);
const STICK_THUMB_COLOR = hexColorToNumber(VOL_COLORS.supportSolid);

/**
 * İnce Phaser sarmalayıcısı: pointer olaylarını dinler, görseli çizer.
 * Stick atama/clamp/deadzone mantığı TouchStickState'te yaşar (bkz. TouchStickState.ts).
 */
export class TouchController extends Phaser.GameObjects.Container implements InputProvider {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly sticks = new TouchStickState();

  constructor(scene: Phaser.Scene) {
    super(scene);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(UI_DEPTH.OVERLAY);

    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.add(this.graphics);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  get isActive(): boolean {
    return this.sticks.isActive;
  }

  getDebugSnapshot(): InputSnapshot {
    const left = this.sticks.getLeftStick();
    const right = this.sticks.getRightStick();
    return {
      activeProvider: 'touch',
      touch: {
        left: left ? this.toStickSnapshot(left) : undefined,
        right: right ? this.toStickSnapshot(right) : undefined,
      },
    };
  }

  private toStickSnapshot(stick: { base: Vector2; current: Vector2 }): TouchStickSnapshot {
    return {
      base: { x: stick.base.x, y: stick.base.y },
      current: { x: stick.current.x, y: stick.current.y },
    };
  }

  getState(_playerPosition: Vector2): InputState {
    return this.sticks.getState();
  }

  update(_delta: number): void {
    if (!this.sticks.isActive) return;
    this.drawSticks();
  }

  /**
   * `this.scene.input` sahne geçişi sırasında destroy()'dan ÖNCE zaten
   * `undefined` olabilir (Phaser'in Systems.shutdown sırasına bağlı) —
   * kontrol olmadan `this.scene.input.off(...)` fırlatır.
   */
  destroy(fromScene?: boolean): void {
    if (this.scene?.input) {
      this.scene.input.off('pointerdown', this.onPointerDown, this);
      this.scene.input.off('pointermove', this.onPointerMove, this);
      this.scene.input.off('pointerup', this.onPointerUp, this);
      this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    }

    super.destroy(fromScene);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) {
      return;
    }

    const halfWidth = this.scene.scale.width * UI_RATIO.SCREEN_HALF;
    const isRightSide = pointer.x >= halfWidth;
    this.sticks.onPointerDown(pointer.id, pointer.x, pointer.y, isRightSide);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.sticks.onPointerMove(pointer.id, pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.sticks.onPointerUp(pointer.id);
  }

  private drawSticks(): void {
    this.graphics.clear();

    const sticks = [this.sticks.getLeftStick(), this.sticks.getRightStick()];
    for (const stick of sticks) {
      if (!stick) {
        continue;
      }

      this.graphics.fillStyle(STICK_BASE_COLOR, UI_ALPHA.STICK_BASE);
      this.graphics.fillCircle(stick.base.x, stick.base.y, this.sticks.maxRadius);

      const thumbPos = this.sticks.getClampedPosition(stick);
      this.graphics.fillStyle(STICK_THUMB_COLOR, UI_ALPHA.STICK_THUMB);
      this.graphics.fillCircle(thumbPos.x, thumbPos.y, UI_SIZE.STICK_THUMB_RADIUS);
    }
  }
}
