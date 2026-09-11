import { invoke } from '@tauri-apps/api/core';

export type ScreenOrientation = 'portrait' | 'landscape';

export interface ScreenOrientationState {
  /** Ekranın o anki yönü — istenen değil, uygulanan. */
  readonly current: ScreenOrientation;
  /** Kayıtlı tercih; hiç seçilmediyse `null`. */
  readonly preferred: ScreenOrientation | null;
  /** Etkinlik bu kipte yön isteğini uygulayabiliyor mu (TV ve çoklu pencere hayır). */
  readonly supported: boolean;
}

/** `user` telefonun sistem döndürme kilidine uyar; `sensor` onu yok sayar. */
export type RotationFamily = 'user' | 'sensor';

/** Android yön köprüsü; komutlar `vol-orientation` eklentisinin izniyle çağrılır. */
export const androidScreenOrientation = {
  getState: (): Promise<ScreenOrientationState> => invoke('plugin:vol-orientation|get_state'),
  set: (
    orientation: ScreenOrientation,
    family: RotationFamily = 'user',
  ): Promise<ScreenOrientationState> =>
    invoke('plugin:vol-orientation|set_orientation', { orientation, family }),
};

const PORTRAIT_QUERY = '(orientation: portrait)';

function portraitQuery(): MediaQueryList | null {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(PORTRAIT_QUERY) : null;
}

/** Görüntü alanının gerçek yönü; tarayıcıda ve masaüstünde de okunur. Kare alan dikeydir. */
export function readViewportOrientation(): ScreenOrientation {
  return portraitQuery()?.matches ? 'portrait' : 'landscape';
}

/** Yön değişimini izler; aboneliği kaldıran fonksiyonu döner. */
export function observeViewportOrientation(
  listener: (orientation: ScreenOrientation) => void,
): () => void {
  const query = portraitQuery();
  if (!query) return () => {};
  const onChange = (): void => listener(readViewportOrientation());
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Görüntü alanı beklenen yöne dönene ya da süre dolana kadar bekler ve sonunda
 * GERÇEK yönü döner. Android bir yön isteğini yok sayabilir; çağıran seçimi bu
 * cevaba göre gerçeğe geri çeker.
 */
export function waitForViewportOrientation(
  expected: ScreenOrientation,
  timeoutMs: number,
): Promise<ScreenOrientation> {
  if (readViewportOrientation() === expected) return Promise.resolve(expected);
  return new Promise((resolve) => {
    const finish = (): void => {
      stopObserving();
      clearTimeout(timer);
      resolve(readViewportOrientation());
    };
    const timer = setTimeout(finish, timeoutMs);
    const stopObserving = observeViewportOrientation((orientation) => {
      if (orientation === expected) finish();
    });
  });
}
