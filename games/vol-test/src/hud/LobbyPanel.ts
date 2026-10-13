import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Input, Modal, SegmentedControl, Text } from '@volstudio/core/ui';
import { NAME_MAX_LENGTH, createRoomCode } from '@volstudio/network/protocol';
import type { MessageKey } from '@/i18n/keys';
import type { OnlineRequest } from '@/network/OnlineSession';
import { MATCH_MODES, type MatchMode } from '@/network/schema';
import './online.css';

/** Oyuncunun lobide yaptığı seçim. */
export interface LobbyChoice {
  readonly name: string;
  readonly request: OnlineRequest;
}

export interface LobbyOptions {
  /** Alanın başlangıç adı. */
  readonly name: string;
  /** Bir katılım biçimi seçildiğinde çağrılır; sonuç `setBusy`/`showError` ile bildirilir. */
  readonly onSubmit: (choice: LobbyChoice) => void;
  /** Ad alanı tamamlandığında (Enter ya da odak çıkışı) çağrılır. */
  readonly onName: (name: string) => void;
  /** Lobi kullanıcı tarafından kapatıldığında (Vazgeç, Escape) çağrılır. */
  readonly onCancel: () => void;
}

const MODE_KEYS = {
  ffa: 'voltest:online.modeKind.ffa',
  teams: 'voltest:online.modeKind.teams',
} as const satisfies Record<MatchMode, MessageKey>;

/**
 * Çok oyunculu lobi: ad, maç türü, hızlı oyun, özel oda kurma ve kodla katılma. CORE `Modal`,
 * `Input`, `SegmentedControl` ve `Button` ile kurulur. Panel ağa dokunmaz; seçimi `onSubmit`e
 * verir, sonucu sahibi bildirir (`setBusy`, `showError`).
 */
