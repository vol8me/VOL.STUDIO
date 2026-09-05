import { DisposableScope, type CancellableDisposable } from '@volstudio/core/lifecycle';
import { ColorPicker, Slider, SplitPane, Toolbar } from '@volstudio/core/ui';
import type { AssetSummary } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../api/AssetStudioClient';
import { element, replaceChildren } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { DocumentSession, type DocumentSessionState } from './DocumentSession';
import { fromHex, toHex, quantizeToPalette, replaceColor } from './Palette';
import { PixelEditor } from './PixelEditor';
import type { RasterBuffer } from './transform';
import { StrokeRecorder } from './StrokeRecorder';
import { encodePng } from './encodePng';
import { editorShortcut } from './editorShortcut';
import { LayerPanel } from './panels/LayerPanel';
import { PalettePanel } from './panels/PalettePanel';
import type { ToolId } from './tools';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Panel yenilemesi bu kadar sessizlikten sonra koşar.
 *
 * Fırça darbesi boyunca onlarca durum değişimi olur; her birinde katman ve
 * kare önizlemesi üretmek darbeyi yüzlerce milisaniye yavaşlatıyordu.
 */
const PANEL_REFRESH_DELAY_MS = 180;
const EDITOR_PRIMARY_SIZE_KEY = 'vol-asset-studio:editor-primary-size';

function readEditorPrimarySize(): number | null {
  try {
    const value = Number(localStorage.getItem(EDITOR_PRIMARY_SIZE_KEY));
    return Number.isFinite(value) && value >= 420 ? value : null;
  } catch {
    return null;
  }
}

function storeEditorPrimarySize(size: number): void {
  try {
    localStorage.setItem(EDITOR_PRIMARY_SIZE_KEY, String(Math.round(size)));
  } catch {
    return;
  }
}

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
const TOOL_SHORTCUTS: Record<ToolId, string> = {
  pencil: 'B',
  eraser: 'E',
  fill: 'G',
  eyedropper: 'I',
};

export class EditorPanel {
  readonly element: HTMLElement;

  readonly #scope = new DisposableScope();
  readonly #options: EditorPanelOptions;
  readonly #title: HTMLSpanElement;
  readonly #status: HTMLSpanElement;
  readonly #stage: HTMLDivElement;
  readonly #colorPicker: ColorPicker;
  readonly #brush: Slider;
  readonly #toolbar: Toolbar;
  readonly #undoButton: HTMLButtonElement;
  readonly #redoButton: HTMLButtonElement;
  readonly #fitButton: HTMLButtonElement;
  readonly #actualSizeButton: HTMLButtonElement;
  readonly #saveButton: HTMLButtonElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #conflictBar: HTMLDivElement;
  readonly #conflictText: HTMLSpanElement;
  readonly #reloadButton: HTMLButtonElement;
  readonly #layerPanel: LayerPanel;
  readonly #palettePanel: PalettePanel;
  readonly #sidebar: HTMLElement;
  readonly #splitPane: SplitPane;
  #panelTimer: CancellableDisposable | null = null;
  #lastState: DocumentSessionState | null = null;
  #t: Translate;
  #asset: AssetSummary | null = null;
  #session: DocumentSession | null = null;
  #editor: PixelEditor | null = null;
  #request: AbortController | null = null;
  #saveRequest: AbortController | null = null;

