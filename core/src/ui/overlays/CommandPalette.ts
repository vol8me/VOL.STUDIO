import { i18next } from '../../systems/I18n';

export interface CommandItem {
  id: string;
  label: string;
  /** İkincil açıklama, etiketle birlikte aranır. */
  description?: string;
  icon?: string | Node;
  /** Gruplama başlığı (ör. "İnşa", "Kamera") — aynı kategoriye sahip item'lar bir başlık altında birlikte gösterilir. Grupsuz item'lar "Genel" altına düşer. */
  category?: string;
  /** Sağda küçük tuş rozeti olarak gösterilir (ör. "Ctrl+B") — yalnızca görsel ipucu, bir listener'a bağlı değil. */
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteOptions {
  placeholder?: string;
  /** Hiç item yokken gösterilecek metin. Varsayılan 'Sonuç yok'. */
  emptyText?: string;
  /** Arama eşleşme bulamadığında gösterilecek metin; {query} arama metniyle değiştirilir. Varsayılan '"{query}" için sonuç yok'. */
  noMatchText?: string;
  onClose?: () => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

interface MatchResult {
  item: CommandItem;
  /** Etiket içinde eşleşen karakter aralıkları, vurgulama için. Boş sorguda boş. */
  ranges: [number, number][];
}

/**
 * Klavyeyle çağrılan (tetikleme çağıran tarafa ait, bkz. open()), yazarken
 * filtrelenen komut listesi. Modal'ın scrim + focus-trap + Escape-kapat
 * desenini paylaşır, ama sabit içerik yerine arama kutusu + dinamik sonuçlar.
 *
 * Arama sorguyu kelimelere böler ve HEPSİNİN (sıradan bağımsız) etiket veya
 * açıklamada görünmesini ister — böylece "tower build" hem "Build Tower" hem
 * "Tower: Build" tarzı etiketleri eşler. Eşleşmeler vurgulanır, sonuçlar
 * `category`'ye göre gruplanır, `shortcut` rozet olarak gösterilir.
 */
export class CommandPalette {
  readonly element: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly resultsList: HTMLDivElement;
  private emptyText: string;
  private readonly emptyTextIsI18n: boolean;
  private readonly noMatchText: string | undefined;
  private placeholder: string;
  private readonly placeholderIsI18n: boolean;
  private readonly onCloseHandler?: () => void;
  private items: CommandItem[] = [];
  private filtered: MatchResult[] = [];
  private activeIndex = 0;
  private previouslyFocused: HTMLElement | null = null;
  private boundKeydown: (event: KeyboardEvent) => void;
  private boundInput: () => void;
  private boundGlobalEscape: (event: KeyboardEvent) => void;

  constructor(options: CommandPaletteOptions = {}) {
    this.emptyTextIsI18n = options.emptyText === undefined;
    this.emptyText = options.emptyText ?? i18next.t('core:commandPalette.empty');
    this.noMatchText = options.noMatchText;
    this.placeholderIsI18n = options.placeholder === undefined;
    this.placeholder = options.placeholder ?? i18next.t('core:commandPalette.placeholder');
    this.onCloseHandler = options.onClose;

    this.element = document.createElement('div');
    this.element.className = ['vol-command-palette', options.className].filter(Boolean).join(' ');
    this.element.inert = true;

    this.scrim = document.createElement('div');
    this.scrim.className = 'vol-command-palette__scrim';
    this.scrim.addEventListener('click', () => this.close());
    this.element.appendChild(this.scrim);

    this.panel = document.createElement('div');
    this.panel.className = 'vol-command-palette__panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');

    const inputRow = document.createElement('div');
    inputRow.className = 'vol-command-palette__input-row';

    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('viewBox', '0 0 24 24');
    searchIcon.setAttribute('fill', 'none');
    searchIcon.setAttribute('stroke', 'currentColor');
    searchIcon.setAttribute('stroke-width', '2');
    searchIcon.setAttribute('stroke-linecap', 'round');
    searchIcon.setAttribute('class', 'vol-command-palette__search-icon');
    const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    searchPath.setAttribute('d', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.35-4.35');
    searchIcon.appendChild(searchPath);
    inputRow.appendChild(searchIcon);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'vol-command-palette__input';
    this.input.placeholder = this.placeholder;
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-autocomplete', 'list');
    inputRow.appendChild(this.input);

    this.panel.appendChild(inputRow);

    this.resultsList = document.createElement('div');
    this.resultsList.className = 'vol-command-palette__results';
    this.resultsList.setAttribute('role', 'listbox');
    this.panel.appendChild(this.resultsList);

    this.element.appendChild(this.panel);

    this.boundInput = () => {
      this.activeIndex = 0;
      this.applyFilter();
    };
    this.input.addEventListener('input', this.boundInput);

    this.boundKeydown = (event) => this.handleKeydown(event);
    this.input.addEventListener('keydown', this.boundKeydown);

    // Odak input'tan kayarsa diye Escape'i document seviyesinde de yakalar.
    this.boundGlobalEscape = (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    };

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private readonly onLanguageChanged = (): void => {
    if (this.emptyTextIsI18n) this.emptyText = i18next.t('core:commandPalette.empty');
    if (this.placeholderIsI18n) {
      this.placeholder = i18next.t('core:commandPalette.placeholder');
      this.input.placeholder = this.placeholder;
    }
    if (this.isOpen()) this.applyFilter();
  };

  setItems(items: CommandItem[]): void {
    this.items = items;
    this.applyFilter();
  }

  open(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this.element.classList.add('vol-command-palette--visible');
    this.element.inert = false;
    this.input.value = '';
    this.activeIndex = 0;
    this.applyFilter();
    document.addEventListener('keydown', this.boundGlobalEscape);
    this.input.focus();
  }

  close(): void {
    this.element.classList.remove('vol-command-palette--visible');
    this.element.inert = true;
    document.removeEventListener('keydown', this.boundGlobalEscape);
    this.previouslyFocused?.focus();
    this.onCloseHandler?.();
  }

  isOpen(): boolean {
    return !this.element.inert;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.input.removeEventListener('input', this.boundInput);
    this.input.removeEventListener('keydown', this.boundKeydown);
    document.removeEventListener('keydown', this.boundGlobalEscape);
    this.element.remove();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
      this.renderActiveState();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.renderActiveState();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const match = this.filtered[this.activeIndex];
      if (match) this.selectItem(match.item);
    }
  }

  /** Her sorgu kelimesinin (sıradan bağımsız) etiket veya açıklamada göründüğünü kontrol eder; etiket vurgu aralıklarını hesaplar. */
  private matchItem(item: CommandItem, words: string[]): MatchResult | null {
    if (words.length === 0) return { item, ranges: [] };

    const lng = i18next.language ?? 'tr';
    const labelLower = item.label.toLocaleLowerCase(lng);
    const descriptionLower = item.description?.toLocaleLowerCase(lng) ?? '';
    const ranges: [number, number][] = [];

    for (const word of words) {
      const labelIndex = labelLower.indexOf(word);
      if (labelIndex !== -1) {
        ranges.push([labelIndex, labelIndex + word.length]);
        continue;
      }
      if (descriptionLower.includes(word)) continue;
      return null;
    }

    ranges.sort((a, b) => a[0] - b[0]);
    return { item, ranges };
  }

  private applyFilter(): void {
    const query = this.input.value.trim().toLocaleLowerCase(i18next.language ?? 'tr');
    const words = query.split(/\s+/).filter(Boolean);

    this.filtered = this.items
      .map((item) => this.matchItem(item, words))
      .filter((result): result is MatchResult => result !== null);

    this.renderResults();
  }

  private renderResults(): void {
    this.resultsList.replaceChildren();

    if (this.items.length === 0) {
      this.renderEmptyState(this.emptyText);
      return;
    }

    if (this.filtered.length === 0) {
      const query = this.input.value.trim();
      const text =
        this.noMatchText !== undefined
          ? this.noMatchText.replace('{query}', query)
          : i18next.t('core:commandPalette.noMatch', { query });
      this.renderEmptyState(text);
      return;
    }

    let renderIndex = 0;
    for (const [category, matches] of this.groupByCategory(this.filtered)) {
      const groupHeader = document.createElement('div');
      groupHeader.className = 'vol-command-palette__group-header';
      groupHeader.textContent = category;
      this.resultsList.appendChild(groupHeader);

      for (const match of matches) {
        this.resultsList.appendChild(this.buildRow(match, renderIndex));
        renderIndex += 1;
      }
    }
  }

  private renderEmptyState(text: string): void {
    const empty = document.createElement('div');
    empty.className = 'vol-command-palette__empty';
    empty.textContent = text;
    this.resultsList.appendChild(empty);
  }

  /** Filtrelenmiş sonuçları kategoriye göre, ilk görülme sırasıyla gruplar. */
  private groupByCategory(matches: MatchResult[]): [string, MatchResult[]][] {
    const groups = new Map<string, MatchResult[]>();
    for (const match of matches) {
      const category = match.item.category ?? i18next.t('core:commandPalette.general');
      const existing = groups.get(category);
      if (existing) {
        existing.push(match);
      } else {
        groups.set(category, [match]);
      }
    }
    return [...groups.entries()];
  }

  private buildRow(match: MatchResult, index: number): HTMLDivElement {
    const { item, ranges } = match;
    const row = document.createElement('div');
    row.className = 'vol-command-palette__item';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === this.activeIndex));

    if (item.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-command-palette__item-icon';
      if (typeof item.icon === 'string') {
        iconSlot.textContent = item.icon;
      } else {
        iconSlot.appendChild(item.icon.cloneNode(true));
      }
      row.appendChild(iconSlot);
    }

    const textWrap = document.createElement('div');
    textWrap.className = 'vol-command-palette__item-text';

    const label = document.createElement('span');
    label.className = 'vol-command-palette__item-label';
    label.appendChild(this.buildHighlightedLabel(item.label, ranges));
    textWrap.appendChild(label);

    if (item.description) {
      const description = document.createElement('span');
      description.className = 'vol-command-palette__item-description';
      description.textContent = item.description;
      textWrap.appendChild(description);
    }

    row.appendChild(textWrap);

    if (item.shortcut) {
      const shortcut = document.createElement('kbd');
      shortcut.className = 'vol-command-palette__item-shortcut';
      shortcut.textContent = item.shortcut;
      row.appendChild(shortcut);
    }

    row.addEventListener('mouseenter', () => {
      this.activeIndex = index;
      this.renderActiveState();
    });
    row.addEventListener('click', () => this.selectItem(item));

    return row;
  }

  /** Etiket metnini DocumentFragment'a çevirir, eşleşen aralıkları <mark> ile sarar. */
  private buildHighlightedLabel(label: string, ranges: [number, number][]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (ranges.length === 0) {
      fragment.appendChild(document.createTextNode(label));
      return fragment;
    }

    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) {
        fragment.appendChild(document.createTextNode(label.slice(cursor, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'vol-command-palette__highlight';
      mark.textContent = label.slice(start, end);
      fragment.appendChild(mark);
      cursor = Math.max(cursor, end);
    }
    if (cursor < label.length) {
      fragment.appendChild(document.createTextNode(label.slice(cursor)));
    }
    return fragment;
  }

  private renderActiveState(): void {
    const rows = this.resultsList.querySelectorAll('.vol-command-palette__item');
    rows.forEach((row, index) => {
      row.setAttribute('aria-selected', String(index === this.activeIndex));
      if (index === this.activeIndex) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private selectItem(item: CommandItem): void {
    this.close();
    item.onSelect();
  }
}
