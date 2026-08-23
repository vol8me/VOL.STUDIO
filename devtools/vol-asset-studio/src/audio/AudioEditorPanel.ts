import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Icon, IconButton, Text } from '@volstudio/core/ui';
import type { AssetSummary } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../api/AssetStudioClient';
import { element } from '../ui/dom';
import { AudioOperationsPanel } from './AudioOperationsPanel';
import { WaveformView, type WaveformData, type WaveformSelection } from './WaveformView';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AudioEditorPanelOptions {
  client: AssetStudioClient;
  t: Translate;
  onClose: () => void;
  onToast: (message: string) => void;
  onSaved: (assetId: string, revision: string) => void;
}

/**
 * Ses inceleme ve düzenleme yüzeyi.
 *
 * Piksel editöründen AYRI bir yüzeydir: sesin kavramları (dalga formu,
 * transport, kazanç, kırpma) rasterla hiç örtüşmez ve aynı panele
 * sıkıştırmak iki ürünü de bozardı.
 *
 * Çözme ve ölçüm SUNUCUDA yapılır; tarayıcı codec desteği motora göre değişir
 * ve OGG/MP3 kombinasyonlarında sessizce başarısız olur. Buradaki `<audio>`
 * yalnız etkileşimli önizlemedir.
 */
export class AudioEditorPanel {
  readonly element: HTMLElement;

  readonly #scope = new DisposableScope();
  readonly #options: AudioEditorPanelOptions;
  readonly #title: Text;
  readonly #subtitle: Text;
  readonly #status: Text;
  readonly #selectionText: Text;
  readonly #closeButton: IconButton;
  readonly #playButton: IconButton;
  readonly #toStartButton: IconButton;
  readonly #zoomInButton: IconButton;
  readonly #zoomOutButton: IconButton;
  readonly #zoomFitButton: IconButton;
  readonly #waveform: WaveformView;
  readonly #operationsPanel: AudioOperationsPanel;
  readonly #saveButton: Button;
  readonly #stats: HTMLDListElement;
  readonly #audio: HTMLAudioElement;
  #t: Translate;
  #asset: AssetSummary | null = null;
  #data: WaveformData | null = null;
  #selection: WaveformSelection = { startFrame: 0, endFrame: 0 };
  #request: AbortController | null = null;
  #playing = false;
  #saving = false;
  #raf: number | null = null;

