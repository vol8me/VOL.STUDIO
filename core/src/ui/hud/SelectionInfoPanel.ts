import { Bar, type BarOptions } from '../feedback/Bar';
import { IconButton, type IconButtonOptions } from '../primitives/IconButton';
import { i18next } from '../../i18n/I18n';

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
  /**
   * Verilirse can/enerji barı gösterilir. `ariaLabel` okuyucuya barın adını söyler ("Can", "Enerji"); verilmezse
   * `core:selectionInfo.health` kullanılır ve dil değişince yenilenir. Düşük durum renkle birlikte desen ve metinle de
   * söylenir (`Bar`).
   */
  health?: Pick<BarOptions, 'max' | 'value' | 'lowThreshold' | 'ariaLabel'>;
  stats?: SelectionInfoStat[];
  actions?: SelectionInfoAction[];
}

/**
 * Seçili birim/bina/makine için bilgi kartı. `show(data)` ile doldurulur,
 * `clear()` ile boş duruma döner. Her `show()` çağrısı önce eski içeriği
 * temizler, sonra health bar/aksiyonları yeniden kurar.
 *
 * Okuyucu: kök adlı bir bölgedir (`core:selectionInfo.label`); seçim değişince gizli bir durum bölgesi YALNIZ seçili
 * öğenin adını duyurur ("Seçili: Okçu Kulesi" / "Seçili öğe yok"), kart içeriğinin tamamını değil — kalabalık seçimde
 * okuyucu boğulmaz. Portre dekoratiftir (`aria-hidden`).
 */
export class SelectionInfoPanel {
  readonly element: HTMLDivElement;
  private readonly portraitElement: HTMLDivElement;
  private readonly nameElement: HTMLDivElement;
  private readonly healthContainer: HTMLDivElement;
  private readonly statsElement: HTMLDivElement;
  private readonly actionsElement: HTMLDivElement;
  private readonly emptyStateElement: HTMLDivElement;
  private readonly announceElement: HTMLSpanElement;
  private healthBar: Bar | null = null;
  private healthLabelFromI18n = false;
  private selectedName: string | null = null;
  private actionButtons: IconButton[] = [];

  private readonly emptyStateTextIsI18n: boolean;
  private emptyStateText: string;
  private readonly onLanguageChanged = (): void => {
    if (this.emptyStateTextIsI18n) {
      this.emptyStateText = i18next.t('core:selectionInfo.emptyState');
      this.emptyStateElement.textContent = this.emptyStateText;
    }
    this.element.setAttribute('aria-label', i18next.t('core:selectionInfo.label'));
    if (this.healthLabelFromI18n) {
      this.healthBar?.setAriaLabel(i18next.t('core:selectionInfo.health'));
    }
    this.announce();
  };

  constructor(options: { emptyStateText?: string } = {}) {
    this.emptyStateTextIsI18n = options.emptyStateText === undefined;
    this.emptyStateText = options.emptyStateText ?? i18next.t('core:selectionInfo.emptyState');
    this.element = document.createElement('div');
    this.element.className = 'vol-selection-panel vol-selection-panel--empty';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', i18next.t('core:selectionInfo.label'));

    this.announceElement = document.createElement('span');
    this.announceElement.className = 'vol-sr-only';
    this.announceElement.setAttribute('role', 'status');
    this.announceElement.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.announceElement);

    this.emptyStateElement = document.createElement('div');
    this.emptyStateElement.className = 'vol-selection-panel__empty-state';
    this.emptyStateElement.textContent = this.emptyStateText;
    this.element.appendChild(this.emptyStateElement);

    i18next.on('languageChanged', this.onLanguageChanged);

    this.portraitElement = document.createElement('div');
    this.portraitElement.className = 'vol-selection-panel__portrait';
    this.portraitElement.setAttribute('aria-hidden', 'true');
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
    this.statsElement.setAttribute('role', 'list');
    body.appendChild(this.statsElement);

    this.actionsElement = document.createElement('div');
    this.actionsElement.className = 'vol-selection-panel__actions';
    body.appendChild(this.actionsElement);
    this.announce();
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
    this.selectedName = data.name;

    if (data.health) {
      this.healthLabelFromI18n = data.health.ariaLabel === undefined;
      this.healthBar = new Bar({
        variant: 'health',
        ...data.health,
        ariaLabel: data.health.ariaLabel ?? i18next.t('core:selectionInfo.health'),
        label: (v, m) => `${v} / ${m}`,
      });
      this.healthContainer.appendChild(this.healthBar.element);
    }

    for (const stat of data.stats ?? []) {
      const row = document.createElement('div');
      row.className = 'vol-selection-panel__stat-row';
      row.setAttribute('role', 'listitem');

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
    this.announce();
  }

  /** Seçim boşalınca çağrılır; panel boş duruma döner. */
  clear(): void {
    this.clearContent();
    this.selectedName = null;
    this.element.classList.add('vol-selection-panel--empty');
    this.replayFadeIn();
    this.announce();
  }

  setHealth(value: number): void {
    this.healthBar?.setValue(value);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.clearContent();
    this.element.remove();
  }

  /** Durum bölgesine yalnız metin değişince yazılır: aynı seçimi yeniden göstermek yeniden duyuru üretmez. */
  private announce(): void {
    const text =
      this.selectedName === null
        ? this.emptyStateText
        : i18next.t('core:selectionInfo.selected', { name: this.selectedName });
    if (this.announceElement.textContent !== text) this.announceElement.textContent = text;
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
    this.healthLabelFromI18n = false;
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
