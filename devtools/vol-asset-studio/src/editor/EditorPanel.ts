import { DisposableScope } from '@volstudio/core/lifecycle';
import type { AssetSummary } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../api/AssetStudioClient';
import { element, replaceChildren } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { DocumentSession, type DocumentSessionState } from './DocumentSession';
import { PixelEditor } from './PixelEditor';
import type { Rgba } from './RasterSurface';
import type { ToolId } from './tools';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface EditorPanelOptions {
  client: AssetStudioClient;
  t: Translate;
  onClose: () => void;
  onToast: (message: string) => void;
  /** Kayıt sonrası katalog satırının tazelenmesi için. */
  onSaved: (assetId: string, revision: string) => void;
}

const TOOL_ORDER: ToolId[] = ['pencil', 'eraser', 'fill', 'eyedropper'];
const TOOL_ICONS: Record<ToolId, IconName> = {
  pencil: 'pencil',
  eraser: 'eraser',
  fill: 'fill',
  eyedropper: 'eyedropper',
};

function toHex(color: Rgba): string {
  const part = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function fromHex(hex: string): Rgba {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 0, g: 0, b: 0, a: 255 };
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 255 };
}

/**
 * Odaklı piksel düzenleme yüzeyi.
 *
 * Kütüphane merkezli açılışın karşılığı: bir görsel düzenlenmek üzere
 * açıldığında kabuk buna geçer, kapatılınca kütüphaneye döner. Aynı anda tek
 * belge açıktır.
 */
export class EditorPanel {
  readonly element: HTMLElement;

  readonly #scope = new DisposableScope();
  readonly #options: EditorPanelOptions;
  readonly #title: HTMLSpanElement;
  readonly #status: HTMLSpanElement;
  readonly #stage: HTMLDivElement;
  readonly #toolButtons = new Map<ToolId, HTMLButtonElement>();
  readonly #colorInput: HTMLInputElement;
  readonly #brushInput: HTMLInputElement;
  readonly #undoButton: HTMLButtonElement;
  readonly #redoButton: HTMLButtonElement;
  readonly #fitButton: HTMLButtonElement;
  readonly #actualSizeButton: HTMLButtonElement;
  readonly #saveButton: HTMLButtonElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #conflictBar: HTMLDivElement;
  readonly #conflictText: HTMLSpanElement;
  readonly #reloadButton: HTMLButtonElement;
  #t: Translate;
  #asset: AssetSummary | null = null;
  #session: DocumentSession | null = null;
  #editor: PixelEditor | null = null;
  #request: AbortController | null = null;
  #saving = false;

