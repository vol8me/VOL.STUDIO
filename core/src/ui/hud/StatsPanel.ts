import { i18next } from '../../systems/I18n';
import { IconButton } from '../primitives/IconButton';
import { Modal } from '../overlays/Modal';

/** İstatistik satırının sunum verisi — oyun kuralları CORE'a girmez. */
export interface StatsPanelEntry {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  /** Dekoratif ikon — CORE ikon sözlüğü tutmaz, çağıran sağlar. */
  readonly icon?: string | Element;
}

/** Panel içindeki mantıksal bölüm. Bölüm etiketi verilmezse başlık çizilmez. */
export interface StatsPanelGroup {
  readonly id: string;
  readonly label?: string;
  /** Bölüm ikonunu oyun veya tüketici üretir; panel yalnızca yerleştirir. */
  readonly icon?: string | Element;
  readonly entries: readonly StatsPanelEntry[];
}

export interface StatsPanelOptions {
  title: string;
  /** Verilmezse CORE i18n'inden alınır. */
  closeLabel?: string;
  className?: string;
}

interface EntryView {
  readonly row: HTMLDivElement;
  readonly icon: HTMLSpanElement;
  readonly label: HTMLSpanElement;
  readonly value: HTMLSpanElement;
  readonly hint: HTMLSpanElement;
}

interface GroupView {
  readonly root: HTMLElement;
  readonly icon: HTMLSpanElement;
  readonly heading: HTMLHeadingElement;
  readonly entries: HTMLDivElement;
  readonly entryViews: Map<string, EntryView>;
}

/** Sağdan açılan, modal davranışlı jenerik istatistik paneli. */
export class StatsPanel {
  readonly element: HTMLElement;
  private readonly modal: Modal;
  private readonly titleElement: HTMLHeadingElement;
  private readonly closeButton: IconButton;
  private readonly groupsElement: HTMLDivElement;
  private readonly groups = new Map<string, GroupView>();
  private readonly closeLabelIsI18n: boolean;
  private destroyed = false;

  constructor(options: StatsPanelOptions) {
    const closeLabel = options.closeLabel ?? i18next.t('core:statsPanel.close');
    this.closeLabelIsI18n = options.closeLabel === undefined;
    this.modal = new Modal({
      closeOnScrimClick: true,
      className: ['vol-stats-panel-modal', options.className].filter(Boolean).join(' '),
    });
    this.element = this.modal.element;

    const header = document.createElement('div');
    header.className = 'vol-stats-panel__header';
    this.titleElement = document.createElement('h2');
    this.titleElement.className = 'vol-stats-panel__title';
    this.titleElement.textContent = options.title;
    this.closeButton = new IconButton('×', {
      label: closeLabel,
      size: 'md',
      onClick: () => this.close(),
    });
    header.append(this.titleElement, this.closeButton.element);

    this.groupsElement = document.createElement('div');
    this.groupsElement.className = 'vol-stats-panel__groups';
    const content = document.createElement('div');
    content.className = 'vol-stats-panel__content';
    content.append(header, this.groupsElement);
    this.modal.add({ element: content });
    i18next.on('languageChanged', this.handleLanguageChanged);
  }

  setTitle(title: string): void {
    if (!this.destroyed) this.titleElement.textContent = title;
  }

  setCloseLabel(label: string): void {
    if (!this.destroyed) this.closeButton.setLabel(label);
  }

  /** Satırları kimliğe göre günceller; her çağrıda DOM'u yıkıp kurmaz. */
  setGroups(groups: readonly StatsPanelGroup[]): void {
    if (this.destroyed) return;
    const nextIds = new Set<string>();
    for (const group of groups) {
      nextIds.add(group.id);
      const view = this.groups.get(group.id) ?? this.createGroup(group.id);
      this.updateGroup(view, group);
      if (!view.root.isConnected) this.groupsElement.appendChild(view.root);
    }
    for (const [id, view] of this.groups) {
      if (nextIds.has(id)) continue;
      view.root.remove();
      this.groups.delete(id);
    }
  }

  open(): void {
    if (!this.destroyed) this.modal.open();
  }

  close(): void {
    if (!this.destroyed) this.modal.close();
  }

  isOpen(): boolean {
    return !this.destroyed && this.modal.isOpen();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    i18next.off('languageChanged', this.handleLanguageChanged);
    this.closeButton.destroy();
    this.groups.clear();
    this.modal.destroy();
  }

  private readonly handleLanguageChanged = (): void => {
    if (this.closeLabelIsI18n) this.setCloseLabel(i18next.t('core:statsPanel.close'));
  };

  private createGroup(id: string): GroupView {
    const root = document.createElement('section');
    root.className = 'vol-stats-panel__group';
    const title = document.createElement('div');
    title.className = 'vol-stats-panel__group-heading';
    const icon = document.createElement('span');
    icon.className = 'vol-stats-panel__group-icon';
    icon.hidden = true;
    const heading = document.createElement('h3');
    heading.className = 'vol-stats-panel__group-title';
    title.append(icon, heading);
    root.appendChild(title);
    const entries = document.createElement('div');
    entries.className = 'vol-stats-panel__entries';
    root.appendChild(entries);
    const view: GroupView = { root, icon, heading, entries, entryViews: new Map() };
    this.groups.set(id, view);
    return view;
  }

  private updateGroup(view: GroupView, group: StatsPanelGroup): void {
    this.updateIcon(view.icon, group.icon);
    view.heading.textContent = group.label ?? '';
    view.heading.hidden = !group.label;
    const nextIds = new Set<string>();
    for (const entry of group.entries) {
      nextIds.add(entry.id);
      const entryView = view.entryViews.get(entry.id) ?? this.createEntry(view, entry.id);
      this.updateIcon(entryView.icon, entry.icon);
      entryView.label.textContent = entry.label;
      entryView.value.textContent = entry.value;
      entryView.hint.textContent = entry.hint ?? '';
      entryView.hint.hidden = !entry.hint;
      if (!entryView.row.isConnected) view.entries.appendChild(entryView.row);
    }
    for (const [id, entryView] of view.entryViews) {
      if (nextIds.has(id)) continue;
      entryView.row.remove();
      view.entryViews.delete(id);
    }
  }

  private createEntry(view: GroupView, id: string): EntryView {
    const row = document.createElement('div');
    row.className = 'vol-stats-panel__entry';
    const icon = document.createElement('span');
    icon.className = 'vol-stats-panel__entry-icon';
    icon.hidden = true;
    const label = document.createElement('span');
    label.className = 'vol-stats-panel__entry-label';
    const value = document.createElement('span');
    value.className = 'vol-stats-panel__entry-value';
    const hint = document.createElement('span');
    hint.className = 'vol-stats-panel__entry-hint';
    hint.hidden = true;
    row.append(icon, label, value, hint);
    const entryView: EntryView = { row, icon, label, value, hint };
    view.entryViews.set(id, entryView);
    return entryView;
  }

  private updateIcon(target: HTMLSpanElement, icon: string | Element | undefined): void {
    target.replaceChildren();
    target.hidden = icon === undefined;
    if (icon === undefined) return;
    if (typeof icon === 'string') {
      target.textContent = icon;
      return;
    }
    const clone = icon.cloneNode(true);
    if (clone instanceof Element) {
      clone.setAttribute('aria-hidden', 'true');
    }
    target.appendChild(clone);
  }
}
