import { ResourceCounter, Text, i18next } from '@volstudio/core';
import { formatTimeMs } from '@/utils/time';
import { ICON_FLUX, svgIcon } from './icons';

/**
 * Oyun içi skor, öldürme sayısı, süre ve Flux gösterimi.
 * Sağ üst köşede sabit durur; dil değişiminde etiketler güncellenir.
 * Değer veya format değişmedikçe DOM manipülasyonu yapmaz.
 */
export class HUDStats {
  private readonly container: HTMLDivElement;
  private readonly scoreLabel: Text;
  private readonly killsLabel: Text;
  private readonly timeLabel: Text;
  private readonly fluxCounter: ResourceCounter;
  private readonly fluxLine: HTMLDivElement;
  private score = 0;
  private kills = 0;
  private timeMs = 0;
  private flux = 0;
  private lastScore = '';
  private lastKills = '';
  private lastTime = '';

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'vol-hud-stats';

    this.scoreLabel = new Text(this.formatScore(), { variant: 'body', tag: 'p' });
    this.killsLabel = new Text(this.formatKills(), { variant: 'body', tag: 'p' });
    this.timeLabel = new Text(this.formatTime(), { variant: 'body', tag: 'p' });

    for (const el of [this.scoreLabel, this.killsLabel, this.timeLabel]) {
      el.element.classList.add('vol-hud-stats__line');
      this.container.appendChild(el.element);
    }

    // Flux para birimi: ikon + sayı. Kazanç ve harcama yönlü renkle vurgulanır.
    this.fluxCounter = new ResourceCounter({
      icon: svgIcon(ICON_FLUX),
      label: i18next.t('volhell:hud.flux'),
      value: 0,
    });
    this.fluxLine = document.createElement('div');
    this.fluxLine.className = 'vol-hud-stats__line vol-hud-stats__line--flux';
    this.fluxLine.appendChild(this.fluxCounter.element);
    this.container.appendChild(this.fluxLine);

    parent.appendChild(this.container);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setScore(value: number): void {
    if (value === this.score) return;
    this.score = value;
    const formatted = this.formatScore();
    if (formatted === this.lastScore) return;
    this.lastScore = formatted;
    this.scoreLabel.setContent(formatted);
  }

  setKills(value: number): void {
    if (value === this.kills) return;
    this.kills = value;
    const formatted = this.formatKills();
    if (formatted === this.lastKills) return;
    this.lastKills = formatted;
    this.killsLabel.setContent(formatted);
  }

  /** Flux sayacını günceller; kazanç ve harcamada yönlü vurgu oynar. */
  setFlux(value: number): void {
    if (value === this.flux) return;
    this.flux = value;
    // Artış/azalış yönü core Counter tarafından otomatik anlaşılır; bu sayede
    // pickup ve shop harcaması aynı, tekrar kullanılabilir geri bildirimi alır.
    this.fluxCounter.setValue(value);
  }

  /** Shop açıldığında HUD para satırını gizler; gerçek değer shop panelinde kalır. */
  setFluxVisible(visible: boolean): void {
    const nextVisible = Boolean(visible);
    if (this.fluxLine.hidden === !nextVisible) return;
    this.fluxLine.hidden = !nextVisible;
    this.fluxLine.setAttribute('aria-hidden', String(!nextVisible));
  }

  setTime(valueMs: number): void {
    if (valueMs === this.timeMs) return;
    this.timeMs = valueMs;
    const formatted = this.formatTime();
    if (formatted === this.lastTime) return;
    this.lastTime = formatted;
    this.timeLabel.setContent(formatted);
  }

  private formatScore(): string {
    return `${i18next.t('volhell:hud.score')}: ${this.score}`;
  }

  private formatKills(): string {
    return `${i18next.t('volhell:hud.kills')}: ${this.kills}`;
  }

  private formatTime(): string {
    return `${i18next.t('volhell:hud.time')}: ${formatTimeMs(this.timeMs)}`;
  }

  private readonly onLanguageChanged = (): void => {
    this.lastScore = this.formatScore();
    this.lastKills = this.formatKills();
    this.lastTime = this.formatTime();
    this.scoreLabel.setContent(this.lastScore);
    this.killsLabel.setContent(this.lastKills);
    this.timeLabel.setContent(this.lastTime);
    // Flux sayısı dilden bağımsız; yalnızca ekran okuyucu etiketi çevrilir.
    this.fluxCounter.element.setAttribute('aria-label', i18next.t('volhell:hud.flux'));
  };

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.scoreLabel.destroy();
    this.killsLabel.destroy();
    this.timeLabel.destroy();
    this.fluxCounter.destroy();
    this.fluxLine.remove();
    this.container.remove();
  }
}
