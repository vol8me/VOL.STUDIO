import { requiredAt } from '../../collections/requiredAt';
import { Button, type ButtonVariant } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { i18next } from '../../i18n/I18n';
import { MODAL_TRANSITION_MS } from './Confirm';
import { Modal } from './Modal';

export interface DialogAction {
  /** Sonuç olarak dönen kararlı kimlik; etiketten bağımsızdır (dil değişse de aynı). */
  readonly id: string;
  readonly label: string;
  readonly variant?: ButtonVariant;
  /** Eylemin niyetini söyleyen kısa not (ör. "Uzak kopya silinir"); düğmenin altında durur ve düğmeye bağlanır. */
  readonly note?: string;
}

export interface DialogDetail {
  readonly label: string;
  readonly value: string;
}

export interface ActionDialogOptions {
  readonly title: string;
  readonly message?: string;
  /** Karşılaştırma/özet satırları (ör. yerel ve uzak kopyanın tarihi); etiket-değer çiftleri. */
  readonly details?: readonly DialogDetail[];
  /** 1–4 eylem; kimlikler benzersiz. */
  readonly actions: readonly DialogAction[];
  /** Escape, scrim, geri tuşu ve iptal sinyalinde dönen eylem; `actions` içinde olmalı. */
  readonly cancelId: string;
  /**
   * Açılışta odak alan eylem. Varsayılan: yıkıcı eylem varsa iptal (yanlış Enter geri alınamaz işlem yapmaz),
   * yoksa ilk birincil eylem, o da yoksa ilk eylem.
   */
  readonly initialFocusId?: string;
  /** Varsayılan: yıkıcı eylem varsa `alertdialog`, yoksa `dialog`. */
  readonly role?: 'dialog' | 'alertdialog';
  /**
   * İptal dışı bir eylem seçilince çalışır. Dönmezse ya da senkron dönerse diyalog eylem kimliğiyle kapanır.
   * Söz dönerse diyalog BEKLEME durumuna girer (diğer eylemler kapanır, iptal açık kalır); reddedilirse HATA
   * durumuna geçer ve aynı eylem yeniden denenebilir; iptal edilirse `signal` iptal olur ve geç sonuç yok sayılır.
   */
  readonly onAction?: (id: string, signal: AbortSignal) => void | PromiseLike<void>;
  /** Bekleme durumunun metni; varsayılan çevrilmiş "İşleniyor…". */
  readonly busyText?: string;
  /** Hatadan okunur ileti üretir; varsayılan genel çevrilmiş ileti (hata nesnesi kullanıcıya sızmaz). */
  readonly describeError?: (error: unknown) => string;
  /** Modal'ın ekleneceği kapsayıcı. Varsayılan document.body. */
  readonly container?: HTMLElement;
  readonly className?: string;
  /** Sahne kapanırken bekleyen diyaloğu iptal eylemiyle sonlandırır. */
  readonly signal?: AbortSignal;
}

export interface ActionDialogHandle {
  /** Seçilen eylemin kimliği; Escape/scrim/geri/sinyalde `cancelId`. Asla reddedilmez. */
  readonly result: Promise<string>;
  /** Programlı kapatma; varsayılan olarak iptal eylemiyle. Kapalıysa etkisizdir. */
  close(id?: string): void;
}

const MAX_ACTIONS = 4;
let dialogSequence = 0;

