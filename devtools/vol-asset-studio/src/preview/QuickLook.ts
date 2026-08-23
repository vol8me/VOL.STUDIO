import { DisposableScope } from '@volstudio/core/lifecycle';
import type { AssetSummary, AudioMetadata } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../api/AssetStudioClient';
import type { Translate } from '../catalog/AssetLibrary';
import { element, formatBytes, replaceChildren } from '../ui/dom';
import { icon } from '../ui/icons';

export interface QuickLookOptions {
  client: AssetStudioClient;
  t: Translate;
  locale: () => string;
  onClose: () => void;
  onToast: (message: string) => void;
  /** Görsel varlığı piksel editöründe açar. */
  onEdit: (asset: AssetSummary) => void;
}

/** Seçili varlığı türüne göre gösteren, düzenleme yapmayan hızlı önizleme çekmecesi. */
export class QuickLook {
  readonly element: HTMLElement;

  private readonly scope = new DisposableScope();
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly preview: HTMLDivElement;
  private readonly details: HTMLDivElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly notice: HTMLParagraphElement;
  private asset: AssetSummary | null = null;
  private t: Translate;
  private request: AbortController | null = null;
  private loadedFont: FontFace | null = null;

  constructor(private readonly options: QuickLookOptions) {
    this.t = options.t;
    this.title = element('h2', { className: 'quick-look__title' });
    this.subtitle = element('p', { className: 'quick-look__subtitle' });
    this.closeButton = element('button', {
      className: 'icon-action quick-look__close',
      attrs: { type: 'button' },
      children: [icon('close')],
    });
    this.scope.addListener(this.closeButton, 'click', options.onClose);
    const header = element('header', {
      className: 'quick-look__header',
      children: [element('div', { children: [this.title, this.subtitle] }), this.closeButton],
    });

    this.preview = element('div', { className: 'quick-look__preview' });
    this.details = element('div', { className: 'quick-look__details' });
    this.copyButton = element('button', {
      className: 'quick-look__copy',
      attrs: { type: 'button' },
      children: [icon('copy'), element('span')],
    });
    this.scope.addListener(this.copyButton, 'click', () => void this.copyPath());
    this.editButton = element('button', {
      className: 'quick-look__edit',
      attrs: { type: 'button', hidden: 'hidden' },
      children: [icon('pencil'), element('span')],
    });
    this.scope.addListener(this.editButton, 'click', () => {
      if (this.asset) options.onEdit(this.asset);
    });
    this.notice = element('p', { className: 'quick-look__notice' });

    this.element = element('aside', {
      className: 'quick-look',
      attrs: { 'aria-label': this.t('asset.details'), 'aria-hidden': 'true' },
      children: [
        header,
        element('div', {
          className: 'quick-look__scroll',
          children: [this.preview, this.details, this.editButton, this.copyButton, this.notice],
        }),
      ],
    });
    this.renderLabels();
  }

  setAsset(asset: AssetSummary | null): void {
    this.cancelPending();
    this.asset = asset;
    this.element.classList.toggle('quick-look--open', Boolean(asset));
    this.element.setAttribute('aria-hidden', String(!asset));
    if (!asset) {
      replaceChildren(this.preview);
      replaceChildren(this.details);
      this.editButton.hidden = true;
      return;
    }

    // Düzenleme yalnız yazılabilir GÖRSEL için sunulur. Salt okunur bir kökte
    // düğmeyi göstermek, sunucunun reddedeceği bir işi davet etmek olurdu.
    this.editButton.hidden = !(asset.kind === 'image' && asset.role !== 'readonly');
    this.title.textContent = asset.name;
    this.subtitle.textContent = asset.path;
    this.renderPreview(asset);
    this.renderDetails(asset);
  }

  setTranslator(t: Translate): void {
    this.t = t;
    this.renderLabels();
    if (this.asset) this.setAsset(this.asset);
  }

  destroy(): void {
    this.cancelPending();
    this.scope.dispose();
    this.element.remove();
  }

  private renderLabels(): void {
    this.closeButton.title = this.t('asset.close');
    this.closeButton.setAttribute('aria-label', this.t('asset.close'));
    this.element.setAttribute('aria-label', this.t('asset.details'));
    const label = this.copyButton.querySelector('span');
    if (label) label.textContent = this.t('asset.reveal');
    const editLabel = this.editButton.querySelector('span');
    if (editLabel) editLabel.textContent = this.t('editor.open');
    this.notice.textContent = this.t('asset.editingNotice');
  }

