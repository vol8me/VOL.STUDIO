import { DisposableScope } from '@volstudio/core/lifecycle';
import { element } from '../ui/dom';

export interface WaveformLevel {
  framesPerPeak: number;
  /** Kanal başına `[min, max, min, max, …]`. */
  channels: number[][];
}

export interface WaveformData {
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  revision?: string;
  levels: WaveformLevel[];
  qa: {
    peakDbfs: number;
    rmsDbfs: number;
    clippedFrames: number;
    silentLeadFrames?: number;
    silentTailFrames?: number;
    dcOffset?: number;
    pass: boolean;
  };
}

export interface WaveformSelection {
  startFrame: number;
  endFrame: number;
}

export interface WaveformViewOptions {
  label?: string;
  onSeek?: (frame: number) => void;
  onSelectionChange?: (selection: WaveformSelection) => void;
  formatTime?: (seconds: number) => string;
}

const CHANNEL_GAP = 8;
const RULER_HEIGHT = 26;

/**
 * Peak piramidinden dalga formu çizer.
 *
 * Piramitten görünür pencereye UYGUN seviye seçilir: daha ince seviye boşuna
 * veri gezer, daha kaba seviye dalga formunu bozar. Her peak min VE max taşır;
 * yalnız mutlak değer çizmek asimetriyi ve DC kaymasını görünmez kılardı.
 */
export class WaveformView {
  readonly element: HTMLElement;
  readonly #scope = new DisposableScope();
  readonly #canvas: HTMLCanvasElement;
  readonly #overlay: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #overlayContext: CanvasRenderingContext2D | null;
  readonly #options: WaveformViewOptions;
  readonly #resizeObserver: ResizeObserver | null;
  #data: WaveformData | null = null;
  #devicePixelRatio = 1;
  #playhead = 0;
  #selection: WaveformSelection = { startFrame: 0, endFrame: 0 };
  #viewStart = 0;
  #viewEnd = 0;
  #drag: { pointerId: number; startX: number; startFrame: number; moved: boolean } | null = null;

