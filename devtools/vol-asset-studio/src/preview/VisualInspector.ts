import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  analyzeSpriteDoc,
  measureSprite,
  renderSprite,
  type RenderResult,
  type VisualSpriteAnalysis,
} from '@volstudio/core/visualSynth';
import type { AssetSummary } from '../../shared/index';
import type { AssetStudioClient } from '../api/AssetStudioClient';
import type { Translate } from '../catalog/AssetLibrary';
import { element, replaceChildren } from '../ui/dom';
import { icon } from '../ui/icons';

export interface VisualInspectorOptions {
  client: AssetStudioClient;
  t: Translate;
  onClose: () => void;
}

type InspectorView = 'rgba' | 'alpha' | 'coverage' | 'height' | 'shade' | 'glow';

const PREVIEW_EDGES = [64, 128, 256] as const;

const METRIC_KEYS: Readonly<Record<string, string>> = {
  finiteValues: 'finiteValues',
  channelBounds: 'channelBounds',
  paletteCompliance: 'paletteCompliance',
  alphaPurity: 'alphaPurity',
  colorCount: 'colorCount',
  scatterHealth: 'scatterHealth',
  outlineContinuity: 'outlineContinuity',
  contrast: 'contrast',
  banding: 'banding',
};

const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  source: 'source',
  height: 'height',
  mask: 'mask',
  materialMask: 'materialMask',
};

/**
 * VisualSynth tarifini düzenlemeye çevirmeden inceleyen kullanıcı yüzeyi.
 *
 * Asset Studio'nun piksel editöründen ayrıdır: burada kaynak JSON, graph
 * maliyeti, QA ve gerçek render profili birlikte görülür; kullanıcı pikselleri
 * değiştiremez ve bu panel hiçbir dosyaya yazmaz.
 */
export class VisualInspector {
  readonly element: HTMLElement;

  private readonly scope = new DisposableScope();
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly renderButton: HTMLButtonElement;
  private readonly viewSelect: HTMLSelectElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly status: HTMLParagraphElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly structure: HTMLDivElement;
  private readonly qa: HTMLDivElement;
  private readonly performance: HTMLDivElement;
  private readonly capabilities: HTMLDivElement;
  private readonly previewLabel: HTMLLabelElement;
  private readonly sizeLabel: HTMLLabelElement;
  private readonly statusLabel: HTMLSpanElement;

  private t: Translate;
  private asset: AssetSummary | null = null;
  private document: unknown = null;
  private analysis: VisualSpriteAnalysis | null = null;
  private result: RenderResult | null = null;
  private request: AbortController | null = null;

  constructor(private readonly options: VisualInspectorOptions) {
    this.t = options.t;
    this.title = element('h2', { className: 'visual-inspector__title' });
    this.subtitle = element('p', { className: 'visual-inspector__subtitle' });
    this.closeButton = element('button', {
      className: 'visual-inspector__close',
      attrs: { type: 'button' },
      children: [icon('close')],
    });
    this.renderButton = element('button', {
      className: 'visual-inspector__render',
      attrs: { type: 'button' },
      children: [icon('refresh')],
    });
    this.viewSelect = element('select', { className: 'visual-inspector__select' });
    this.sizeSelect = element('select', { className: 'visual-inspector__select' });
    for (const edge of PREVIEW_EDGES) {
      this.sizeSelect.append(
        element('option', {
          attrs: { value: edge },
          children: [this.t('inspector.pixelSize', { value: edge })],
        }),
      );
    }
    this.sizeSelect.value = '128';
    this.status = element('p', {
      className: 'visual-inspector__status',
      attrs: { role: 'status' },
    });
    this.statusLabel = element('span', { className: 'visual-inspector__status-label' });
    this.canvas = element('canvas', {
      className: 'visual-inspector__canvas',
      attrs: { role: 'img' },
    });
    this.structure = element('div', { className: 'visual-inspector__section-body' });
    this.qa = element('div', { className: 'visual-inspector__section-body' });
    this.performance = element('div', { className: 'visual-inspector__section-body' });
    this.capabilities = element('div', { className: 'visual-inspector__section-body' });
    this.previewLabel = element('label', {
      className: 'visual-inspector__control',
      children: [this.viewSelect],
    });
    this.sizeLabel = element('label', {
      className: 'visual-inspector__control',
      children: [this.sizeSelect],
    });

    const header = element('header', {
      className: 'visual-inspector__header',
      children: [
        element('div', {
          className: 'visual-inspector__identity',
          children: [this.title, this.subtitle],
        }),
        this.closeButton,
      ],
    });
    const toolbar = element('div', {
      className: 'visual-inspector__toolbar',
      children: [
        this.previewLabel,
        this.sizeLabel,
        this.renderButton,
        element('div', {
          className: 'visual-inspector__toolbar-status',
          children: [this.statusLabel],
        }),
      ],
    });
    const preview = element('section', {
      className: 'visual-inspector__preview-panel',
      children: [this.canvas, this.status],
    });
    const side = element('aside', {
      className: 'visual-inspector__side',
      children: [
        this.section('structure', this.structure),
        this.section('qa', this.qa),
        this.section('performance', this.performance),
        this.section('capabilities', this.capabilities),
      ],
    });
    this.element = element('section', {
      className: 'visual-inspector',
      attrs: { 'aria-hidden': 'true', 'aria-label': this.t('inspector.title') },
      children: [
        header,
        toolbar,
        element('div', { className: 'visual-inspector__body', children: [preview, side] }),
      ],
    });

    this.scope.addListener(this.closeButton, 'click', () => options.onClose());
    this.scope.addListener(this.renderButton, 'click', () => void this.renderCurrent());
    this.scope.addListener(this.sizeSelect, 'change', () => void this.renderCurrent());
    this.scope.addListener(this.viewSelect, 'change', () => this.drawCanvas());
    this.renderLabels();
    this.setStatus('idle');
  }

