import type Phaser from 'phaser';
import {
  ActionEdges,
  InputManager,
  Vector2,
  VirtualActionSource,
  VirtualStickSource,
} from '@volstudio/core';
import {
  AIM_STICK_ACTION,
  EDGE_ACTIONS,
  GAMEPAD_BINDINGS,
  PC_BINDINGS,
  TEST_ACTIONS,
  type TestAction,
} from '@/input/bindings';
import { idleCommand, type TankCommand } from '@/sim/command';
import { ControlIntent } from '@/input/ControlIntent';

/**
 * Oyuncu girdisinin tek sahibi: CORE `InputManager` (klavye/fare, kol,
 * dokunmatik), ekran düğmelerinin ve sabit joystick'lerin sanal kaynakları,
 * kenar algılayıcı. Her
 * kare bir `TankCommand` üretir ve kenar eylemlerini (zoom, ızgara,
 * duraklatma) sorgulanabilir kılar.
 */
export class PlayerControls {
  /** HUD'un dokunmatik düğmelerinin yazdığı kaynak. */
  readonly actionSource = new VirtualActionSource<TestAction>();
  /** HUD'un sabit joystick'lerinin (CORE `Joystick`) yazdığı eksen kaynağı. */
  readonly stickSource = new VirtualStickSource();
  readonly command: TankCommand = idleCommand();
  private readonly manager: InputManager<TestAction>;
  private readonly edges = new ActionEdges<TestAction>();
  private readonly position = new Vector2();
  private readonly rawAim = new Vector2();
  private readonly intent = new ControlIntent();

  constructor(scene: Phaser.Scene, initialMode?: string) {
    this.manager = new InputManager<TestAction>(scene, {
      actions: TEST_ACTIONS,
      inputMode: { initial: initialMode },
      restingAimPolicy: 'owner',
      pcActionBindings: PC_BINDINGS,
      gamepad: { actionBindings: GAMEPAD_BINDINGS },
      aimStickAction: AIM_STICK_ACTION,
      actionSource: this.actionSource,
      stickSource: this.stickSource,
      // Dokunmatikte sabit joystick'ler kullanılır; görünmeyen serbest
      // çubuklar kapatılır, ekrana dokunmak çubuk doğurmaz.
      leftStickRegion: null,
      rightStickRegion: null,
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
    command.brake = state.actions.brake;
    const touch = this.manager.inputMode === 'touch';
    this.stickSource.write('aim', this.rawAim);
    return this.intent.update(
      command,
      deltaMs,
      touch ? Math.hypot(this.rawAim.x, this.rawAim.y) : undefined,
    );
  }

  get aiming(): boolean {
    return this.stickSource.isHeld('aim') || this.command.aimX !== 0 || this.command.aimY !== 0;
  }

  snapshot(): ReturnType<InputManager<TestAction>['getDebugSnapshot']> {
    return this.manager.getDebugSnapshot();
  }

  presentationState(): { mode: string | undefined; padId: string; padConnected: boolean } {
    const pad = this.manager.getDebugSnapshot().providers?.gamepad;
    return {
      mode: this.manager.inputMode,
      padId: typeof pad?.padId === 'string' ? pad.padId : '',
      padConnected: typeof pad?.padIndex === 'number' && pad.padIndex >= 0,
    };
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
    this.intent.reset();
    this.actionSource.clear();
    this.stickSource.clear();
  }

  destroy(): void {
    this.manager.destroy();
    this.actionSource.clear();
    this.stickSource.clear();
  }
}
