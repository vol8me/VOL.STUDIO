import { invoke, isTauri } from '@tauri-apps/api/core';

export type SessionKind = 'web' | 'desktop' | 'gamescope' | 'bigpicture';

const NATIVE_KINDS: readonly SessionKind[] = ['desktop', 'gamescope', 'bigpicture'];

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
 * oyun kipi `gamescope`, masaüstünde Steam Big Picture `bigpicture` döner;
 * ikisi de kol kipiyle başlar, gamescope ayrıca pencere/çözünürlük ayarını
 * gizler. Tarayıcı her zaman `web`, bilinmeyen ya da başarısız komut `desktop` verir.
 */
export async function getSessionKind(probe: SessionKindProbe = defaultProbe): Promise<SessionKind> {
  if (!probe.isTauri()) return 'web';
  try {
    const kind = await probe.invoke('session_kind');
    return NATIVE_KINDS.find((known) => known === kind) ?? 'desktop';
  } catch {
    return 'desktop';
  }
}