  get isOpen(): boolean {
    return this.element.classList.contains('visual-inspector--open');
  }

  open(asset: AssetSummary): void {
    this.cancelPending();
    this.asset = asset;
    this.document = null;
    this.analysis = null;
    this.result = null;
    this.element.classList.add('visual-inspector--open');
    this.element.setAttribute('aria-hidden', 'false');
    this.title.textContent = asset.name;
    this.subtitle.textContent = asset.path;
    this.setStatus('loading');
    this.clearDataPanels();
    const request = new AbortController();
    this.request = request;
    void this.load(asset, request.signal);
  }

  close(): void {
    this.cancelPending();
    this.asset = null;
    this.element.classList.remove('visual-inspector--open');
    this.element.setAttribute('aria-hidden', 'true');
    this.setStatus('idle');
  }

  /** Açık belge diskten değiştiğinde eski graph/QA sonucunu tutmaz. */
  noteAssetChanged(asset: AssetSummary): void {
    if (this.isOpen && this.asset?.id === asset.id) this.open(asset);
  }

  setTranslator(t: Translate): void {
    this.t = t;
    this.renderLabels();
    if (this.analysis && this.result) {
      this.renderAnalysis();
      this.renderResultData();
    }
  }

  destroy(): void {
    this.cancelPending();
    this.scope.dispose();
    this.element.remove();
  }

  private async load(asset: AssetSummary, signal: AbortSignal): Promise<void> {
    try {
      const source = await this.options.client.getJsonContent<unknown>(asset, signal);
      if (signal.aborted || this.asset?.id !== asset.id) return;
      this.document = source;
      this.analysis = analyzeSpriteDoc(source);
      this.renderCurrent();
    } catch (error) {
      if (signal.aborted || this.asset?.id !== asset.id) return;
      this.clearDataPanels();
      this.setStatus('error', error instanceof Error ? error.message : String(error));
    }
  }

