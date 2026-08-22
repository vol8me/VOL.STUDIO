import type { SpriteDoc } from '@volstudio/core/visual';
import { DocumentStore } from './state/DocumentStore';
import { EditorState } from './state/editorState';
import { PreviewRenderer } from './preview/PreviewRenderer';
import { LayerPanel } from './ui/LayerPanel';
import { TreePanel } from './ui/TreePanel';
import { ParamPanel } from './ui/ParamPanel';
import { DocumentPanel } from './ui/DocumentPanel';
import { PalettePanel } from './ui/PalettePanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { IssuePanel } from './ui/IssuePanel';
import { SavePanel } from './ui/SavePanel';
import { el, section, t } from './ui/dom';

/**
 * Editör kabuğu — panelleri kurar ve tek yönlü akışı bağlar.
 *
 * Akış her zaman aynı yönde: **belge değişir → paneller yeniden çizilir →
 * önizleme istenir.** Panellerin birbirini doğrudan güncellemesine izin
 * verilmez; iki yönlü bağlanma, hangi panelin neyi bozduğunu izlenemez yapar.
 */
export class Editor {
  readonly element: HTMLDivElement;
  private readonly store: DocumentStore;
  private readonly state = new EditorState();
  private readonly preview = new PreviewRenderer();

  private readonly layers: LayerPanel;
  private readonly tree: TreePanel;
  private readonly params: ParamPanel;
  private readonly document: DocumentPanel;
  private readonly palette: PalettePanel;
  private readonly previewPanel: PreviewPanel;
  private readonly issues: IssuePanel;
  private readonly save: SavePanel;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(initial: SpriteDoc) {
    this.store = new DocumentStore(initial);
    this.layers = new LayerPanel(this.store, this.state);
    this.tree = new TreePanel(this.store, this.state);
    this.params = new ParamPanel(this.store, this.state);
    this.document = new DocumentPanel(this.store);
    this.palette = new PalettePanel(this.store);
    this.previewPanel = new PreviewPanel(this.state);
    this.issues = new IssuePanel(this.store, this.state);
    this.save = new SavePanel(this.store, () => this.issues.hasIssues);

    this.element = el('div', 'vf-app');

    const left = el('div', 'vf-column vf-column--left');
    const layerSection = section(t('section.layers'));
    layerSection.body.appendChild(this.layers.element);
    const treeSection = section(t('section.tree'));
    treeSection.body.appendChild(this.tree.element);
    left.appendChild(layerSection.element);
    left.appendChild(treeSection.element);

    const center = el('div', 'vf-column vf-column--center');
    center.appendChild(this.previewPanel.buildChannelBar());
    center.appendChild(this.previewPanel.element);

    const right = el('div', 'vf-column vf-column--right');
    const paramSection = section(t('section.params'));
    paramSection.body.appendChild(this.params.element);
    const docSection = section(t('section.document'));
    docSection.body.appendChild(this.document.element);
    right.appendChild(paramSection.element);
    right.appendChild(docSection.element);

    const main = el('div', 'vf-main');
    main.appendChild(left);
    main.appendChild(center);
    main.appendChild(right);

    const bottom = el('div', 'vf-bottom');
    const paletteSection = section(t('section.palette'));
    paletteSection.body.appendChild(this.palette.element);
    const issueSection = section(t('section.issues'));
    issueSection.body.appendChild(this.issues.element);
    const saveSection = section(t('section.save'));
    saveSection.body.appendChild(this.save.element);
    bottom.appendChild(paletteSection.element);
    bottom.appendChild(issueSection.element);
    bottom.appendChild(saveSection.element);

    this.element.appendChild(main);
    this.element.appendChild(bottom);
  }

  start(): void {
    this.unsubscribe.push(this.store.subscribe(() => this.onDocChange()));
    this.unsubscribe.push(this.state.subscribe(() => this.onStateChange()));
    this.unsubscribe.push(this.preview.subscribe((frame) => this.previewPanel.setFrame(frame)));
    this.onDocChange();
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.preview.dispose();
    this.layers.destroy();
    this.tree.destroy();
    this.params.destroy();
    this.document.destroy();
    this.palette.destroy();
    this.previewPanel.destroy();
    this.issues.destroy();
    this.save.destroy();
    this.element.remove();
  }

  private onDocChange(): void {
    this.layers.render();
    this.tree.render();
    this.params.render();
    this.document.render();
    this.palette.render();
    this.issues.render();
    this.save.refresh();
    // Geçersiz bir belge render EDİLMEZ; hata paneli zaten neyin yanlış
    // olduğunu söylüyor ve her karede aynı istisnayı yakalamak boşa iş.
    if (!this.issues.hasIssues) this.preview.request(this.store.get());
  }

  private onStateChange(): void {
    this.layers.render();
    this.tree.render();
    this.params.render();
    this.previewPanel.render();
  }
}