  public constructor(options: AudioEditorPanelOptions) {
    this.#options = options;
    this.#t = options.t;

    this.#title = new Text('', { variant: 'heading', tag: 'h2' });
    this.#subtitle = new Text('', { variant: 'muted' });
    this.#status = new Text('', { variant: 'muted' });
    this.#status.element.classList.add('audio-editor__status');
    this.#selectionText = new Text('', { variant: 'body' });
    this.#selectionText.element.classList.add('audio-editor__selection-text');
    this.#closeButton = new IconButton(new Icon({ name: 'close' }).element, {
      label: options.t('editor.close'),
      size: 'sm',
      onClick: () => options.onClose(),
    });
    this.#playButton = new IconButton(new Icon({ name: 'play' }).element, {
      label: options.t('audio.play'),
      onClick: () => this.togglePlayback(),
    });
    this.#toStartButton = new IconButton(new Icon({ name: 'collapse' }).element, {
      label: options.t('audio.selectionStart'),
      onClick: () => this.seekToFrame(this.#selection.startFrame),
    });
    this.#zoomInButton = new IconButton(new Icon({ name: 'zoom-in' }).element, {
      label: options.t('audio.zoomIn'),
      size: 'sm',
      onClick: () => this.#waveform.zoom(1.7),
    });
    this.#zoomOutButton = new IconButton(new Icon({ name: 'zoom-out' }).element, {
      label: options.t('audio.zoomOut'),
      size: 'sm',
      onClick: () => this.#waveform.zoom(1 / 1.7),
    });
    this.#zoomFitButton = new IconButton(new Icon({ name: 'fit' }).element, {
      label: options.t('audio.zoomFit'),
      size: 'sm',
      onClick: () => this.#waveform.fit(),
    });

    this.#waveform = new WaveformView({
      label: options.t('audio.waveformLabel'),
      onSeek: (frame) => this.seekToFrame(frame),
      onSelectionChange: (selection) => this.#setSelection(selection),
      formatTime: (seconds) => this.#formatTime(seconds),
    });

    this.#operationsPanel = new AudioOperationsPanel({
      t: options.t,
      formatTime: (seconds) => this.#formatTime(seconds),
      onPreviewGain: (value) => {
        this.#audio.volume = Math.max(0, Math.min(1, 10 ** (value / 20)));
      },
      onChange: () => this.#updateControls(),
    });
    this.#saveButton = new Button(options.t('audio.save'), {
      size: 'sm',
      variant: 'primary',
      onClick: () => this.#save(),
    });

    this.#stats = element('dl', { className: 'audio-editor__stats' });
    this.#audio = element('audio', { attrs: { preload: 'metadata' } });
    this.#scope.addListener(this.#audio, 'ended', () => this.#handleEnded());
    this.#scope.addListener(this.#audio, 'timeupdate', () => this.#syncPlayhead());
    this.#scope.addListener(this.#audio, 'pause', () => this.#syncPlaybackState(false));
    this.#scope.addListener(this.#audio, 'play', () => this.#syncPlaybackState(true));

    this.element = element('section', {
      className: 'audio-editor',
      attrs: { 'aria-hidden': 'true' },
      children: [
        element('header', {
          className: 'audio-editor__bar',
          children: [
            element('div', {
              className: 'audio-editor__identity',
              children: [this.#title.element, this.#subtitle.element, this.#status.element],
            }),
            element('div', {
              className: 'audio-editor__transport',
              children: [
                this.#toStartButton.element,
                this.#playButton.element,
                this.#zoomOutButton.element,
                this.#zoomInButton.element,
                this.#zoomFitButton.element,
                this.#saveButton.element,
                this.#closeButton.element,
              ],
            }),
          ],
        }),
        element('div', {
          className: 'audio-editor__workspace',
          children: [
            element('div', {
              className: 'audio-editor__main',
              children: [
                this.#waveform.element,
                element('div', {
                  className: 'audio-editor__selection',
                  children: [this.#selectionText.element],
                }),
                this.#operationsPanel.controls,
              ],
            }),
            element('aside', {
              className: 'audio-editor__inspector',
              children: [this.#stats, this.#operationsPanel.element],
            }),
          ],
        }),
        this.#audio,
      ],
    });
    this.#updateControls();
  }

  public get isOpen(): boolean {
    return this.#asset !== null;
  }

  public setTranslator(next: Translate): void {
    this.#t = next;
    this.#closeButton.setLabel(next('editor.close'));
    this.#playButton.setLabel(next(this.#playing ? 'audio.pause' : 'audio.play'));
    this.#toStartButton.setLabel(next('audio.selectionStart'));
    this.#zoomInButton.setLabel(next('audio.zoomIn'));
    this.#zoomOutButton.setLabel(next('audio.zoomOut'));
    this.#zoomFitButton.setLabel(next('audio.zoomFit'));
    this.#waveform.setLabel(next('audio.waveformLabel'));
    this.#operationsPanel.setTranslator(next);
    this.#saveButton.setLabel(next('audio.save'));
    if (this.#data !== null) {
      this.renderStats(this.#data);
      this.#renderSelection();
    }
    this.#updateControls();
  }

  public async open(asset: AssetSummary): Promise<void> {
    this.close();
    this.#asset = asset;
    this.element.setAttribute('aria-hidden', 'false');
    this.element.classList.add('audio-editor--open');
    this.#title.setContent(asset.name);
    this.#subtitle.setContent(asset.path);
    this.#status.setContent(this.#t('editor.loading'));
    this.#audio.src = this.#options.client.contentUrl(asset);

    const request = new AbortController();
    this.#request = request;
    try {
      const data = await this.#options.client.getWaveform(asset.id, request.signal);
      if (request.signal.aborted) return;
      this.#data = data;
      this.#status.setContent(this.#t('audio.ready'));
      this.#waveform.setData(data);
      this.#setSelection({ startFrame: 0, endFrame: data.frameCount }, false);
      this.syncWaveformSize();
      this.renderStats(data);
      this.#updateControls();
    } catch (error) {
      if (request.signal.aborted) return;
      this.#status.setContent(this.#errorText(error));
    } finally {
      if (this.#request === request) this.#request = null;
    }
  }

  public close(): void {
    this.stopPlayback();
    this.#request?.abort();
    this.#request = null;
    this.#audio.removeAttribute('src');
    this.#audio.currentTime = 0;
    this.#audio.volume = 1;
    this.#data = null;
    this.#asset = null;
    this.#selection = { startFrame: 0, endFrame: 0 };
    this.#operationsPanel.reset();
    this.#waveform.setData(null);
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('audio-editor--open');
    this.#updateControls();
  }

  public syncWaveformSize(): void {
    const rect = this.#waveform.element.getBoundingClientRect();
    this.#waveform.resize(
      rect.width || 640,
      rect.height || 280,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    );
  }

  public togglePlayback(): void {
    if (this.#playing) this.stopPlayback();
    else void this.startPlayback();
  }

  public destroy(): void {
    this.close();
    for (const component of [
      this.#title,
      this.#subtitle,
      this.#status,
      this.#selectionText,
      this.#closeButton,
      this.#playButton,
      this.#toStartButton,
      this.#zoomInButton,
      this.#zoomOutButton,
      this.#zoomFitButton,
      this.#saveButton,
    ]) {
      component.destroy();
    }
    this.#operationsPanel.destroy();
    this.#waveform.destroy();
    this.#scope.dispose();
    this.element.remove();
  }

  private async startPlayback(): Promise<void> {
    const data = this.#data;
    if (data === null) return;
    const selectionEnd = this.#selection.endFrame / data.sampleRate;
    if (
      this.#audio.currentTime >= selectionEnd ||
      this.#audio.currentTime < this.#selection.startFrame / data.sampleRate
    ) {
      this.seekToFrame(this.#selection.startFrame);
    }
    try {
      await this.#audio.play();
    } catch {
      // Otomatik oynatma engellendiyse sessizce durulur; sahte "çalıyor"
      // durumu göstermek kullanıcıyı yanıltır.
      return;
    }
    this.#syncPlaybackState(true);
  }

  private stopPlayback(): void {
    if (this.#raf !== null) {
      cancelAnimationFrame(this.#raf);
      this.#raf = null;
    }
    this.#audio.pause();
    this.#syncPlaybackState(false);
    this.#syncPlayhead();
  }

  private trackPlayhead(): void {
    const step = (): void => {
      const data = this.#data;
      if (data === null || !this.#playing) return;
      const frame = Math.min(
        data.frameCount,
        Math.round(this.#audio.currentTime * data.sampleRate),
      );
      if (frame >= this.#selection.endFrame) {
        this.#audio.currentTime = this.#selection.endFrame / data.sampleRate;
        this.#waveform.setPlayhead(this.#selection.endFrame);
        this.stopPlayback();
        return;
      }
      this.#waveform.setPlayhead(frame);
      this.#renderSelection(frame);
      this.#raf = requestAnimationFrame(step);
    };
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    this.#raf = requestAnimationFrame(step);
  }

  private seekToFrame(frame: number): void {
    const data = this.#data;
    if (data === null || data.sampleRate === 0) return;
    const clamped = Math.max(0, Math.min(data.frameCount, Math.round(frame)));
    this.#audio.currentTime = clamped / data.sampleRate;
    this.#waveform.setPlayhead(clamped);
    this.#renderSelection(clamped);
  }

  private renderStats(data: WaveformData): void {
    const rows: [string, string][] = [
      [this.#t('audio.duration'), this.#formatTime(data.frameCount / data.sampleRate)],
      [this.#t('audio.sampleRate'), this.#t('audio.hertz', { value: data.sampleRate })],
      [this.#t('audio.channels'), String(data.channelCount)],
      [this.#t('editor.audioPeak'), this.#formatDb(data.qa.peakDbfs)],
      [this.#t('editor.audioRms'), this.#formatDb(data.qa.rmsDbfs)],
      [this.#t('editor.audioClipped'), String(data.qa.clippedFrames)],
      [
        this.#t('audio.qa'),
        data.qa.pass ? this.#t('editor.audioQaPass') : this.#t('editor.audioQaFail'),
      ],
    ];
    this.#stats.replaceChildren(
      ...rows.flatMap(([term, value]) => [
        element('dt', { children: [term] }),
        element('dd', { children: [value] }),
      ]),
    );
  }

  #setSelection(selection: WaveformSelection, updateWaveform = true): void {
    const frameCount = this.#data?.frameCount ?? 0;
    this.#selection = {
      startFrame: Math.max(0, Math.min(frameCount, Math.round(selection.startFrame))),
      endFrame: Math.max(0, Math.min(frameCount, Math.round(selection.endFrame))),
    };
    if (this.#selection.endFrame < this.#selection.startFrame) {
      [this.#selection.startFrame, this.#selection.endFrame] = [
        this.#selection.endFrame,
        this.#selection.startFrame,
      ];
    }
    if (updateWaveform) {
      this.#waveform.setSelection(this.#selection.startFrame, this.#selection.endFrame);
    }
    this.#renderSelection();
    this.#operationsPanel.setContext(this.#asset, this.#data, this.#selection);
    this.#updateControls();
  }

  #renderSelection(playhead?: number): void {
    const data = this.#data;
    if (data === null) {
      this.#selectionText.setContent('');
      return;
    }
    const current = playhead ?? Math.round(this.#audio.currentTime * data.sampleRate);
    this.#selectionText.setContent(
      this.#t('audio.selectionSummary', {
        current: this.#formatTime(current / data.sampleRate),
        start: this.#formatTime(this.#selection.startFrame / data.sampleRate),
        end: this.#formatTime(this.#selection.endFrame / data.sampleRate),
      }),
    );
  }

  #updateControls(): void {
    const asset = this.#asset;
    const editable =
      this.#data !== null &&
      asset !== null &&
      asset.role !== 'readonly' &&
      (asset.format === 'ogg' || asset.format === 'wav');
    this.#operationsPanel.setContext(asset, this.#data, this.#selection);
    this.#saveButton.setDisabled(
      !editable || this.#operationsPanel.getOperations().length === 0 || this.#saving,
    );
  }

  async #save(): Promise<void> {
    const asset = this.#asset;
    const operations = this.#operationsPanel.getOperations();
    if (asset === null || operations.length === 0 || this.#saving) return;
    this.#saving = true;
    this.#status.setContent(this.#t('audio.saving'));
    this.#updateControls();
    try {
      const result = await this.#options.client.saveAudio(asset.id, asset.revision, operations);
      const updated = { ...asset, revision: result.revision, bytes: result.bytes };
      this.#options.onSaved(asset.id, result.revision);
      this.#options.onToast(this.#t('audio.saved'));
      await this.open(updated);
    } catch (error) {
      this.#status.setContent(this.#errorText(error));
      this.#options.onToast(this.#errorText(error));
    } finally {
      this.#saving = false;
      this.#updateControls();
    }
  }

  #syncPlayhead(): void {
    const data = this.#data;
    if (data === null) return;
    const frame = Math.max(
      0,
      Math.min(data.frameCount, Math.round(this.#audio.currentTime * data.sampleRate)),
    );
    this.#waveform.setPlayhead(frame);
    this.#renderSelection(frame);
  }

  #handleEnded(): void {
    const data = this.#data;
    const end = Math.min(data?.frameCount ?? 0, this.#selection.endFrame);
    this.#waveform.setPlayhead(end);
    this.#renderSelection(end);
    this.#syncPlaybackState(false);
  }

  #syncPlaybackState(playing: boolean): void {
    this.#playing = playing;
    this.#playButton.setIcon(new Icon({ name: playing ? 'pause' : 'play' }).element);
    this.#playButton.setLabel(this.#t(playing ? 'audio.pause' : 'audio.play'));
    if (playing) this.trackPlayhead();
    else if (this.#raf !== null) {
      cancelAnimationFrame(this.#raf);
      this.#raf = null;
    }
  }

  #formatDb(value: number): string {
    return Number.isFinite(value)
      ? this.#t('audio.dbfs', { value: value.toFixed(1) })
      : this.#t('audio.unknownTime');
  }

  #formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return this.#t('audio.unknownTime');
    if (seconds < 1) {
      return this.#t('audio.milliseconds', { value: Math.round(seconds * 1000) });
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    if (minutes > 0) {
      return this.#t('audio.minutesSeconds', {
        minutes,
        seconds: remainder.toFixed(remainder < 10 ? 2 : 1).padStart(4, '0'),
      });
    }
    return this.#t('audio.seconds', { value: remainder.toFixed(remainder < 10 ? 2 : 1) });
  }

  #errorText(error: unknown): string {
    const code = error instanceof AssetStudioApiError ? error.code : 'request_failed';
    return this.#t(`errors.${code}`);
  }
}
