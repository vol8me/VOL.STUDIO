import { i18next } from '../../i18n/I18n';
import { pushBackHandler } from '../../platform/backNavigation';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { Icon, type IconName } from '../primitives/Icon';
import { emitUiIntent, findUiIntentRoot, type UiIntentKind } from '../feedback/uiIntent';
import type { TextEntryRequest, TextEntryResult } from './textEntry';

/**
 * CORE'un kolla kullanılan ekran klavyesi.
 *
 * Ne zaman devreye girer: `requestGamepadTextEntry` kol kipindeyken bir
 * sağlayıcı yoksa. Gezinme için dışarıdan bir şey gerektirmez — tuşlar
 * `button` olduğu için `listFocusable`/`FocusNavController` uzamsal gezinme,
 * A=etkinleştirme ve B=geri davranışını kendiliğinden verir (modal diyalog
 * olduğu için odak kapsamı da otomatik sınırlanır).
 *
 * Düzen arayüz diline uyar: Türkçe için Q düzeni (`ı, İ, ğ, ü, ş, ö, ç` birinci
 * sınıf tuş), diğer diller için QWERTY. İki katman vardır: harfler ve semboller
 * (`@ # ₺ € / \ …` — kullanıcı adı, adres ve parola için gerekir). İmleç gerçektir:
 * `←` `→` ile hareket eder, yazma ve silme imleç konumunda olur; değer panelde
 * canlı görünür ve parola maskelenir.
 */

type KeyAction =
  'backspace' | 'shift' | 'done' | 'cancel' | 'newline' | 'symbols' | 'letters' | 'left' | 'right';

interface KeyDef {
  label: string;
  /** Normal karakter tuşu; `action`lı tuşlarda tanımsız. */
  value?: string;
  action?: KeyAction;
  /** Geniş tuş (space, done, cancel). */
  wide?: boolean;
  /** Etiket yerine ikon (erişilebilir ad `aria` ile verilir). */
  icon?: IconName;
  aria?: string;
  /** Ana eylem tuşu (marka rengi). */
  primary?: boolean;
}

type LetterLayout = readonly (readonly string[])[];

const TR_LETTERS: LetterLayout = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç'],
];

const EN_LETTERS: LetterLayout = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SYMBOL_ROWS: readonly (readonly string[])[] = [
  ['@', '#', '₺', '€', '%', '&', '*', '(', ')', '+'],
  ['!', '?', ':', ';', '"', "'", '/', '\\', '_', '='],
  ['[', ']', '{', '}', '<', '>', '|', '~', '^', '$'],
];

const DIGITS = '1234567890'.split('');

let keyboardInstanceCounter = 0;

/** Etkin arayüz dili Türkçe ise Türkçe Q düzeni ve Türkçe büyük harf kuralları kullanılır. */
const isTurkish = (): boolean => (i18next.language ?? 'tr').toLowerCase().startsWith('tr');
const upper = (text: string): string => text.toLocaleUpperCase(isTurkish() ? 'tr' : 'en');

export class OnScreenKeyboard {
  readonly element: HTMLDivElement;
  private readonly valueView: HTMLDivElement;
  private readonly caretView: HTMLSpanElement;
  private readonly counterView: HTMLSpanElement | null;
  private readonly keyGrid: HTMLDivElement;
  private readonly scope = new DisposableScope();
  private readonly resolve: (result: TextEntryResult) => void;
  private readonly original: string;
  private readonly isMultiline: boolean;
  private readonly masked: boolean;
  private readonly purpose: NonNullable<TextEntryRequest['purpose']>;
  private readonly maxLength: number;
  private value: string;
  /** İmleç, kod noktası cinsinden (`[...value]` indeksi); 0..uzunluk. */
  private caret: number;
  private shifted = false;
  private layer: 'letters' | 'symbols' = 'letters';
  private layoutIsTurkish = isTurkish();
  private closed = false;
  /** Klavyeyi açan öğe: ses/niyet veriyolu ve kök, ona göre bulunur (klavye gövdeye değil köke eklenir). */
  private readonly anchor: Element;
  private readonly onLanguageChanged = (): void => this.handleLanguageChanged();

