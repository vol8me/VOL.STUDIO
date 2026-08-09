import { i18next } from '../../systems/I18n';

export type EventLogTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface EventLogEntry {
  text: string;
  tone?: EventLogTone;
  /** Gösterilecek zaman damgası metni (biçimlendirme tüketiciye ait, ör. "12:03"). Verilmezse hizası bozulmadan boş bırakılır. */
  timestamp?: string;
  icon?: string | Node;
}

export interface EventLogOptions {
  /** Görünür yükseklik (piksel). Varsayılan 200. */
  height?: number;
  /** Tutulacak maksimum kayıt sayısı; aşılırsa en eski kayıtlar atılır. Varsayılan 100. */
  maxEntries?: number;
  /** true ise yeni kayıtta otomatik en alta kaydırır — kullanıcı yukarı kaydırmışsa durur. Varsayılan true. */
  autoScroll?: boolean;
  /** true ise üstte tone'a göre filtre çubuğu gösterilir (Tümü/Başarı/Uyarı/Tehlike/Bilgi). Varsayılan false. */
  showFilters?: boolean;
  /** true ise ardışık, aynı metin+tone'lu olaylar tek satırda "×N" rozetiyle birleştirilir. Varsayılan false. */
  collapseDuplicates?: boolean;
  /** true ise her satırda "sabitle" düğmesi çıkar; sabitlenen satırlar filtre/scroll'dan bağımsız en üstte kalır. Varsayılan false. */
  pinnable?: boolean;
  onPinChange?: (entry: EventLogEntry, pinned: boolean) => void;
}

/** vol-event-log__row--leave CSS animasyonunun süresiyle (theme.css) eşleşmelidir. */
const EVENT_LOG_LEAVE_DURATION_MS = 220;

const TONE_I18N_KEYS = {
  default: 'core:eventlog.tone.default',
  success: 'core:eventlog.tone.success',
  warning: 'core:eventlog.tone.warning',
  danger: 'core:eventlog.tone.danger',
  info: 'core:eventlog.tone.info',
} as const;

interface InternalEntry {
  entry: EventLogEntry;
  count: number;
  pinned: boolean;
  /** true ise satır gerçek veriden silinmiştir ama çıkış animasyonu oynarken DOM'da bir tur daha kalır. */
  leaving?: boolean;
}

/** Zaman damgalı, otomatik büyüyen olay günlüğü. `push()` yeni satır ekler ve (kullanıcı yukarı kaydırmadıysa) otomatik en alta kayar. */
export class EventLog {
  readonly element: HTMLDivElement;
  private readonly scrollArea: HTMLDivElement;
  private readonly listElement: HTMLDivElement;
  private readonly filterBar: HTMLDivElement | null;
  private readonly maxEntries: number;
  private readonly autoScrollEnabled: boolean;
  private readonly collapseDuplicates: boolean;
  private readonly pinnable: boolean;
  private readonly onPinChangeHandler?: (entry: EventLogEntry, pinned: boolean) => void;
  private entries: InternalEntry[] = [];
  private activeFilter: EventLogTone | 'all' = 'all';
  private userScrolledUp = false;
  private boundScroll: () => void;
  /** En son eklenen kaydın referansı — yalnızca bu satır render'da giriş animasyonu alır. */
  private lastPushedEntry: InternalEntry | null = null;
  /** trimToMaxEntries() satırı hemen silmez, `leaving:true` işaretler; çıkış animasyonu sonunda burada tutulan timeout gerçek silmeyi yapar. */
  private leavingTimeouts = new Set<number>();
  private readonly onLanguageChanged = (): void => {
    if (this.filterBar) {
      const tones: (EventLogTone | 'all')[] = ['all', 'success', 'warning', 'danger', 'info'];
      const buttons = this.filterBar.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter');
      buttons.forEach((btn, i) => {
        const tone = tones[i];
        btn.textContent = tone === 'all' ? i18next.t('core:eventlog.filter.all') : i18next.t(TONE_I18N_KEYS[tone]);
      });
    }
    this.renderVisibleEntries();
  };

