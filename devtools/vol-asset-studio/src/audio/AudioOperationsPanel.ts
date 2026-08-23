import { Button, Slider, Text } from '@volstudio/core/ui';
import type { AssetSummary, AudioEditOperation } from '../../shared/index';
import { element, replaceChildren } from '../ui/dom';
import type { Translate } from './AudioEditorPanel';
import type { WaveformData, WaveformSelection } from './WaveformView';

export interface AudioOperationsPanelOptions {
  t: Translate;
  formatTime: (seconds: number) => string;
  onPreviewGain: (decibels: number) => void;
  onChange: () => void;
}

export class AudioOperationsPanel {
  readonly element: HTMLElement;
  readonly controls: HTMLElement;
  readonly #options: AudioOperationsPanelOptions;
  readonly #title: Text;
  readonly #empty: Text;
  readonly #gain: Slider;
  readonly #addGainButton: Button;
  readonly #trimButton: Button;
  readonly #fadeInButton: Button;
  readonly #fadeOutButton: Button;
  readonly #normalizeButton: Button;
  readonly #reverseButton: Button;
  readonly #clearButton: Button;
  readonly #list: HTMLDivElement;
  #t: Translate;
  #asset: AssetSummary | null = null;
  #data: WaveformData | null = null;
  #selection: WaveformSelection = { startFrame: 0, endFrame: 0 };
  #operations: AudioEditOperation[] = [];

