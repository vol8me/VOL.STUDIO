import { Easing, animateValue } from '../animation';
import { UI_TIMING } from '../../constants';

export interface TimerBarOptions {
  durationSeconds: number;
  /** 'fill' (varsayılan): boştan doluya akar. 'drain': doludan boşa akar (geri sayım/cooldown). */
  mode?: 'fill' | 'drain';
  /** Sabit metin veya `(remainingSeconds, totalSeconds) => string` formatter. */
  label?: string | ((remainingSeconds: number, totalSeconds: number) => string);
  /** true ise constructor'da hemen başlar. Varsayılan false. */
  autoStart?: boolean;
  /** true ise süre dolunca otomatik sıfırlanıp yeniden başlar. Varsayılan false. */
  loop?: boolean;
  onComplete?: () => void;
}

/** Otomatik dolan/boşalan, sıfırlanabilen zamanlayıcı çubuğu (rAF tabanlı). `mode` yönü belirler, `loop` döngüyü otomatik yeniden başlatır. */
export class TimerBar {
  readonly element: HTMLDivElement;
  private readonly fillElement: HTMLDivElement;
  private readonly labelElement: HTMLSpanElement | null;
  private readonly durationSeconds: number;
  private readonly mode: 'fill' | 'drain';
  private readonly label?: string | ((remainingSeconds: number, totalSeconds: number) => string);
  private readonly loop: boolean;
  private readonly onCompleteHandler?: () => void;
  private cancelAnimation?: () => void;
  private loopRestartTimeout?: ReturnType<typeof setTimeout>;
  private running = false;
  private elapsedSeconds = 0;

  constructor(options: TimerBarOptions) {
    const {
      durationSeconds,
      mode = 'fill',
      label,
      autoStart = false,
      loop = false,
      onComplete,
    } = options;
    this.durationSeconds = durationSeconds;
    this.mode = mode;
    this.label = label;
    this.loop = loop;
    this.onCompleteHandler = onComplete;

    this.element = document.createElement('div');
    this.element.className = 'vol-timer-bar';
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');
    this.element.setAttribute('aria-valuemax', String(durationSeconds));

    this.fillElement = document.createElement('div');
    this.fillElement.className = 'vol-timer-bar__fill';
    this.element.appendChild(this.fillElement);

    if (label) {
      this.labelElement = document.createElement('span');
      this.labelElement.className = 'vol-timer-bar__label';
      this.element.appendChild(this.labelElement);
    } else {
      this.labelElement = null;
    }

    this.render(0);
    if (autoStart) this.start();
  }

  /** Kaldığı yerden saymaya başlar. Zaten çalışıyorsa no-op. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.runFrom(this.elapsedSeconds);
  }

  /** Mevcut ilerlemeyi korur ama animasyonu durdurur; start() ile kaldığı yerden devam eder. */
  pause(): void {
    this.running = false;
    this.cancelAnimation?.();
    this.cancelAnimation = undefined;
    // Loop yeniden başlatma gecikmesi beklemedeyken pause() çağrılırsa bu timeout
    // iptal edilmezse barı sessizce yeniden başlatıp pause() garantisini bozardı.
    clearTimeout(this.loopRestartTimeout);
    this.loopRestartTimeout = undefined;
  }

  /** Durdurur ve kısa bir geri-çekme animasyonuyla sıfıra döner. autoRestart true ise bitince hemen yeniden başlar. */
  reset(autoRestart = false): void {
    this.pause();
    const from = this.elapsedSeconds;
    if (from === 0) {
      if (autoRestart) this.start();
      return;
    }

    this.cancelAnimation = animateValue({
      from,
      to: 0,
      durationMs: UI_TIMING.TIMER_RESET,
      easing: Easing.easeOutCubic,
      onUpdate: (value) => {
        this.elapsedSeconds = value;
        this.render(value);
      },
      onComplete: () => {
        this.elapsedSeconds = 0;
        this.render(0);
        this.cancelAnimation = undefined;
        if (autoRestart) this.start();
      },
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  destroy(): void {
    this.cancelAnimation?.();
    clearTimeout(this.loopRestartTimeout);
    this.element.remove();
  }

  private runFrom(elapsedSeconds: number): void {
    this.cancelAnimation?.();
    this.cancelAnimation = animateValue({
      from: elapsedSeconds,
      to: this.durationSeconds,
      durationMs: (this.durationSeconds - elapsedSeconds) * 1000,
      easing: Easing.linear,
      onUpdate: (value) => {
        this.elapsedSeconds = value;
        this.render(value);
      },
      onComplete: () => {
        this.running = false;
        this.render(this.durationSeconds);
        this.onCompleteHandler?.();
        if (this.loop) {
          // Kısa gecikme, tamamlanma anının bir kare görünmesini garanti eder.
          this.loopRestartTimeout = setTimeout(() => {
            this.loopRestartTimeout = undefined;
            this.elapsedSeconds = 0;
            this.render(0);
            this.running = true;
            this.runFrom(0);
          }, UI_TIMING.TIMER_LOOP_DELAY);
        }
      },
    });
  }

  private render(elapsedSeconds: number): void {
    const ratio =
      this.durationSeconds > 0
        ? Math.max(0, Math.min(1, elapsedSeconds / this.durationSeconds))
        : 0;
    const fillRatio = this.mode === 'fill' ? ratio : 1 - ratio;
    this.fillElement.style.width = `${fillRatio * 100}%`;

    const remaining = Math.max(0, this.durationSeconds - elapsedSeconds);
    this.element.setAttribute(
      'aria-valuenow',
      String(Math.round(this.mode === 'fill' ? elapsedSeconds : remaining)),
    );

    if (this.labelElement) {
      this.labelElement.textContent =
        typeof this.label === 'function'
          ? this.label(Math.ceil(remaining), this.durationSeconds)
          : this.label ?? '';
    }
  }
}
