import { DisposableScope } from '@volstudio/core/lifecycle';
import { Icon, Input, Text, Toolbar, ToolButton, Tooltip } from '@volstudio/core/ui';
import type { AssetSummary } from '../../shared/index';
import type { AssetStudioClient } from '../api/AssetStudioClient';
import { element } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';

export type AssetFilter = 'all' | 'images' | 'audio' | 'fonts' | 'problems' | 'modified';
export type AssetView = 'grid' | 'list';
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const FILTERS: ReadonlyArray<{ id: AssetFilter; icon: IconName }> = [
  { id: 'all', icon: 'apps' },
  { id: 'images', icon: 'image' },
  { id: 'audio', icon: 'volume' },
  { id: 'fonts', icon: 'font' },
  { id: 'problems', icon: 'warning' },
  { id: 'modified', icon: 'modified' },
];

const VIEW_STORAGE_KEY = 'vol-asset-studio:view';

interface AssetCard {
  asset: AssetSummary;
  element: HTMLButtonElement;
  destroy(): void;
}

export interface AssetLibraryOptions {
  client: AssetStudioClient;
  t: Translate;
  onSelect: (asset: AssetSummary | null) => void;
  onRefresh: () => void;
}

/** Arama, filtreleme ve kimlik bazlı DOM diff'i yapan ana varlık kütüphanesi. */
export class AssetLibrary {
  readonly element: HTMLElement;
  readonly rail: HTMLElement;

  private readonly scope = new DisposableScope();
  private readonly headerTitle: Text;
  private readonly count: Text;
  private readonly search: Input;
  private readonly emptyText: Text;
  private readonly emptyHint: Text;
  private readonly filterToolbar: Toolbar;
  private readonly viewToolbar: Toolbar;
  private readonly gridButton: ToolButton;
  private readonly listButton: ToolButton;
  private readonly refreshButton: ToolButton;
  private readonly content: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private readonly cards = new Map<string, AssetCard>();
  private readonly buttonTooltips = new Map<ToolButton, Tooltip>();
  private viewSwitchTimer?: ReturnType<typeof setTimeout>;
  private assets: AssetSummary[] = [];
  private filter: AssetFilter = 'all';
  private view: AssetView;
  private query = '';
  private selectedId: string | null = null;
  private t: Translate;

