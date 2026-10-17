import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Input, Modal, SegmentedControl, Text } from '@volstudio/core/ui';
import { NAME_MAX_LENGTH } from '@volstudio/network/protocol';
import { WAR } from '@/config/war';
import type { MessageKey } from '@/i18n/keys';
import './online.css';

/** Oyuncunun katılırken yaptığı seçim. */
export interface LobbyChoice {
  readonly name: string;
  /** İstenen cephe; `undefined` sunucunun dengeye göre seçmesi demektir. */
  readonly faction: number | undefined;
}

export interface LobbyOptions {
  /** Alanın başlangıç adı. */
  readonly name: string;
  /** Katılım istendiğinde çağrılır; sonuç `setBusy`/`showError` ile bildirilir. */
  readonly onSubmit: (choice: LobbyChoice) => void;
  /** Ad alanı tamamlandığında (Enter ya da odak çıkışı) çağrılır. */
  readonly onName: (name: string) => void;
  /** Panel kullanıcı tarafından kapatıldığında (Vazgeç, Escape) çağrılır. */
  readonly onCancel: () => void;
}

/** Cephe seçiminde "dengeye göre" seçeneğinin değeri. */
const AUTO = 'auto';

const FACTION_KEYS: readonly MessageKey[] = [
  'voltest:war.faction.amber',
  'voltest:war.faction.blue',
] as const;

/**
 * Savaşa katılma paneli: ad ve cephe tercihi. CORE `Modal`, `Input`, `SegmentedControl` ve `Button`
 * ile kurulur. Panel ağa dokunmaz; seçimi `onSubmit`e verir, sonucu sahibi bildirir (`setBusy`,
 * `showError`).
 */
export class LobbyPanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly modal: Modal;
  private readonly title: Text;
  private readonly nameLabel: Text;
  private readonly name: Input;
  private readonly factionLabel: Text;
  private readonly faction: SegmentedControl;
  private readonly enter: Button;
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
      onEnter: () => this.submit(),
      enterKeyHint: 'go',
    });
    this.name.element.maxLength = NAME_MAX_LENGTH;
    this.name.element.dataset.testid = 'lobby-name';
    this.factionLabel = new Text('', { variant: 'muted', tag: 'span' });
    this.faction = new SegmentedControl({ options: this.factionOptions(), value: AUTO });
    this.faction.element.dataset.testid = 'lobby-faction';
    this.enter = new Button('', { variant: 'primary', onClick: () => this.submit() });
    this.enter.element.dataset.testid = 'lobby-enter';
    this.cancel = new Button('', { onClick: () => this.modal.close() });
    this.cancel.element.dataset.testid = 'lobby-cancel';
    this.status = new Text('', { variant: 'body', tag: 'p' });
    this.status.element.dataset.testid = 'lobby-status';
    this.status.element.setAttribute('role', 'status');
    this.status.element.classList.add('vt-lobby__status');

    for (const part of this.parts()) this.modal.add(part);
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

  /** Paneli oyun adına kapatır; `onCancel` çağrılmaz. */
  close(): void {
    if (!this.modal.isOpen()) return;
    this.closingFromCode = true;
    this.modal.close();
    this.closingFromCode = false;
  }

  /** Bağlanırken seçimler kilitlenir ve durum satırı "bağlanıyor" der. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.enter.setDisabled(busy);
    this.name.setDisabled(busy);
    this.faction.setDisabled(busy);
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
    this.factionLabel.setContent(i18next.t('voltest:online.faction'));
    this.faction.setOptions(this.factionOptions());
    this.faction.setAriaLabel(i18next.t('voltest:online.faction'));
    this.enter.setLabel(i18next.t('voltest:online.enter'));
    this.cancel.setLabel(i18next.t('voltest:online.cancel'));
    if (this.statusKey) this.status.setContent(i18next.t(this.statusKey));
  }

  destroy(): void {
    this.scope.dispose();
    for (const part of this.parts()) part.destroy();
    this.element.remove();
  }

  private parts() {
    return [
      this.title,
      this.nameLabel,
      this.name,
      this.factionLabel,
      this.faction,
      this.enter,
      this.status,
      this.cancel,
    ];
  }

  private submit(): void {
    if (this.busy) return;
    const name = this.name.getValue();
    this.options.onName(name);
    this.options.onSubmit({ name, faction: this.selectedFaction() });
  }

  private selectedFaction(): number | undefined {
    const value = Number(this.faction.getValue());
    return Number.isInteger(value) && value >= 0 && value < WAR.factions ? value : undefined;
  }

  private factionOptions(): Array<{ value: string; label: string }> {
    return [
      { value: AUTO, label: i18next.t('voltest:online.factionAuto') },
      ...FACTION_KEYS.map((key, index) => ({ value: String(index), label: i18next.t(key) })),
    ];
  }

  private setStatus(key: MessageKey | undefined, danger = false): void {
    this.statusKey = key;
    this.status.setContent(key ? i18next.t(key) : '');
    this.status.element.dataset.tone = danger ? 'danger' : '';
  }
}
