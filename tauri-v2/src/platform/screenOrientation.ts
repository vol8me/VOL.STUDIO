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
