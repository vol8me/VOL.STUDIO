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
  readonly events?: EventTarget;
  readonly visible?: () => boolean;
}

const defaultProbe: LinuxHapticsProbe = {
  isTauri,
  invoke: (command, args) => invoke(command, args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  events: typeof window === 'undefined' ? undefined : window,
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
};

/**
 * Kabuğun Linux titreşim durumu. `hidraw` Deck kontrolcüsünün HID feature
 * raporu yolunu, `evdev` sanal/FF_RUMBLE aygıtını bildirir; `none` sürücü
 * kaydedilemez demektir. Komut kabulü fiziksel his kanıtı değildir.
 */
export interface LinuxHapticsStatus {
  readonly backend: 'hidraw' | 'evdev' | 'none';
  readonly platformSupported?: boolean;
  readonly lastError?: string | null;
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
  let generation = 0;
  return {
    async play(pattern: HapticPattern) {
      const current = ++generation;
      for (const pulse of planRumblePulses(pattern)) {
        if (current !== generation) return;
        await probe.invoke('vol_haptics_rumble', {
          strong: pulse.strong,
          weak: pulse.weak,
          durationMs: pulse.durationMs,
        });
        if (current !== generation) return;
        if (pulse.gapAfterMs > 0) await probe.sleep(pulse.gapAfterMs);
      }
    },
    async cancel() {
      generation++;
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

export function observeLinuxHaptics(probe: LinuxHapticsProbe = defaultProbe): () => void {
  if (!probe.isTauri()) return () => {};
  let active = true;
  let refreshing = false;
  let registered = false;
  const driver = createLinuxHapticsDriver(probe);
  const refresh = async () => {
    if (!active || refreshing || probe.visible?.() === false) return;
    refreshing = true;
    try {
      const status = await getLinuxHapticsStatus(probe);
      if (!active) return;
      if (status.platformSupported === false) clearInterval(interval);
      const available = status.backend !== 'none';
      if (available === registered) return;
      registered = available;
      setHapticsDriver(available ? driver : null);
      if (!available) void Promise.resolve(driver.cancel?.()).catch(() => {});
    } finally {
      refreshing = false;
    }
  };
  const wake = (event?: Event) => {
    if (
      registered &&
      (event?.type === 'blur' || event?.type === 'pagehide' || probe.visible?.() === false)
    ) {
      void Promise.resolve(driver.cancel?.()).catch(() => {});
      return;
    }
    void refresh();
  };
  const events = [
    'gamepadconnected',
    'gamepaddisconnected',
    'visibilitychange',
    'pageshow',
    'pagehide',
    'blur',
  ];
  for (const event of events) probe.events?.addEventListener(event, wake);
  const interval = setInterval(() => {
    if (probe.visible?.() !== false) wake();
  }, 1000);
  wake();
  return () => {
    if (!active) return;
    active = false;
    clearInterval(interval);
    for (const event of events) probe.events?.removeEventListener(event, wake);
    if (registered) {
      setHapticsDriver(null);
      void Promise.resolve(driver.cancel?.()).catch(() => {});
    }
  };
}
