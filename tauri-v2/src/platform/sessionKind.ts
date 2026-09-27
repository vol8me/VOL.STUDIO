import { invoke, isTauri } from '@tauri-apps/api/core';

export type SessionKind = 'web' | 'desktop' | 'gamescope';

export interface SessionKindProbe {
  readonly isTauri: () => boolean;
  readonly invoke: (command: string) => Promise<string>;
}

const defaultProbe: SessionKindProbe = {
  isTauri,
  invoke: (command) => invoke<string>(command),
};

/**
 * Kabuğun oturum sınıfı; `getRuntimePlatform`'ın tamamlayıcısı. Steam Deck
 * oyun kipinde (gamescope) kabuk `gamescope` döner — bu sınıf ön yüzün
 * pencere/çözünürlük ayarını gizlemesine (D5) ve kol kipini açmasına (D3)
 * bağlanır. Tarayıcı her zaman `web`, başarısız komut `desktop` verir.
 */
export async function getSessionKind(probe: SessionKindProbe = defaultProbe): Promise<SessionKind> {
  if (!probe.isTauri()) return 'web';
  try {
    const kind = await probe.invoke('session_kind');
    return kind === 'gamescope' ? 'gamescope' : 'desktop';
  } catch {
    return 'desktop';
  }
}
