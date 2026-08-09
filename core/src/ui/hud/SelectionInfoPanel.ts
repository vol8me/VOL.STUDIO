import { Bar, type BarOptions } from '../feedback/Bar';
import { IconButton, type IconButtonOptions } from '../primitives/IconButton';
import { i18next } from '../../systems/I18n';

export interface SelectionInfoStat {
  label: string;
  value: string;
}

export interface SelectionInfoAction extends Omit<IconButtonOptions, 'label'> {
  icon: string | Node;
  label: string;
}

export interface SelectionInfoData {
  name: string;
  /** SVG/emoji portre; verilmezse ikon alanı boş kalır. */
  portrait?: string | Node;
  /** Verilirse can/enerji barı gösterilir. */
  health?: Pick<BarOptions, 'max' | 'value' | 'lowThreshold'>;
  stats?: SelectionInfoStat[];
  actions?: SelectionInfoAction[];
}

/**
 * Seçili birim/bina/makine için bilgi kartı. `show(data)` ile doldurulur,
 * `clear()` ile boş duruma döner. Her `show()` çağrısı önce eski içeriği
 * temizler, sonra health bar/aksiyonları yeniden kurar.
 */
export class SelectionInfoPanel {
  readonly element: HTMLDivElement;
  private readonly portraitElement: HTMLDivElement;
  private readonly nameElement: HTMLDivElement;
  private readonly healthContainer: HTMLDivElement;
  private readonly statsElement: HTMLDivElement;
  private readonly actionsElement: HTMLDivElement;
  private readonly emptyStateElement: HTMLDivElement;
  private healthBar: Bar | null = null;
  private actionButtons: IconButton[] = [];

  private readonly emptyStateTextIsI18n: boolean;
  private emptyStateText: string;
  private readonly onLanguageChanged = (): void => {
    if (this.emptyStateTextIsI18n) {
      this.emptyStateText = i18next.t('core:selectionInfo.emptyState');
      this.emptyStateElement.textContent = this.emptyStateText;
    }
  };

  constructor(options: { emptyStateText?: string } = {}) {
    this.emptyStateTextIsI18n = options.emptyStateText === undefined;
    this.emptyStateText = options.emptyStateText ?? i18next.t('core:selectionInfo.emptyState');
    this.element = document.createElement('div');
    this.element.className = 'vol-selection-panel vol-selection-panel--empty';

    this.emptyStateElement = document.createElement('div');
    this.emptyStateElement.className = 'vol-selection-panel__empty-state';
    this.emptyStateElement.textContent = this.emptyStateText;
    this.element.appendChild(this.emptyStateElement);

    i18next.on('languageChanged', this.onLanguageChanged);

    this.portraitElement = document.createElement('div');
    this.portraitElement.className = 'vol-selection-panel__portrait';
    this.element.appendChild(this.portraitElement);

    const body = document.createElement('div');
    body.className = 'vol-selection-panel__body';
    this.element.appendChild(body);

    this.nameElement = document.createElement('div');
    this.nameElement.className = 'vol-selection-panel__name';
    body.appendChild(this.nameElement);

    this.healthContainer = document.createElement('div');
    this.healthContainer.className = 'vol-selection-panel__health';
    body.appendChild(this.healthContainer);

    this.statsElement = document.createElement('div');
    this.statsElement.className = 'vol-selection-panel__stats';
    body.appendChild(this.statsElement);

    this.actionsElement = document.createElement('div');
    this.actionsElement.className = 'vol-selection-panel__actions';
    body.appendChild(this.actionsElement);
  }

  show(data: SelectionInfoData): void {
    this.clearContent();
    this.element.classList.remove('vol-selection-panel--empty');

    this.portraitElement.textContent = '';
    if (data.portrait) {
      if (typeof data.portrait === 'string') {
        this.portraitElement.textContent = data.portrait;
      } else {
        this.portraitElement.appendChild(data.portrait);
      }
    }

    this.nameElement.textContent = data.name;

    if (data.health) {
      this.healthBar = new Bar({
        variant: 'health',
        ...data.health,
        label: (v, m) => `${v} / ${m}`,
      });
      this.healthContainer.appendChild(this.healthBar.element);
    }

    for (const stat of data.stats ?? []) {
      const row = document.createElement('div');
      row.className = 'vol-selection-panel__stat-row';

      const label = document.createElement('span');
      label.className = 'vol-selection-panel__stat-label';
      label.textContent = stat.label;
      row.appendChild(label);

      const value = document.createElement('span');
      value.className = 'vol-selection-panel__stat-value';
      value.textContent = stat.value;
      row.appendChild(value);

      this.statsElement.appendChild(row);
    }

    for (const action of data.actions ?? []) {
      const { icon, label, ...rest } = action;
      const button = new IconButton(icon, { label, ...rest });
      this.actionButtons.push(button);
      this.actionsElement.appendChild(button.element);
    }

    // İçerik dolduktan sonra oynatılır, aksi halde animasyon boş elementler üzerinde bitmiş olurdu.
    this.replayFadeIn();
  }

  /** Seçim boşalınca çağrılır; panel boş duruma döner. */
  clear(): void {
    this.clearContent();
    this.element.classList.add('vol-selection-panel--empty');
    this.replayFadeIn();
  }

  setHealth(value: number): void {
    this.healthBar?.setValue(value);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.clearContent();
    this.element.remove();
  }

  private replayFadeIn(): void {
    this.element.classList.remove('vol-selection-panel--transition');
    // Reflow zorunlu, aksi halde animasyon yeniden tetiklenmez.
    void this.element.offsetWidth;
    this.element.classList.add('vol-selection-panel--transition');
  }

  private clearContent(): void {
    this.healthBar?.destroy();
    this.healthBar = null;
    this.healthContainer.textContent = '';

    for (const button of this.actionButtons) {
      button.destroy();
    }
    this.actionButtons = [];
    this.actionsElement.textContent = '';

    this.statsElement.textContent = '';
    this.nameElement.textContent = '';
    this.portraitElement.textContent = '';
  }
}