  private constructor(request: TextEntryRequest, resolve: (r: TextEntryResult) => void) {
    this.anchor = document.activeElement ?? document.body;
    this.value = request.value;
    this.caret = [...request.value].length;
    this.original = request.value;
    this.isMultiline = request.multiline === true;
    this.purpose = request.purpose ?? 'default';
    this.masked = this.purpose === 'password';
    this.maxLength = request.maxLength ?? Number.POSITIVE_INFINITY;
    this.resolve = resolve;

    const titleId = `vol-osk-title-${++keyboardInstanceCounter}`;
    this.element = document.createElement('div');
    this.element.className = 'vol-osk';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', titleId);

    // Başlık şeridi çekirdeğin çerçeve dilini (`vol-frame__header`) taşır: marka elması + display yazısı.
    const header = document.createElement('div');
    header.className = 'vol-frame__header vol-osk__header';
    const title = document.createElement('span');
    title.id = titleId;
    title.className = 'vol-osk__title';
    title.textContent = this.titleText();
    header.appendChild(title);
    if (Number.isFinite(this.maxLength)) {
      this.counterView = document.createElement('span');
      this.counterView.className = 'vol-osk__counter';
      header.appendChild(this.counterView);
    } else {
      this.counterView = null;
    }
    this.element.appendChild(header);

    const body = document.createElement('div');
    body.className = 'vol-osk__body';
    this.element.appendChild(body);

    this.valueView = document.createElement('div');
    this.valueView.className = 'vol-osk__value';
    // Değer alanı yalnız gösterimdir (yazma tuşlarla olur); ekran okuyucu metni ve adı okur.
    this.valueView.setAttribute('role', 'textbox');
    this.valueView.setAttribute('aria-readonly', 'true');
    this.valueView.setAttribute('aria-labelledby', titleId);
    if (this.isMultiline) this.valueView.setAttribute('aria-multiline', 'true');
    this.caretView = document.createElement('span');
    this.caretView.className = 'vol-osk__caret';
    this.caretView.setAttribute('aria-hidden', 'true');
    body.appendChild(this.valueView);
    this.showValue();

    this.keyGrid = document.createElement('div');
    this.keyGrid.className = 'vol-osk__grid';
    body.appendChild(this.keyGrid);

    this.element.addEventListener('click', (event) => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('.vol-osk__key');
      if (key) this.onKey(key, event);
    });
    this.renderKeys();

