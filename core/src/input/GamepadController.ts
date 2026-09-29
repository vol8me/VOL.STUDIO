import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import { createIdleActions } from './InputState';
import {
  computeGamepadInput,
  isGamepadInputActive,
  resolveGamepadActions,
  GAMEPAD_DEFAULT_DEAD_ZONE,
  type GamepadActionBinding,
  type GamepadInputOptions,
  type PadLike,
} from './GamepadState';
import {
  createSingleProviderSnapshot,
  type InputSnapshot,
  type ProviderSnapshot,
} from './InputSnapshot';
import { Vector2 } from '../math/Vector2';
import { selectGamepad } from './selectGamepad';

/** Gamepad sağlayıcısının diagnostics gövdesi — CORE yorumlamaz. */
export interface GamepadInputSnapshot extends ProviderSnapshot {
  /** Tarayıcının bildirdiği `Gamepad.id` (ör. Steam sanal kolu). */
  padId: string;
  padIndex: number;
  mapping: string;
  moveAxes: readonly [number, number];
  aimAxes: readonly [number, number];
  /** Basılı düğme dizinleri — ham veri, eylem adı değil. */
  pressedButtons: readonly number[];
  actions: Readonly<Record<string, boolean>>;
}

export interface GamepadControllerOptions<TAction extends string> extends GamepadInputOptions {
  /**
   * Eylem → düğme eşlemesi; eylem kümesini TÜKETİCİ tanımlar. Verilmezse
   * sağlayıcı yalnız hareket/nişan ve kip algısı üretir, eylemler hep
   * `false` kalır.
   */
  actionBindings?: Readonly<Record<TAction, GamepadActionBinding>>;
  /**
   * `navigator.getGamepads` karşılığı. Enjekte edilebilir: testler sahte
   * kol listesi, kaportacılar (WebKit) gerektiğinde kendi dizisini verir.
   * Varsayılan `() => navigator.getGamepads()`; DOM'suz ortamda boş dizidir.
   */
  getGamepads?: () => readonly (PadLike | null)[];
  /**
   * Sabit kol dizini. Verilmezse son etkin standart kol, nötrken de korunur.
   */
  padIndex?: number;
  /** Diagnostics'teki sağlayıcı kimliği; varsayılan `'gamepad'`. */
  id?: string;
  /**
   * Kol görünür olunca ya da kaybolunca bir kez çağrılır (yoklamadan türer).
   * Duraklatma ve oyuncu atama politikası tüketicinindir.
   */
  onConnectionChange?: (connected: boolean, padId: string) => void;
}

/**
 * Tarayıcı Gamepad API'sini `InputProvider` sözleşmesine bağlayan sağlayıcı.
 *
 * Olay tabanlı DEĞİLDİR: `update()` her kare `getGamepads()`'i yoklar.
 * `gamepadconnected` olayına güvenilmez çünkü bazı tarayıcılar (WebKitGTK
 * dahil) kolyi ilk düğme basımına dek bağlı göstermez; yoklama ikisini de
 * doğru kapsar.
 *
 * `providesRestingState` YOKTUR: çubuk serbestken nişan sıfırdır ve bu bir
 * sinyal değil, "nişan yok" demektir — durağan fare nişanı `InputManager`
 * tarafında birleştirilir.
 */
export class GamepadController<TAction extends string> implements InputProvider<TAction> {
  readonly id: string;
  private readonly actionBindings: Readonly<Record<TAction, GamepadActionBinding>>;
  private readonly getGamepads: () => readonly (PadLike | null)[];
  private readonly padIndex?: number;
  private readonly options: GamepadInputOptions;
  private readonly actions: readonly TAction[];
  private readonly onConnectionChange?: (connected: boolean, padId: string) => void;
  /** Son görülen kol — `getDebugSnapshot` update'ler arasında da çalışsın diye. */
  private pad: PadLike | null = null;

  constructor(options: GamepadControllerOptions<TAction> & { actions: readonly TAction[] }) {
    this.actionBindings = options.actionBindings ?? ({} as Record<TAction, GamepadActionBinding>);
    this.padIndex = options.padIndex;
    this.id = options.id ?? 'gamepad';
    this.actions = options.actions;
    this.onConnectionChange = options.onConnectionChange;
    this.options = options;
    this.getGamepads =
      options.getGamepads ??
      (() =>
        typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? (navigator.getGamepads() as readonly (PadLike | null)[])
          : []);
  }

  private selectPad(): PadLike | null {
    return selectGamepad(this.getGamepads(), this.pad, {
      padIndex: this.padIndex,
      deadZone: this.options.moveDeadZone,
    });
  }

  update(_delta: number): void {
    const previous = this.pad;
    this.pad = this.selectPad();
    if ((previous === null) !== (this.pad === null)) {
      this.onConnectionChange?.(this.pad !== null, (this.pad ?? previous)?.id ?? '');
    }
  }

  get isActive(): boolean {
    return (
      this.pad !== null &&
      isGamepadInputActive(this.pad, this.options.moveDeadZone ?? GAMEPAD_DEFAULT_DEAD_ZONE)
    );
  }

  getState(): InputState<TAction> {
    const pad = this.pad;
    if (!pad) {
      return {
        move: Vector2.zero(),
        aim: Vector2.zero(),
        actions: createIdleActions(this.actions),
      };
    }
    const actions = resolveGamepadActions(
      this.actionBindings,
      (index) => pad.buttons[index]?.pressed ?? false,
    );
    return computeGamepadInput(pad, actions, this.options);
  }

  getDebugSnapshot(): InputSnapshot {
    const pad = this.pad;
    const body: GamepadInputSnapshot = {
      padId: pad?.id ?? '',
      padIndex: pad?.index ?? -1,
      mapping: pad?.mapping ?? '',
      moveAxes: this.options.moveAxes ?? [0, 1],
      aimAxes: this.options.aimAxes ?? [2, 3],
      pressedButtons: pad
        ? pad.buttons.flatMap((button, index) => (button.pressed ? [index] : []))
        : [],
      actions: pad
        ? resolveGamepadActions(
            this.actionBindings,
            (index) => pad.buttons[index]?.pressed ?? false,
          )
        : {},
    };
    return createSingleProviderSnapshot(this.id, body);
  }

  destroy(): void {
    this.pad = null;
  }
}
