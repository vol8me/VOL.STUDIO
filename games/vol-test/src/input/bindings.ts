import type { PCActionBinding } from '@volstudio/core';
import { GAMEPAD_BUTTON, type GamepadActionBinding } from '@volstudio/core/input/gamepad';

/**
 * VOL.TEST eylem sözlüğü. Hareket ve nişan eylem değildir (`InputState.move`,
 * `InputState.aim`); burada yalnız düğmeye bağlanan niyetler durur. Tuş
 * değiştirmek veri değişikliğidir.
 */
export type TestAction = 'fire' | 'boost' | 'zoomIn' | 'zoomOut' | 'grid' | 'pause';

export const TEST_ACTIONS: readonly TestAction[] = [
  'fire',
  'boost',
  'zoomIn',
  'zoomOut',
  'grid',
  'pause',
];

/** Basıldığı karede bir kez işlenen eylemler; basılı tutmak tekrar etmez. */
export const EDGE_ACTIONS: readonly TestAction[] = ['zoomIn', 'zoomOut', 'grid', 'pause'];

/** Ham `KeyboardEvent.keyCode` değerleri; kayıt dosyası da aynı sayıları taşır. */
const KEY = { shift: 16, escape: 27, e: 69, g: 71, q: 81 } as const;

export const PC_BINDINGS: Readonly<Record<TestAction, PCActionBinding>> = {
  fire: { source: 'pointerButton', button: 'left' },
  boost: { source: 'key', keyCode: KEY.shift },
  zoomIn: { source: 'key', keyCode: KEY.e },
  zoomOut: { source: 'key', keyCode: KEY.q },
  grid: { source: 'key', keyCode: KEY.g },
  pause: { source: 'key', keyCode: KEY.escape },
};

/**
 * Kol eşlemesi (W3C `standard`). Steam Deck'te Steam Input sanal kolu aynı
 * dizinleri verir: sol çubuk hareket, sağ çubuk nişan, tetikler ateş ve
 * hızlanma, omuzlar zoom.
 */
export const GAMEPAD_BINDINGS: Readonly<Record<TestAction, GamepadActionBinding>> = {
  fire: { source: 'button', button: GAMEPAD_BUTTON.rightTrigger },
  boost: { source: 'button', button: GAMEPAD_BUTTON.leftTrigger },
  zoomIn: { source: 'button', button: GAMEPAD_BUTTON.rightBumper },
  zoomOut: { source: 'button', button: GAMEPAD_BUTTON.leftBumper },
  grid: { source: 'button', button: GAMEPAD_BUTTON.select },
  pause: { source: 'button', button: GAMEPAD_BUTTON.start },
};

/** Dokunmatikte sağ çubuğu sürüklemek nişan alır ve ateş eder. */
export const AIM_STICK_ACTION: TestAction = 'fire';

/**
 * Kenar algılayıcı: eylemin bu karede basılmaya BAŞLAYIP başlamadığını söyler.
 * Kare başına bir kez `update` çağrılır.
 */
export class ActionEdges<TAction extends string> {
  private readonly held = new Set<TAction>();
  private readonly pressed = new Set<TAction>();

  update(actions: Readonly<Record<TAction, boolean>>, watched: readonly TAction[]): void {
    this.pressed.clear();
    for (const action of watched) {
      const down = actions[action];
      if (down && !this.held.has(action)) this.pressed.add(action);
      if (down) this.held.add(action);
      else this.held.delete(action);
    }
  }

  /**
   * Eylemi bırakılana dek basılı sayar: başka bir katmanın (ör. Escape'i
   * dinleyen modal) zaten işlediği basış ikinci kez tetiklenmez.
   */
  suppress(action: TAction): void {
    this.held.add(action);
    this.pressed.delete(action);
  }

  wasPressed(action: TAction): boolean {
    return this.pressed.has(action);
  }

  reset(): void {
    this.held.clear();
    this.pressed.clear();
  }
}