function isThenable(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function validate(options: ActionDialogOptions): void {
  const { actions, cancelId } = options;
  if (actions.length < 1 || actions.length > MAX_ACTIONS) {
    throw new RangeError(`Diyalog 1–${MAX_ACTIONS} eylem ister, ${actions.length} verildi`);
  }
  const ids = new Set(actions.map((action) => action.id));
  if (ids.size !== actions.length) throw new Error('Diyalog eylem kimlikleri benzersiz olmalı');
  if (!ids.has(cancelId)) throw new Error(`İptal eylemi (${cancelId}) eylemler arasında değil`);
  if (options.initialFocusId !== undefined && !ids.has(options.initialFocusId)) {
    throw new Error(`İlk odak eylemi (${options.initialFocusId}) eylemler arasında değil`);
  }
}

function defaultFocusId(options: ActionDialogOptions): string {
  const { actions, cancelId } = options;
  if (actions.some((action) => action.variant === 'danger')) return cancelId;
  return (actions.find((action) => action.variant === 'primary') ?? requiredAt(actions, 0)).id;
}

/**
 * Eylem diyaloğu: yıkıcı işlem, çıkış, izin, çakışma gibi "karar sor" kalıplarının ortak gövdesi. `Modal` +
 * `Text` + `Button` bileşimidir; yeni ham DOM yüzeyi yoktur.
 *
 * Sözleşme: ad (`aria-labelledby`) ve açıklama (`aria-describedby`) bağlıdır; bekleme `role="status"`,
 * hata `role="alert"` ile bildirilir; bekleme sırasında odak iptal düğmesine geçer (çıkış yolu), hatada hatalı
 * eyleme döner (yeniden deneme). Sonuç Promise'i asla reddedilmez.
 */
export function openActionDialog(options: ActionDialogOptions): ActionDialogHandle {
  validate(options);
  const { cancelId, container = document.body, signal, onAction } = options;
  if (signal?.aborted) {
    return { result: Promise.resolve(cancelId), close: () => undefined };
  }

  const id = ++dialogSequence;
  const titleId = `vol-dialog-title-${id}`;
  const messageId = `vol-dialog-message-${id}`;
  const role =
    options.role ??
    (options.actions.some((action) => action.variant === 'danger') ? 'alertdialog' : 'dialog');
  const buttons = new Map<string, Button>();
  let resolved = false;
  let inflight: AbortController | null = null;
  let resolveResult!: (id: string) => void;
  const result = new Promise<string>((resolve) => (resolveResult = resolve));

  const finish = (actionId: string): void => {
    if (resolved) return;
    resolved = true;
    signal?.removeEventListener('abort', onAbort);
    inflight?.abort();
    inflight = null;
    resolveResult(actionId);
    modal.close();
    // `transitionend` arka planda/azaltılmış harekette hiç gelmeyebilir; Confirm ile aynı zamanlayıcı.
    window.setTimeout(() => {
      modal.destroy();
      for (const button of buttons.values()) button.destroy();
    }, MODAL_TRANSITION_MS);
  };
  const onAbort = (): void => finish(cancelId);

  const modal = new Modal({
    onClose: () => finish(cancelId),
    className: ['vol-dialog', options.className].filter(Boolean).join(' '),
    role,
    labelledBy: titleId,
    describedBy: options.message ? messageId : undefined,
    initialFocus: () => buttons.get(options.initialFocusId ?? defaultFocusId(options))?.element,
  });

  const title = new Text(options.title, { variant: 'heading', tag: 'h2' });
  title.element.id = titleId;
  modal.add(title);
  if (options.message) {
    const message = new Text(options.message, { variant: 'body' });
    message.element.id = messageId;
    message.element.classList.add('vol-dialog__message');
    modal.add(message);
  }
  if (options.details && options.details.length > 0) {
    const list = document.createElement('dl');
    list.className = 'vol-dialog__details';
    for (const detail of options.details) {
      const term = document.createElement('dt');
      term.textContent = detail.label;
      const value = document.createElement('dd');
      value.textContent = detail.value;
      list.append(term, value);
    }
    modal.add({ element: list });
  }

  // İki ayrı canlı bölge: bekleme nazikçe (`status`), hata hemen (`alert`) okunur; rol değiştirmek duyuruyu kaçırır.
  const status = document.createElement('p');
  status.className = 'vol-dialog__status';
  status.setAttribute('role', 'status');
  const alert = document.createElement('p');
  alert.className = 'vol-dialog__alert';
  alert.setAttribute('role', 'alert');
  modal.add({ element: status }).add({ element: alert });

  const stacked = options.actions.some((action) => action.note);
  const actions = document.createElement('div');
  actions.className = ['vol-dialog__actions', stacked ? 'vol-dialog__actions--stacked' : '']
    .filter(Boolean)
    .join(' ');

  const setStatus = (kind: 'busy' | 'error' | null, text = ''): void => {
    status.textContent = kind === 'busy' ? text : '';
    alert.textContent = kind === 'error' ? text : '';
    modal.element.querySelector('[role]')?.setAttribute('aria-busy', String(kind === 'busy'));
  };
  const lockOthers = (except: Button | null, locked: boolean): void => {
    for (const [buttonId, button] of buttons) {
      if (buttonId !== cancelId && button !== except) button.setDisabled(locked);
    }
  };

  const fail = (button: Button, error: unknown): void => {
    inflight = null;
    lockOthers(button, false);
    setStatus(
      'error',
      options.describeError ? options.describeError(error) : i18next.t('core:dialog.failed'),
    );
    button.setError(true);
    // Düğme bekleme boyunca `disabled`dı ve tıklama davranışı bu çağrıdan SONRA açar; odak bir sonraki turda verilir.
    window.setTimeout(() => {
      if (!resolved) button.element.focus();
    }, 0);
  };

  const run = (actionId: string, button: Button): void | Promise<void> => {
    if (!onAction) {
      finish(actionId);
      return;
    }
    const controller = new AbortController();
    inflight = controller;
    setStatus('busy', options.busyText ?? i18next.t('core:dialog.busy'));
    lockOthers(button, true);
    buttons.get(cancelId)?.element.focus();
    let outcome: void | PromiseLike<void>;
    try {
      outcome = onAction(actionId, controller.signal);
    } catch (error) {
      fail(button, error);
      return;
    }
    if (!isThenable(outcome)) {
      if (inflight === controller) finish(actionId);
      return;
    }
    return Promise.resolve(outcome).then(
      () => {
        if (inflight !== controller || controller.signal.aborted) return;
        finish(actionId);
      },
      (error: unknown) => {
        if (inflight !== controller || controller.signal.aborted) return;
        fail(button, error);
      },
    );
  };

  for (const action of options.actions) {
    const button: Button = new Button(action.label, {
      variant: action.variant ?? 'default',
      fullWidth: false,
      haptic:
        action.variant === 'danger' ? 'warning' : action.variant === 'primary' ? 'success' : 'tap',
      onClick: (): void | Promise<void> =>
        action.id === cancelId ? finish(cancelId) : run(action.id, button),
    });
    buttons.set(action.id, button);
    if (action.note) {
      const noteId = `vol-dialog-note-${id}-${buttons.size}`;
      const note = document.createElement('p');
      note.id = noteId;
      note.className = 'vol-dialog__action-note';
      note.textContent = action.note;
      button.element.setAttribute('aria-describedby', noteId);
      const cell = document.createElement('div');
      cell.className = 'vol-dialog__action';
      cell.append(button.element, note);
      actions.appendChild(cell);
    } else {
      actions.appendChild(button.element);
    }
  }
  modal.add({ element: actions });

  container.appendChild(modal.element);
  // İlk opacity:0 durumu open()'dan önce boyansın (Confirm ile aynı gerekçe).
  void modal.element.offsetWidth;
  modal.open();
  signal?.addEventListener('abort', onAbort, { once: true });

  return { result, close: (actionId = cancelId) => finish(actionId) };
}

/** `openActionDialog(...).result` kısayolu. */
export function showDialog(options: ActionDialogOptions): Promise<string> {
  return openActionDialog(options).result;
}
