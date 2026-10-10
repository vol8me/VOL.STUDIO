import { i18next } from '../../i18n/I18n';
import { ContextMenu, type ContextMenuEntry } from '../overlays/ContextMenu';
import {
  createWebClipboardAdapter,
  type ClipboardAdapter,
  type ClipboardFailure,
} from './clipboard';

/**
 * Düzenlenebilir alanların kendi bağlam menüsü (Kes / Kopyala / Yapıştır / Tümünü Seç).
 *
 * WebView'un yerel menüsü `suppressNativeMenus` ile kapalıdır (kaplamasız, Deck'te güvenilmez, platforma göre
 * değişir); yerine çekirdeğin kendi `ContextMenu`'sü açılır. Fare sağ tıkı ve klavyenin Shift+F10 / Menü tuşu
 * `contextmenu` olayını üretir; tek yol budur. Dokunmada yerel seçim tutamakları ve eylem çubuğu kalır
 * (Android ActionMode, UI-11.3): dokunma kaynaklı `contextmenu` olayına dokunulmaz.
 *
 * Kurallar (`planEditMenu` saf ve testlidir):
 * - Devre dışı alan: menü yok. Salt okunur: yalnız Kopyala + Tümünü Seç (Kes / Yapıştır sunulmaz).
 * - Parola: Kopyala ve Kes sunulur ama KAPALIdır; panoya parola çıkmaz.
 * - Kes / Kopyala seçim yokken, Yapıştır pano okunamıyorken kapalı sunulur.
 * - Yapıştırma yalnız menü öğesinin tıklanmasıyla (kullanıcı eylemi) panoyu okur; arka planda okuma yoktur.
 * - Kes önce panoya yazar; yazma başarısızsa metin SİLİNMEZ.
 * - İzin reddi, yetenek yokluğu ve hata akışı bozmaz: alan değişmez, `onResult` sonucu bildirir.
 * - Pano içeriği hiçbir yere yazılmaz; sonuç nesnesi içeriği taşımaz.
 * - Menü açıldıktan sonra değer değişmişse ya da alan sökülmüşse bekleyen eylem uygulanmaz (`stale`).
 */
export type EditMenuAction = 'cut' | 'copy' | 'paste' | 'selectAll';

export interface EditMenuPlanItem {
  action: EditMenuAction;
  enabled: boolean;
}

export interface EditMenuFieldState {
  readOnly: boolean;
  disabled: boolean;
  password: boolean;
  hasSelection: boolean;
  hasValue: boolean;
}

export interface EditMenuCapabilities {
  canRead: boolean;
  canWrite: boolean;
}

/** Hangi eylemler hangi durumda sunulur ve açık mıdır; saf karar. Boş dizi: menü açılmaz. */
export function planEditMenu(
  field: EditMenuFieldState,
  capabilities: EditMenuCapabilities,
): EditMenuPlanItem[] {
  if (field.disabled) return [];
  const mayCopy = field.hasSelection && !field.password && capabilities.canWrite;
  const selectAll: EditMenuPlanItem = { action: 'selectAll', enabled: field.hasValue };
  if (field.readOnly) return [{ action: 'copy', enabled: mayCopy }, selectAll];
  return [
    { action: 'cut', enabled: mayCopy },
    { action: 'copy', enabled: mayCopy },
    { action: 'paste', enabled: capabilities.canRead },
    selectAll,
  ];
}

export interface EditMenuResult {
  action: EditMenuAction;
  ok: boolean;
  /** Başarısızlık nedeni; `stale`: menü açıldıktan sonra alan değişti ya da söküldü. */
  reason?: ClipboardFailure | 'stale';
}

export interface EditMenuOptions {
  /** Varsayılan: `createWebClipboardAdapter()`. Yerel kabuk kendi bağdaştırıcısını verir. */
  clipboard?: ClipboardAdapter;
  /** Menünün ekleneceği kapsayıcı (UI kökü); varsayılan `document.body`. */
  container?: HTMLElement;
  /** Her eylemin sonucu; geri bildirimi (bildirim, ses) tüketici buradan verir. İçerik taşımaz. */
  onResult?: (result: EditMenuResult) => void;
}

type EditableField = HTMLInputElement | HTMLTextAreaElement;

/** Seçim arayüzü olan metin türleri; e-posta/sayı türlerinde `selectionStart` `null` olduğundan kapsam dışıdır. */
const SELECTABLE_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'url',
  'tel',
  'password',
]);

function asEditableField(target: EventTarget | null): EditableField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest('input, textarea');
  if (field instanceof HTMLTextAreaElement) return field;
  if (field instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES.has(field.type)) return field;
  return null;
}

function dispatchInput(field: EditableField, inputType: string, data: string | null): void {
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
}