export class LobbyPanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly modal: Modal;
  private readonly title: Text;
  private readonly nameLabel: Text;
  private readonly name: Input;
  private readonly modeLabel: Text;
  private readonly mode: SegmentedControl;
  private readonly quick: Button;
  private readonly create: Button;
  private readonly codeLabel: Text;
  private readonly code: Input;
  private readonly join: Button;
  private readonly cancel: Button;
  private readonly status: Text;
  private statusKey: MessageKey | undefined;
  private busy = false;
  private closingFromCode = false;

  constructor(private readonly options: LobbyOptions) {
    this.modal = this.scope.addDestroyable(
      new Modal({
        className: 'vt-lobby',
        closeOnScrimClick: false,
        onClose: () => {
          if (!this.closingFromCode) options.onCancel();
        },
      }),
    );
    this.element = this.modal.element;
    this.title = new Text('', { variant: 'heading', tag: 'h2' });
    this.nameLabel = new Text('', { variant: 'muted', tag: 'span' });
    this.name = new Input({
      value: options.name,
      onCommit: (value) => options.onName(value),
      enterKeyHint: 'done',
    });
    this.name.element.maxLength = NAME_MAX_LENGTH;
    this.name.element.dataset.testid = 'lobby-name';
    this.modeLabel = new Text('', { variant: 'muted', tag: 'span' });
    this.mode = new SegmentedControl({ options: this.modeOptions(), value: 'ffa' });
    this.mode.element.dataset.testid = 'lobby-mode';
    this.quick = new Button('', {
      variant: 'primary',
      onClick: () => this.submit({ kind: 'quick', mode: this.selectedMode() }),
    });
    this.quick.element.dataset.testid = 'lobby-quick';
    this.create = new Button('', {
      onClick: () => this.submit({ kind: 'create', code: createRoomCode() }),
    });
    this.create.element.dataset.testid = 'lobby-create';
    this.codeLabel = new Text('', { variant: 'muted', tag: 'span' });
    this.code = new Input({
      onEnter: () => this.submitJoin(),
      enterKeyHint: 'go',
    });
    this.code.element.maxLength = 12;
    this.code.element.autocapitalize = 'characters';
    this.code.element.spellcheck = false;
    this.code.element.classList.add('vt-lobby__code');
    this.code.element.dataset.testid = 'lobby-code';
    this.join = new Button('', { onClick: () => this.submitJoin() });
    this.join.element.dataset.testid = 'lobby-join';
    this.cancel = new Button('', { onClick: () => this.modal.close() });
    this.cancel.element.dataset.testid = 'lobby-cancel';
    this.status = new Text('', { variant: 'body', tag: 'p' });
    this.status.element.dataset.testid = 'lobby-status';
    this.status.element.setAttribute('role', 'status');
    this.status.element.classList.add('vt-lobby__status');

    for (const part of [
      this.title,
      this.nameLabel,
      this.name,
      this.modeLabel,
      this.mode,
      this.quick,
      this.create,
      this.codeLabel,
      this.code,
      this.join,
      this.status,
      this.cancel,
    ])
      this.modal.add(part);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  get isOpen(): boolean {
    return this.modal.isOpen();
  }

  open(): void {
    if (!this.modal.isOpen()) this.modal.open();
  }

  /** Lobiyi oyun adına kapatır; `onCancel` çağrılmaz. */
  close(): void {
    if (!this.modal.isOpen()) return;
    this.closingFromCode = true;
    this.modal.close();
    this.closingFromCode = false;
  }

  /** Bağlanırken seçimler kilitlenir ve durum satırı "bağlanıyor" der. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const control of [this.quick, this.create, this.join]) control.setDisabled(busy);
    this.name.setDisabled(busy);
    this.code.setDisabled(busy);
    this.mode.setDisabled(busy);
    if (busy) this.setStatus('voltest:online.connecting');
    else if (this.statusKey === 'voltest:online.connecting') this.setStatus(undefined);
  }

  /** Katılım hatasını durum satırında gösterir ve seçimleri açar. */
  showError(key: MessageKey): void {
    this.busy = false;
    this.setBusy(false);
    this.setStatus(key, true);
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:online.title'));
    this.nameLabel.setContent(i18next.t('voltest:online.name'));
    this.name.element.placeholder = i18next.t('voltest:online.namePlaceholder');
    this.name.element.setAttribute('aria-label', i18next.t('voltest:online.name'));
    this.modeLabel.setContent(i18next.t('voltest:online.mode'));
    this.mode.setOptions(this.modeOptions());
    this.mode.setAriaLabel(i18next.t('voltest:online.mode'));
    this.quick.setLabel(i18next.t('voltest:online.quick'));
    this.create.setLabel(i18next.t('voltest:online.create'));
    this.codeLabel.setContent(i18next.t('voltest:online.code'));
    this.code.element.placeholder = i18next.t('voltest:online.codePlaceholder');
    this.code.element.setAttribute('aria-label', i18next.t('voltest:online.code'));
    this.join.setLabel(i18next.t('voltest:online.join'));
    this.cancel.setLabel(i18next.t('voltest:online.cancel'));
    if (this.statusKey) this.status.setContent(i18next.t(this.statusKey));
  }

  destroy(): void {
    this.scope.dispose();
    for (const part of [
      this.title,
      this.nameLabel,
      this.name,
      this.modeLabel,
      this.mode,
      this.quick,
      this.create,
      this.codeLabel,
      this.code,
      this.join,
      this.status,
      this.cancel,
    ])
      part.destroy();
    this.element.remove();
  }

  private submit(request: OnlineRequest): void {
    if (this.busy) return;
    const name = this.name.getValue();
    this.options.onName(name);
    this.options.onSubmit({ name, request });
  }

  private submitJoin(): void {
    this.submit({ kind: 'join', code: this.code.getValue() });
  }

  private selectedMode(): MatchMode {
    const value = this.mode.getValue();
    return MATCH_MODES.find((mode) => mode === value) ?? 'ffa';
  }

  private modeOptions(): Array<{ value: MatchMode; label: string }> {
    return MATCH_MODES.map((mode) => ({ value: mode, label: i18next.t(MODE_KEYS[mode]) }));
  }

  private setStatus(key: MessageKey | undefined, danger = false): void {
    this.statusKey = key;
    this.status.setContent(key ? i18next.t(key) : '');
    this.status.element.dataset.tone = danger ? 'danger' : '';
  }
}
