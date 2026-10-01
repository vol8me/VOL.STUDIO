import { invoke } from '@tauri-apps/api/core';
import { planRumblePulses, setHapticsDriver, type HapticsDriver } from '@volstudio/core';
import { getRuntimePlatform, type RuntimePlatform } from './runtimePlatform';

export interface AndroidHapticsProbe {
  readonly platform: () => RuntimePlatform;
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  readonly events?: EventTarget;
  readonly visible?: () => boolean;
}

const defaultProbe: AndroidHapticsProbe = {
  platform: getRuntimePlatform,
  invoke: (command, args) => invoke(command, args),
  events: typeof window === 'undefined' ? undefined : window,
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
};

export function createAndroidHapticsDriver(
  probe: AndroidHapticsProbe = defaultProbe,
): HapticsDriver {
  return {
    async play(pattern, intensity = 1) {
      const pulses = planRumblePulses(pattern, intensity);
      const timings: number[] = [];
      const amplitudes: number[] = [];
      for (const pulse of pulses) {
        const amplitude = Math.round(Math.max(pulse.strong, pulse.weak) * 255);
        if (amplitude === 0) return;
        timings.push(pulse.durationMs);
        amplitudes.push(amplitude);
        if (pulse.gapAfterMs > 0) {
          timings.push(pulse.gapAfterMs);
          amplitudes.push(0);
        }
      }
      await probe.invoke('plugin:vol-haptics|play', { timings, amplitudes });
    },
    async cancel() {
      await probe.invoke('plugin:vol-haptics|cancel');
    },
  };
}

/** Android WebView API'si yerine izin ve gerçek motor desteğiyle native sürücü kurar. */
export function observeAndroidHaptics(probe: AndroidHapticsProbe = defaultProbe): () => void {
  if (probe.platform() !== 'android') return () => {};
  let active = true;
  let registered = false;
  const driver = createAndroidHapticsDriver(probe);
  const cancel = () => void Promise.resolve(driver.cancel?.()).catch(() => {});
  const background = (event: Event) => {
    if (registered && (event.type !== 'visibilitychange' || probe.visible?.() === false)) cancel();
  };
  const events = ['blur', 'pagehide', 'visibilitychange'];
  for (const event of events) probe.events?.addEventListener(event, background);
  void probe.invoke('plugin:vol-haptics|status').then(
    (result) => {
      if (!active || !(result as { supported?: boolean })?.supported) return;
      registered = true;
      setHapticsDriver(driver);
    },
    () => {},
  );
  return () => {
    if (!active) return;
    active = false;
    for (const event of events) probe.events?.removeEventListener(event, background);
    if (registered) {
      setHapticsDriver(null);
      cancel();
    }
  };
}