/** `maxLength` UTF-16 kod birimi sayar; kesim vekil çiftin yarısını bırakırsa o yarı atılır. */
function fitToRoom(text: string, room: number): string {
  const cut = text.slice(0, Math.max(0, room));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

const LABEL_KEYS = {
  cut: 'core:editMenu.cut',
  copy: 'core:editMenu.copy',
  paste: 'core:editMenu.paste',
  selectAll: 'core:editMenu.selectAll',
} as const satisfies Record<EditMenuAction, string>;

interface OpenState {
  field: EditableField;
  value: string;
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
}

/**
 * Köke bağlanır; kaldırıcıyı döndürür. Bir arada yalnız bir menü açıktır; yeni açılış öncekini kapatır.
 */
export function installEditMenu(
  root: Document | HTMLElement = document,
  options: EditMenuOptions = {},
): () => void {
  const clipboard = options.clipboard ?? createWebClipboardAdapter();
  let lastPointerType = '';
  let active: { close: () => void } | null = null;

  const onPointerDown = (event: Event): void => {
    lastPointerType = 'pointerType' in event ? String((event as PointerEvent).pointerType) : '';
  };

  const report = (result: EditMenuResult): void => {
    options.onResult?.(result);
  };

  function fieldIsCurrent(state: OpenState): boolean {
    const { field } = state;
    return field.isConnected && !field.disabled && field.value === state.value;
  }

  /** Menü açılırkenki seçimi alana geri verir; menü öğesine odak geçince alan seçimi korusa da odağı yitirmiştir. */
  function restore(state: OpenState): void {
    state.field.focus({ preventScroll: true });
    state.field.setSelectionRange(state.start, state.end, state.direction);
  }

  async function run(action: EditMenuAction, state: OpenState): Promise<void> {
    if (!fieldIsCurrent(state)) return report({ action, ok: false, reason: 'stale' });
    restore(state);
    const { field } = state;
    if (action === 'selectAll') {
      field.select();
      return report({ action, ok: true });
    }
    if (action === 'copy' || action === 'cut') {
      const written = await clipboard.writeText(state.value.slice(state.start, state.end));
      if (!written.ok) return report({ action, ok: false, reason: written.reason });
      if (action === 'cut') {
        // Yazma sürerken alan değiştiyse eski aralığı silmek başka metni keserdi.
        if (!fieldIsCurrent(state) || field.readOnly) {
          return report({ action, ok: false, reason: 'stale' });
        }
        field.setRangeText('', state.start, state.end, 'end');
        dispatchInput(field, 'deleteByCut', null);
      }
      return report({ action, ok: true });
    }
    const read = await clipboard.readText();
    if (!read.ok) return report({ action, ok: false, reason: read.reason });
    if (!fieldIsCurrent(state) || field.readOnly) {
      return report({ action, ok: false, reason: 'stale' });
    }
    let text = field instanceof HTMLInputElement ? read.text.replace(/[\r\n]+/g, ' ') : read.text;
    if (field.maxLength >= 0) {
      text = fitToRoom(text, field.maxLength - (field.value.length - (state.end - state.start)));
    }
    if (text.length === 0) return report({ action, ok: true });
    field.setRangeText(text, state.start, state.end, 'end');
    dispatchInput(field, 'insertFromPaste', text);
    return report({ action, ok: true });
  }

  function open(field: EditableField, x: number, y: number): void {
    active?.close();
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? start;
    const state: OpenState = {
      field,
      value: field.value,
      start,
      end,
      direction: field.selectionDirection ?? 'none',
    };
    const plan = planEditMenu(
      {
        readOnly: field.readOnly,
        disabled: field.disabled,
        password: field instanceof HTMLInputElement && field.type === 'password',
        hasSelection: end > start,
        hasValue: field.value.length > 0,
      },
      { canRead: clipboard.canRead, canWrite: clipboard.canWrite },
    );
    if (plan.length === 0) return;

    const anchor = document.createElement('span');
    anchor.className = 'vol-edit-menu-anchor';
    anchor.style.left = `${Math.round(x)}px`;
    anchor.style.top = `${Math.round(y)}px`;
    (options.container ?? document.body).appendChild(anchor);

    const entries: ContextMenuEntry[] = plan.map((item) => ({
      label: i18next.t(LABEL_KEYS[item.action]),
      disabled: !item.enabled,
      onSelect: () => void run(item.action, state),
    }));
    let finished = false;
    const handle = {
      close: () => menu.popup.close({ silent: true }),
    };
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (active === handle) active = null;
      // Popup kendi kapanış geri çağrısının içinde yok edilmez; Escape yolu hedefe odak verdikten sonra temizlenir.
      queueMicrotask(() => {
        const focused = document.activeElement;
        const focusLost = focused === document.body || focused === null || anchor.contains(focused);
        const insideMenu = focused instanceof Node && menu.popup.element.contains(focused);
        menu.destroy();
        anchor.remove();
        // Odak menü öğesindeyse ya da kaybolduysa alana döner; başka yere tıklandıysa orada kalır.
        if ((insideMenu || focusLost) && field.isConnected) field.focus({ preventScroll: true });
      });
    };
    const menu = new ContextMenu(anchor, entries, {
      container: options.container,
      placement: 'bottom-start',
      className: 'vol-edit-menu',
      onClose: finish,
    });
    menu.popup.element.setAttribute('aria-label', i18next.t('core:editMenu.label'));
    active = handle;
    // Tetikleyici tıklaması menüyü açar ve ilk açık öğeye odak verir (klavye yolu `ContextMenu`'nün kendisidir).
    anchor.click();
  }

  const onContextMenu = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    const field = asEditableField(event.target);
    if (!field) return;
    // Dokunmada yerel seçim eylem çubuğu kullanılır; yalnız yerel menü susturulur (suppressNativeMenus).
    if (lastPointerType === 'touch') return;
    event.preventDefault();
    const rect = field.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom &&
      (event.clientX !== 0 || event.clientY !== 0);
    // Klavyeden (Shift+F10 / Menü tuşu) gelen olayın koordinatı güvenilmezdir: alanın alt kenarına açılır.
    open(field, inside ? event.clientX : rect.left, inside ? event.clientY : rect.bottom);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('contextmenu', onContextMenu, true);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('contextmenu', onContextMenu, true);
    active?.close();
    active = null;
  };
}
