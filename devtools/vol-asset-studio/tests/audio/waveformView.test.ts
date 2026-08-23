import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformView, type WaveformData } from '../../src/audio/WaveformView';

function data(): WaveformData {
  return {
    sampleRate: 48000,
    channelCount: 2,
    frameCount: 4800,
    levels: [
      {
        framesPerPeak: 1,
        channels: [
          [0, 1, 0, 1, 0, 1],
          [0, -1, 0, -1, 0, -1],
        ],
      },
      {
        framesPerPeak: 10,
        channels: [
          [0, 1, 0, 1],
          [0, -1, 0, -1],
        ],
      },
    ],
    qa: { peakDbfs: -6, rmsDbfs: -12, clippedFrames: 0, pass: true },
  };
}

function rectFor(left: number, top: number, width: number, height: number) {
  return () => ({ left, top, width, height, right: left + width, bottom: top + height });
}

class MockResizeObserver implements ResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(): void {
    this.cb([], this);
  }
  unobserve(): void {}
  disconnect(): void {}
}

describe('WaveformView', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('veri atar, göz atar ve oynatma kafasını konumlandırır', () => {
    const onSeek = vi.fn();
    const view = new WaveformView({ onSeek, formatTime: (s) => `${s.toFixed(1)}s` });
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);

    view.setData(data());
    expect(view.getSelection()).toEqual({ startFrame: 0, endFrame: 4800 });

    view.setPlayhead(1200);
    expect(onSeek).not.toHaveBeenCalled();

    view.zoom(2, 0.5);
    view.pan(100);
    view.fit();

    view.setSelection(1000, 2000, true);
    expect(view.getSelection()).toEqual({ startFrame: 1000, endFrame: 2000 });
  });

  it('işaretçi ve fare tekerleği ile gezinir ve seçer', () => {
    const onSeek = vi.fn();
    const onSelectionChange = vi.fn();
    const view = new WaveformView({ onSeek, onSelectionChange });
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);
    view.setData(data());
    const overlay = view.element.querySelector<HTMLElement>('.waveform__overlay')!;
    overlay.getBoundingClientRect = rectFor(
      0,
      0,
      600,
      200,
    ) as unknown as typeof overlay.getBoundingClientRect;

    overlay.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 150, button: 0, bubbles: true }),
    );
    overlay.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 300, bubbles: true }),
    );
    overlay.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 300, bubbles: true }),
    );
    expect(onSeek).toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenCalled();

    overlay.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 300, bubbles: true }));
    overlay.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 50, shiftKey: true, clientX: 300, bubbles: true }),
    );

    overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  it('klavye ile kafayı ve seçimi kontrol eder', () => {
    const onSeek = vi.fn();
    const view = new WaveformView({ onSeek });
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);
    view.setData(data());
    const overlay = view.element.querySelector<HTMLElement>('.waveform__overlay')!;
    overlay.focus();

    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(onSeek).toHaveBeenCalled();

    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  });

  it('cancel işaretçi etkinliği seçimi sıfırlar', () => {
    const view = new WaveformView();
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);
    view.setData(data());
    const overlay = view.element.querySelector<HTMLElement>('.waveform__overlay')!;
    overlay.getBoundingClientRect = rectFor(
      0,
      0,
      600,
      200,
    ) as unknown as typeof overlay.getBoundingClientRect;

    overlay.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 100, button: 0, bubbles: true }),
    );
    overlay.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2, bubbles: true }));
    expect(view.getSelection()).toEqual({ startFrame: 0, endFrame: 4800 });
  });

  it('boş veride işlemler güvenli kalır', () => {
    const view = new WaveformView();
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);

    view.setData(null);
    view.setPlayhead(100);
    view.setSelection(0, 100, true);
    view.zoom(2);
    view.pan(10);
    view.render();
    view.fit();

    expect(view.element.querySelector('canvas')).not.toBeNull();
  });

  it('destroy gözlemcileri ve dinleyicileri kaldırır', () => {
    const view = new WaveformView();
    document.body.appendChild(view.element);
    view.resize(600, 200, 1);
    view.setData(data());

    view.destroy();
    expect(view.element.isConnected).toBe(false);
  });
});