  private renderCurrent(): void {
    if (this.document === null || this.analysis === null) return;
    this.renderButton.disabled = true;
    this.setStatus('rendering');
    try {
      const maxEdge = Number(this.sizeSelect.value);
      const [sourceWidth, sourceHeight] = [this.analysis.width, this.analysis.height];
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(8, Math.round(sourceWidth * scale));
      const height = Math.max(8, Math.round(sourceHeight * scale));
      this.result = renderSprite(this.document, { size: [width, height], profile: true });
      this.drawCanvas();
      this.renderAnalysis();
      this.renderResultData();
      this.setStatus('ready');
    } catch (error) {
      this.result = null;
      this.clearDataPanels();
      this.setStatus('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.renderButton.disabled = false;
    }
  }

  private drawCanvas(): void {
    if (!this.result) return;
    const result = this.result;
    const image = new Uint8ClampedArray(result.width * result.height * 4);
    const view = this.viewSelect.value as InspectorView;
    for (let i = 0; i < result.width * result.height; i++) {
      const target = i * 4;
      if (view === 'rgba') {
        image.set(result.rgba.subarray(target, target + 4), target);
        continue;
      }
      const value = this.channelValue(view, i);
      const byte = Math.round(Math.max(0, Math.min(1, value)) * 255);
      image[target] = byte;
      image[target + 1] = byte;
      image[target + 2] = byte;
      image[target + 3] = 255;
    }
    this.canvas.width = result.width;
    this.canvas.height = result.height;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error(this.t('inspector.canvasUnavailable'));
    context.imageSmoothingEnabled = false;
    const imageData = context.createImageData(result.width, result.height);
    imageData.data.set(image);
    context.putImageData(imageData, 0, 0);
    this.canvas.setAttribute(
      'aria-label',
      this.t('inspector.previewLabel', { view: this.viewLabel(view) }),
    );
  }

  private channelValue(view: InspectorView, index: number): number {
    if (!this.result) return 0;
    switch (view) {
      case 'alpha':
        return this.result.rgba[index * 4 + 3] / 255;
      case 'coverage':
        return this.result.channels.coverage[index];
      case 'height':
        return this.result.channels.height[index];
      case 'shade':
        return this.result.shade[index];
      case 'glow':
        return this.result.glow?.[index] ?? 0;
      default:
        return 0;
    }
  }

  private renderLabels(): void {
    this.element.setAttribute('aria-label', this.t('inspector.title'));
    this.closeButton.setAttribute('aria-label', this.t('inspector.close'));
    this.renderButton.setAttribute('aria-label', this.t('inspector.render'));
    this.renderButton.title = this.t('inspector.render');
    this.previewLabel.setAttribute('aria-label', this.t('inspector.channel'));
    this.sizeLabel.setAttribute('aria-label', this.t('inspector.previewSize'));
    replaceChildren(
      this.previewLabel,
      element('span', { children: [this.t('inspector.channel')] }),
      this.viewSelect,
    );
    replaceChildren(
      this.sizeLabel,
      element('span', { children: [this.t('inspector.previewSize')] }),
      this.sizeSelect,
    );
    const selected = this.viewSelect.value as InspectorView;
    replaceChildren(
      this.viewSelect,
      ...(['rgba', 'alpha', 'coverage', 'height', 'shade', 'glow'] as InspectorView[]).map((view) =>
        element('option', {
          attrs: { value: view },
          children: [this.viewLabel(view)],
        }),
      ),
    );
    this.viewSelect.value = selected || 'rgba';
    for (const option of [...this.sizeSelect.options]) {
      option.textContent = this.t('inspector.pixelSize', { value: option.value });
    }
    if (this.analysis) this.renderAnalysis();
    if (this.result) this.renderResultData();
  }

  private renderAnalysis(): void {
    if (!this.analysis) return;
    const analysis = this.analysis;
    const list = element('dl', { className: 'visual-inspector__facts' });
    this.addFact(
      list,
      this.t('inspector.facts.documentSize'),
      `${analysis.width} × ${analysis.height}`,
    );
    this.addFact(list, this.t('inspector.facts.layers'), String(analysis.layerCount));
    this.addFact(list, this.t('inspector.facts.fieldNodes'), String(analysis.fieldNodeCount));
    this.addFact(
      list,
      this.t('inspector.facts.buffers'),
      String(analysis.requiredFullResolutionBuffers),
    );
    this.addFact(
      list,
      this.t('inspector.facts.memory'),
      formatBytes(analysis.estimatedPeakWorkingBytes),
    );
    replaceChildren(this.structure, list, this.layerTree());

    const capability = element('div', { className: 'visual-inspector__capability' });
    const mode = analysis.regionSupport.mode === 'region' ? 'region' : 'fullFrame';
    capability.append(
      element('p', {
        className: 'visual-inspector__capability-mode',
        children: [this.t(`inspector.region.${mode}`)],
      }),
    );
    if (analysis.regionSupport.haloPixels === null) {
      capability.append(element('p', { children: [this.t('inspector.region.haloUnknown')] }));
    } else {
      capability.append(
        element('p', {
          children: [
            this.t('inspector.region.halo', { pixels: analysis.regionSupport.haloPixels }),
          ],
        }),
      );
    }
    if (analysis.regionSupport.blockers.length > 0) {
      const blockers = element('ul', { className: 'visual-inspector__list' });
      for (const blocker of analysis.regionSupport.blockers) {
        blockers.append(element('li', { children: [this.blockerLabel(blocker)] }));
      }
      capability.append(blockers);
    }
    replaceChildren(this.capabilities, capability);
  }

  private renderResultData(): void {
    if (!this.result) return;
    const report = measureSprite(this.result);
    const qaList = element('ul', { className: 'visual-inspector__qa-list' });
    for (const metric of report.metrics) {
      const key = METRIC_KEYS[metric.id] ?? 'generic';
      qaList.append(
        element('li', {
          className: metric.pass ? 'visual-inspector__qa-pass' : 'visual-inspector__qa-fail',
          children: [
            element('span', {
              children: [metric.pass ? '✓' : '✗', this.t(`inspector.metrics.${key}`)],
            }),
            element('strong', { children: [formatNumber(metric.value)] }),
          ],
        }),
      );
    }
    replaceChildren(this.qa, qaList);

    const profile = this.result.profile;
    const performanceList = element('dl', { className: 'visual-inspector__facts' });
    if (profile) {
      for (const [key, value] of Object.entries({
        total: profile.totalMs,
        palette: profile.paletteMs,
        layers: profile.layersMs,
        shading: profile.shadingMs,
        outline: profile.outlineMs,
        glow: profile.glowMs,
        dither: profile.ditherMs,
        quantize: profile.quantizeMs,
      })) {
        this.addFact(performanceList, this.t(`inspector.stages.${key}`), `${value.toFixed(2)} ms`);
      }
    }
    replaceChildren(this.performance, performanceList);
  }

  private layerTree(): HTMLElement {
    const doc = this.document as { layers?: readonly unknown[] } | null;
    const tree = element('ul', { className: 'visual-inspector__tree', attrs: { role: 'tree' } });
    for (const layer of doc?.layers ?? []) {
      if (!layer || typeof layer !== 'object') continue;
      const record = layer as Record<string, unknown>;
      const item = element('li', { attrs: { role: 'treeitem' } });
      item.append(
        element('strong', {
          children: [displayTechnicalValue(record.id, this.t('inspector.unknown'))],
        }),
      );
      for (const key of Object.keys(FIELD_LABEL_KEYS)) {
        const field = record[key];
        if (!field || typeof field !== 'object' || Array.isArray(field)) continue;
        const fieldItem = element('ul', { className: 'visual-inspector__tree' });
        fieldItem.append(
          element('li', {
            children: [
              element('span', { children: [this.t(`inspector.fields.${FIELD_LABEL_KEYS[key]}`)] }),
              this.fieldTree(field, 1),
            ],
          }),
        );
        item.append(fieldItem);
      }
      tree.append(item);
    }
    return tree;
  }

  private fieldTree(value: object, depth: number): HTMLElement {
    const record = value as Record<string, unknown>;
    const node = element('span', {
      className: 'visual-inspector__node',
      children: [displayTechnicalValue(record.kind, this.t('inspector.unknown'))],
    });
    if (depth >= 4) return node;
    for (const child of Object.values(record)) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const childRecord = child as Record<string, unknown>;
      if (typeof childRecord.kind !== 'string') continue;
      node.append(
        element('span', {
          className: 'visual-inspector__node-child',
          children: [this.fieldTree(child, depth + 1)],
        }),
      );
    }
    return node;
  }