  public constructor(options: EditorPanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = element('span', { className: 'editor-panel__title' });
    this.#status = element('span', { className: 'editor-panel__status' });
    this.#closeButton = this.#iconButton('close', 'close', () => options.onClose());

    // Araç seçimi CORE `Toolbar`: roving tabindex, tek seçim ve ARIA onun
    // sözleşmesinde. Elle `aria-pressed` yönetmek bu davranışı kaybettiriyordu.
    this.#toolbar = new Toolbar({
      ariaLabel: options.t('editor.toolsLabel'),
      orientation: 'vertical',
      selectionMode: 'single',
      value: 'pencil',
      items: TOOL_ORDER.map((id) => ({
        id,
        icon: TOOL_ICONS[id],
        label: options.t(`editor.tools.${id}`),
        shortcut: TOOL_SHORTCUTS[id],
      })),
      onChange: (value) => {
        if (typeof value === 'string') this.#editor?.setActiveTool(value as ToolId);
      },
    });
    this.#toolbar.element.classList.add('editor-panel__tools');
    for (const id of TOOL_ORDER) {
      const button = this.#toolbar.getButton(id)?.element;
      if (button) {
        button.classList.add('editor-panel__tool');
        button.dataset.tool = id;
      }
    }

    // Renk seçimi CORE `ColorPicker`: ham `<input type="color">` tarayıcının
    // kendi diyaloğunu açardı — VOL teması, fontları ve i18n'i olmayan,
    // uygulamaya hiç benzemeyen bir pencere. `ColorPicker` artık kendi
    // içinde de yerli seçici KULLANMAZ (bkz. ColorPicker.ts sınıf dokümanı).
    this.#colorPicker = new ColorPicker({
      value: '#ffffff',
      label: options.t('editor.color'),
      onInput: (value) => this.#editor?.setPrimaryColor(fromHex(value)),
    });
    this.#colorPicker.element.classList.add('editor-panel__color');

    this.#brush = new Slider({
      min: 1,
      max: 16,
      step: 1,
      value: 1,
      label: options.t('editor.brush'),
      formatValue: (value) => this.#t('editor.pixels', { value: Math.round(value) }),
      onInput: (value) => this.#editor?.setBrushSize(value),
    });
    this.#brush.element.classList.add('editor-panel__brush');

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

    this.#layerPanel = new LayerPanel({
      t: (key, opts) => this.#t(key, opts),
      onSelect: (layerId) => this.#session?.setActiveLayer(layerId),
      onToggleVisible: (layerId, visible) =>
        this.#session?.updateLayer(layerId, { visible }, this.#t('editor.layerVisible')),
      onOpacity: (layerId, opacity) =>
        this.#session?.updateLayer(layerId, { opacity }, this.#t('editor.layerOpacity')),
      onBlendMode: (layerId, blendMode) =>
        this.#session?.updateLayer(layerId, { blendMode }, this.#t('editor.layerBlend')),
      onAdd: () => this.#session?.addLayer(),
      onRemove: (layerId) => this.#session?.removeLayer(layerId),
      onMove: (layerId, direction) => this.#session?.moveLayer(layerId, direction),
      onMergeDown: (layerId) => this.#session?.mergeLayerDown(layerId),
    });

    this.#palettePanel = new PalettePanel({
      t: (key, opts) => this.#t(key, opts),
      onPick: (hex) => {
        this.#colorPicker.setValue(hex);
        this.#editor?.setPrimaryColor(fromHex(hex));
      },
      onReplace: (from, to) =>
        this.#applyBufferEdit(this.#t('editor.palette'), (buffer) =>
          replaceColor(buffer, fromHex(from), fromHex(to)),
        ),
      onQuantize: (palette, dither) =>
        this.#applyBufferEdit(this.#t('editor.quantize'), (buffer) =>
          quantizeToPalette(buffer, {
            palette,
            ...(dither ? { dither: 'bayer4' as const, ditherAmount: 0.6 } : {}),
          }),
        ),
    });

    this.#sidebar = element('aside', {
      className: 'editor-panel__sidebar',
      children: [this.#layerPanel.element, this.#palettePanel.element],
    });
    const settings = element('div', {
      className: 'editor-panel__settings',
      children: [
        this.#colorPicker.element,
        this.#brush.element,
        this.#fitButton,
        this.#actualSizeButton,
      ],
    });
    const workspace = element('div', {
      className: 'editor-panel__workspace',
      children: [settings, this.#stage],
    });
    this.#splitPane = new SplitPane({
      primary: workspace,
      secondary: this.#sidebar,
      initialSize: Math.max(480, (typeof window === 'undefined' ? 1024 : window.innerWidth) - 320),
      minPrimary: 420,
      minSecondary: 272,
      onCommit: (size) => storeEditorPrimarySize(size),
      className: 'editor-panel__split',
    });
    const storedSize = readEditorPrimarySize();
    if (storedSize !== null) this.#splitPane.setSize(storedSize);

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
              className: 'editor-panel__actions',
              children: [this.#undoButton, this.#redoButton, this.#saveButton, this.#closeButton],
            }),
          ],
        }),
        this.#conflictBar,
        element('div', {
          className: 'editor-panel__body',
          children: [this.#toolbar.element, this.#splitPane.element],
        }),
      ],
    });
    this.#scope.addListener(window, 'keydown', (event) =>
      this.#handleKeydown(event as KeyboardEvent),
    );
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
    this.#layerPanel.setTranslator(t);
    this.#palettePanel.setTranslator(t);
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
        t: (key, options) => this.#t(key, options),
        onChange: (state) => {
          if (this.#session === session) this.#applyState(state);
        },
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
          this.#colorPicker.setValue(toHex(color));
        },
      });
      this.#editor.setPrimaryColor(fromHex(this.#colorPicker.getValue()));
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
    this.#toolbar.setValue(id);
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
    if (session === null || asset === null || this.#saveRequest !== null || !session.isDirty)
      return;
    // Kodlama başlamadan gesture tamamlanır; geçmişte olmayan piksel kaydedilmez.
    this.#editor?.cancelGesture();
    const token = session.stateToken;
    const revision = session.revision;
    const request = new AbortController();
    this.#saveRequest = request;
    this.#saveButton.disabled = true;
    this.#status.textContent = this.#t('editor.saving');
    try {
      const png = await encodePng(session.composite());
      if (request.signal.aborted) return;
      const response = await this.#options.client.saveRaster(asset, revision, png, request.signal);
      if (request.signal.aborted) return;
      const result = response.results[0];
      session.markSaved(result.revision, token);
      this.#options.onSaved(asset.id, result.revision);
      this.#options.onToast(this.#t('editor.saved'));
    } catch (error) {
      if (request.signal.aborted) return;
      this.#syncState();
      this.#status.textContent = this.#errorText(error);
      this.#options.onToast(this.#errorText(error));
    } finally {
      if (this.#saveRequest === request) {
        this.#saveRequest = null;
        this.#saveButton.disabled = !session.isDirty;
      }
    }
  }

  public close(): void {
    this.#teardownDocument();
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('editor-panel--open');
  }

  public destroy(): void {
    this.close();
    this.#toolbar.destroy();
    this.#colorPicker.destroy();
    this.#brush.destroy();
    this.#layerPanel.destroy();
    this.#palettePanel.destroy();
    this.#splitPane.destroy();
    this.#scope.dispose();
    this.element.remove();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    const action = editorShortcut(event);
    if (action === null) return;
    event.preventDefault();
    const commands = {
      save: () => void this.save(),
      undo: () => this.#session?.undo(),
      redo: () => this.#session?.redo(),
      pencil: () => this.setTool('pencil'),
      eraser: () => this.setTool('eraser'),
      fill: () => this.setTool('fill'),
      eyedropper: () => this.setTool('eyedropper'),
      fit: () => this.#editor?.fit(),
      actualSize: () => this.#editor?.actualSize(),
      brushDown: () => this.#stepBrush(-1),
      brushUp: () => this.#stepBrush(1),
      cancel: () => this.#editor?.cancelGesture(),
    };
    commands[action]();
  }

  #stepBrush(direction: number): void {
    this.#brush.setValue(this.#brush.getValue() + direction);
    this.#editor?.setBrushSize(this.#brush.getValue());
  }

  /** Palet işlemi yalnız aktif yüzeye yazılır; diğer katmanlar korunur. */
  #applyBufferEdit(label: string, transform: (buffer: RasterBuffer) => RasterBuffer): void {
    const session = this.#session;
    if (session === null) return;
    const surface = session.surface;
    const before = { width: surface.width, height: surface.height, rgba: surface.toRgba() };
    const after = transform(before);
    const recorder = new StrokeRecorder(surface);
    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const index = (y * surface.width + x) * 4;
        recorder.setPixel(x, y, {
          r: after.rgba[index],
          g: after.rgba[index + 1],
          b: after.rgba[index + 2],
          a: after.rgba[index + 3],
        });
      }
    }
    const command = recorder.toCommand({ label });
    if (command !== null) session.record(command);
    this.#editor?.requestRender();
  }

  public renderLabels(): void {
    this.#saveButton.textContent = this.#t('editor.save');
    this.#saveButton.title = this.#t('editor.pngLayers');
    this.#labelButton(this.#undoButton, 'editor.undo');
    this.#labelButton(this.#redoButton, 'editor.redo');
    this.#labelButton(this.#fitButton, 'editor.fit');
    this.#labelButton(this.#actualSizeButton, 'editor.actualSize');
    this.#labelButton(this.#closeButton, 'editor.close');
    this.#toolbar.element.setAttribute('aria-label', this.#t('editor.toolsLabel'));
    this.#colorPicker.setLabel(this.#t('editor.color'));
    this.#colorPicker.element.setAttribute('aria-label', this.#t('editor.color'));
    this.#brush.setLabel(this.#t('editor.brush'));
    this.#brush.element.setAttribute('aria-label', this.#t('editor.brush'));
    this.#reloadButton.textContent = this.#t('editor.reloadFromDisk');
    for (const id of TOOL_ORDER) {
      const button = this.#toolbar.getButton(id)?.element;
      if (button === undefined) continue;
      const label = this.#t(`editor.tools.${id}`);
      button.setAttribute('aria-label', label);
      button.title = `${label} (${TOOL_SHORTCUTS[id]})`;
    }
  }

  #teardownDocument(): void {
    if (this.#panelTimer !== null) {
      this.#panelTimer.cancel();
      this.#panelTimer = null;
    }
    this.#lastState = null;
    this.#saveRequest?.abort();
    this.#saveRequest = null;
    this.#request?.abort();
    this.#request = null;
    this.#editor?.destroy();
    this.#editor = null;
    this.#session = null;
    this.#asset = null;
    replaceChildren(this.#stage);
    this.#conflictBar.hidden = true;
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
    this.#lastState = state;
    this.#undoButton.disabled = !state.canUndo;
    this.#redoButton.disabled = !state.canRedo;
    this.#saveButton.disabled = this.#saveRequest !== null || !state.dirty;
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
    this.#editor?.requestRender();
    this.#schedulePanelRefresh();
  }

  /** Pahalı panel yenilemesini geciktirir; hızlı ardışık değişimler tek sefere iner. */
  #schedulePanelRefresh(): void {
    if (this.#panelTimer !== null) this.#panelTimer.cancel();
    this.#panelTimer = this.#scope.addTimeout(() => {
      this.#panelTimer = null;
      this.#refreshPanels();
    }, PANEL_REFRESH_DELAY_MS);
  }

  #refreshPanels(): void {
    const session = this.#session;
    const state = this.#lastState;
    if (session === null || state === null) return;
    this.#layerPanel.setLayers(state.layers, state.activeLayerId, (layerId) => {
      const layer = session.document.get(layerId);
      return layer === null
        ? null
        : {
            width: session.document.width,
            height: session.document.height,
            rgba: layer.surface.toRgba(),
          };
    });
    this.#palettePanel.update(session.composite());
  }

  #syncState(): void {
    if (this.#session !== null) this.#applyState(this.#session.getState());
  }

  #errorText(error: unknown): string {
    const code = error instanceof AssetStudioApiError ? error.code : 'request_failed';
    return this.#t(`errors.${code}`);
  }
}
