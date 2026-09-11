import { vi } from 'vitest';
import type { ScreenOrientation } from '@volstudio/tauri-v2';

/** `matchMedia('(orientation: portrait)')` sahtesi; döndürme dinleyicileri tetikler. */
export function stubViewport(initial: ScreenOrientation) {
  let portrait = initial === 'portrait';
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return portrait;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    rotate(to: ScreenOrientation) {
      portrait = to === 'portrait';
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}
