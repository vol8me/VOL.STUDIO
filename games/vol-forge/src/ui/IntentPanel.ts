import { Button, DisposableScope, TextArea } from '@volstudio/core';
import { VISUAL_PRESET_CATALOG, type VisualPresetId } from '@volstudio/core/visual';
import { ChildScope, el, t } from './dom';

export interface IntentApplyRequest {
  readonly prompt: string;
  readonly preset?: VisualPresetId;
}

export type IntentFeedback =
  | { readonly kind: 'object'; readonly object: 'worm' }
  | { readonly kind: 'preset'; readonly preset: VisualPresetId }
  | { readonly kind: 'modifiers' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'empty' };

export type ApplyIntent = (request: IntentApplyRequest) => IntentFeedback;

const PRESET_IDS = Object.keys(VISUAL_PRESET_CATALOG) as VisualPresetId[];
const LIVE_DELAY_MS = 320;
const PRESET_GLYPHS: Record<VisualPresetId, string> = {
  brushedSurface: '▰',
  terrainCells: '▦',
  organicCluster: '♧',
  liquidRipples: '≋',
  cutMineral: '◆',
  structureGrid: '▥',
  softGlow: '✦',
};

/** Yazılan niyeti gecikmeli, katalog kartını ise anında canlı akışa uygular. */
export class IntentPanel {
  readonly element: HTMLDivElement;
  private readonly prompt: TextArea;
  private readonly status: HTMLDivElement;
  private readonly cards = new Map<VisualPresetId, HTMLButtonElement>();
  private readonly lifecycle = new DisposableScope();
  private readonly scope = new ChildScope();
  private selected: VisualPresetId | null = null;
  private liveTimer: number | null = null;

  constructor(private readonly onApply: ApplyIntent) {
    this.element = el('div', 'vf-intent');
    this.element.appendChild(el('h1', 'vf-intent__title', t('intent.title')));
    this.element.appendChild(el('p', 'vf-intent__lead', t('intent.lead')));

    const promptLabel = el('label', 'vf-intent__prompt-label');
    promptLabel.appendChild(el('span', undefined, t('intent.promptLabel')));
    this.prompt = this.scope.add(
      new TextArea({
        rows: 4,
        maxLength: 240,
        placeholder: t('intent.promptPlaceholder'),
        onInput: () => this.scheduleLiveApply(),
      }),
    );
    this.prompt.element.classList.add('vf-intent__prompt');
    promptLabel.appendChild(this.prompt.element);
    this.element.appendChild(promptLabel);

    this.status = el('div', 'vf-intent__status');
    this.status.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.status);

    this.element.appendChild(el('h2', 'vf-intent__catalog-title', t('intent.catalogTitle')));
    const catalog = el('div', 'vf-intent__catalog');
    for (const id of PRESET_IDS) catalog.appendChild(this.buildCard(id));
    this.element.appendChild(catalog);

    const onKeydown = (rawEvent: Event): void => {
      const event = rawEvent as KeyboardEvent;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.applyPromptNow();
      }
    };
    this.lifecycle.addListener(this.prompt.element, 'keydown', onKeydown);
    this.renderSelection();
  }

  focusPrompt(): void {
    this.prompt.focus();
  }

  destroy(): void {
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.lifecycle.dispose();
    this.scope.clear();
    this.element.remove();
  }

  private buildCard(id: VisualPresetId): HTMLButtonElement {
    const card = this.scope.add(
      new Button(t(`preset.${id}.name`), {
        size: 'sm',
        iconLeft: PRESET_GLYPHS[id],
        onClick: () => this.applyPreset(id),
      }),
    );
    card.element.classList.add('vf-intent__card');
    card.element.dataset.preset = id;
    card.element.title = t(`preset.${id}.description`);
    this.cards.set(id, card.element);
    return card.element;
  }

  private scheduleLiveApply(): void {
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    const value = this.prompt.getValue().trim();
    if (value.length === 0) {
      this.liveTimer = null;
      this.showFeedback({ kind: 'empty' });
      return;
    }
    this.status.dataset.tone = 'working';
    this.status.textContent = t('intent.reading');
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = null;
      this.applyPromptNow();
    }, LIVE_DELAY_MS);
  }

  private applyPreset(id: VisualPresetId): void {
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.selected = id;
    this.renderSelection();
    this.showFeedback(this.onApply({ preset: id, prompt: this.prompt.getValue().trim() }));
  }

  private applyPromptNow(): void {
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.showFeedback(this.onApply({ prompt: this.prompt.getValue().trim() }));
  }

  private showFeedback(feedback: IntentFeedback): void {
    this.status.dataset.tone = feedback.kind === 'unknown' ? 'warning' : 'success';
    switch (feedback.kind) {
      case 'object':
        this.selected = null;
        this.status.textContent = t(`object.${feedback.object}.applied`);
        break;
      case 'preset':
        this.selected = feedback.preset;
        this.status.textContent = t('intent.matched', {
          name: t(`preset.${feedback.preset}.name`),
        });
        break;
      case 'modifiers':
        this.status.textContent = t('intent.modifiersApplied');
        break;
      case 'unknown':
        this.selected = null;
        this.status.textContent = t('intent.unknown');
        break;
      case 'empty':
        this.status.textContent = '';
        break;
    }
    this.renderSelection();
  }

  private renderSelection(): void {
    for (const [id, card] of this.cards) {
      const selected = id === this.selected;
      card.classList.toggle('vf-intent__card--selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
  }
}
