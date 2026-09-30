import { Vector2 } from '../math/Vector2';
import { normalizeAnalog, normalizeDirection } from './InputUtils';
import { INPUT } from '../constants';
import type { InputState } from './InputState';

/**
 * W3C `standard` eşlemesinin düğme dizinleri.
 *
 * Sayılar `Gamepad.buttons` dizisinin indeksleridir; aile adları (A/B/X/Y,
 * LB/RB…) kasıtlı olarak burada YOKTUR — düğme adı göstermek glif sisteminin
 * işidir, eşleme verisi yalnız dizin taşır. Dizinler değişmez bir
 * standarttır: `mapping === 'standard'` diyen her kol aynı dizini verir.
 */
export const GAMEPAD_BUTTON = {
  /** Alt yüz düğmesi (Xbox A / PS Cross). */
  primary: 0,
  /** Sağ yüz düğmesi (Xbox B / PS Circle). */
  secondary: 1,
  /** Sol yüz düğmesi (Xbox X / PS Square). */
  tertiary: 2,
  /** Üst yüz düğmesi (Xbox Y / PS Triangle). */
  quaternary: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  /** Back/View/Select. */
  select: 8,
  /** Start/Menu/Options. */
  start: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  /** Logo düğmesi — tarayıcılar Steam düğmesini de buraya koyar. */
  home: 16,
} as const;

/**
 * Bir eylemin kolda neye bağlandığı.
 *
 * `PCActionBinding` ile aynı ilke: eşleme VERİDİR. Yeniden atama ekranı ya
 * da kayıt dosyası bu nesneyi taşır, CORE hangi eylemin var olduğunu bilmez.
 * `axes` üzerinden eylem bağlanmaz; eksen niyeti `move`/`aim`'e gider,
 * eylem bağlamak isteyen düğme dizini kullanır (D-pad dahil).
 */
export interface GamepadActionBinding {
  source: 'button';
  /** `Gamepad.buttons` dizini; standart adlar için `GAMEPAD_BUTTON`. */
  button: number;
}

/**
 * Sağlayıcının ihtiyaç duyduğu `Gamepad` alt kümesi.
 *
 * DOM `Gamepad` tipine yapısal olarak uyar ama ona BAĞLI DEĞİLDİR: testler
 * düz nesnelerle, sanal-kol betikleri kendi uydurma dizileriyle besler.
 */
export interface PadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  /** `'standard'` dışındaki eşlemelerde eksen/düğme dizinleri güvenilmezdir. */
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/** `computeGamepadInput` için seçenekler. */
export interface GamepadInputOptions {
  /** Sol çubuk eksenleri `[x, y]`; varsayılan `[0, 1]`. */
  moveAxes?: readonly [number, number];
  /** Sağ çubuk eksenleri `[x, y]`; varsayılan `[2, 3]`. */
  aimAxes?: readonly [number, number];
  moveDeadZone?: number;
  aimDeadZone?: number;
}

const DEFAULT_MOVE_AXES: readonly [number, number] = [0, 1];
const DEFAULT_AIM_AXES: readonly [number, number] = [2, 3];

function readAxis(pad: PadLike, index: number): number {
  const value = pad.axes[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Eylem eşlemelerini o karenin basılı/basılı değil kaydına çevirir.
 *
 * `pressed` yerine `value` eşiği KASITLI kullanılmaz: analog tetikler
 * (LT/RT) `pressed`'i kendi eşiğiyle raporlar ve platformlar arası tutarlıdır;
 * ayrı bir tetik-eşiği eklemek eşlemeyi veri olmaktan çıkarırdı.
 */
export function resolveGamepadActions<TAction extends string>(
  bindings: Readonly<Record<TAction, GamepadActionBinding>>,
  buttonPressed: (index: number) => boolean,
): Record<TAction, boolean> {
  const result = {} as Record<TAction, boolean>;
  for (const action of Object.keys(bindings) as TAction[]) {
    result[action] = buttonPressed(bindings[action].button);
  }
  return result;
}

/** Çubuğun iki eksenini okur; ham değer döner (deadzone burada uygulanmaz). */
export function readStick(pad: PadLike, axes: readonly [number, number]): { x: number; y: number } {
  return { x: readAxis(pad, axes[0]), y: readAxis(pad, axes[1]) };
}

/**
 * Kolun bu karede ANLAMLI girdi üretip üretmediği.
 *
 * Anlamlı = herhangi bir düğme basılı ya da bir çubuk deadzone'un ötesinde.
 * Üreticinin bildirdiği `mapping !== 'standard'` kollar da burada sayılır:
 * yanlış eşlenen bir kolun basılı düğmesi "kol elde" sinyalini yine de verir
 * (state'e yalnız standard eşleme yansır).
 */
export function isGamepadInputActive(pad: PadLike, deadZone: number): boolean {
  for (const button of pad.buttons) {
    if (button.pressed) return true;
  }
  for (const axis of pad.axes) {
    if (Math.abs(axis) > deadZone) return true;
  }
  return false;
}

/**
 * Bir `PadLike` anlık görüntüsünden `InputState` hesaplayan saf mantık —
 * `navigator`/Phaser bağımlılığı yoktur, birim testlidir.
 *
 * `move` büyüklük taşır (analog), `aim` yalnız yöndür — fare nişanıyla aynı
 * sözleşme (`normalizeDirection` çıktısı 0 ya da 1 uzunlukludur). Sağ çubuk
 * serbestken `aim` sıfırdır; `InputManager` boşluğu durağan-nişan
 * sağlayıcısından (fare) doldurabilir — iki kaynak birbirini kilitlemez.
 */
export function computeGamepadInput<TAction extends string>(
  pad: PadLike,
  actions: Readonly<Record<TAction, boolean>>,
  options: GamepadInputOptions = {},
): InputState<TAction> {
  const moveRaw = readStick(pad, options.moveAxes ?? DEFAULT_MOVE_AXES);
  const aimRaw = readStick(pad, options.aimAxes ?? DEFAULT_AIM_AXES);
  return {
    move: normalizeAnalog(
      new Vector2(moveRaw.x, moveRaw.y),
      options.moveDeadZone ?? GAMEPAD_DEFAULT_DEAD_ZONE,
    ),
    aim: normalizeDirection(
      new Vector2(aimRaw.x, aimRaw.y),
      options.aimDeadZone ?? GAMEPAD_DEFAULT_DEAD_ZONE,
    ),
    actions,
  };
}

/** `INPUT.DEAD_ZONE_RATIO`'nun kol bağlamındaki adı — okunabilirlik için. */
export const GAMEPAD_DEFAULT_DEAD_ZONE = INPUT.DEAD_ZONE_RATIO;
