import { Accordion, DisposableScope, IconButton } from '@volstudio/core';
import {
  collectSpriteDocIssues,
  type PresetCategory,
  type SpriteDoc,
} from '@volstudio/core/visual';
import { resolveVisualIntent, type VisualIntentResolution } from './intent/resolveVisualIntent';
import { PreviewRenderer } from './preview/PreviewRenderer';
import { DocumentStore, type ChangeOptions } from './state/DocumentStore';
import { FullscreenControl } from './ui/FullscreenControl';
import { IntentPanel, type IntentApplyRequest, type IntentFeedback } from './ui/IntentPanel';
import { OutputPanel } from './ui/OutputPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { QuickControlsPanel } from './ui/QuickControlsPanel';
import { SavePanel } from './ui/SavePanel';
import { el, t } from './ui/dom';

/**
 * VOL Forge tek ekran ürün kabuğu.
 *
 * Teknik ağaç, katman, kanal ve kip yüzeyi yoktur. Kullanıcının tek akışı
 * niyet → canlı CORE sonucu → temel çıktı kararları → ortak CLI hattından
 * kayıttır. Aynı belge geçmişi geri al/yinele için korunur.
 */
export class Editor {
  readonly element: HTMLDivElement;
  private readonly store: DocumentStore;
  private readonly preview = new PreviewRenderer();
  private readonly lifecycle = new DisposableScope();
  private readonly intent: IntentPanel;
  private readonly previewPanel = new PreviewPanel();
  private readonly quick: QuickControlsPanel;
  private readonly save: SavePanel;
  private readonly outputs: OutputPanel;
  private readonly outputAccordion: Accordion;
  private readonly fullscreen: FullscreenControl;
  private undoButton!: IconButton;
  private redoButton!: IconButton;
  private readonly validationStatus: HTMLDivElement;

  constructor(initial: SpriteDoc, initialCategory: PresetCategory = 'material') {
    this.store = new DocumentStore(initial);
    this.intent = new IntentPanel((request) => this.applyIntent(request));
    this.quick = new QuickControlsPanel(this.store, () => this.createVariation());
    this.save = new SavePanel(this.store, () => this.documentIssues().length > 0);
    this.save.setCategory(initialCategory);
    this.outputs = new OutputPanel((category, name, doc) =>
      this.loadSavedOutput(category, name, doc),
    );
    this.outputAccordion = new Accordion([
      {
        id: 'outputs',
        title: t('outputs.title'),
        content: { element: this.outputs.element },
      },
    ]);
    this.outputAccordion.element.classList.add('vf-output-accordion');
    this.fullscreen = new FullscreenControl();

    this.element = el('div', 'vf-app');
    this.element.appendChild(this.buildHeader());

    const main = el('div', 'vf-workspace');
    const left = el('aside', 'vf-column vf-column--intent');
    const center = el('main', 'vf-column vf-column--preview');
    const right = el('aside', 'vf-column vf-column--controls');
    left.appendChild(this.intent.element);
    center.appendChild(this.previewPanel.element);
    right.appendChild(this.quick.element);

    const saveCard = el('section', 'vf-save-card');
    saveCard.appendChild(el('h2', 'vf-panel-title', t('save.title')));
    saveCard.appendChild(this.save.element);
    right.appendChild(saveCard);
    right.appendChild(this.outputAccordion.element);
    this.validationStatus = el('div', 'vf-validation-status');
    this.validationStatus.setAttribute('role', 'alert');
    right.appendChild(this.validationStatus);

    main.append(left, center, right);
    this.element.appendChild(main);
  }

  start(): void {
    this.lifecycle.add({
      dispose: this.store.subscribe((_doc, options) => this.onDocChange(options)),
    });
    this.lifecycle.add({
      dispose: this.preview.subscribe((frame) => this.previewPanel.setFrame(frame)),
    });
    this.onDocChange({});
    this.intent.focusPrompt();
  }

  /** Açık tarifin salt-okunur anlık görüntüsü — entegrasyon ve test yüzeyi. */
  getDocument(): SpriteDoc {
    return this.store.get();
  }

  destroy(): void {
    this.lifecycle.dispose();
    this.preview.dispose();
    this.intent.destroy();
    this.previewPanel.destroy();
    this.quick.destroy();
    this.save.destroy();
    this.outputs.destroy();
    this.outputAccordion.destroy();
    this.fullscreen.destroy();
    this.undoButton.destroy();
    this.redoButton.destroy();
    this.element.remove();
  }

  private buildHeader(): HTMLElement {
    const header = el('header', 'vf-header');
    const brand = el('div', 'vf-brand');
    brand.appendChild(el('div', 'vf-brand__name', t('app.title')));
    brand.appendChild(el('div', 'vf-brand__pipeline', t('app.pipeline')));
    header.appendChild(brand);

    const history = el('div', 'vf-header__actions');
    this.undoButton = new IconButton('↶', {
      size: 'sm',
      label: t('app.undo'),
      onClick: () => {
        this.store.undo();
      },
    });
    this.redoButton = new IconButton('↷', {
      size: 'sm',
      label: t('app.redo'),
      onClick: () => {
        this.store.redo();
      },
    });
    history.append(this.undoButton.element, this.redoButton.element, this.fullscreen.element);
    header.appendChild(history);
    return header;
  }

  private applyIntent(request: IntentApplyRequest): IntentFeedback {
    const resolution = resolveVisualIntent({ ...request, current: this.store.get() });
    if ('doc' in resolution) {
      this.store.set(resolution.doc, { source: 'intent' });
      if ('category' in resolution) this.save.setCategory(resolution.category);
    }
    return this.feedbackFor(resolution);
  }

  private feedbackFor(resolution: VisualIntentResolution): IntentFeedback {
    switch (resolution.kind) {
      case 'object':
        return { kind: 'object', object: resolution.object };
      case 'preset':
        return { kind: 'preset', preset: resolution.preset };
      case 'modifiers':
        return { kind: 'modifiers' };
      case 'unknown':
        return { kind: 'unknown' };
      case 'empty':
        return { kind: 'empty' };
    }
  }

  /** Her tarifte gerçek piksel çıktısını etkileyen deterministik yeni tohum. */
  private createVariation(): void {
    const current = this.store.get();
    const seed = (Math.imul(current.seed, 1_664_525) + 1_013_904_223) | 0;
    this.store.set({ ...current, seed });
  }

  private loadSavedOutput(category: PresetCategory, name: string, doc: SpriteDoc): void {
    this.store.set(doc, { source: 'output' });
    this.save.setCategory(category);
    this.save.setName(name);
  }

  private onDocChange(options: ChangeOptions): void {
    if (options.source !== 'quick') this.quick.render();
    const issues = this.documentIssues();
    this.validationStatus.hidden = issues.length === 0;
    this.validationStatus.textContent =
      issues.length === 0 ? '' : t('issues.count', { count: issues.length });
    this.save.refresh();
    this.undoButton.setDisabled(!this.store.canUndo);
    this.redoButton.setDisabled(!this.store.canRedo);
    if (issues.length === 0) this.preview.request(this.store.get());
  }

  private documentIssues(): string[] {
    return collectSpriteDocIssues(this.store.get());
  }
}