  constructor(options: EventLogOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.autoScrollEnabled = options.autoScroll ?? true;
    this.collapseDuplicates = options.collapseDuplicates ?? false;
    this.pinnable = options.pinnable ?? false;
    this.onPinChangeHandler = options.onPinChange;

    this.element = document.createElement('div');
    this.element.className = 'vol-event-log';

    if (options.showFilters) {
      this.filterBar = this.buildFilterBar();
      this.element.appendChild(this.filterBar);
    } else {
      this.filterBar = null;
    }

    const scrollArea = document.createElement('div');
    scrollArea.className = 'vol-event-log__scroll-area';
    if (options.height) {
      scrollArea.style.height = `${options.height}px`;
    }
    this.element.appendChild(scrollArea);

    this.listElement = document.createElement('div');
    this.listElement.className = 'vol-event-log__list';
    this.listElement.setAttribute('role', 'log');
    this.listElement.setAttribute('aria-live', 'polite');
    scrollArea.appendChild(this.listElement);

    // Kullanıcı yukarı kaydırdıysa yeni olayda otomatik en alta zıplamak okumayı böler.
    this.boundScroll = () => {
      const distanceFromBottom =
        scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
      this.userScrolledUp = distanceFromBottom > 24;
    };
    scrollArea.addEventListener('scroll', this.boundScroll);
    this.scrollArea = scrollArea;

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  push(entry: EventLogEntry): void {
    if (this.collapseDuplicates) {
      const last = this.entries[this.entries.length - 1];
      if (
        last &&
        !last.pinned &&
        last.entry.text === entry.text &&
        (last.entry.tone ?? 'default') === (entry.tone ?? 'default')
      ) {
        last.count += 1;
        last.entry = entry;
        this.lastPushedEntry = last;
        this.renderVisibleEntries();
        this.scrollToBottomIfNeeded();
        return;
      }
    }

    const newEntry: InternalEntry = { entry, count: 1, pinned: false };
    this.entries.push(newEntry);
    this.lastPushedEntry = newEntry;
    this.trimToMaxEntries();
    this.renderVisibleEntries();
    this.scrollToBottomIfNeeded();
  }

  /** Tüm kayıtları (sabitlenenler dahil) temizler. */
  clear(): void {
    this.entries = [];
    this.lastPushedEntry = null;
    this.leavingTimeouts.forEach((handle) => window.clearTimeout(handle));
    this.leavingTimeouts.clear();
    this.listElement.replaceChildren();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.leavingTimeouts.forEach((handle) => window.clearTimeout(handle));
    this.leavingTimeouts.clear();
    this.scrollArea.removeEventListener('scroll', this.boundScroll);
    this.element.remove();
  }

  private scrollToBottomIfNeeded(): void {
    if (this.autoScrollEnabled && !this.userScrolledUp) {
      this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    }
  }

  /** maxEntries aşıldığında en eski satırları atar; sabitlenmiş satırlar limitten muaftır. Hemen silinmez, `leaving:true` işaretlenip çıkış animasyonuyla bir tur sonra kaldırılır. */
  private trimToMaxEntries(): void {
    const droppable = this.entries.filter((e) => !e.pinned && !e.leaving);
    const overflow = droppable.length - this.maxEntries;
    if (overflow <= 0) return;

    for (const entry of droppable.slice(0, overflow)) {
      entry.leaving = true;
    }
    this.scheduleLeaveCleanup();
  }

  private scheduleLeaveCleanup(): void {
    const handle = window.setTimeout(() => {
      this.leavingTimeouts.delete(handle);
      this.entries = this.entries.filter((e) => !e.leaving);
      this.renderVisibleEntries();
    }, EVENT_LOG_LEAVE_DURATION_MS);
    this.leavingTimeouts.add(handle);
  }

  private buildFilterBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'vol-event-log__filters';

    const tones: (EventLogTone | 'all')[] = ['all', 'success', 'warning', 'danger', 'info'];
    for (const tone of tones) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-event-log__filter';
      button.textContent = tone === 'all' ? i18next.t('core:eventlog.filter.all') : i18next.t(TONE_I18N_KEYS[tone]);
      button.classList.toggle('vol-event-log__filter--active', tone === this.activeFilter);
      button.addEventListener('click', () => {
        this.activeFilter = tone;
        bar.querySelectorAll('.vol-event-log__filter').forEach((el, index) => {
          el.classList.toggle('vol-event-log__filter--active', tones[index] === tone);
        });
        this.renderVisibleEntries();
      });
      bar.appendChild(button);
    }

