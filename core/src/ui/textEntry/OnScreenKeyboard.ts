import { i18next } from '../../i18n/I18n';
import { pushBackHandler } from '../../platform/backNavigation';
import { DisposableScope } from '../../lifecycle/DisposableScope';
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
 * Düzen Türkçe Q klavyesidir: `ı, İ, ğ, ü, ş, ö, ç` birinci sınıf tuştur.
 * Düzenleme sona ekleme/sondan silmedir — imleç ortaya alınmaz (kolla
 * metin girişinde standart basitleştirme); değer panelde canlı görünür.
 */

type KeyAction = 'backspace' | 'shift' | 'done' | 'newline';

interface KeyDef {
  label: string;
  /** Normal karakter tuşu; `action`lı tuşlarda tanımsız. */
  value?: string;
  action?: KeyAction;
  /** Geniş tuş (space, done). */
  wide?: boolean;
}

const LETTER_ROWS: readonly string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç'],
];

export class OnScreenKeyboard {
  readonly element: HTMLDivElement;
  private readonly valueView: HTMLDivElement;
  private readonly keyGrid: HTMLDivElement;
  private readonly scope = new DisposableScope();
  private readonly resolve: (result: TextEntryResult) => void;
  private readonly original: string;
  private readonly isMultiline: boolean;
  private readonly masked: boolean;
  private readonly maxLength: number;
  private value: string;
  private shifted = false;
  private closed = false;
  private readonly onLanguageChanged = (): void => this.relabelActionKeys();

  private constructor(request: TextEntryRequest, resolve: (r: TextEntryResult) => void) {
    this.value = request.value;
    this.original = request.value;
    this.isMultiline = request.multiline === true;
    this.masked = request.purpose === 'password';
    this.maxLength = request.maxLength ?? Number.POSITIVE_INFINITY;
    this.resolve = resolve;

    this.element = document.createElement('div');
    this.element.className = 'vol-osk';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');

    this.valueView = document.createElement('div');
    this.valueView.className = 'vol-osk__value';
    this.element.appendChild(this.valueView);
    this.showValue();

    this.keyGrid = document.createElement('div');
    this.keyGrid.className = 'vol-osk__grid';
    this.element.appendChild(this.keyGrid);

    this.element.addEventListener('click', (event) => {
      const key = (event.target as HTMLElement).closest<HTMLButtonElement>('.vol-osk__key');
      if (key) this.onKey(key.dataset);
    });
    this.renderKeys();

    // Açık klavyede dil değişirse işlev tuşlarının etiketi güncellenir (odak yerinde kalır).
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
      document.body.appendChild(kb.element);
      // İlk tuşu odakla: FocusNavController'ın halkası ilk D-pad kenarında
      // o tuşa oturur; odaksız açılışta ilk basış "ilk aday"a düşerdi.
      kb.element.querySelector<HTMLButtonElement>('.vol-osk__key')?.focus();
    });
  }

  private buildRows(): KeyDef[][] {
    const letters = LETTER_ROWS.map((row) =>
      row.map((ch): KeyDef => ({
        label: this.shifted ? ch.toLocaleUpperCase('tr') : ch,
        value: ch,
      })),
    );
    const digits = '1234567890'.split('').map((ch): KeyDef => ({ label: ch, value: ch }));
    const actions: KeyDef[] = [
      { label: i18next.t('core:keyboard.shift'), action: 'shift' },
      ...letters[2],
      { label: i18next.t('core:keyboard.backspace'), action: 'backspace' },
    ];
    const bottom: KeyDef[] = [
      { label: '.', value: '.' },
      { label: ',', value: ',' },
      { label: i18next.t('core:keyboard.space'), value: ' ', wide: true },
      { label: '-', value: '-' },
    ];
    return [
      digits,
      letters[0],
      letters[1],
      actions,
      this.isMultiline ? [...bottom, { label: '↵', action: 'newline' as const }] : bottom,
      [{ label: i18next.t('core:keyboard.done'), action: 'done', wide: true }],
    ];
  }

  /** Tuşlar bir kez kurulur; shift yalnız etiketleri değiştirir, odak yerinde kalır. */
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
          (def.wide ? ' vol-osk__key--wide' : '');
        key.textContent = def.label;
        if (def.action) {
          key.dataset.action = def.action;
          if (def.action === 'shift') key.setAttribute('aria-pressed', 'false');
        } else key.dataset.value = def.value ?? '';
        rowEl.appendChild(key);
      }
      this.keyGrid.appendChild(rowEl);
    }
  }

  /** İşlev tuşları ve boşluk etiketini geçerli dile çevirir; harf tuşlarına dokunmaz. */
  private relabelActionKeys(): void {
    for (const key of this.keyGrid.querySelectorAll<HTMLButtonElement>('.vol-osk__key')) {
      if (key.dataset.action === 'shift') key.textContent = i18next.t('core:keyboard.shift');
      else if (key.dataset.action === 'backspace') {
        key.textContent = i18next.t('core:keyboard.backspace');
      } else if (key.dataset.action === 'done') key.textContent = i18next.t('core:keyboard.done');
      else if (key.dataset.value === ' ') key.textContent = i18next.t('core:keyboard.space');
    }
  }

  private applyShift(shifted: boolean): void {
    this.shifted = shifted;
    for (const key of this.keyGrid.querySelectorAll<HTMLButtonElement>('.vol-osk__key')) {
      const value = key.dataset.value;
      if (key.dataset.action === 'shift') key.setAttribute('aria-pressed', String(shifted));
      else if (value && /\p{L}/u.test(value)) {
        key.textContent = shifted ? value.toLocaleUpperCase('tr') : value;
      }
    }
  }

  private onKey(data: DOMStringMap): void {
    switch (data.action) {
      case 'backspace':
        this.value = this.value.slice(0, -1);
        break;
      case 'shift':
        this.applyShift(!this.shifted);
        return;
      case 'newline':
        this.append('\n');
        break;
      case 'done':
        this.close(false);
        return;
      default:
        if (data.value !== undefined) {
          this.append(this.shifted ? data.value.toLocaleUpperCase('tr') : data.value);
          if (this.shifted) this.applyShift(false);
        }
    }
    this.showValue();
  }

  private append(text: string): void {
    if ([...this.value].length < this.maxLength) this.value += text;
  }

  /** Parola ekranda maskelenir; değer yine olduğu gibi döner. */
  private showValue(): void {
    const shown = this.masked ? '•'.repeat([...this.value].length) : this.value;
    this.valueView.textContent = shown || ' ';
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