  private section(key: string, content: HTMLElement): HTMLElement {
    return element('section', {
      className: 'visual-inspector__section',
      children: [element('h3', { children: [this.t(`inspector.sections.${key}`)] }), content],
    });
  }

  private addFact(list: HTMLDListElement, label: string, value: string): void {
    list.append(
      element('div', {
        className: 'visual-inspector__fact',
        children: [element('dt', { children: [label] }), element('dd', { children: [value] })],
      }),
    );
  }

  private viewLabel(view: InspectorView): string {
    return this.t(`inspector.views.${view}`);
  }

  private blockerLabel(blocker: string): string {
    if (blocker.startsWith('buffered:')) {
      return this.t('inspector.blockers.buffered', { kind: blocker.slice('buffered:'.length) });
    }
    const [category, name] = blocker.split(':');
    return this.t(`inspector.blockers.${category}`, { kind: name ?? category });
  }

  private setStatus(
    state: 'idle' | 'loading' | 'rendering' | 'ready' | 'error',
    detail?: string,
  ): void {
    this.status.dataset.state = state;
    const message = detail ?? this.t(`inspector.status.${state}`);
    this.status.textContent = message;
    this.statusLabel.textContent = message;
  }

  private clearDataPanels(): void {
    replaceChildren(this.structure);
    replaceChildren(this.qa);
    replaceChildren(this.performance);
    replaceChildren(this.capabilities);
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  private cancelPending(): void {
    this.request?.abort();
    this.request = null;
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayTechnicalValue(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