    // Açık klavyede dil değişirse etiketler (ve düzen gerekiyorsa tuşlar) güncellenir; odak korunur.
    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));

    // B / Escape / Android geri — ortak yığın iptal eder.
    this.scope.addSubscription(
      pushBackHandler(() => {
        this.close(true);
        return true;
      }),
    );
  }

  /** Klavyeyi açar; kullanıcı bitirince çözülen promise döner. */
  static open(request: TextEntryRequest, signal?: AbortSignal): Promise<TextEntryResult> {
    return new Promise((resolve) => {
      const kb = new OnScreenKeyboard(request, resolve);
      const cancel = (): void => kb.close(true);
      if (signal) kb.scope.addListener(signal, 'abort', cancel, { once: true });
      if (signal?.aborted) {
        kb.close(true);
        return;
      }
      // Kayıtlı UI kökü varsa klavye ONUN içine girer: kökün ses gözlemcisi (hover/odak) ve niyet
      // veriyolu tuşları da kapsar. Kök yoksa gövdeye eklenir (sessiz, eski davranış).
      (findUiIntentRoot(kb.anchor) ?? document.body).appendChild(kb.element);
      // İlk tuşu odakla: FocusNavController'ın halkası ilk D-pad kenarında
      // o tuşa oturur; odaksız açılışta ilk basış "ilk aday"a düşerdi.
      kb.element.querySelector<HTMLButtonElement>('.vol-osk__key')?.focus();
    });
  }

  private letterRows(): LetterLayout {
    return this.layoutIsTurkish ? TR_LETTERS : EN_LETTERS;
  }

  private buildRows(): KeyDef[][] {
    const digits = DIGITS.map((ch): KeyDef => ({ label: ch, value: ch }));
    const backspace: KeyDef = {
      label: '',
      action: 'backspace',
      icon: 'backspace',
      aria: i18next.t('core:keyboard.backspaceLabel'),
    };
    const bottomCommon = (toggle: KeyDef): KeyDef[] => [
      toggle,
      { label: '.', value: '.' },
      { label: ',', value: ',' },
      { label: i18next.t('core:keyboard.space'), value: ' ', wide: true },
      { label: '-', value: '-' },
      {
        label: '',
        action: 'left',
        icon: 'chevronLeft',
        aria: i18next.t('core:keyboard.leftLabel'),
      },
      {
        label: '',
        action: 'right',
        icon: 'chevronRight',
        aria: i18next.t('core:keyboard.rightLabel'),
      },
      ...(this.isMultiline
        ? [
            {
              label: '',
              action: 'newline' as const,
              icon: 'enter' as const,
              aria: i18next.t('core:keyboard.newlineLabel'),
            },
          ]
        : []),
    ];
    const footer: KeyDef[] = [
      { label: i18next.t('core:keyboard.cancel'), action: 'cancel', wide: true },
      { label: i18next.t('core:keyboard.done'), action: 'done', wide: true, primary: true },
    ];

    if (this.layer === 'symbols') {
      return [
        digits,
        SYMBOL_ROWS[0].map((ch): KeyDef => ({ label: ch, value: ch })),
        SYMBOL_ROWS[1].map((ch): KeyDef => ({ label: ch, value: ch })),
        [...SYMBOL_ROWS[2].map((ch): KeyDef => ({ label: ch, value: ch })), backspace],
        bottomCommon({
          label: i18next.t('core:keyboard.letters'),
          action: 'letters',
          aria: i18next.t('core:keyboard.lettersLabel'),
        }),
        footer,
      ];
    }

    const rows = this.letterRows();
    const letters = rows.map((row) =>
      row.map((ch): KeyDef => ({ label: this.shifted ? upper(ch) : ch, value: ch })),
    );
    const shift: KeyDef = {
      label: '',
      action: 'shift',
      icon: 'shift',
      aria: i18next.t('core:keyboard.shiftLabel'),
    };
    return [
      digits,
      letters[0],
      letters[1],
      [shift, ...letters[2], backspace],
      bottomCommon({
        label: i18next.t('core:keyboard.symbols'),
        action: 'symbols',
        aria: i18next.t('core:keyboard.symbolsLabel'),
      }),
      footer,
    ];
  }

  /** Geçerli katmanın tuşlarını kurar; shift yalnız etiketleri değiştirir (odak yerinde kalır). */
  private renderKeys(): void {
    this.keyGrid.replaceChildren();
    for (const row of this.buildRows()) {
      const rowEl = document.createElement('div');
      rowEl.className = 'vol-osk__row';
      for (const def of row) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className =
          'vol-osk__key' +
          (def.action ? ' vol-osk__key--action' : '') +
          (def.wide ? ' vol-osk__key--wide' : '') +
          (def.primary ? ' vol-osk__key--primary' : '');
        if (def.icon) {
          key.appendChild(new Icon({ name: def.icon, size: 22 }).element);
        } else {
          key.textContent = def.label;
        }
        if (def.aria) key.setAttribute('aria-label', def.aria);
        if (def.action) {
          key.dataset.action = def.action;
          if (def.action === 'shift') key.setAttribute('aria-pressed', String(this.shifted));
        } else key.dataset.value = def.value ?? '';
        rowEl.appendChild(key);
      }
      this.keyGrid.appendChild(rowEl);
    }
  }

  /** Katman/düzen değişince tuşlar yeniden kurulur; odak aynı anlamlı tuşa geri verilir. */
  private rerenderKeepingFocus(): void {
    const active = document.activeElement;
    const focused =
      active !== null && this.element.contains(active)
        ? active.closest<HTMLElement>('.vol-osk__key')
        : null;
    const action = focused?.dataset.action;
    const value = focused?.dataset.value;
    this.renderKeys();
    if (!focused) return;
    const keys = [...this.keyGrid.querySelectorAll<HTMLElement>('.vol-osk__key')];
    // Katman değiştiren tuş (symbols/letters) yenisiyle aynı yerde durur; eşleşme yoksa ilk tuşa düşer.
    const layerKey = action === 'symbols' || action === 'letters';
    const target = keys.find((candidate) =>
      layerKey
        ? candidate.dataset.action === 'symbols' || candidate.dataset.action === 'letters'
        : action
          ? candidate.dataset.action === action
          : candidate.dataset.value === value,
    );
    (target ?? keys[0])?.focus();
  }

  private handleLanguageChanged(): void {
    const turkish = isTurkish();
    if (turkish !== this.layoutIsTurkish) {
      this.layoutIsTurkish = turkish;
      this.rerenderKeepingFocus();
    } else {
      this.relabelActionKeys();
    }
  }

  /** İşlev tuşları ve boşluk etiketini geçerli dile çevirir; harf tuşlarına dokunmaz. */
  private relabelActionKeys(): void {
    // Anahtarlar tipli olduğundan her biri açık yazılır (dinamik anahtar derlemede reddedilir).
    const text: Partial<Record<KeyAction, () => string>> = {
      symbols: () => i18next.t('core:keyboard.symbols'),
      letters: () => i18next.t('core:keyboard.letters'),
      done: () => i18next.t('core:keyboard.done'),
      cancel: () => i18next.t('core:keyboard.cancel'),
    };
    const aria: Partial<Record<KeyAction, () => string>> = {
      shift: () => i18next.t('core:keyboard.shiftLabel'),
      backspace: () => i18next.t('core:keyboard.backspaceLabel'),
      left: () => i18next.t('core:keyboard.leftLabel'),
      right: () => i18next.t('core:keyboard.rightLabel'),
      newline: () => i18next.t('core:keyboard.newlineLabel'),
      symbols: () => i18next.t('core:keyboard.symbolsLabel'),
      letters: () => i18next.t('core:keyboard.lettersLabel'),
    };
    for (const key of this.keyGrid.querySelectorAll<HTMLButtonElement>('.vol-osk__key')) {
      const action = key.dataset.action as KeyAction | undefined;
      if (action) {
        const label = text[action];
        if (label) key.textContent = label();
        const name = aria[action];
        if (name) key.setAttribute('aria-label', name());
      } else if (key.dataset.value === ' ') key.textContent = i18next.t('core:keyboard.space');
    }
    const title = this.element.querySelector('.vol-osk__title');
    if (title) title.textContent = this.titleText();
  }

  private titleText(): string {
    if (this.purpose === 'password') return i18next.t('core:keyboard.title.password');
    if (this.purpose === 'search') return i18next.t('core:keyboard.title.search');
    return i18next.t('core:keyboard.title.default');
  }

  private applyShift(shifted: boolean): void {
    this.shifted = shifted;
    for (const key of this.keyGrid.querySelectorAll<HTMLButtonElement>('.vol-osk__key')) {
      const value = key.dataset.value;
      if (key.dataset.action === 'shift') key.setAttribute('aria-pressed', String(shifted));
      else if (value && /\p{L}/u.test(value)) {
        key.textContent = shifted ? upper(value) : value;
      }
    }
  }

  /** Kabul edilen kullanıcı eylemini niyet olarak yayar; olaysız çağrı sessizdir. */
  private intent(
    kind: UiIntentKind,
    key: HTMLElement,
    event: Event,
    haptic: 'tap' | 'select' = 'tap',
  ): void {
    emitUiIntent({ kind, origin: 'OnScreenKeyboard', target: key, event, defaultHaptic: haptic });
  }

  private onKey(key: HTMLButtonElement, event: Event): void {
    const data = key.dataset;
    switch (data.action) {
      case 'backspace':
        if (this.caret === 0) return;
        this.edit(this.caret - 1, 1, '');
        this.intent('erase', key, event);
        break;
      case 'shift':
        this.applyShift(!this.shifted);
        this.intent('toggle', key, event, 'select');
        return;
      case 'symbols':
      case 'letters':
        this.layer = data.action === 'symbols' ? 'symbols' : 'letters';
        // Niyet, tuş DOM'dan kalkmadan yayılır: kaldırılmış öğe kök/veriyolu bulamaz.
        this.intent('select', key, event, 'select');
        this.shifted = false;
        this.rerenderKeepingFocus();
        return;
      case 'left':
      case 'right': {
        const next = this.caret + (data.action === 'left' ? -1 : 1);
        if (next < 0 || next > [...this.value].length) return;
        this.caret = next;
        this.intent('select', key, event, 'select');
        break;
      }
      case 'newline':
        if (!this.insert('\n', key, event)) return;
        break;
      case 'cancel':
        this.intent('cancel', key, event);
        this.close(true);
        return;
      case 'done':
        this.intent('confirm', key, event);
        this.close(false);
        return;
      default:
        if (data.value !== undefined) {
          if (!this.insert(this.shifted ? upper(data.value) : data.value, key, event)) return;
          if (this.shifted) this.applyShift(false);
        }
    }
    this.showValue();
  }

  /** İmleç konumuna metin ekler; sınır doluysa reddeder ve `false` döner. */
  private insert(text: string, key: HTMLElement, event: Event): boolean {
    const added = [...text];
    if ([...this.value].length + added.length > this.maxLength) {
      this.intent('reject', key, event);
      return false;
    }
    this.edit(this.caret, 0, text);
    this.caret += added.length;
    this.intent('type', key, event);
    return true;
  }

  /** `[...value]` üzerinde `start`tan `deleteCount` kod noktasını `text` ile değiştirir. */
  private edit(start: number, deleteCount: number, text: string): void {
    const chars = [...this.value];
    chars.splice(start, deleteCount, ...text);
    this.value = chars.join('');
    if (deleteCount > 0) this.caret = start;
  }

  /** Parola ekranda maskelenir; değer yine olduğu gibi döner. İmleç değerin içinde görünür. */
  private showValue(): void {
    const chars = [...this.value];
    const shown = this.masked ? chars.map(() => '•') : chars;
    this.valueView.replaceChildren(
      document.createTextNode(shown.slice(0, this.caret).join('')),
      this.caretView,
      document.createTextNode(shown.slice(this.caret).join('') || (shown.length === 0 ? ' ' : '')),
    );
    if (this.counterView) this.counterView.textContent = `${chars.length} / ${this.maxLength}`;
  }

  private close(canceled: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.scope.dispose();
    this.element.remove();
    // İptal, sözleşme gereği başlangıç değerini döndürür.
    this.resolve({ value: canceled ? this.original : this.value, canceled });
  }
}