    return bar;
  }

  /** Aktif filtreye göre listElement'i tamamen yeniden çizer. Sabitlenmiş satırlar filtreden bağımsız her zaman en üstte gösterilir. */
  private renderVisibleEntries(): void {
    const wasAtBottom = !this.userScrolledUp;
    this.listElement.replaceChildren();

    const matchesFilter = (item: InternalEntry): boolean =>
      this.activeFilter === 'all' || (item.entry.tone ?? 'default') === this.activeFilter;

    const pinned = this.entries.filter((item) => item.pinned);
    // leaving:true satırlar filtreden bağımsız bir tur daha DOM'da kalır (animasyon yarıda kesilmesin diye).
    const unpinned = this.entries.filter(
      (item) => !item.pinned && (item.leaving || matchesFilter(item)),
    );

    for (const item of pinned) {
      this.listElement.appendChild(this.buildRow(item));
    }
    for (const item of unpinned) {
      this.listElement.appendChild(this.buildRow(item));
    }

    if (wasAtBottom) {
      this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    }
  }

  private buildRow(item: InternalEntry): HTMLDivElement {
    const { entry } = item;
    const row = document.createElement('div');
    row.className = `vol-event-log__row vol-event-log__row--${entry.tone ?? 'default'}`;
    row.classList.toggle('vol-event-log__row--pinned', item.pinned);
    // Yalnızca gerçekten yeni eklenen kayıt giriş animasyonu alır; aksi halde
    // eski satırlar her push()'ta yeniden animasyonlanırdı.
    if (item === this.lastPushedEntry) {
      row.classList.add('vol-event-log__row--enter');
    }
    if (item.leaving) {
      row.classList.add('vol-event-log__row--leave');
    }

    // Timestamp slot her zaman render edilir (boş olsa bile), aksi halde satırlar hizadan kayardı.
    const time = document.createElement('span');
    time.className = 'vol-event-log__timestamp';
    time.textContent = entry.timestamp ?? '';
    row.appendChild(time);

    if (entry.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-event-log__icon';
      if (typeof entry.icon === 'string') {
        iconSlot.textContent = entry.icon;
      } else {
        iconSlot.appendChild(entry.icon.cloneNode(true));
      }
      row.appendChild(iconSlot);
    }

    const text = document.createElement('span');
    text.className = 'vol-event-log__text';
    text.textContent = entry.text;
    row.appendChild(text);

    if (item.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'vol-event-log__count';
      badge.textContent = `×${item.count}`;
      row.appendChild(badge);
    }

    if (this.pinnable) {
      const pinButton = document.createElement('button');
      pinButton.type = 'button';
      pinButton.className = 'vol-event-log__pin';
      pinButton.classList.toggle('vol-event-log__pin--active', item.pinned);
      pinButton.setAttribute('aria-label', item.pinned ? i18next.t('core:eventlog.unpin') : i18next.t('core:eventlog.pin'));
      pinButton.appendChild(this.buildPinIcon());
      pinButton.addEventListener('click', () => {
        item.pinned = !item.pinned;
        this.onPinChangeHandler?.(item.entry, item.pinned);
        this.renderVisibleEntries();
      });
      row.appendChild(pinButton);
    }

    return row;
  }

  private buildPinIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 17v5 M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z');
    svg.appendChild(path);
    return svg;
  }
}
