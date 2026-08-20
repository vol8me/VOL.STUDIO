import { i18next } from '../../systems/I18n';

export interface RoundCounterOptions {
  /** Toplam dalga sayısı biliniyorsa (örn. "3 / 10"); bilinmiyorsa (sonsuz mod) undefined bırakılır. */
  totalRounds?: number;
  onCountdownEnd?: () => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
  /**
   * Tur etiketini biçimlendirir — ÇEVRİLMİŞ metin beklenir.
   *
   * Varsayılan CORE'un nötr metnidir ("Tur 3"). Oyunun kendi kelimesi varsa
   * ("Dalga 3", "El 3", "Vardiya 3") onu CORE'un sözlüğüne eklemek yerine
   * buradan verir: hangi turun ne dendiği oyunun kararıdır.
   */
  formatRound?: (round: number, total?: number) => string;
  /** Geri sayım metnini biçimlendirir — ÇEVRİLMİŞ metin beklenir. */
  formatCountdown?: (seconds: number) => string;
}

/**
 * Tur göstergesi + kalan süre geri sayımı. **Saf görüntüdür:** turu kendisi
 * ilerletmez, ne zaman biteceğine karar vermez; sadece dışarıdan verilen tur
 * numarasını ve kalan süreyi çizer.
 */
export class RoundCounter {
  readonly element: HTMLDivElement;
  private readonly roundLabelElement: HTMLSpanElement;
  private readonly countdownElement: HTMLSpanElement;
  private readonly totalRounds?: number;
  private readonly onCountdownEndHandler?: () => void;
  private readonly formatRound?: (round: number, total?: number) => string;
  private readonly formatCountdown?: (seconds: number) => string;
  private intervalId?: ReturnType<typeof setInterval>;
  private remainingSeconds = 0;
  private round = 1;
  private readonly onLanguageChanged = (): void => {
    this.setRound(this.round);
    if (!this.countdownElement.hidden) this.renderCountdown();
  };

  constructor(options: RoundCounterOptions = {}) {
    this.totalRounds = options.totalRounds;
    this.onCountdownEndHandler = options.onCountdownEnd;
    this.formatRound = options.formatRound;
    this.formatCountdown = options.formatCountdown;

    this.element = document.createElement('div');
    this.element.className = ['vol-round-counter', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');

    this.roundLabelElement = document.createElement('span');
    this.roundLabelElement.className = 'vol-round-counter__round';
    this.element.appendChild(this.roundLabelElement);

    this.countdownElement = document.createElement('span');
    this.countdownElement.className = 'vol-round-counter__countdown';
    this.countdownElement.hidden = true;
    this.element.appendChild(this.countdownElement);

    this.setRound(1);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setRound(round: number): void {
    this.round = round;
    this.roundLabelElement.textContent = this.formatRound
      ? this.formatRound(round, this.totalRounds)
      : this.totalRounds !== undefined
      ? i18next.t('core:roundcounter.roundTotal', { round, total: this.totalRounds })
      : i18next.t('core:roundcounter.round', { round });
  }

  getRound(): number {
    return this.round;
  }

  /**
   * Saniye bazlı geri sayım başlatır; süre dolunca `onCountdownEnd` tetiklenir.
   * Yeni çağrı mevcut geri sayımı iptal eder.
   *
   * Süre bittiğinde NE OLACAĞINA bileşen karar vermez: turu ilerletmek,
   * durdurmak ya da yeni bir geri sayım açmak çağıranın işidir.
   */
  startCountdown(seconds: number): void {
    this.runCountdown(seconds, () => this.onCountdownEndHandler?.());
  }

  /**
   * Kalan süreyi DIŞARIDAN alıp gösterir — kendi zamanlayıcısını kurmaz.
   *
   * Süreyi zaten yöneten bir sistem (ör. `RoundLoop`) varken bileşenin ikinci
   * bir `setInterval` kurması iki sayacın kayması demektir. Negatif değer 0
   * sayılır; `null` verilirse geri sayım metni gizlenir.
   */
  setRemainingSeconds(seconds: number | null): void {
    if (seconds === null) {
      this.countdownElement.hidden = true;
      return;
    }
    // Çalışan bir `runCountdown` interval'i varsa durdur — iki kaynak aynı
    // metni güncellerse sayma kayar.
    clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.remainingSeconds = Math.max(0, Math.ceil(seconds));
    this.countdownElement.hidden = false;
    this.renderCountdown();
  }

  /** Geri sayımı durdurur ve countdown metnini gizler. */
  stopCountdown(): void {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.countdownElement.hidden = true;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.stopCountdown();
    this.element.remove();
  }

  private runCountdown(seconds: number, onEnd: () => void): void {
    clearInterval(this.intervalId);
    this.remainingSeconds = Math.max(0, Math.ceil(seconds));
    this.countdownElement.hidden = false;
    this.renderCountdown();

    this.intervalId = setInterval(() => {
      this.remainingSeconds -= 1;
      if (this.remainingSeconds <= 0) {
        clearInterval(this.intervalId);
        this.intervalId = undefined;
        this.countdownElement.hidden = true;
        onEnd();
        return;
      }
      this.renderCountdown();
    }, 1000);
  }

  private renderCountdown(): void {
    this.countdownElement.textContent = this.formatCountdown
      ? this.formatCountdown(this.remainingSeconds)
      : i18next.t('core:roundcounter.next', { seconds: this.remainingSeconds });
  }
}
