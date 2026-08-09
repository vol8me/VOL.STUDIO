import { i18next } from '../../systems/I18n';

export interface WaveCounterOptions {
  /** Toplam dalga sayısı biliniyorsa (örn. "3 / 10"); bilinmiyorsa (sonsuz mod) undefined bırakılır. */
  totalWaves?: number;
  onCountdownEnd?: () => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

export interface AutoLoopOptions {
  /** Dalgalar arası mola süresi (saniye). */
  countdownSeconds: number;
  /** Her yeni dalga başladığında (mola bitip dalga numarası artınca) tetiklenir. */
  onWaveStart: (wave: number) => void;
}

/**
 * Dalga/round göstergesi + sonraki dalgaya kalan süre geri sayımı. `startCountdown()` tek seferlik geri sayım başlatır.
 * `startAutoLoop()` mola bitiminde dalgayı otomatik artırıp yeni molayı başlatır (totalWaves'e ulaşılınca durur). İkisi aynı anda aktif olamaz.
 */
export class WaveCounter {
  readonly element: HTMLDivElement;
  private readonly waveLabelElement: HTMLSpanElement;
  private readonly countdownElement: HTMLSpanElement;
  private readonly totalWaves?: number;
  private readonly onCountdownEndHandler?: () => void;
  private intervalId?: ReturnType<typeof setInterval>;
  private remainingSeconds = 0;
  private wave = 1;
  private autoLoop: AutoLoopOptions | null = null;
  private readonly onLanguageChanged = (): void => {
    this.setWave(this.wave);
    if (!this.countdownElement.hidden) this.renderCountdown();
  };

  constructor(options: WaveCounterOptions = {}) {
    this.totalWaves = options.totalWaves;
    this.onCountdownEndHandler = options.onCountdownEnd;

    this.element = document.createElement('div');
    this.element.className = ['vol-wave-counter', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');

    this.waveLabelElement = document.createElement('span');
    this.waveLabelElement.className = 'vol-wave-counter__wave';
    this.element.appendChild(this.waveLabelElement);

    this.countdownElement = document.createElement('span');
    this.countdownElement.className = 'vol-wave-counter__countdown';
    this.countdownElement.hidden = true;
    this.element.appendChild(this.countdownElement);

    this.setWave(1);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setWave(wave: number): void {
    this.wave = wave;
    this.waveLabelElement.textContent =
      this.totalWaves !== undefined
        ? i18next.t('core:wavecounter.waveTotal', { wave, total: this.totalWaves })
        : i18next.t('core:wavecounter.wave', { wave });
  }

  getWave(): number {
    return this.wave;
  }

  /** Saniye bazlı geri sayım başlatır; süre dolunca onCountdownEnd tetiklenir. Yeni çağrı öncekini iptal eder. */
  startCountdown(seconds: number): void {
    this.autoLoop = null;
    this.runCountdown(seconds, () => this.onCountdownEndHandler?.());
  }

  /** Dalgalar arası otomatik döngüyü başlatır. totalWaves verilmediyse döngü hiç durmaz — durdurmak için stopCountdown() çağrılmalı. */
  startAutoLoop(options: AutoLoopOptions): void {
    this.autoLoop = options;
    this.runCountdown(options.countdownSeconds, () => this.advanceLoop());
  }

  /** Geri sayımı durdurur ve countdown metnini gizler. */
  stopCountdown(): void {
    this.autoLoop = null;
    clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.countdownElement.hidden = true;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.stopCountdown();
    this.element.remove();
  }

  private advanceLoop(): void {
    const loop = this.autoLoop;
    if (!loop) return;

    const nextWave = this.wave + 1;
    if (this.totalWaves !== undefined && nextWave > this.totalWaves) {
      this.autoLoop = null;
      return;
    }

    this.setWave(nextWave);
    loop.onWaveStart(nextWave);
    this.runCountdown(loop.countdownSeconds, () => this.advanceLoop());
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
    this.countdownElement.textContent = i18next.t('core:wavecounter.next', { seconds: this.remainingSeconds });
  }
}