  private renderPreview(asset: AssetSummary): void {
    replaceChildren(this.preview);
    this.preview.className = `quick-look__preview quick-look__preview--${asset.kind}`;

    if (asset.kind === 'image') {
      this.preview.append(
        element('img', {
          attrs: {
            src: this.options.client.thumbnailUrl(asset, 512),
            alt: asset.name,
            draggable: 'false',
          },
        }),
      );
      return;
    }

    if (asset.kind === 'audio') {
      const audio = element('audio', {
        attrs: { controls: true, preload: 'metadata', src: this.options.client.contentUrl(asset) },
      });
      this.preview.append(icon('audio', 'quick-look__hero-icon'), audio);
      this.request = new AbortController();
      void this.loadAudioMetadata(asset, this.request.signal);
      return;
    }

    if (asset.kind === 'font') {
      const sample = element('p', {
        className: 'quick-look__font-sample',
        children: [this.t('asset.fontPreview')],
      });
      this.preview.append(sample);
      this.loadFont(asset, sample);
      return;
    }

    this.preview.append(
      icon('file', 'quick-look__hero-icon'),
      element('p', { children: [this.t('asset.previewUnavailable')] }),
    );
  }

  private renderDetails(asset: AssetSummary, audio?: AudioMetadata): void {
    const list = element('dl', { className: 'quick-look__metadata' });
    this.addDetail(list, this.t('asset.size'), formatBytes(asset.bytes, this.options.locale()));
    this.addDetail(list, this.t('asset.format'), asset.format.toUpperCase());
    this.addDetail(list, this.t('asset.root'), asset.rootId);
    this.addDetail(
      list,
      this.t('asset.git'),
      asset.gitStatus ? this.t(`asset.${asset.gitStatus}`) : this.t('asset.notTracked'),
    );
    this.addDetail(
      list,
      this.t('asset.modifiedAt'),
      new Intl.DateTimeFormat(this.options.locale(), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(asset.modifiedAt)),
    );
    if (asset.image) {
      this.addDetail(
        list,
        this.t('asset.dimensions'),
        `${asset.image.width} × ${asset.image.height}`,
      );
    }
    if (audio) {
      this.addDetail(list, this.t('asset.codec'), audio.codec.toUpperCase());
      this.addDetail(list, this.t('asset.duration'), formatDuration(audio.durationSeconds));
      if (audio.sampleRate)
        this.addDetail(list, this.t('asset.sampleRate'), `${audio.sampleRate} Hz`);
      if (audio.channels) this.addDetail(list, this.t('asset.channels'), String(audio.channels));
    }
    if (asset.problemCodes.length > 0) {
      this.addDetail(
        list,
        this.t('asset.problems'),
        asset.problemCodes.join(', '),
        'quick-look__value--danger',
      );
    }
    replaceChildren(this.details, list);
  }

  private addDetail(list: HTMLDListElement, label: string, value: string, className = ''): void {
    list.append(
      element('div', {
        className: 'quick-look__metadata-row',
        children: [
          element('dt', { children: [label] }),
          element('dd', { className, children: [value] }),
        ],
      }),
    );
  }

  private async loadAudioMetadata(asset: AssetSummary, signal: AbortSignal): Promise<void> {
    try {
      const metadata = await this.options.client.getAudioMetadata(asset.id, signal);
      if (!signal.aborted && this.asset?.id === asset.id) this.renderDetails(asset, metadata);
    } catch (error) {
      if (!signal.aborted && error instanceof AssetStudioApiError) {
        this.preview.classList.add('quick-look__preview--warning');
      }
    }
  }

  private loadFont(asset: AssetSummary, sample: HTMLElement): void {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const family = `VolAssetPreview-${asset.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const face = new FontFace(family, `url("${this.options.client.contentUrl(asset)}")`);
    this.loadedFont = face;
    document.fonts.add(face);
    void face
      .load()
      .then(() => {
        if (this.loadedFont === face) sample.style.fontFamily = `"${family}"`;
      })
      .catch(() => {
        if (this.loadedFont === face) this.preview.classList.add('quick-look__preview--warning');
      });
  }

  private async copyPath(): Promise<void> {
    if (!this.asset) return;
    try {
      await navigator.clipboard.writeText(this.asset.path);
      this.options.onToast(this.t('asset.pathCopied'));
    } catch {
      // Clipboard izni verilmediyse sessiz kalır; sahte başarı bildirimi gösterilmez.
    }
  }

  private cancelPending(): void {
    this.request?.abort();
    this.request = null;
    const font = this.loadedFont;
    this.loadedFont = null;
    if (font && document.fonts) document.fonts.delete(font);
    const audio = this.preview?.querySelector('audio');
    audio?.pause();
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
