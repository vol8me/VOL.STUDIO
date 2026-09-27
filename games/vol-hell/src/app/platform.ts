import { getRuntimePlatform, type SessionKind } from '@volstudio/tauri-v2';
import {
  displayCapabilitiesForSession,
  inputModeForSession,
  type SessionDisplayCapabilities,
} from '@volstudio/core';

/**
 * Oturum sınıfı — bootstrap'te `getSessionKind()` ile bir kez ölçülür ve
 * burada saklanır (oturum oyun ömrü boyunca değişmez). Kabuk bildirimi
 * gelmeden okuyan senkron tüketiciler `desktop` varsayımı görür.
 */
let sessionKind: SessionKind = 'desktop';

export function setSessionKind(kind: SessionKind): void {
  sessionKind = kind;
}

export function getSessionKindValue(): SessionKind {
  return sessionKind;
}

/** Oturumun görüntü yetenekleri — gamescope'ta pencere/çözünürlük yoktur. */
export function displayCapabilities(): SessionDisplayCapabilities {
  return displayCapabilitiesForSession(sessionKind);
}

/** Oturum için başlangıç girdi kipi; gamescope'ta `'gamepad'`, aksi hâlde `undefined`. */
export function initialInputMode(): string | undefined {
  return inputModeForSession(sessionKind);
}

/**
 * Native masaüstü pencere yeteneği — TEK yüklem. `bootstrap` adapter'ı, ayar
 * ekranları çözünürlük kontrolünü bununla açar; iki yerde ayrı yazılsaydı biri
 * değişip öteki kalır ve hiçbir şey yapmayan bir seçenek görünürdü. Karar kabuğa
 * bağlıdır: dokunmatik ekranlı Windows dizüstünün de native penceresi vardır.
 * gamescope'ta WebView kendi penceresini sahiplenmez — native kontrol yoktur.
 */
export function hasNativeWindow(): boolean {
  return getRuntimePlatform() === 'desktop' && sessionKind !== 'gamescope';
}

/**
 * Görüntü ayarları (pencere kipi, çözünürlük, grafik kalitesi) sunulur mu.
 * Android kabuğu sistem çubuklarını zaten gizler; telefon tarayıcısı ise web'dir
 * ve orada DOM tam ekranı gerçek bir iş yapar. gamescope'ta kalite satırı
 * geçerlidir — yetenek ayrımı `displayCapabilities`'dedir, bu bayrak bölümün
 * tamamını değil "video bölümü var mı" sorusunu yanıtlar.
 */
export function supportsDisplaySettings(): boolean {
  return getRuntimePlatform() !== 'android';
}
