import { getRuntimePlatform } from '@volstudio/tauri-v2';

/**
 * Native masaüstü pencere yeteneği — TEK yüklem. `bootstrap` adapter'ı, ayar
 * ekranları çözünürlük kontrolünü bununla açar; iki yerde ayrı yazılsaydı biri
 * değişip öteki kalır ve hiçbir şey yapmayan bir seçenek görünürdü. Karar kabuğa
 * bağlıdır: dokunmatik ekranlı Windows dizüstünün de native penceresi vardır.
 */
export function hasNativeWindow(): boolean {
  return getRuntimePlatform() === 'desktop';
}

/**
 * Görüntü ayarları (pencere kipi, çözünürlük, grafik kalitesi) sunulur mu.
 * Android kabuğu sistem çubuklarını zaten gizler; telefon tarayıcısı ise web'dir
 * ve orada DOM tam ekranı gerçek bir iş yapar.
 */
export function supportsDisplaySettings(): boolean {
  return getRuntimePlatform() !== 'android';
}