  public constructor(options: WaveformViewOptions = {}) {
    this.#options = options;
    this.#canvas = element('canvas', { className: 'waveform__canvas' });
    this.#overlay = element('canvas', {
      className: 'waveform__overlay',
      attrs: { tabindex: 0, role: 'slider', 'aria-label': options.label ?? '' },
    });
    this.#context = this.#canvas.getContext('2d');
    this.#overlayContext = this.#overlay.getContext('2d');
    this.element = element('div', {
      className: 'waveform',
      children: [this.#canvas, this.#overlay],
    });

    this.#scope.addListener(this.#overlay, 'pointerdown', (event) =>
      this.#onPointerDown(event as PointerEvent),
    );
    this.#scope.addListener(this.#overlay, 'pointermove', (event) =>
      this.#onPointerMove(event as PointerEvent),
    );
    this.#scope.addListener(this.#overlay, 'pointerup', (event) =>
      this.#onPointerEnd(event as PointerEvent, false),
    );
    this.#scope.addListener(this.#overlay, 'pointercancel', (event) =>
      this.#onPointerEnd(event as PointerEvent, true),
    );
    this.#scope.addListener(this.#overlay, 'wheel', (event) => this.#onWheel(event as WheelEvent), {
      passive: false,
    });
    this.#scope.addListener(this.#overlay, 'dblclick', () => this.fit());
    this.#scope.addListener(this.#overlay, 'keydown', (event) =>
      this.#onKeydown(event as KeyboardEvent),
    );

    this.#resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const rect = this.element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              this.resize(rect.width, rect.height, window.devicePixelRatio || 1);
            }
          });
    this.#resizeObserver?.observe(this.element);
  }

  public setLabel(label: string): void {
    this.#overlay.setAttribute('aria-label', label);
  }

  public setData(data: WaveformData | null): void {
    this.#data = data;
    this.#playhead = 0;
    this.#viewStart = 0;
    this.#viewEnd = data?.frameCount ?? 0;
    this.#selection = { startFrame: 0, endFrame: data?.frameCount ?? 0 };
    this.render();
  }

  public getSelection(): WaveformSelection {
    return { ...this.#selection };
  }

  public setSelection(startFrame: number, endFrame: number, notify = false): void {
    const frameCount = this.#data?.frameCount ?? 0;
    const start = Math.max(0, Math.min(frameCount, Math.round(startFrame)));
    const end = Math.max(0, Math.min(frameCount, Math.round(endFrame)));
    this.#selection = {
      startFrame: Math.min(start, end),
      endFrame: Math.max(start, end),
    };
    this.render();
    if (notify) this.#options.onSelectionChange?.(this.getSelection());
  }

  public setPlayhead(frame: number): void {
    const maximum = this.#data?.frameCount ?? 0;
    this.#playhead = Math.max(0, Math.min(maximum, Math.round(frame)));
    this.#renderOverlay();
  }

  public resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    this.#devicePixelRatio = ratio;
    for (const canvas of [this.#canvas, this.#overlay]) {
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.max(1, Math.round(cssHeight * ratio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    this.render();
  }

  public fit(): void {
    this.#viewStart = 0;
    this.#viewEnd = this.#data?.frameCount ?? 0;
    this.render();
  }

  public zoom(factor: number, anchor = 0.5): void {
    const data = this.#data;
    if (data === null || data.frameCount === 0 || !Number.isFinite(factor) || factor <= 0) return;
    const current = Math.max(1, this.#viewEnd - this.#viewStart);
    const minimum = Math.max(32, Math.round(data.sampleRate / 20));
    const next = Math.max(minimum, Math.min(data.frameCount, current / factor));
    const clampedAnchor = Math.max(0, Math.min(1, anchor));
    const frame = this.#viewStart + current * clampedAnchor;
    let start = frame - next * clampedAnchor;
    start = Math.max(0, Math.min(data.frameCount - next, start));
    this.#viewStart = start;
    this.#viewEnd = start + next;
    this.render();
  }

  public pan(frames: number): void {
    const data = this.#data;
    if (data === null || !Number.isFinite(frames)) return;
    const span = this.#viewEnd - this.#viewStart;
    const start = Math.max(0, Math.min(data.frameCount - span, this.#viewStart + frames));
    this.#viewStart = start;
    this.#viewEnd = start + span;
    this.render();
  }

  public render(): void {
    this.#renderWaveform();
    this.#renderOverlay();
  }

  public destroy(): void {
    this.#resizeObserver?.disconnect();
    this.#scope.dispose();
    this.element.remove();
  }

  #renderWaveform(): void {
    const context = this.#context;
    if (context === null) return;
    const ratio = this.#devicePixelRatio;
    const width = this.#canvas.width / ratio;
    const height = this.#canvas.height / ratio;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    context.scale(ratio, ratio);
    context.fillStyle = '#090e12';
    context.fillRect(0, 0, width, height);

    const data = this.#data;
    if (data === null || data.channelCount === 0 || this.#viewEnd <= this.#viewStart) return;
    this.#drawRuler(context, width);
    const level = this.#selectLevel(data, width);
    const contentHeight = height - RULER_HEIGHT;
    const laneHeight = (contentHeight - CHANNEL_GAP * (data.channelCount - 1)) / data.channelCount;
    for (let channel = 0; channel < data.channelCount; channel += 1) {
      const peaks = level.channels[channel] ?? [];
      const top = RULER_HEIGHT + channel * (laneHeight + CHANNEL_GAP);
      const middle = top + laneHeight / 2;
      this.#drawChannel(context, peaks, level.framesPerPeak, width, top, laneHeight);
      context.strokeStyle = 'rgba(164, 190, 204, 0.18)';
      context.beginPath();
      context.moveTo(0, Math.round(middle) + 0.5);
      context.lineTo(width, Math.round(middle) + 0.5);
      context.stroke();
    }

    const selectionStart = this.#frameToX(this.#selection.startFrame, width);
    const selectionEnd = this.#frameToX(this.#selection.endFrame, width);
    if (selectionEnd > 0 && selectionStart < width) {
      const left = Math.max(0, selectionStart);
      const right = Math.min(width, selectionEnd);
      context.fillStyle = 'rgba(184, 85, 24, 0.14)';
      context.fillRect(left, RULER_HEIGHT, Math.max(0, right - left), height - RULER_HEIGHT);
      context.strokeStyle = 'rgba(224, 122, 58, 0.9)';
      context.beginPath();
      context.moveTo(Math.round(left) + 0.5, RULER_HEIGHT);
      context.lineTo(Math.round(left) + 0.5, height);
      context.moveTo(Math.round(right) - 0.5, RULER_HEIGHT);
      context.lineTo(Math.round(right) - 0.5, height);
      context.stroke();
    }
  }

  #renderOverlay(): void {
    const context = this.#overlayContext;
    if (context === null) return;
    const ratio = this.#devicePixelRatio;
    const width = this.#overlay.width / ratio;
    const height = this.#overlay.height / ratio;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.#overlay.width, this.#overlay.height);
    context.scale(ratio, ratio);
    const data = this.#data;
    if (data === null || data.frameCount === 0) return;
    const x = Math.max(0.5, Math.min(width - 1.5, this.#frameToX(this.#playhead, width)));
    context.strokeStyle = '#f0a340';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, height);
    context.stroke();
    context.fillStyle = '#f0a340';
    context.beginPath();
    context.moveTo(x - 5, 0);
    context.lineTo(x + 5, 0);
    context.lineTo(x, 7);
    context.fill();
    this.#overlay.setAttribute('aria-valuemin', '0');
    this.#overlay.setAttribute('aria-valuemax', String(data.frameCount));
    this.#overlay.setAttribute('aria-valuenow', String(this.#playhead));
  }

  #drawChannel(
    context: CanvasRenderingContext2D,
    peaks: number[],
    framesPerPeak: number,
    width: number,
    top: number,
    laneHeight: number,
  ): void {
    const peakCount = peaks.length / 2;
    if (peakCount === 0) return;
    const first = Math.max(0, Math.floor(this.#viewStart / framesPerPeak));
    const last = Math.min(peakCount - 1, Math.ceil(this.#viewEnd / framesPerPeak));
    const middle = top + laneHeight / 2;
    context.beginPath();
    for (let index = first; index <= last; index += 1) {
      const frame = index * framesPerPeak + framesPerPeak / 2;
      const x = this.#frameToX(frame, width);
      const y = middle - (peaks[index * 2 + 1] ?? 0) * (laneHeight * 0.46);
      if (index === first) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    for (let index = last; index >= first; index -= 1) {
      const frame = index * framesPerPeak + framesPerPeak / 2;
      const x = this.#frameToX(frame, width);
      const y = middle - (peaks[index * 2] ?? 0) * (laneHeight * 0.46);
      context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = '#3c98bd';
    context.fill();
    context.strokeStyle = '#6dc2df';
    context.lineWidth = 1;
    context.stroke();
  }

  #drawRuler(context: CanvasRenderingContext2D, width: number): void {
    const data = this.#data;
    if (data === null || data.sampleRate <= 0) return;
    context.fillStyle = '#0d1419';
    context.fillRect(0, 0, width, RULER_HEIGHT);
    const spanSeconds = (this.#viewEnd - this.#viewStart) / data.sampleRate;
    const rawStep = spanSeconds / Math.max(2, Math.floor(width / 110));
    const power = 10 ** Math.floor(Math.log10(Math.max(rawStep, 0.001)));
    const normalized = rawStep / power;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
    const startSeconds = this.#viewStart / data.sampleRate;
    const first = Math.ceil(startSeconds / step) * step;
    context.font = '12px sans-serif';
    context.fillStyle = 'rgba(210, 221, 228, 0.7)';
    context.strokeStyle = 'rgba(164, 190, 204, 0.18)';
    for (let seconds = first; seconds <= this.#viewEnd / data.sampleRate; seconds += step) {
      const x = this.#frameToX(seconds * data.sampleRate, width);
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, RULER_HEIGHT - 7);
      context.lineTo(Math.round(x) + 0.5, RULER_HEIGHT);
      context.stroke();
      context.fillText(this.#options.formatTime?.(seconds) ?? seconds.toFixed(2), x + 4, 15);
    }
  }

  #frameToX(frame: number, width: number): number {
    const span = this.#viewEnd - this.#viewStart || 1;
    return ((frame - this.#viewStart) / span) * width;
  }

  #frameAt(clientX: number): number {
    const rect = this.#overlay.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    return Math.round(
      this.#viewStart + Math.max(0, Math.min(1, ratio)) * (this.#viewEnd - this.#viewStart),
    );
  }

  #onPointerDown(event: PointerEvent): void {
    if (this.#data === null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const frame = this.#frameAt(event.clientX);
    this.#drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startFrame: frame,
      moved: false,
    };
    this.#overlay.setPointerCapture(event.pointerId);
    this.setPlayhead(frame);
    this.#options.onSeek?.(frame);
    event.preventDefault();
  }

  #onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) >= 3) drag.moved = true;
    if (!drag.moved) return;
    this.setSelection(drag.startFrame, this.#frameAt(event.clientX));
    event.preventDefault();
  }

  #onPointerEnd(event: PointerEvent, cancelled: boolean): void {
    const drag = this.#drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (this.#overlay.hasPointerCapture(event.pointerId)) {
      this.#overlay.releasePointerCapture(event.pointerId);
    }
    this.#drag = null;
    if (cancelled) {
      this.setSelection(0, this.#data?.frameCount ?? 0);
      return;
    }
    if (drag.moved) this.#options.onSelectionChange?.(this.getSelection());
  }

  #onWheel(event: WheelEvent): void {
    if (this.#data === null) return;
    event.preventDefault();
    if (event.shiftKey) {
      this.pan((event.deltaY / 600) * (this.#viewEnd - this.#viewStart));
      return;
    }
    const rect = this.#overlay.getBoundingClientRect();
    const anchor = rect.width === 0 ? 0.5 : (event.clientX - rect.left) / rect.width;
    this.zoom(Math.exp(-event.deltaY * 0.002), anchor);
  }

  #onKeydown(event: KeyboardEvent): void {
    const data = this.#data;
    if (data === null) return;
    const step = Math.max(1, Math.round((this.#viewEnd - this.#viewStart) / 100));
    const next =
      event.key === 'ArrowLeft'
        ? this.#playhead - step
        : event.key === 'ArrowRight'
        ? this.#playhead + step
        : event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? data.frameCount
        : null;
    if (next === null) return;
    event.preventDefault();
    this.setPlayhead(next);
    this.#options.onSeek?.(this.#playhead);
  }

  #selectLevel(data: WaveformData, pixelWidth: number): WaveformLevel {
    const desired = Math.max(1, (this.#viewEnd - this.#viewStart) / Math.max(1, pixelWidth));
    let best = data.levels[0];
    for (const level of data.levels) {
      if (level.framesPerPeak <= desired) best = level;
      else break;
    }
    return best ?? { framesPerPeak: 1, channels: [] };
  }
}
