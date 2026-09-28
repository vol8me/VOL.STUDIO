import { GAMEPAD_DEFAULT_DEAD_ZONE, isGamepadInputActive, type PadLike } from './GamepadState';

export interface GamepadSelectionOptions {
  padIndex?: number;
  deadZone?: number;
}

export function selectGamepad(
  pads: readonly (PadLike | null)[],
  previous: PadLike | null = null,
  options: GamepadSelectionOptions = {},
): PadLike | null {
  if (options.padIndex !== undefined) {
    const selected = pads[options.padIndex];
    return selected?.connected ? selected : null;
  }
  const connected = pads.filter((pad): pad is PadLike => Boolean(pad?.connected));
  const standard = connected.filter((pad) => pad.mapping === 'standard');
  const candidates = standard.length ? standard : connected;
  const retained = candidates.find(
    (pad) => pad.index === previous?.index && pad.id === previous.id,
  );
  const active = (pad: PadLike) =>
    isGamepadInputActive(pad, options.deadZone ?? GAMEPAD_DEFAULT_DEAD_ZONE);
  if (retained && active(retained)) return retained;
  return candidates.find(active) ?? retained ?? candidates[0] ?? null;
}