  public constructor(options: AudioOperationsPanelOptions) {
    this.#options = options;
    this.#t = options.t;
    this.#title = new Text(options.t('audio.operations'), { variant: 'heading', tag: 'h3' });
    this.#empty = new Text(options.t('audio.operationsEmpty'), { variant: 'muted' });
    this.#empty.element.classList.add('audio-editor__operations-empty');
    this.#gain = new Slider({
      min: -24,
      max: 12,
      step: 0.5,
      value: 0,
      label: options.t('audio.gain'),
      formatValue: (value) =>
        this.#t('audio.decibels', {
          value: `${value > 0 ? '+' : ''}${value.toFixed(1)}`,
        }),
      // Kazanç ÖNİZLEMEDE canlı uygulanır; dosyaya yazma ayrı ve açık bir
      // eylemdir (repo yalnız açık kaydette değişir).
      onInput: (value) => {
        options.onPreviewGain(value);
        this.#updateControls();
      },
    });
    this.#addGainButton = new Button(options.t('audio.addGain'), {
      size: 'sm',
      onClick: () => this.#add({ kind: 'gain', decibels: this.#gain.getValue() }),
    });
    this.#trimButton = new Button(options.t('audio.trim'), {
      size: 'sm',
      onClick: () =>
        this.#add({
          kind: 'trim',
          startFrame: this.#selection.startFrame,
          endFrame: this.#selection.endFrame,
        }),
    });
    this.#fadeInButton = new Button(options.t('audio.fadeIn'), {
      size: 'sm',
      onClick: () =>
        this.#add({
          kind: 'fadeIn',
          startFrame: this.#selection.startFrame,
          durationFrames: this.#selection.endFrame - this.#selection.startFrame,
        }),
    });
    this.#fadeOutButton = new Button(options.t('audio.fadeOut'), {
      size: 'sm',
      onClick: () =>
        this.#add({
          kind: 'fadeOut',
          startFrame: this.#selection.startFrame,
          durationFrames: this.#selection.endFrame - this.#selection.startFrame,
        }),
    });
    this.#normalizeButton = new Button(options.t('audio.normalize'), {
      size: 'sm',
      onClick: () => this.#add({ kind: 'normalize', mode: 'peak', target: -1 }),
    });
    this.#reverseButton = new Button(options.t('audio.reverse'), {
      size: 'sm',
      onClick: () => this.#add({ kind: 'reverse' }),
    });
    this.#clearButton = new Button(options.t('audio.clearOperations'), {
      size: 'sm',
      onClick: () => this.reset(),
    });
    this.#list = element('div', {
      className: 'audio-editor__operations-list',
      attrs: { role: 'list' },
    });
    this.controls = element('div', {
      className: 'audio-editor__controls',
      children: [
        element('div', {
          className: 'audio-editor__gain',
          children: [this.#gain.element, this.#addGainButton.element],
        }),
        element('div', {
          className: 'audio-editor__processes',
          children: [
            this.#trimButton.element,
            this.#fadeInButton.element,
            this.#fadeOutButton.element,
            this.#normalizeButton.element,
            this.#reverseButton.element,
          ],
        }),
      ],
    });
    this.element = element('section', {
      className: 'audio-editor__operations',
      children: [
        element('div', {
          className: 'audio-editor__operations-header',
          children: [this.#title.element, this.#clearButton.element],
        }),
        this.#empty.element,
        this.#list,
      ],
    });
    this.#render(false);
  }

  public getOperations(): readonly AudioEditOperation[] {
    return this.#operations;
  }

  public setContext(
    asset: AssetSummary | null,
    data: WaveformData | null,
    selection: WaveformSelection,
  ): void {
    this.#asset = asset;
    this.#data = data;
    this.#selection = { ...selection };
    this.#updateControls();
  }

  public setTranslator(next: Translate): void {
    this.#t = next;
    this.#title.setContent(next('audio.operations'));
    this.#empty.setContent(next('audio.operationsEmpty'));
    this.#gain.setLabel(next('audio.gain'));
    this.#addGainButton.setLabel(next('audio.addGain'));
    this.#trimButton.setLabel(next('audio.trim'));
    this.#fadeInButton.setLabel(next('audio.fadeIn'));
    this.#fadeOutButton.setLabel(next('audio.fadeOut'));
    this.#normalizeButton.setLabel(next('audio.normalize'));
    this.#reverseButton.setLabel(next('audio.reverse'));
    this.#clearButton.setLabel(next('audio.clearOperations'));
    this.#render();
  }

  public reset(): void {
    this.#operations = [];
    this.#gain.setValue(0);
    this.#options.onPreviewGain(0);
    this.#render();
  }

  public destroy(): void {
    for (const component of [
      this.#title,
      this.#empty,
      this.#gain,
      this.#addGainButton,
      this.#trimButton,
      this.#fadeInButton,
      this.#fadeOutButton,
      this.#normalizeButton,
      this.#reverseButton,
      this.#clearButton,
    ]) {
      component.destroy();
    }
    this.controls.remove();
    this.element.remove();
  }

  #add(operation: AudioEditOperation): void {
    this.#operations = [...this.#operations, operation];
    if (operation.kind === 'gain') {
      this.#gain.setValue(0);
      this.#options.onPreviewGain(0);
    }
    this.#render();
  }

  #render(notify = true): void {
    replaceChildren(
      this.#list,
      ...this.#operations.map((operation, index) =>
        element('div', {
          className: 'audio-editor__operation',
          attrs: { role: 'listitem' },
          children: [
            element('span', {
              className: 'audio-editor__operation-index',
              children: [String(index + 1)],
            }),
            element('span', {
              className: 'audio-editor__operation-label',
              children: [this.#label(operation)],
            }),
          ],
        }),
      ),
    );
    this.#empty.element.hidden = this.#operations.length > 0;
    this.#list.hidden = this.#operations.length === 0;
    this.#updateControls();
    if (notify) this.#options.onChange();
  }

  #label(operation: AudioEditOperation): string {
    if (operation.kind === 'gain') {
      return this.#t('audio.operationGain', { value: operation.decibels.toFixed(1) });
    }
    if (operation.kind === 'trim') {
      const rate = this.#data?.sampleRate ?? 1;
      return this.#t('audio.operationTrim', {
        start: this.#options.formatTime(operation.startFrame / rate),
        end: this.#options.formatTime(operation.endFrame / rate),
      });
    }
    if (operation.kind === 'fadeIn' || operation.kind === 'fadeOut') {
      const rate = this.#data?.sampleRate ?? 1;
      return this.#t(
        operation.kind === 'fadeIn' ? 'audio.operationFadeIn' : 'audio.operationFadeOut',
        { duration: this.#options.formatTime(operation.durationFrames / rate) },
      );
    }
    if (operation.kind === 'normalize') return this.#t('audio.operationNormalize');
    if (operation.kind === 'reverse') return this.#t('audio.operationReverse');
    return this.#t('audio.operationOther');
  }

  #updateControls(): void {
    const selectionLength = this.#selection.endFrame - this.#selection.startFrame;
    const editable =
      this.#data !== null &&
      this.#asset !== null &&
      this.#asset.role !== 'readonly' &&
      (this.#asset.format === 'ogg' || this.#asset.format === 'wav');
    const fullSelection =
      this.#data !== null &&
      this.#selection.startFrame === 0 &&
      this.#selection.endFrame === this.#data.frameCount;
    this.#addGainButton.setDisabled(!editable || this.#gain.getValue() === 0);
    this.#trimButton.setDisabled(!editable || selectionLength < 1 || fullSelection);
    this.#fadeInButton.setDisabled(!editable || selectionLength < 1);
    this.#fadeOutButton.setDisabled(!editable || selectionLength < 1);
    this.#normalizeButton.setDisabled(!editable);
    this.#reverseButton.setDisabled(!editable);
    this.#clearButton.setDisabled(this.#operations.length === 0);
  }
}