  constructor(private readonly options: AssetLibraryOptions) {
    this.t = options.t;
    this.view = readStoredView();

    this.filterToolbar = new Toolbar({
      ariaLabel: this.t('library.filters'),
      orientation: 'vertical',
      selectionMode: 'single',
      value: this.filter,
      items: FILTERS.map((filter) => ({
        id: filter.id,
        icon: filter.icon,
        label: this.t(`library.${filter.id}`),
      })),
      onChange: (value) => {
        if (typeof value === 'string') this.setFilter(value as AssetFilter);
      },
    });
    this.rail = this.filterToolbar.element;
    this.rail.classList.add('asset-rail');
    for (const filter of FILTERS) {
      const button = this.filterToolbar.getButton(filter.id)?.element;
      if (!button) continue;
      button.classList.add('asset-rail__button');
      button.dataset.filter = filter.id;
      if (filter.id === 'problems' || filter.id === 'modified') {
        button.append(element('span', { className: 'asset-rail__badge', attrs: { hidden: true } }));
      }
    }

    this.headerTitle = new Text(this.t('library.title'), { variant: 'title', tag: 'h1' });
    this.headerTitle.element.classList.add('asset-library__title');
    this.count = new Text('', { variant: 'muted' });
    this.count.element.classList.add('asset-library__count');

    this.search = new Input({
      type: 'search',
      placeholder: this.t('library.search'),
      onInput: (value) => {
        this.query = normalize(value);
        this.renderAssets();
      },
    });
    this.search.element.classList.add('asset-search__input');
    this.search.element.setAttribute('aria-label', this.t('library.search'));
    this.search.element.setAttribute('autocomplete', 'off');
    const search = element('label', {
      className: 'asset-search',
      children: [icon('search'), this.search.element],
    });

    this.viewToolbar = new Toolbar({
      ariaLabel: this.t('library.view'),
      selectionMode: 'single',
      value: this.view,
      items: [
        { id: 'grid', icon: 'grid', label: this.t('library.grid') },
        { id: 'list', icon: 'list', label: this.t('library.list') },
      ],
      onChange: (value) => {
        if (value === 'grid' || value === 'list') this.setView(value);
      },
    });
    this.gridButton = this.requiredToolButton(this.viewToolbar, 'grid');
    this.listButton = this.requiredToolButton(this.viewToolbar, 'list');
    this.gridButton.element.classList.add('icon-action');
    this.gridButton.element.dataset.view = 'grid';
    this.listButton.element.classList.add('icon-action');
    this.listButton.element.dataset.view = 'list';
    this.refreshButton = new ToolButton({
      id: 'refresh',
      icon: 'refresh',
      label: this.t('library.refresh'),
      onPress: options.onRefresh,
    });
    this.refreshButton.element.classList.add('icon-action');

    const viewTools = element('div', {
      className: 'asset-library__tools',
      children: [this.viewToolbar.element, this.refreshButton.element],
    });
    const heading = element('div', {
      className: 'asset-library__heading',
      children: [
        element('div', {
          className: 'asset-library__identity',
          children: [this.headerTitle.element, this.count.element],
        }),
        search,
        viewTools,
      ],
    });

    this.content = element('div', {
      className: 'asset-grid',
      attrs: { role: 'listbox', 'aria-label': this.t('library.title') },
    });
    this.scope.addListener(this.content, 'click', (event) => this.handleCardClick(event));
    this.emptyText = new Text(this.t('library.empty'), { variant: 'muted' });
    this.emptyText.element.classList.add('asset-library__empty-title');
    this.emptyHint = new Text(this.t('library.problemScope'), { variant: 'muted' });
    this.emptyHint.element.classList.add('asset-library__empty-hint');
    this.emptyHint.element.hidden = true;
    this.empty = element('div', {
      className: 'asset-library__empty',
      children: [
        new Icon({ name: 'file' }).element,
        this.emptyText.element,
        this.emptyHint.element,
      ],
    });

    this.element = element('section', {
      className: 'asset-library',
      attrs: { 'aria-labelledby': 'asset-library-title' },
      children: [
        heading,
        element('div', {
          className: 'asset-library__scroll',
          children: [this.content, this.empty],
        }),
      ],
    });
    this.headerTitle.element.id = 'asset-library-title';
    this.renderState();
    this.attachTooltips();
  }

