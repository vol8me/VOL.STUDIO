import { Button, Panel, Text, i18n, i18next } from '@volstudio/core';
import { formatTimeMs } from '@/utils/time';

export interface DeathStats {
  score: number;
  bestScore: number;
  kills: number;
  bestKills: number;
  timeMs: number;
  bestTimeMs: number;
  totalKills: number;
}

interface StatField {
  readonly i18nKey: string;
  readonly getValue: (s: DeathStats) => string;
}

const STAT_FIELDS: readonly StatField[] = [
  { i18nKey: 'volhell:death.score', getValue: (s) => `${s.score}` },
  { i18nKey: 'volhell:death.bestScore', getValue: (s) => `${s.bestScore}` },
  { i18nKey: 'volhell:death.kills', getValue: (s) => `${s.kills}` },
  { i18nKey: 'volhell:death.bestKills', getValue: (s) => `${s.bestKills}` },
  { i18nKey: 'volhell:death.time', getValue: (s) => formatTimeMs(s.timeMs) },
  { i18nKey: 'volhell:death.bestTime', getValue: (s) => formatTimeMs(s.bestTimeMs) },
  { i18nKey: 'volhell:death.totalKills', getValue: (s) => `${s.totalKills}` },
];

/**
 * Oyuncu ölünce gösterilen ekran — DOM tabanlı overlay.
 * Yeniden başla ve ana menü butonları içerir; koşu istatistiklerini gösterir.
 */
export class DeathScreen {
  private readonly panel: Panel;
  private readonly overlay: HTMLDivElement;
  private readonly restartButton: Button;
  private readonly mainMenuButton: Button;
  private readonly titleText: Text;
  private readonly statTexts: Text[] = [];
  private stats: DeathStats | null = null;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('volhell:death.title'));
    this.restartButton.setLabel(i18next.t('volhell:death.restart'));
    this.mainMenuButton.setLabel(i18next.t('volhell:death.mainMenu'));
    this.updateStatContents();
  };

  constructor(
    parent: HTMLElement,
    private readonly callbacks: {
      onRestart: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'vol-death-overlay';

    this.titleText = new Text(i18next.t('volhell:death.title'), { variant: 'title', tag: 'h1' });

    this.restartButton = new Button(i18next.t('volhell:death.restart'), {
      variant: 'primary',
      onClick: () => this.callbacks.onRestart(),
    });
    this.mainMenuButton = new Button(i18next.t('volhell:death.mainMenu'), {
      variant: 'danger',
      onClick: () => this.callbacks.onMainMenu(),
    });

    // İstatistik alanı — başlangıçta boş, show() ile doldurulur
    const statContainer = document.createElement('div');
    statContainer.className = 'death-stats';
    statContainer.style.display = 'flex';
    statContainer.style.flexDirection = 'column';
    statContainer.style.gap = 'var(--vol-space-xs)';
    statContainer.style.margin = 'var(--vol-space-sm) 0';

    for (const field of STAT_FIELDS) {
      const t = new Text('', { variant: 'body', tag: 'p' });
      t.element.style.margin = '0';
      t.element.style.textAlign = 'center';
      t.element.dataset.i18nKey = field.i18nKey;
      this.statTexts.push(t);
      statContainer.appendChild(t.element);
    }

    this.panel = new Panel({ className: 'death-panel' })
      .add(this.titleText)
      .add({ element: statContainer })
      .add(this.restartButton)
      .add(this.mainMenuButton);

    this.overlay.appendChild(this.panel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  show(stats: DeathStats): void {
    this.stats = stats;
    this.updateStatContents();
    this.overlay.classList.add('vol-death-overlay--visible');
    this.panel.show();
  }

  isVisible(): boolean {
    return this.panel.isVisible();
  }

  private updateStatContents(): void {
    if (!this.stats) return;

    const s = this.stats;
    for (let i = 0; i < STAT_FIELDS.length; i++) {
      const field = STAT_FIELDS[i];
      const text = this.statTexts[i];
      if (!text) continue;
      text.setContent(`${i18n.tDynamic(field.i18nKey)}: ${field.getValue(s)}`);
    }
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.restartButton.destroy();
    this.mainMenuButton.destroy();
    this.panel.destroy();
    this.overlay.remove();
  }
}
