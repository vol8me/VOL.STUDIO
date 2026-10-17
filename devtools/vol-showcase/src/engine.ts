/**
 * Çalışan web motoru sınıfı. WebKitGTK (Steam Deck/Linux kabuğu) yüzeyleri CPU'da boyar; Chromium/WebKit-Apple'dan
 * farklı bir performans profili vardır ve bazı CSS kararları (katman terfisi) yalnız orada ölçümle doğrulanmıştır.
 * Tarayıcı kimliği yalnız bu sınıflandırma içindir; özellik varlığı kararı değildir.
 */
export type WebEngine = 'webkitgtk' | 'other';

export function detectEngine(userAgent: string): WebEngine {
  const webkit = /AppleWebKit/.test(userAgent);
  const chromium = /Chrome|Chromium|CriOS|Android|Edg\//.test(userAgent);
  return webkit && !chromium && /Linux|X11/.test(userAgent) ? 'webkitgtk' : 'other';
}
