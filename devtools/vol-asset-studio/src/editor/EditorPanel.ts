import { DisposableScope } from '@volstudio/core/lifecycle';
import { ColorPicker, Slider, SplitPane, Toolbar } from '@volstudio/core/ui';
import type { AssetSummary } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../api/AssetStudioClient';
import { element, replaceChildren } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { DocumentSession, type DocumentSessionState } from './DocumentSession';
import { fromHex as paletteFromHex, quantizeToPalette, replaceColor } from './Palette';
import { PixelEditor } from './PixelEditor';
import type { Rgba } from './RasterSurface';
import type { RasterBuffer } from './transform';
import { StrokeRecorder } from './StrokeRecorder';
import { FramePanel } from './panels/FramePanel';
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
  readonly #framePanel: FramePanel;
  readonly #palettePanel: PalettePanel;
  readonly #sidebar: HTMLElement;
  readonly #splitPane: SplitPane;
  #playbackTimer: ReturnType<typeof setTimeout> | null = null;
  #panelTimer: ReturnType<typeof setTimeout> | null = null;
  #lastState: DocumentSessionState | null = null;
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

    // Renk seçimi CORE `ColorPicker`: ham `<input type="color">` TARAYICININ
    // kendi diyaloğunu açıyordu — VOL teması, fontları ve i18n'i olmayan,
    // uygulamaya hiç benzemeyen bir pencere.
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
      formatValue: (value) => `${Math.round(value)} px`,
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

    this.#framePanel = new FramePanel({
      t: (key, opts) => this.#t(key, opts),
      onSelect: (index) => this.#session?.setActiveFrame(index),
      onAdd: (copyCurrent) => this.#session?.addFrame(copyCurrent),
      onRemove: (index) => this.#session?.removeFrame(index),
      onDuration: (index, durationMs) => this.#session?.setFrameDuration(index, durationMs),
      onOnionSkin: (before, after) => this.#editor?.setOnionSkin(before, after),
      onPlayToggle: (playing) => this.#setPlayback(playing),
    });

    this.#palettePanel = new PalettePanel({
      t: (key, opts) => this.#t(key, opts),
      onPick: (hex) => {
        this.#colorPicker.setValue(hex);
        this.#editor?.setPrimaryColor(paletteFromHex(hex));
      },
      onReplace: (from, to) =>
        this.#applyBufferEdit(this.#t('editor.palette'), (buffer) =>
          replaceColor(buffer, paletteFromHex(from), paletteFromHex(to)),
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
      children: [settings, this.#stage, this.#framePanel.element],
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
    this.#framePanel.setTranslator(t);
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
      const response = await this.#options.client.saveRaster(asset, session.revision, png);
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
    this.#toolbar.destroy();
    this.#colorPicker.destroy();
    this.#brush.destroy();
    this.#layerPanel.destroy();
    this.#framePanel.destroy();
    this.#palettePanel.destroy();
    this.#splitPane.destroy();
    this.#scope.dispose();
    this.element.remove();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }
    const key = event.key.toLocaleLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (command && key === 's') {
      event.preventDefault();
      void this.save();
      return;
    }
    if (command && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.#session?.redo();
      else this.#session?.undo();
      return;
    }
    const tool =
      key === 'b'
        ? 'pencil'
        : key === 'e'
        ? 'eraser'
        : key === 'g'
        ? 'fill'
        : key === 'i'
        ? 'eyedropper'
        : null;
    if (tool !== null) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }
    if (key === 'f') {
      event.preventDefault();
      this.#editor?.fit();
    } else if (key === '1') {
      event.preventDefault();
      this.#editor?.actualSize();
    } else if (key === '[' || key === ']') {
      event.preventDefault();
      const next = this.#brush.getValue() + (key === '[' ? -1 : 1);
      this.#brush.setValue(next);
      this.#editor?.setBrushSize(next);
    } else if (key === 'escape') {
      this.#editor?.cancelGesture();
    }
  }

  /**
   * Bütün bileşiği dönüştüren işlemleri tek undo adımına indirir.
   *
   * Palet indirgeme ve renk değiştirme AKTİF KATMANA uygulanır; bileşiğe
   * yazmak alttaki katmanları düzleştirir ve kullanıcının katman ayrımını
   * sessizce yok ederdi.
   */
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

  /** Kare önizlemesi: her karenin kendi süresiyle ilerler. */
  #setPlayback(playing: boolean): void {
    if (this.#playbackTimer !== null) {
      clearTimeout(this.#playbackTimer);
      this.#playbackTimer = null;
    }
    if (!playing) return;
    const step = (): void => {
      const session = this.#session;
      if (session === null || !this.#framePanel.isPlaying) return;
      const next = (session.document.activeFrameIndex + 1) % session.document.frameCount;
      session.setActiveFrame(next);
      this.#editor?.requestRender();
      const frame = session.document.frameAt(next);
      this.#playbackTimer = setTimeout(step, frame?.durationMs ?? 100);
    };
    this.#playbackTimer = setTimeout(step, 100);
  }

  public renderLabels(): void {
    this.#saveButton.textContent = this.#t('editor.save');
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
    this.#framePanel.stopPlayback();
    if (this.#panelTimer !== null) {
      clearTimeout(this.#panelTimer);
      this.#panelTimer = null;
    }
    this.#lastState = null;
    if (this.#playbackTimer !== null) {
      clearTimeout(this.#playbackTimer);
      this.#playbackTimer = null;
    }
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

  /**
   * Ucuz durum: her değişimde koşar.
   *
   * Pahalı panel yenilemesi (katman ve kare küçük önizlemeleri, palet taraması)
   * BURADA YAPILMAZ. Bir dönem yapılıyordu ve tek fırça darbesi 1024² belgede
   * 700 ms sürüyordu: darbe boyunca her hareket tam bileşik, her katman için
   * tam tampon kopyası ve 1M piksellik palet taraması tetikliyordu. Pahalı iş
   * artık gecikmeli ve yalnız gesture bittikten sonra koşar.
   */
  #applyState(state: DocumentSessionState): void {
    this.#lastState = state;
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
    this.#editor?.requestRender();
    this.#schedulePanelRefresh();
  }

  /** Pahalı panel yenilemesini geciktirir; hızlı ardışık değişimler tek sefere iner. */
  #schedulePanelRefresh(): void {
    if (this.#panelTimer !== null) clearTimeout(this.#panelTimer);
    this.#panelTimer = setTimeout(() => {
      this.#panelTimer = null;
      this.#refreshPanels();
    }, PANEL_REFRESH_DELAY_MS);
  }

  #refreshPanels(): void {
    const session = this.#session;
    const state = this.#lastState;
    if (session === null || state === null) return;
    this.#layerPanel.setLayers(state.layers, state.activeLayerId, (layerId) => ({
      width: session.document.width,
      height: session.document.height,
      rgba: session.document.celSurface(session.document.activeFrameIndex, layerId).toRgba(),
    }));
    const frame = session.document.frameAt(state.activeFrameIndex);
    this.#framePanel.setFrames(
      state.frameCount,
      state.activeFrameIndex,
      frame?.durationMs ?? 100,
      (index) => session.document.compositeFrame(index),
    );
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
