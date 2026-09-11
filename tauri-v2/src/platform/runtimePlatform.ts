import { isTauri } from '@tauri-apps/api/core';

export type RuntimePlatform = 'web' | 'desktop' | 'android';

export interface RuntimePlatformProbe {
  readonly isTauri: () => boolean;
  readonly userAgent: () => string;
}

const defaultProbe: RuntimePlatformProbe = {
  isTauri,
  userAgent: () => (typeof navigator === 'undefined' ? '' : navigator.userAgent),
};

/**
 * Uygulamanın koştuğu kabuk; işaretçi türünden bağımsızdır. Fareli Android (DeX)
 * dokunmatik değildir ama geri tuşu uygulamaya gelir ve sistem çubukları gizlidir;
 * dokunmatik ekranlı dizüstü ise bir masaüstü penceresidir.
 *
 * Android, Tauri içinde WebView kullanıcı ajanından tanınır (ölçüldü, SM-G990B2:
 * `Linux; Android 16; …; wv`). Tarayıcıdaki Android telefon `web`dir.
 */
export function getRuntimePlatform(probe: RuntimePlatformProbe = defaultProbe): RuntimePlatform {
  if (!probe.isTauri()) return 'web';
  return /\bAndroid\b/.test(probe.userAgent()) ? 'android' : 'desktop';
}
