import type Phaser from 'phaser';
import { Vector2 } from '../math/Vector2';
import { PCController, type MoveKeyBindings } from './PCController';
import type { PCActionBinding } from './PCInputState';
import type { InputProvider } from './InputProvider';
import { createIdleActions, type InputState } from './InputState';
import type { InputSnapshot } from './InputSnapshot';
import { TouchController } from './TouchController';

export interface InputManagerOptions<TAction extends string> {
  /**
   * Oyunun eylem sözlüğü. Üretilen her `InputState.actions` kaydı bu kümenin
   * TAMAMINI taşır; aktif provider yokken hepsi `false` olur.
   */
  actions: readonly TAction[];
  /** Eylem → klavye tuşu / pointer düğmesi eşlemesi (PC sağlayıcısı). */
  pcActionBindings: Readonly<Record<TAction, PCActionBinding>>;
  /** Hareket tuşları; verilmezse WASD (bkz. `DEFAULT_MOVE_KEYS`). */
  moveKeys?: MoveKeyBindings;
  /** Sağ joystick deadzone'u aştığında basılı sayılacak eylem (dokunmatik). */
  aimStickAction?: TAction;
  /**
   * Provider'lar testler için enjekte edilebilir. Verilmezse gerçek
   * TouchController/PCController kurulur; ilk eleman her zaman "touch"
   * sağlayıcı kabul edilir.
   */
  providers?: InputProvider<TAction>[];
}

export class InputManager<TAction extends string> {
  private readonly providers: InputProvider<TAction>[];
  private readonly touch: InputProvider<TAction>;
  private readonly actions: readonly TAction[];

  constructor(scene: Phaser.Scene, options: InputManagerOptions<TAction>) {
    this.actions = options.actions;
    this.providers =
      options.providers ??
      ([
        new TouchController(scene, {
          actions: options.actions,
          aimStickAction: options.aimStickAction,
        }),
        new PCController(scene, {
          actionBindings: options.pcActionBindings,
          moveKeys: options.moveKeys,
        }),
      ] as InputProvider<TAction>[]);

    const touch = this.providers[0];
    // noUncheckedIndexedAccess kapali oldugu icin TS bos diziyi yakalamiyor;
    // guard olmadan getState() ilk satirda anlamsiz bir TypeError atardi.
    if (!touch) {
      throw new Error('InputManager: en az bir InputProvider gerekli (providers boş olamaz)');
    }
    this.touch = touch;
  }

  /**
   * Aktif saglayiciyi secer. getState() ve getDebugSnapshot() AYNI secimi
   * kullanmali — aksi halde debug overlay 'pc' gosterirken oyun touch state'i
   * kullanir ve hata ayiklama araci yaniltir.
   */
  private resolveActiveProvider(): InputProvider<TAction> | undefined {
    if (this.touch.isActive) return this.touch;
    return this.providers.find((provider) => provider.isActive);
  }

  update(delta: number): void {
    for (const provider of this.providers) {
      provider.update(delta);
    }
  }

  /**
   * Touch her zaman PC'den önce kontrol edilir: stale bir `activePointer`
   * (dokunuştan miras kalan) PC'ye yanlışlıkla öncelik verdirmemeli.
   */
  getState(playerPosition: Vector2): InputState<TAction> {
    const active = this.resolveActiveProvider();
    if (active) {
      return active.getState(playerPosition);
    }

    return {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: createIdleActions(this.actions),
    };
  }

  /** Aktif input provider'ın ham durum snapshot'ını döner. */
  getDebugSnapshot(): InputSnapshot {
    const active = this.resolveActiveProvider();
    if (active?.getDebugSnapshot) {
      return active.getDebugSnapshot();
    }
    return { activeProvider: 'none' };
  }

  destroy(): void {
    for (const provider of this.providers) {
      provider.destroy();
    }
  }
}
