import type Phaser from 'phaser';
import { InputManager, Vector2, VirtualActionSource } from '@volstudio/core';
import {
  ActionEdges,
  AIM_STICK_ACTION,
  EDGE_ACTIONS,
  GAMEPAD_BINDINGS,
  PC_BINDINGS,
  TEST_ACTIONS,
  type TestAction,
} from '@/input/bindings';
import { idleCommand, type TankCommand } from '@/sim/command';

/**
 * Oyuncu girdisinin tek sahibi: CORE `InputManager` (klavye/fare, kol,
 * dokunmatik), ekran düğmelerinin sanal kaynağı ve kenar algılayıcı. Her
 * kare bir `TankCommand` üretir ve kenar eylemlerini (zoom, ızgara,
 * duraklatma) sorgulanabilir kılar.
 */
export class PlayerControls {
  /** HUD'un dokunmatik düğmelerinin yazdığı kaynak. */
  readonly actionSource = new VirtualActionSource<TestAction>();
  readonly command: TankCommand = idleCommand();
  private readonly manager: InputManager<TestAction>;
  private readonly edges = new ActionEdges<TestAction>();
  private readonly position = new Vector2();

  constructor(scene: Phaser.Scene) {
    this.manager = new InputManager<TestAction>(scene, {
      actions: TEST_ACTIONS,
      pcActionBindings: PC_BINDINGS,
      gamepad: { actionBindings: GAMEPAD_BINDINGS },
      aimStickAction: AIM_STICK_ACTION,
      actionSource: this.actionSource,
    });
  }

  /**
   * Bu karenin girdisini okur. Fare nişanı tankın konumuna göre hesaplandığı
   * için tank konumu verilir.
   */
  read(tankX: number, tankY: number, deltaMs: number): TankCommand {
    this.manager.update(deltaMs);
    this.position.x = tankX;
    this.position.y = tankY;
    const state = this.manager.getState(this.position);
    this.edges.update(state.actions, EDGE_ACTIONS);
    const command = this.command;
    command.moveX = state.move.x;
    command.moveY = state.move.y;
    command.aimX = state.aim.x;
    command.aimY = state.aim.y;
    command.fire = state.actions.fire;
    command.boost = state.actions.boost;
    return command;
  }

  /** Eylem bu karede basılmaya başladı mı (kenar). */
  pressed(action: TestAction): boolean {
    return this.edges.wasPressed(action);
  }

  /** Başka bir katmanın işlediği basışı bırakılana dek yok sayar. */
  suppress(action: TestAction): void {
    this.edges.suppress(action);
  }

  /** Tutulan çubuk, tuş ve sanal düğme durumunu bırakır (duraklatma geçişi). */
  release(): void {
    this.manager.reset();
    this.actionSource.clear();
  }

  destroy(): void {
    this.manager.destroy();
    this.actionSource.clear();
  }
}
