import { i18next } from '../../systems/I18n';

export interface PauseResumeButtonOptions {
  /** Duraklat durumundayken (oyun çalışırken) gösterilecek erişilebilirlik etiketi. Varsayılan 'Duraklat'. */
  pauseLabel?: string;
  /** Devam Et durumundayken (oyun duraklamışken) gösterilecek erişilebilirlik etiketi. Varsayılan 'Devam Et'. */
  resumeLabel?: string;
  /** true ise buton 'Devam Et' (duraklamış) durumunda başlar. Varsayılan false (çalışır durumda başlar). */
  startPaused?: boolean;
  /** Durum her değiştiğinde (basılınca) çağrılır — isRunning artık false ise oyun duraklatıldı demektir. */
  onToggle?: (isRunning: boolean) => void;
  size?: number;
  /** Verilirse buton kendi sayacını tutar, `direction`'a göre sayar, ve duraklat/devam et ile otomatik durur/sürer. */
  counter?: {
    /** 'up' saniye 0'dan başlar artar; 'down' `startSeconds`'tan 0'a azalır. */
    direction: 'up' | 'down';
    /** direction:'down' için zorunlu başlangıç saniyesi; direction:'up' için yok sayılır. */
    startSeconds?: number;
    /** Her saniye (durmuşken değil, çalışırken) çağrılır. */
    onTick?: (seconds: number) => void;
    /** direction:'down' iken sayaç 0'a ulaştığında bir kez çağrılır; buton otomatik olarak duraklatılmış duruma geçer. */
    onComplete?: () => void;
  };
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Oyunu durdurup başlatan iki-durumlu buton. `counter` verilirse kendi setInterval'ini durum geçişleriyle senkron yönetir. */
export class PauseResumeButton {
  readonly element: HTMLButtonElement;
  private pauseLabel: string;
  private resumeLabel: string;
  private readonly pauseLabelIsI18n: boolean;
  private readonly resumeLabelIsI18n: boolean;
  private readonly onToggleHandler?: (isRunning: boolean) => void;
  private readonly counterOptions?: PauseResumeButtonOptions['counter'];
  private readonly iconSlot: HTMLSpanElement;
  private readonly counterEl: HTMLSpanElement | null = null;
  private readonly pauseIcon: SVGSVGElement;
  private readonly resumeIcon: SVGSVGElement;
  private isRunning: boolean;
  private seconds: number;
  private intervalHandle: number | null = null;
  private pressed = false;

  constructor(options: PauseResumeButtonOptions = {}) {
    this.pauseLabelIsI18n = options.pauseLabel === undefined;
    this.resumeLabelIsI18n = options.resumeLabel === undefined;
    this.pauseLabel = options.pauseLabel ?? i18next.t('core:pause.pause');
    this.resumeLabel = options.resumeLabel ?? i18next.t('core:pause.resume');
    this.onToggleHandler = options.onToggle;
    this.counterOptions = options.counter;
    this.isRunning = !(options.startPaused ?? false);
    this.seconds =
      this.counterOptions?.direction === 'down' ? this.counterOptions.startSeconds ?? 0 : 0;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-pause-resume-button';
    if (options.size) {
      this.element.style.setProperty('--vol-pause-resume-button-size', `${options.size}px`);
    }

    this.pauseIcon = this.buildIcon('pause');
    this.resumeIcon = this.buildIcon('resume');

    this.iconSlot = document.createElement('span');
    this.iconSlot.className = 'vol-pause-resume-button__icon';
    this.iconSlot.appendChild(this.isRunning ? this.pauseIcon : this.resumeIcon);
    this.element.appendChild(this.iconSlot);

    if (this.counterOptions) {
      this.counterEl = document.createElement('span');
      this.counterEl.className = 'vol-pause-resume-button__counter';
      this.counterEl.textContent = formatSeconds(this.seconds);
      this.element.appendChild(this.counterEl);
    }

    this.element.setAttribute('aria-label', this.isRunning ? this.pauseLabel : this.resumeLabel);
    this.element.addEventListener('click', () => this.handleClick());
    this.element.addEventListener('pointerdown', () => this.setPressed(true));
    this.element.addEventListener('pointerup', () => this.setPressed(false));
    this.element.addEventListener('pointerleave', () => this.setPressed(false));

    if (this.isRunning) this.startInterval();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private readonly onLanguageChanged = (): void => {
    if (this.pauseLabelIsI18n) this.pauseLabel = i18next.t('core:pause.pause');
    if (this.resumeLabelIsI18n) this.resumeLabel = i18next.t('core:pause.resume');
    this.element.setAttribute('aria-label', this.isRunning ? this.pauseLabel : this.resumeLabel);
  };

  /** Şu an çalışıyor mu (true) yoksa duraklatılmış mı (false). */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /** Sayaç kullanılıyorsa şu anki saniye değerini döner (counter verilmediyse her zaman 0). */
  getSeconds(): number {
    return this.seconds;
  }

  /** Durumu programatik olarak değiştirir — click ile aynı yolu izler, onToggle da tetiklenir. */
  setRunning(running: boolean): void {
    if (this.isRunning === running) return;
    this.applyState(running);
    this.onToggleHandler?.(this.isRunning);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.stopInterval();
    this.element.remove();
  }

  private handleClick(): void {
    this.applyState(!this.isRunning);
    this.onToggleHandler?.(this.isRunning);
  }

  private applyState(running: boolean): void {
    this.isRunning = running;
    this.element.classList.toggle('vol-pause-resume-button--running', running);
    this.element.setAttribute('aria-label', running ? this.pauseLabel : this.resumeLabel);
    this.iconSlot.replaceChildren(running ? this.pauseIcon : this.resumeIcon);

    if (running) {
      this.startInterval();
    } else {
      this.stopInterval();
    }
  }

  private setPressed(pressed: boolean): void {
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.element.classList.toggle('vol-pause-resume-button--pressed', pressed);
  }

  private startInterval(): void {
    if (!this.counterOptions || this.intervalHandle !== null) return;
    this.intervalHandle = window.setInterval(() => this.tickCounter(), 1000);
  }

  private stopInterval(): void {
    if (this.intervalHandle === null) return;
    window.clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  private tickCounter(): void {
    if (!this.counterOptions || !this.counterEl) return;

    if (this.counterOptions.direction === 'down') {
      this.seconds = Math.max(0, this.seconds - 1);
    } else {
      this.seconds += 1;
    }

    this.counterEl.textContent = formatSeconds(this.seconds);
    this.counterOptions.onTick?.(this.seconds);

    if (this.counterOptions.direction === 'down' && this.seconds === 0) {
      this.applyState(false);
      this.counterOptions.onComplete?.();
    }
  }

  private buildIcon(kind: 'pause' | 'resume'): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      kind === 'pause'
        ? 'M6 4h4.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M13.5 4h4.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z'
        : 'M7.5 4.3a1 1 0 0 1 1.5-.9l11 7.7a1 1 0 0 1 0 1.6l-11 7.7a1 1 0 0 1-1.5-.9V4.3Z',
    );
    svg.appendChild(path);
    return svg;
  }
}
