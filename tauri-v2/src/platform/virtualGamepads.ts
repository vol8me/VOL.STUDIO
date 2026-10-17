import { invoke, isTauri } from '@tauri-apps/api/core';

/** Steam Input sanal kol yuvasının arkasındaki gerçek aygıt. */
export interface SteamVirtualGamepad {
  readonly slot: number;
  readonly name: string;
  readonly vid: number;
  readonly pid: number;
  readonly type: string;
}

export interface VirtualGamepadProbe {
  readonly isTauri: () => boolean;
  readonly invoke: (command: string) => Promise<unknown>;
}

const defaultProbe: VirtualGamepadProbe = { isTauri, invoke: (command) => invoke(command) };

/** Steam dışında, tarayıcıda ya da komut düşerse boş liste. */
export async function steamVirtualGamepads(
  probe: VirtualGamepadProbe = defaultProbe,
): Promise<readonly SteamVirtualGamepad[]> {
  if (!probe.isTauri()) return [];
  try {
    const pads = await probe.invoke('steam_virtual_gamepads');
    return Array.isArray(pads) ? (pads as SteamVirtualGamepad[]) : [];
  } catch {
    return [];
  }
}

/**
 * Glif bağlamı için sanal kol ipucu. Gamepad API sırası ile Steam yuva
 * numarasının eşleşmesi ölçülmediği için yalnız tek kol varken döner.
 */
export function singleVirtualPad(
  pads: readonly SteamVirtualGamepad[],
): { readonly vid: number; readonly type: string } | undefined {
  return pads.length === 1 ? { vid: pads[0].vid, type: pads[0].type } : undefined;
}
