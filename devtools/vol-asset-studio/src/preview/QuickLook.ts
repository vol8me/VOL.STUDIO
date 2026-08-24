import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Icon, IconButton, Text } from '@volstudio/core/ui';
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
  /** Ses varlığını KENDİ editöründe açar; piksel yüzeyiyle açılmaz. */
  onEditAudio: (asset: AssetSummary) => void;
}

/** Seçili varlığı türüne göre gösteren, düzenleme yapmayan hızlı önizleme çekmecesi. */
export class QuickLook {
  readonly element: HTMLElement;

  private readonly scope = new DisposableScope();
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly closeButton: IconButton;
  private readonly preview: HTMLDivElement;
  private readonly details: HTMLDivElement;
  private readonly copyButton: Button;
  private readonly editButton: Button;
  private readonly audioButton: Button;
  private readonly notice: Text;
  private asset: AssetSummary | null = null;
  private t: Translate;
  private request: AbortController | null = null;
  private loadedFont: FontFace | null = null;

  constructor(private readonly options: QuickLookOptions) {
    this.t = options.t;
    this.title = new Text('', { variant: 'heading', tag: 'h2' });
    this.title.element.classList.add('quick-look__title');
    this.subtitle = new Text('', { variant: 'muted' });
    this.subtitle.element.classList.add('quick-look__subtitle');
    this.closeButton = new IconButton(new Icon({ name: 'close' }).element, {
      label: options.t('asset.close'),
      size: 'sm',
      onClick: () => options.onClose(),
    });
    this.closeButton.element.classList.add('quick-look__close');

    const header = element('header', {
      className: 'quick-look__header',
      children: [
        element('div', {
          className: 'quick-look__identity',
          children: [this.title.element, this.subtitle.element],
        }),
        this.closeButton.element,
      ],
    });

    this.preview = element('div', { className: 'quick-look__preview' });
    this.details = element('div', { className: 'quick-look__details' });
    this.copyButton = new Button(options.t('asset.reveal'), {
      size: 'sm',
      onClick: () => void this.copyPath(),
    });
    this.copyButton.element.classList.add('quick-look__copy');
    this.copyButton.element.prepend(new Icon({ name: 'copy' }).element);
    this.editButton = new Button(options.t('editor.open'), {
      size: 'sm',
      variant: 'primary',
      onClick: () => {
        if (this.asset) options.onEdit(this.asset);
      },
    });
    this.editButton.element.classList.add('quick-look__edit');
    this.editButton.element.prepend(new Icon({ name: 'pencil' }).element);
    this.audioButton = new Button(options.t('audio.open'), {
      size: 'sm',
      variant: 'primary',
      onClick: () => {
        if (this.asset) options.onEditAudio(this.asset);
      },
    });
    this.audioButton.element.classList.add('quick-look__audio');
    this.audioButton.element.prepend(new Icon({ name: 'volume' }).element);
    this.audioButton.element.hidden = true;
    this.editButton.element.hidden = true;

    this.notice = new Text('', { variant: 'muted' });
    this.notice.element.classList.add('quick-look__notice');

    this.element = element('aside', {
      className: 'quick-look',
      attrs: { 'aria-label': this.t('asset.details'), 'aria-hidden': 'true' },
      children: [
        header,
        element('div', {
          className: 'quick-look__scroll',
          children: [
            this.preview,
            this.details,
            element('div', {
              className: 'quick-look__actions',
              children: [
                this.editButton.element,
                this.audioButton.element,
                this.copyButton.element,
              ],
            }),
            this.notice.element,
          ],
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
      this.editButton.element.hidden = true;
      this.audioButton.element.hidden = true;
      return;
    }

    // Düzenleme yalnız yazılabilir GÖRSEL için sunulur. Salt okunur bir kökte
    // düğmeyi göstermek, sunucunun reddedeceği bir işi davet etmek olurdu.
    // Düzenleme yalnız YAZILABİLİR görsel için sunulur; sesin kendi editörü
    // vardır ve piksel yüzeyiyle açılmaz.
    this.editButton.element.hidden = !(asset.kind === 'image' && asset.role !== 'readonly');
    this.audioButton.element.hidden = asset.kind !== 'audio';
    this.title.setContent(asset.name);
    this.subtitle.setContent(asset.path);
    const noticeKey =
      asset.kind === 'image'
        ? 'asset.editingNotice'
        : asset.kind === 'audio'
        ? 'asset.audioNotice'
        : null;
    this.notice.element.hidden = noticeKey === null;
    if (noticeKey !== null) this.notice.setContent(this.t(noticeKey));
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
    for (const component of [
      this.title,
      this.subtitle,
      this.closeButton,
      this.copyButton,
      this.editButton,
      this.audioButton,
      this.notice,
    ]) {
      component.destroy();
    }
    this.scope.dispose();
    this.element.remove();
  }

  private renderLabels(): void {
    this.closeButton.setLabel(this.t('asset.close'));
    this.element.setAttribute('aria-label', this.t('asset.details'));
    this.copyButton.setLabel(this.t('asset.reveal'));
    this.editButton.setLabel(this.t('editor.open'));
    this.audioButton.setLabel(this.t('audio.open'));
    this.notice.setContent(this.t('asset.editingNotice'));
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

    if (asset.kind === 'audio' || asset.kind === 'audio-recipe') {
      const iconName = asset.kind === 'audio-recipe' ? 'music' : 'volume';
      if (asset.kind === 'audio') {
        const audio = element('audio', {
          attrs: {
            controls: true,
            preload: 'metadata',
            src: this.options.client.contentUrl(asset),
          },
        });
        this.preview.append(icon(iconName, 'quick-look__hero-icon'), audio);
        this.request = new AbortController();
        void this.loadAudioMetadata(asset, this.request.signal);
      } else {
        this.preview.append(icon(iconName, 'quick-look__hero-icon'));
      }
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
        asset.problemCodes.map((code) => this.t(`problems.${code}`)).join(', '),
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