  setAssets(assets: AssetSummary[]): void {
    this.assets = [...assets].sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }),
    );
    if (this.selectedId && !this.assets.some((asset) => asset.id === this.selectedId)) {
      this.selectedId = null;
      this.options.onSelect(null);
    }
    this.updateFilterBadges();
    this.renderAssets();
  }

  setSelected(assetId: string | null): void {
    const previous = this.selectedId;
    this.selectedId = assetId;
    if (previous) {
      const card = this.cards.get(previous)?.element;
      card?.classList.remove('asset-card--selected');
      card?.setAttribute('aria-selected', 'false');
    }
    if (assetId) {
      const card = this.cards.get(assetId)?.element;
      card?.classList.add('asset-card--selected');
      card?.setAttribute('aria-selected', 'true');
    }
  }

  setTranslator(t: Translate): void {
    this.t = t;
    this.headerTitle.setContent(t('library.title'));
    this.emptyText.setContent(t('library.empty'));
    this.emptyHint.setContent(t('library.problemScope'));
    this.search.element.placeholder = t('library.search');
    this.search.element.setAttribute('aria-label', t('library.search'));
    this.content.setAttribute('aria-label', t('library.title'));
    this.rail.setAttribute('aria-label', t('library.filters'));
    for (const { id } of FILTERS) {
      const button = this.filterToolbar.getButton(id);
      if (!button) continue;
      const label = t(`library.${id}`);
      button.element.setAttribute('aria-label', label);
      this.buttonTooltips.get(button)?.setText(label);
    }
    this.updateActionButtonTooltips();
    this.renderAssets(true);
  }

  focusSearch(): void {
    this.search.focus();
  }

  destroy(): void {
    clearTimeout(this.viewSwitchTimer);
    for (const tooltip of this.buttonTooltips.values()) tooltip.destroy();
    this.buttonTooltips.clear();
    for (const card of this.cards.values()) card.destroy();
    this.cards.clear();
    this.element.remove();
    this.filterToolbar.destroy();
    this.viewToolbar.destroy();
    this.refreshButton.destroy();
    this.headerTitle.destroy();
    this.count.destroy();
    this.emptyText.destroy();
    this.emptyHint.destroy();
    this.search.destroy();
    this.scope.dispose();
  }

  private setFilter(filter: AssetFilter): void {
    if (this.filter === filter) return;
    this.filter = filter;
    this.renderState();
    this.renderAssets();
  }

  private setView(view: AssetView): void {
    if (this.view === view) return;
    this.view = view;
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Gizli mod veya kapalı storage görünümü etkilememeli.
    }
    this.renderState();
    this.content.classList.add('asset-grid--fading');
    if (this.viewSwitchTimer) clearTimeout(this.viewSwitchTimer);
    this.viewSwitchTimer = setTimeout(() => {
      this.content.classList.remove('asset-grid--fading');
      this.viewSwitchTimer = undefined;
    }, 180);
  }

  private renderState(): void {
    this.filterToolbar.setValue(this.filter);
    for (const { id } of FILTERS) {
      const button = this.filterToolbar.getButton(id)?.element;
      if (!button) continue;
      const active = id === this.filter;
      button.classList.toggle('asset-rail__button--active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    }
    this.headerTitle.setContent(
      this.filter === 'all' ? this.t('library.title') : this.t(`library.${this.filter}`),
    );
    this.content.dataset.view = this.view;
    this.viewToolbar.setValue(this.view);
    this.gridButton.element.classList.toggle('icon-action--active', this.view === 'grid');
    this.listButton.element.classList.toggle('icon-action--active', this.view === 'list');
    this.updateActionButtonTooltips();
  }

  private updateActionButtonTooltips(): void {
    for (const [button, key] of [
      [this.gridButton, 'library.grid'],
      [this.listButton, 'library.list'],
      [this.refreshButton, 'library.refresh'],
    ] as const) {
      const label = this.t(key);
      button.element.setAttribute('aria-label', label);
      this.buttonTooltips.get(button)?.setText(label);
    }
  }

  private attachTooltips(): void {
    for (const { id } of FILTERS) {
      const button = this.filterToolbar.getButton(id);
      if (!button || this.buttonTooltips.has(button)) continue;
      const label = this.t(`library.${id}`);
      button.element.removeAttribute('title');
      this.buttonTooltips.set(button, new Tooltip(button.element, label, { placement: 'bottom' }));
    }
    for (const [button, key] of [
      [this.gridButton, 'library.grid'],
      [this.listButton, 'library.list'],
      [this.refreshButton, 'library.refresh'],
    ] as const) {
      if (this.buttonTooltips.has(button)) continue;
      button.element.removeAttribute('title');
      this.buttonTooltips.set(
        button,
        new Tooltip(button.element, this.t(key), { placement: 'bottom' }),
      );
    }
  }

  private updateFilterBadges(): void {
    const counts: Partial<Record<AssetFilter, number>> = {
      problems: this.assets.filter((asset) => asset.problemCodes.length > 0).length,
      modified: this.assets.filter(
        (asset) => Boolean(asset.gitStatus) && asset.gitStatus !== 'clean',
      ).length,
    };
    for (const id of ['problems', 'modified'] as const) {
      const badge = this.filterToolbar
        .getButton(id)
        ?.element.querySelector<HTMLElement>('.asset-rail__badge');
      if (!badge) continue;
      const count = counts[id] ?? 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
  }

  private requiredToolButton(toolbar: Toolbar, id: string): ToolButton {
    const button = toolbar.getButton(id);
    if (!button) throw new Error(`[AssetLibrary] Toolbar aracı bulunamadı: ${id}`);
    return button;
  }

  private renderAssets(force = false): void {
    const visible = this.assets.filter((asset) => this.matches(asset));
    const visibleIds = new Set(visible.map((asset) => asset.id));

    for (const [id, card] of this.cards) {
      if (!visibleIds.has(id)) {
        card.destroy();
        card.element.remove();
        this.cards.delete(id);
      }
    }

    for (const asset of visible) {
      let card = this.cards.get(asset.id);
      if (!card || force || card.asset.revision !== asset.revision) {
        const replacement = this.createCard(asset);
        if (card) {
          card.destroy();
          card.element.replaceWith(replacement.element);
        }
        card = replacement;
        this.cards.set(asset.id, card);
      }
      const selected = asset.id === this.selectedId;
      card.element.classList.toggle('asset-card--selected', selected);
      card.element.setAttribute('aria-selected', String(selected));
      this.content.append(card.element);
    }

    this.count.setContent(this.t('library.count', { count: visible.length }));
    this.emptyText.setContent(
      this.t(this.filter === 'problems' ? 'library.noProblems' : 'library.empty'),
    );
    this.emptyHint.element.hidden = this.filter !== 'problems';
    this.empty.hidden = visible.length > 0;
    this.content.hidden = visible.length === 0;
  }

  private createCard(asset: AssetSummary): AssetCard {
    const preview = element('span', {
      className: `asset-card__preview asset-card__preview--${asset.kind}`,
    });
    let destroyPreview = (): void => {};
    if (asset.kind === 'image') {
      const image = element('img', {
        attrs: {
          src: this.options.client.thumbnailUrl(asset),
          alt: '',
          loading: 'lazy',
          draggable: 'false',
        },
      });
      const handleError = (): void => preview.classList.add('asset-card__preview--failed');
      image.addEventListener('error', handleError, { once: true });
      destroyPreview = () => image.removeEventListener('error', handleError);
      preview.append(image, icon('image', 'asset-card__fallback'));
    } else if (asset.kind === 'audio') {
      preview.append(icon('volume'), this.createWaveform());
    } else if (asset.kind === 'audio-recipe') {
      preview.append(icon('music'));
    } else if (asset.kind === 'font') {
      preview.append(
        element('span', { className: 'asset-card__glyph', children: [this.t('asset.fontSample')] }),
      );
    } else {
      preview.append(icon('file'));
    }

    const kind = element('span', {
      className: 'asset-card__kind',
      children: [this.t(`asset.${asset.kind}`)],
    });
    const problem =
      asset.problemCodes.length > 0
        ? element('span', {
            className: 'asset-card__problem',
            attrs: { title: this.t('asset.problemCount', { count: asset.problemCodes.length }) },
            children: [icon('warning')],
          })
        : null;
    const body = element('span', {
      className: 'asset-card__body',
      children: [
        element('span', { className: 'asset-card__name', children: [asset.name] }),
        element('span', { className: 'asset-card__path', children: [asset.path] }),
        element('span', {
          className: 'asset-card__meta',
          children: [kind, element('span', { children: [asset.format.toUpperCase()] }), problem],
        }),
      ],
    });
    const card = element('button', {
      className: 'asset-card',
      attrs: {
        type: 'button',
        role: 'option',
        'data-asset-id': asset.id,
        'aria-selected': String(asset.id === this.selectedId),
        'aria-label': `${asset.name}, ${this.t(`asset.${asset.kind}`)}`,
      },
      children: [preview, body, icon('chevron-right', 'asset-card__chevron')],
    });
    return { asset, element: card, destroy: destroyPreview };
  }

  private createWaveform(): HTMLElement {
    const waveform = element('span', {
      className: 'asset-card__waveform',
      attrs: { 'aria-hidden': 'true' },
    });
    for (const height of [35, 72, 48, 88, 56, 100, 64, 42, 78, 50, 84, 38]) {
      waveform.append(element('i', { attrs: { style: `--wave-height:${height}%` } }));
    }
    return waveform;
  }

  private matches(asset: AssetSummary): boolean {
    if (
      this.query &&
      !normalize(`${asset.name} ${asset.path} ${asset.format}`).includes(this.query)
    ) {
      return false;
    }
    switch (this.filter) {
      case 'images':
        return asset.kind === 'image';
      case 'audio':
        return asset.kind === 'audio' || asset.kind === 'audio-recipe';
      case 'fonts':
        return asset.kind === 'font';
      case 'problems':
        return asset.problemCodes.length > 0;
      case 'modified':
        return Boolean(asset.gitStatus && asset.gitStatus !== 'clean');
      default:
        return true;
    }
  }

  private handleCardClick(event: Event): void {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-asset-id]')
        : null;
    const asset = target
      ? this.assets.find((candidate) => candidate.id === target.dataset.assetId)
      : undefined;
    if (!asset) return;
    this.setSelected(asset.id);
    this.options.onSelect(asset);
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function readStoredView(): AssetView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}