  public constructor(options: EditorPanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = element('span', { className: 'editor-panel__title' });
    this.#status = element('span', { className: 'editor-panel__status' });
    this.#closeButton = this.#iconButton('close', 'close', () => options.onClose());

    for (const id of TOOL_ORDER) {
      const button = element('button', {
        className: 'editor-panel__tool',
        attrs: { type: 'button', 'data-tool': id, 'aria-pressed': 'false' },
        children: [icon(TOOL_ICONS[id])],
      });
      this.#scope.addListener(button, 'click', () => this.setTool(id));
      this.#toolButtons.set(id, button);
    }

    this.#colorInput = element('input', {
      className: 'editor-panel__color',
      attrs: { type: 'color', value: '#ffffff' },
    });
    this.#scope.addListener(
      this.#colorInput,
      'input',
      () => this.#editor?.setPrimaryColor(fromHex(this.#colorInput.value)),
    );

    this.#brushInput = element('input', {
      className: 'editor-panel__brush',
      attrs: { type: 'range', min: '1', max: '16', step: '1', value: '1' },
    });
    this.#scope.addListener(
      this.#brushInput,
      'input',
      () => this.#editor?.setBrushSize(Number(this.#brushInput.value)),
    );

    this.#undoButton = this.#iconButton('undo', 'undo', () => {
      this.#session?.undo();
      this.#editor?.requestRender();
    });
    this.#redoButton = this.#iconButton('redo', 'redo', () => {
      this.#session?.redo();
      this.#editor?.requestRender();
    });
    this.#fitButton = this.#iconButton('fit', 'fit', () => this.#editor?.fit());
    this.#actualSizeButton = this.#iconButton(
      'actualSize',
      'grid',
      () => this.#editor?.actualSize(),
    );
    this.#saveButton = element('button', {
      className: 'editor-panel__save',
      attrs: { type: 'button' },
    });
    this.#scope.addListener(this.#saveButton, 'click', () => void this.save());

    this.#conflictText = element('span', { className: 'editor-panel__conflict-text' });
    this.#reloadButton = element('button', {
      className: 'editor-panel__conflict-action',
      attrs: { type: 'button' },
    });
    this.#scope.addListener(this.#reloadButton, 'click', () => void this.reload());
    this.#conflictBar = element('div', {
      className: 'editor-panel__conflict',
      attrs: { hidden: 'hidden', role: 'status' },
      children: [this.#conflictText, this.#reloadButton],
    });

    this.#stage = element('div', { className: 'editor-panel__stage' });

    this.element = element('section', {
      className: 'editor-panel',
      attrs: { 'aria-hidden': 'true' },
      children: [
        element('header', {
          className: 'editor-panel__bar',
          children: [
            element('div', {
              className: 'editor-panel__identity',
              children: [this.#title, this.#status],
            }),
            element('div', {
              className: 'editor-panel__tools',
              attrs: { role: 'group' },
              children: [...this.#toolButtons.values()],
            }),
            element('div', {
              className: 'editor-panel__settings',
              children: [
                this.#colorInput,
                this.#brushInput,
                this.#fitButton,
                this.#actualSizeButton,
              ],
            }),
            element('div', {
              className: 'editor-panel__actions',
              children: [this.#undoButton, this.#redoButton, this.#saveButton, this.#closeButton],
            }),
          ],
        }),
        this.#conflictBar,
        this.#stage,
      ],
    });
    this.renderLabels();
  }

  public get isOpen(): boolean {
    return this.#session !== null;
  }

  public get isDirty(): boolean {
    return this.#session?.isDirty ?? false;
  }

  public get openAssetId(): string | null {
    return this.#asset?.id ?? null;
  }

  public setTranslator(t: Translate): void {
    this.#t = t;
    this.renderLabels();
    this.#syncState();
  }

  /** Belgeyi indirir ve düzenlemeye açar. */
  public async open(asset: AssetSummary): Promise<void> {
    this.#teardownDocument();
    this.#asset = asset;
    this.element.setAttribute('aria-hidden', 'false');
    this.element.classList.add('editor-panel--open');
    this.#title.textContent = asset.name;
    this.#status.textContent = this.#t('editor.loading');

    const request = new AbortController();
    this.#request = request;
    try {
      const raster = await this.#options.client.getRaster(asset.id, request.signal);
      if (request.signal.aborted) return;
      const session = new DocumentSession({
        assetId: asset.id,
        width: raster.width,
        height: raster.height,
        rgba: raster.rgba,
        revision: raster.revision,
        onChange: (state) => this.#applyState(state),
      });
      this.#session = session;
      this.#editor = new PixelEditor({
        container: this.#stage,
        session,
        labels: {
          pencil: this.#t('editor.tools.pencil'),
          eraser: this.#t('editor.tools.eraser'),
          fill: this.#t('editor.tools.fill'),
          eyedropper: this.#t('editor.tools.eyedropper'),
        },
        onColorChange: (color) => {
          this.#colorInput.value = toHex(color);
        },
      });
      this.#editor.setPrimaryColor(fromHex(this.#colorInput.value));
      this.setTool('pencil');
      if (raster.strippedMetadata.length > 0) {
        this.#options.onToast(
          this.#t('editor.metadataStripped', { fields: raster.strippedMetadata.join(', ') }),
        );
      }
      this.#applyState(session.getState());
    } catch (error) {
      if (request.signal.aborted) return;
      this.#status.textContent = this.#errorText(error);
    } finally {
      if (this.#request === request) this.#request = null;
    }
  }

  public setTool(id: ToolId): void {
    this.#editor?.setActiveTool(id);
    for (const [toolId, button] of this.#toolButtons) {
      button.setAttribute('aria-pressed', String(toolId === id));
    }
  }

  /** Diskteki güncel içeriği yeniden yükler; kirli çalışmayı ATAR. */
  public async reload(): Promise<void> {
    if (this.#asset !== null) await this.open(this.#asset);
  }

  /** Harici değişikliği açık belgeye bildirir. */
  public noteExternalRevision(assetId: string, revision: string): void {
    if (this.#session === null || this.#session.assetId !== assetId) return;
    this.#session.noteExternalRevision(revision);
  }

  public async save(): Promise<void> {
    const session = this.#session;
    const asset = this.#asset;
    if (session === null || asset === null || this.#saving) return;
    // Temiz belge YAZILMAZ. Kaydetmek dosyayı yeniden kodlar; içerik aynı olsa
    // bile baytlar değişebilir, mtime kayar ve `git status` sebepsiz kirlenir.
    // Düğme zaten pasiftir; bu koruma programatik çağrıyı da kapsar.
    if (!session.isDirty) return;
    this.#saving = true;
    this.#saveButton.disabled = true;
    this.#status.textContent = this.#t('editor.saving');
    try {
      const png = await this.#encodePng(session);
      const response = await this.#options.client.saveRaster(
        asset,
        session.revision,
        session.surface.width,
        session.surface.height,
        png,
      );
      const result = response.results[0];
      session.markSaved(result.revision);
      this.#options.onSaved(asset.id, result.revision);
      this.#options.onToast(this.#t('editor.saved'));
    } catch (error) {
      this.#syncState();
      this.#status.textContent = this.#errorText(error);
      this.#options.onToast(this.#errorText(error));
    } finally {
      this.#saving = false;
      this.#saveButton.disabled = !(this.#session?.isDirty ?? false);
    }
  }

  public close(): void {
    this.#teardownDocument();
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('editor-panel--open');
  }

  public destroy(): void {
    this.close();
    this.#scope.dispose();
    this.element.remove();
  }

  public renderLabels(): void {
    this.#saveButton.textContent = this.#t('editor.save');
    this.#labelButton(this.#undoButton, 'editor.undo');
    this.#labelButton(this.#redoButton, 'editor.redo');
    this.#labelButton(this.#fitButton, 'editor.fit');
    this.#labelButton(this.#actualSizeButton, 'editor.actualSize');
    this.#labelButton(this.#closeButton, 'editor.close');
    this.#colorInput.setAttribute('aria-label', this.#t('editor.color'));
    this.#brushInput.setAttribute('aria-label', this.#t('editor.brush'));
    this.#reloadButton.textContent = this.#t('editor.reloadFromDisk');
    for (const [id, button] of this.#toolButtons) {
      this.#labelButton(button, `editor.tools.${id}`);
    }
  }

  #teardownDocument(): void {
    this.#request?.abort();
    this.#request = null;
    this.#editor?.destroy();
    this.#editor = null;
    this.#session = null;
    this.#asset = null;
    replaceChildren(this.#stage);
    this.#conflictBar.hidden = true;
  }

  /** Belge yüzeyini PNG'ye kodlar. */
  async #encodePng(session: DocumentSession): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = session.surface.width;
    canvas.height = session.surface.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('[EditorPanel] PNG kodlama contexti alınamadı');
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(session.toRgba());
    context.putImageData(image, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('[EditorPanel] PNG üretilemedi'));
      }, 'image/png');
    });
  }

  #iconButton(key: string, iconName: IconName, run: () => void): HTMLButtonElement {
    const button = element('button', {
      className: `icon-action editor-panel__${key}`,
      attrs: { type: 'button' },
      children: [icon(iconName)],
    });
    this.#scope.addListener(button, 'click', run);
    return button;
  }

  #labelButton(button: HTMLButtonElement, key: string): void {
    const label = this.#t(key);
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  #applyState(state: DocumentSessionState): void {
    this.#undoButton.disabled = !state.canUndo;
    this.#redoButton.disabled = !state.canRedo;
    this.#saveButton.disabled = this.#saving || !state.dirty;
    this.#status.textContent = state.dirty ? this.#t('editor.unsaved') : this.#t('editor.clean');
    const conflict = state.conflictRevision !== undefined;
    this.#conflictBar.hidden = !conflict;
    if (conflict) {
      // Kirli belge OTOMATİK yüklenmez: kullanıcının kaydedilmemiş çalışmasını
      // sessizce atmak veri kaybıdır. Karar kullanıcıya bırakılır.
      this.#conflictText.textContent = state.dirty
        ? this.#t('editor.conflictDirty')
        : this.#t('editor.conflictClean');
    }
  }

  #syncState(): void {
    if (this.#session !== null) this.#applyState(this.#session.getState());
  }

  #errorText(error: unknown): string {
    const code = error instanceof AssetStudioApiError ? error.code : 'request_failed';
    return this.#t(`errors.${code}`);
  }
}
