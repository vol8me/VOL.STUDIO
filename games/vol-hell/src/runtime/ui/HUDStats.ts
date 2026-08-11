import { Text, i18next } from '@volstudio/core';
import { formatTimeMs } from '@/utils/time';

/**
 * Oyun içi skor, öldürme sayısı ve süre gösterimi.
 * Sağ üst köşede sabit durur; dil değişiminde etiketler güncellenir.
 * Değer veya format değişmedikçe DOM manipülasyonu yapmaz.
 */
export class HUDStats {
  private readonly container: HTMLDivElement;
  private readonly scoreLabel: Text;
  private readonly killsLabel: Text;
  private readonly timeLabel: Text;
  private score = 0;
  private kills = 0;
  private timeMs = 0;
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
  };

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.scoreLabel.destroy();
    this.killsLabel.destroy();
    this.timeLabel.destroy();
    this.container.remove();
  }
}
