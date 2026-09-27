import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  planRumblePulses,
  setHapticsDriver,
  type HapticPattern,
  type HapticsDriver,
} from '@volstudio/core';

export interface LinuxHapticsProbe {
  readonly isTauri: () => boolean;
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  readonly sleep: (ms: number) => Promise<void>;
}

const defaultProbe: LinuxHapticsProbe = {
  isTauri,
  invoke: (command, args) => invoke(command, args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Kabuğun Linux titreşim durumu. `hidraw` Deck kontrolcüsünün HID feature
 * raporu yolunu, `evdev` sanal/FF_RUMBLE aygıtını bildirir; `none` sürücü
 * kaydedilemez demektir. Öncelik hidraw'dadır — Steam Input'un sanal kolu
 * EVIOCSFF'i reddeder (ölçüldü: EFAULT).
 */
export interface LinuxHapticsStatus {
  readonly backend: 'hidraw' | 'evdev' | 'none';
  readonly device?: string;
  readonly scan?: {
    nodes: number;
    opened: number;
    rumbleCapable: number;
    uploadFailed: number;
    hidrawNodes: number;
    hidrawValve: number;
  };
}

export async function getLinuxHapticsStatus(
  probe: LinuxHapticsProbe = defaultProbe,
): Promise<LinuxHapticsStatus> {
  if (!probe.isTauri()) return { backend: 'none' };
  try {
    return (await probe.invoke('vol_haptics_status')) as LinuxHapticsStatus;
  } catch {
    return { backend: 'none' };
  }
}

/**
 * Linux titreşim sürücüsü — hidraw (Deck HID raporu) ya da evdev FF_RUMBLE;
 * kabuğun `vol_haptics_*` komutları arka ucu seçer. WebKitGTK'nın
 * `vibrationActuator` boşluğunu kaplar. Desen darbe dizisine
 * `planRumblePulses` ile çevrilir: core'un desen tablosu tek kaynak kalır.
 */
export function createLinuxHapticsDriver(probe: LinuxHapticsProbe = defaultProbe): HapticsDriver {
  return {
    async play(pattern: HapticPattern) {
      for (const pulse of planRumblePulses(pattern)) {
        await probe.invoke('vol_haptics_rumble', {
          strong: pulse.strong,
          weak: pulse.weak,
          durationMs: pulse.durationMs,
        });
        if (pulse.gapAfterMs > 0) await probe.sleep(pulse.gapAfterMs);
      }
    },
    async cancel() {
      await probe.invoke('vol_haptics_stop');
    },
  };
}

/**
 * Linux kabuğundaysa native sürücüyü core'a `native` arka uç olarak kaydeder.
 * Kayıt başarısızlığı (aygıt yok, komut yok) sessizdir — çağıranın koşul
 * yazması gerekmez; `getHapticsCapability` doğru arka ucu bildirmeye devam
 * eder. Titreşim çağrıları desen kısıtını core'da geçer.
 */
export async function registerLinuxHaptics(
  probe: LinuxHapticsProbe = defaultProbe,
): Promise<boolean> {
  const status = await getLinuxHapticsStatus(probe);
  if (status.backend === 'none') return false;
  setHapticsDriver(createLinuxHapticsDriver(probe));
  return true;
}
