import { DisposableScope } from '@volstudio/core/lifecycle';
import { Toolbar, ToolButton } from '@volstudio/core/ui';
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
  { id: 'audio', icon: 'audio' },
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
  private readonly headerTitle: HTMLHeadingElement;
  private readonly count: HTMLSpanElement;
  private readonly searchInput: HTMLInputElement;
  private readonly filterToolbar: Toolbar;
  private readonly viewToolbar: Toolbar;
  private readonly gridButton: ToolButton;
  private readonly listButton: ToolButton;
  private readonly refreshButton: ToolButton;
  private readonly content: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private readonly cards = new Map<string, AssetCard>();
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
        text: this.t(`library.${filter.id}`),
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
      button.querySelector('.vol-tool-button__text')?.classList.add('asset-rail__label');
    }

    this.headerTitle = element('h1', {
      className: 'asset-library__title',
      children: [this.t('library.title')],
    });
    this.count = element('span', { className: 'asset-library__count' });

    this.searchInput = element('input', {
      className: 'asset-search__input',
      attrs: {
        type: 'search',
        placeholder: this.t('library.search'),
        'aria-label': this.t('library.search'),
        autocomplete: 'off',
        spellcheck: 'false',
      },
    });
    this.scope.addListener(this.searchInput, 'input', () => {
      this.query = normalize(this.searchInput.value);
      this.renderAssets();
    });
    const search = element('label', {
      className: 'asset-search',
      children: [icon('search'), this.searchInput],
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
      children: [element('div', { children: [this.headerTitle, this.count] }), search, viewTools],
    });

    this.content = element('div', { className: 'asset-grid', attrs: { role: 'list' } });
    this.scope.addListener(this.content, 'click', (event) => this.handleCardClick(event));
    this.empty = element('div', {
      className: 'asset-library__empty',
      children: [icon('file'), element('span', { children: [this.t('library.empty')] })],
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
    this.headerTitle.id = 'asset-library-title';
    this.renderState();
  }

  setAssets(assets: AssetSummary[]): void {
    this.assets = [...assets].sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }),
    );
    if (this.selectedId && !this.assets.some((asset) => asset.id === this.selectedId)) {
      this.selectedId = null;
      this.options.onSelect(null);
    }
    this.renderAssets();
  }

  setSelected(assetId: string | null): void {
    const previous = this.selectedId;
    this.selectedId = assetId;
    if (previous) this.cards.get(previous)?.element.classList.remove('asset-card--selected');
    if (assetId) this.cards.get(assetId)?.element.classList.add('asset-card--selected');
  }

  setTranslator(t: Translate): void {
    this.t = t;
    this.headerTitle.textContent = t('library.title');
    this.searchInput.placeholder = t('library.search');
    this.searchInput.setAttribute('aria-label', t('library.search'));
    this.rail.setAttribute('aria-label', t('library.filters'));
    for (const { id } of FILTERS) {
      const button = this.filterToolbar.getButton(id)?.element;
      const label = button?.querySelector<HTMLElement>('.asset-rail__label');
      if (label) label.textContent = t(`library.${id}`);
      button?.setAttribute('aria-label', t(`library.${id}`));
      if (button) button.title = t(`library.${id}`);
    }
    this.updateActionLabels();
    this.renderAssets(true);
  }

  focusSearch(): void {
    this.searchInput.focus();
  }

  destroy(): void {
    for (const card of this.cards.values()) card.destroy();
    this.cards.clear();
    this.element.remove();
    this.filterToolbar.destroy();
    this.viewToolbar.destroy();
    this.refreshButton.destroy();
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
    this.content.dataset.view = this.view;
    this.viewToolbar.setValue(this.view);
    this.gridButton.element.classList.toggle('icon-action--active', this.view === 'grid');
    this.listButton.element.classList.toggle('icon-action--active', this.view === 'list');
    this.updateActionLabels();
  }

  private updateActionLabels(): void {
    for (const [button, key] of [
      [this.gridButton.element, 'library.grid'],
      [this.listButton.element, 'library.list'],
      [this.refreshButton.element, 'library.refresh'],
    ] as const) {
      button.title = this.t(key);
      button.setAttribute('aria-label', this.t(key));
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
      card.element.classList.toggle('asset-card--selected', asset.id === this.selectedId);
      this.content.append(card.element);
    }

    this.count.textContent = this.t('library.count', { count: visible.length });
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
      preview.append(icon('audio'), this.createWaveform());
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
        role: 'listitem',
        'data-asset-id': asset.id,
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
