import { i18next } from '@volstudio/core';
import lifeTr from '@/i18n/tr.json';
import lifeEn from '@/i18n/en.json';

/**
 * Açılış zinciri kırıldığında görünür hata yüzeyi. Kırılan i18n'in kendisi
 * olabilir; o durumda başlık paketlenmiş çeviri dosyasından okunur ve dil
 * tarayıcıdan düşürülür.
 */
export function showFatalError(error: unknown, parent: HTMLElement = document.body): HTMLElement {
  console.error('[VOL.LIFE] Açılış başarısız:', error);

  const overlay = document.createElement('div');
  overlay.className = 'vol-life-fatal';
  overlay.setAttribute('role', 'alert');

  const title = document.createElement('h1');
  title.className = 'vol-life-fatal__title';
  title.textContent = fatalTitle();

  const detail = document.createElement('p');
  detail.className = 'vol-life-fatal__detail';
  detail.textContent = error instanceof Error ? error.message : String(error);

  overlay.append(title, detail);
  parent.appendChild(overlay);
  return overlay;
}

function fatalTitle(): string {
  if (i18next.isInitialized) return i18next.t('life:fatal.title');
  const language = (typeof navigator === 'undefined' ? '' : navigator.language).toLowerCase();
  return language.startsWith('en') ? lifeEn.fatal.title : lifeTr.fatal.title;
}
