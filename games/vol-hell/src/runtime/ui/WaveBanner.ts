import { i18next } from '@volstudio/core';
import { uiConfig } from '@/config/ui';
import { clampFinite, safeDeltaMs } from '@/runtime/utils/numeric';

/**
 * Dalga göstergesi — sürekli duran bir satır + geçişlerde beliren bir duyuru.
 *
 * Üç şey anlatır:
 * 1. **Hangi dalgadayız ve ne kadar kaldı** — sürekli görünen küçük satır.
 * 2. **Yeni dalga başladı** — ortada kısa süre beliren büyük duyuru.
 * 3. **Zorunlu engel bekleniyor** — süre dolduğu hâlde Elite/Boss ayaktaysa,
 *    sayaç yerine "Elite'i yen" uyarısı. Oyuncu dalganın neden bitmediğini
 *    tahmin etmek zorunda kalmamalı.
 *
 * Duyurunun süresi CSS animasyonuyla değil JS sayacıyla yönetilir: oyun
 * duraklatıldığında (kart ekranı) duyuru da donmalı.
 */
export class WaveBanner {
  readonly element: HTMLDivElement;
  private readonly counter: HTMLDivElement;
  private readonly announcement: HTMLDivElement;
  private announcementTimerMs = 0;
  private lastWave = 0;
  private lastSeconds = -1;
  private lastBlocked = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'vol-wave';

    this.counter = document.createElement('div');
    this.counter.className = 'vol-wave__counter';
    this.element.appendChild(this.counter);

    this.announcement = document.createElement('div');
    this.announcement.className = 'vol-wave__announcement';
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.announcement.setAttribute('aria-hidden', 'true');
    this.element.appendChild(this.announcement);

    parent.appendChild(this.element);
  }

  /** Yeni dalga başladı — ortada duyuru belirir. */
  announce(wave: number): void {
    this.announcement.textContent = i18next.t('volhell:hud.waveAnnounce', { wave });
    this.announcement.setAttribute('aria-hidden', 'false');
    // Yeniden tetiklemede animasyon baştan oynasın diye sınıf sıfırlanır.
    this.announcement.classList.remove('vol-wave__announcement--visible');
    // Reflow: sınıfın kaldırılıp hemen eklenmesi tarayıcıda tek değişiklik
    // sayılır ve animasyon yeniden başlamaz.
    void this.announcement.offsetWidth;
    this.announcement.classList.add('vol-wave__announcement--visible');
    this.announcementTimerMs = uiConfig.hud.waveAnnounceMs;
  }

  /**
   * Göstergeyi tazeler.
   *
   * @param awaitingBlocker Süre doldu ama Elite/Boss hâlâ ayakta.
   * @param blockerRatio Engelin kalan can oranı (0-1); yoksa null.
   */
  refresh(
    deltaMs: number,
    wave: number,
    remainingMs: number,
    awaitingBlocker: boolean,
    blockerRatio: number | null,
  ): void {
    const safeDelta = safeDeltaMs(deltaMs);
    if (this.announcementTimerMs > 0) {
      this.announcementTimerMs -= safeDelta;
      if (this.announcementTimerMs <= 0) {
        this.announcement.classList.remove('vol-wave__announcement--visible');
        this.announcement.setAttribute('aria-hidden', 'true');
      }
    }

    const seconds = Math.max(
      0,
      Math.ceil(clampFinite(remainingMs, 0, Number.MAX_SAFE_INTEGER, 0) / 1000),
    );
    if (
      wave === this.lastWave &&
      seconds === this.lastSeconds &&
      awaitingBlocker === this.lastBlocked
    ) {
      return;
    }
    this.lastWave = wave;
    this.lastSeconds = seconds;
    this.lastBlocked = awaitingBlocker;

    this.counter.classList.toggle('vol-wave__counter--blocked', awaitingBlocker);
    if (!awaitingBlocker) {
      this.counter.textContent = i18next.t('volhell:hud.waveCounter', { wave, seconds });
      return;
    }

    // Engel bekleniyor: sayaç yerine hedef gösterilir, canı da yüzdeyle.
    const percent =
      blockerRatio === null ? 100 : Math.ceil(clampFinite(blockerRatio, 0, 1, 0) * 100);
    this.counter.textContent = i18next.t('volhell:hud.waveBlocked', { percent });
  }

  /** Dil değişiminde bir sonraki `refresh()` yeniden yazdırsın. */
  refreshLabels(): void {
    this.lastSeconds = -1;
    this.lastWave = 0;
  }

  destroy(): void {
    this.element.remove();
  }
}
