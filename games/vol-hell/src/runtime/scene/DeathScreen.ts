import { Button, Panel, Text, i18n, i18next } from '@volstudio/core';
import { formatTimeMs } from '@/utils/time';

/** Koşunun nasıl bittiği — ekranın başlığı ve rengi buna göre değişir. */
export type RunOutcome = 'defeat' | 'victory';

export interface DeathStats {
  score: number;
  bestScore: number;
  kills: number;
  bestKills: number;
  timeMs: number;
  bestTimeMs: number;
  totalKills: number;
  /** Ulaşılan dalga (1 tabanlı). */
  wave: number;
  /** Koşu boyunca biriken Flux. */
  flux: number;
  /** Ulaşılan Spark seviyesi. */
  level: number;
  /**
   * Koşu zaferle mi bitti (Boss öldürüldü) yoksa yenilgiyle mi (oyuncu öldü)?
   * Verilmezse yenilgi sayılır.
   */
  outcome?: RunOutcome;
}

interface StatField {
  readonly i18nKey: string;
  readonly getValue: (s: DeathStats) => string;
}

const STAT_FIELDS: readonly StatField[] = [
  { i18nKey: 'volhell:death.wave', getValue: (s) => `${s.wave}` },
  { i18nKey: 'volhell:death.level', getValue: (s) => `${s.level}` },
  { i18nKey: 'volhell:death.flux', getValue: (s) => `${s.flux}` },
  { i18nKey: 'volhell:death.score', getValue: (s) => `${s.score}` },
  { i18nKey: 'volhell:death.bestScore', getValue: (s) => `${s.bestScore}` },
  { i18nKey: 'volhell:death.kills', getValue: (s) => `${s.kills}` },
  { i18nKey: 'volhell:death.bestKills', getValue: (s) => `${s.bestKills}` },
  { i18nKey: 'volhell:death.time', getValue: (s) => formatTimeMs(s.timeMs) },
  { i18nKey: 'volhell:death.bestTime', getValue: (s) => formatTimeMs(s.bestTimeMs) },
  { i18nKey: 'volhell:death.totalKills', getValue: (s) => `${s.totalKills}` },
];

/**
 * Koşu sonu özeti — DOM tabanlı overlay.
 *
 * Hem YENİLGİ (oyuncu öldü) hem ZAFER (Boss devrildi, 20 dalga tamamlandı)
 * durumunu gösterir; ikisi arasındaki fark başlık, alt başlık ve panelin
 * vurgu rengidir. İki ayrı ekran kurmak yerine tek ekranın iki kılığı
 * tutuldu: gösterilen veriler aynı, yalnızca çerçeve değişiyor.
 *
 * KALICILIK YOK: burada kazanılan hiçbir şey sonraki koşuya taşınmaz
 * (meta-progression bilinçli olarak kapsam dışı).
 */
export class DeathScreen {
  private readonly panel: Panel;
  private readonly overlay: HTMLDivElement;
  private readonly restartButton: Button;
  private readonly mainMenuButton: Button;
  private readonly titleText: Text;
  private readonly subtitleText: Text;
  private readonly statTexts: Text[] = [];
  private stats: DeathStats | null = null;
  private readonly onLanguageChanged = (): void => {
    this.updateHeader();
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
    this.subtitleText = new Text('', { variant: 'body', tag: 'p' });
    this.subtitleText.element.className = 'vol-run-summary__subtitle';

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

    for (const field of STAT_FIELDS) {
      const t = new Text('', { variant: 'body', tag: 'p' });
      t.element.className = 'vol-run-summary__stat';
      t.element.dataset.i18nKey = field.i18nKey;
      this.statTexts.push(t);
      statContainer.appendChild(t.element);
    }

    this.panel = new Panel({ className: 'death-panel' })
      .add(this.titleText)
      .add(this.subtitleText)
      .add({ element: statContainer })
      .add(this.restartButton)
      .add(this.mainMenuButton);

    this.overlay.appendChild(this.panel.element);
    parent.appendChild(this.overlay);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  show(stats: DeathStats): void {
    this.stats = stats;
    // Aynı scene örneği restart'ta yeniden kullanılır. Önceki koşudan kalan
    // mobil scroll konumu başlığı veya iki aksiyon düğmesini ekranın dışında
    // bırakmamalı; her yeni ölüm özeti üstten başlar.
    this.overlay.scrollTop = 0;
    this.panel.element.scrollTop = 0;
    this.updateHeader();
    this.updateStatContents();
    this.overlay.classList.add('vol-death-overlay--visible');
    this.panel.show();
  }

  isVisible(): boolean {
    return this.panel.isVisible();
  }

  /** Başlık, alt başlık ve zafer/yenilgi vurgusu. */
  private updateHeader(): void {
    const victory = this.stats?.outcome === 'victory';
    this.titleText.setContent(
      victory ? i18next.t('volhell:death.victoryTitle') : i18next.t('volhell:death.title'),
    );
    this.subtitleText.setContent(
      victory
        ? i18next.t('volhell:death.victorySubtitle')
        : i18next.t('volhell:death.defeatSubtitle'),
    );
    this.overlay.classList.toggle('vol-death-overlay--victory', victory);
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
