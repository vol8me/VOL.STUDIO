import { describePCBinding } from '../../input/bindingLabels';
import { i18next } from '../../systems/I18n';
import type { PCActionBinding } from '../../input/PCInputState';

export interface KeyBindingRow {
  /** Eylemin kararlı kimliği — kayıt dosyasında da bu yazar. */
  action: string;
  /** ÇEVRİLMİŞ eylem adı; CORE hangi eylemin ne dendiğini bilmez. */
  label: string;
  binding: PCActionBinding;
  /** Bu satır yeniden atanabilir mi? Sabit bir bağ okunur gösterilir. */
  editable?: boolean;
}

export interface KeyBindingListOptions {
  rows: readonly KeyBindingRow[];
  /**
   * Kullanıcı yeni bir girdi verdi. Çakışma çözümü ve KALICILIK çağıranın;
   * bileşen kendi defterini tutmaz, `setRows` ile yeni durumu bekler.
   */
  onRebind: (action: string, binding: PCActionBinding) => void;
  /** Satırı varsayılana döndürme niyeti; verilmezse düğme çizilmez. */
  onReset?: (action: string) => void;
  /** Bağ metnini oyunun kendi kelimesiyle yazmak için. */
  formatBinding?: (binding: PCActionBinding) => string;
  className?: string;
}

/**
 * Eylem → tuş eşlemesini gösteren ve yeniden atamayı TOPLAYAN liste.
 *
 * Eşleme zaten veriydi (`PCActionBinding`); eksik olan onu oyuncuya sunan
 * yüzeydi. Bileşen SAF GÖRÜNTÜDÜR: hangi tuşun hangi eyleme gittiğine karar
 * vermez, çakışmayı çözmez, hiçbir şey kaydetmez. Yakaladığı girdiyi
 * `onRebind` ile bildirir ve çağıranın verdiği yeni satırları çizer.
 *
 * **Yakalama sırasında olay AKIŞTAN alınır** (`capture: true` + `preventDefault`):
 * atama yapılırken basılan Space sayfayı kaydırmamalı, Tab odağı
 * kaçırmamalıdır. Esc yakalamayı iptal eder ve bu İPTALDİR — "Esc'e bağla"
 * değil; bir tuş atama ekranından çıkışın evrensel yolu odur.
 */
export class KeyBindingList {
  readonly element: HTMLDivElement;
  private rows: readonly KeyBindingRow[];
  private readonly onRebind: (action: string, binding: PCActionBinding) => void;
  private readonly onReset?: (action: string) => void;
  private readonly formatBinding: (binding: PCActionBinding) => string;
  private capturing: string | null = null;
  private readonly onLanguageChanged = (): void => this.render();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.capturing === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.stopCapture();
      return;
    }
    const action = this.capturing;
    this.stopCapture();
    this.onRebind(action, { source: 'key', keyCode: event.keyCode });
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.capturing === null) return;
    // Listenin KENDİ düğmesine basmak bir atama değildir; yakalamayı o düğme
    // başlattı ve `pointerdown` ondan geliyor olabilir.
    if (this.element.contains(event.target as Node)) return;
    event.preventDefault();
    /*
     * YALNIZ sol düğme bağlanabilir. `PointerButton` bilinçli olarak `'left'`
     * ile sınırlı çünkü `resolvePCActions` yalnız `leftButtonDown` okur; orta
     * veya sağ düğmeyi kaydetmek, motorun HİÇBİR ZAMAN çözemeyeceği bir bağ
     * üretirdi ve oyuncu tuşunun neden çalışmadığını anlamazdı. Diğer düğmeler
     * yakalamayı iptal eder.
     */
    const action = this.capturing;
    this.stopCapture();
    if (event.button !== 0) return;
    this.onRebind(action, { source: 'pointerButton', button: 'left' });
  };

  constructor(options: KeyBindingListOptions) {
    this.rows = options.rows;
    this.onRebind = options.onRebind;
    this.onReset = options.onReset;
    this.formatBinding = options.formatBinding ?? describePCBinding;

    this.element = document.createElement('div');
    this.element.className = ['vol-key-bindings', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'list');

    this.render();
    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /** Çağıran çakışmayı çözdükten SONRA yeni durumu buradan verir. */
  setRows(rows: readonly KeyBindingRow[]): void {
    this.rows = rows;
    this.render();
  }

  /** Yakalama sürüyor mu? Ayar ekranı bunu bilerek başka kısayolu kapatır. */
  isCapturing(): boolean {
    return this.capturing !== null;
  }

  destroy(): void {
    this.stopCapture();
    i18next.off('languageChanged', this.onLanguageChanged);
    this.element.remove();
  }

  private startCapture(action: string): void {
    if (this.capturing !== null) this.stopCapture();
    this.capturing = action;
    // `capture: true` ŞART: yakalama sırasında basılan tuş sayfadaki başka bir
    // kısayola gitmeden burada tüketilmelidir.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('pointerdown', this.onPointerDown, true);
    this.render();
  }

  private stopCapture(): void {
    if (this.capturing === null) return;
    this.capturing = null;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    this.render();
  }

  private render(): void {
    this.element.textContent = '';

    for (const row of this.rows) {
      const item = document.createElement('div');
      item.className = 'vol-key-bindings__row';
      item.setAttribute('role', 'listitem');

      const label = document.createElement('span');
      label.className = 'vol-key-bindings__label';
      label.textContent = row.label;
      item.appendChild(label);

      const editable = row.editable ?? true;
      const active = this.capturing === row.action;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'vol-key-bindings__binding';
      trigger.disabled = !editable;
      trigger.dataset.capturing = String(active);
      trigger.textContent = active
        ? i18next.t('core:keyBindings.listening')
        : this.formatBinding(row.binding);
      trigger.setAttribute(
        'aria-label',
        i18next.t('core:keyBindings.rebind', { action: row.label }),
      );
      if (editable) {
        trigger.addEventListener('click', () =>
          active ? this.stopCapture() : this.startCapture(row.action),
        );
      }
      item.appendChild(trigger);

      if (this.onReset && editable) {
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'vol-key-bindings__reset';
        reset.textContent = i18next.t('core:keyBindings.reset');
        reset.setAttribute(
          'aria-label',
          i18next.t('core:keyBindings.resetAction', { action: row.label }),
        );
        reset.addEventListener('click', () => this.onReset?.(row.action));
        item.appendChild(reset);
      }

      this.element.appendChild(item);
    }
  }
}
