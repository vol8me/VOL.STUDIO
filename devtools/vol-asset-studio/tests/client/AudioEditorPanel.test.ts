import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStudioApiError, type AssetStudioClient } from '../../src/api/AssetStudioClient';
import { AudioEditorPanel } from '../../src/audio/AudioEditorPanel';
import type { WaveformData } from '../../src/audio/WaveformView';
import { asset, translate } from './helpers';

const waveform: WaveformData = {
  sampleRate: 8_000,
  channelCount: 1,
  frameCount: 800,
  levels: [{ framesPerPeak: 256, channels: [[-0.4, 0.4, -0.7, 0.7, -0.2, 0.2, 0, 0]] }],
  qa: { peakDbfs: -3, rmsDbfs: -12, clippedFrames: 0, pass: true },
};

function mount() {
  const saveAudio = vi.fn().mockResolvedValue({
    assetId: 'audio:click',
    revision: 'b'.repeat(64),
    bytes: 2048,
  });
  const client = {
    getWaveform: vi.fn().mockResolvedValue(waveform),
    contentUrl: vi.fn(() => '/audio.ogg'),
    saveAudio,
  } as unknown as AssetStudioClient;
  const panel = new AudioEditorPanel({
    client,
    t: translate,
    onClose: vi.fn(),
    onToast: vi.fn(),
    onSaved: vi.fn(),
  });
  document.body.append(panel.element);
  return { panel, saveAudio };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('AudioEditorPanel', () => {
  it('kısa ses bittiğinde oynatma çizgisini gerçek sona taşır', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { panel } = mount();
    await panel.open(
      asset({
        id: 'audio:click',
        name: 'click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    );

    panel.element.querySelector('audio')!.dispatchEvent(new Event('ended'));

    expect(panel.element.querySelector('.waveform__overlay')?.getAttribute('aria-valuenow')).toBe(
      '800',
    );
    panel.destroy();
  });

  it('dalga formu seçimini gerçek trim işlemine ve kayda dönüştürür', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { panel, saveAudio } = mount();
    await panel.open(
      asset({
        id: 'audio:click',
        name: 'click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    );
    const overlay = panel.element.querySelector<HTMLCanvasElement>('.waveform__overlay')!;
    overlay.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 640, height: 280, right: 640, bottom: 280 }) as DOMRect;
    overlay.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 160 }),
    );
    overlay.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 480 }));
    overlay.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 480 }));

    const trim = [
      ...panel.element.querySelectorAll<HTMLButtonElement>('.audio-editor__processes button'),
    ].find((button) => button.textContent === translate('audio.trim'))!;
    trim.click();
    expect(panel.element.querySelectorAll('.audio-editor__operation')).toHaveLength(1);

    panel.element.querySelector<HTMLButtonElement>('.audio-editor__transport .vol-button')!.click();
    await vi.waitFor(() => expect(saveAudio).toHaveBeenCalledOnce());
    expect(saveAudio).toHaveBeenCalledWith('audio:click', expect.any(String), [
      { kind: 'trim', startFrame: 200, endFrame: 600 },
    ]);
    panel.destroy();
  });

  it('taşıma, oynatma ve yakınlaştırma kontrollerini çalıştırır', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { panel } = mount();
    await panel.open(
      asset({
        id: 'audio:click',
        name: 'click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    );

    const [toStart, play, zoomOut, zoomIn, zoomFit, close] = Array.from(
      panel.element.querySelectorAll<HTMLButtonElement>(
        '.audio-editor__transport .vol-icon-button',
      ),
    );

    toStart.click();
    play.click();
    zoomOut.click();
    zoomIn.click();
    zoomFit.click();
    play.click();
    close.click();

    expect(panel.isOpen).toBe(true);
    panel.destroy();
  });

  it('tüm ses işlemlerini ekler ve kazanç önizlemesini uygular', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { panel } = mount();
    await panel.open(
      asset({
        id: 'audio:click',
        name: 'click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    );

    const overlay = panel.element.querySelector<HTMLCanvasElement>('.waveform__overlay')!;
    overlay.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 640, height: 280, right: 640, bottom: 280 }) as DOMRect;
    overlay.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 160 }),
    );
    overlay.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 480 }));
    overlay.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 480 }));

    const process = (label: string) =>
      [
        ...panel.element.querySelectorAll<HTMLButtonElement>('.audio-editor__processes button'),
      ].find((b) => b.textContent === translate(label));

    const gainInput = panel.element.querySelector<HTMLInputElement>(
      '.audio-editor__gain .vol-slider__input',
    )!;
    gainInput.value = '6';
    gainInput.dispatchEvent(new Event('input', { bubbles: true }));
    panel.element.querySelector<HTMLButtonElement>('.audio-editor__gain .vol-button')!.click();

    process('audio.fadeIn')!.click();
    process('audio.fadeOut')!.click();
    process('audio.normalize')!.click();
    process('audio.reverse')!.click();

    expect(panel.element.querySelectorAll('.audio-editor__operation').length).toBeGreaterThan(1);

    panel.setTranslator((key) => `tr:${key}`);
    expect(
      panel.element
        .querySelectorAll('.audio-editor__transport .vol-icon-button')[1]
        ?.getAttribute('aria-label'),
    ).toBe('tr:audio.play');

    panel.element
      .querySelector<HTMLButtonElement>('.audio-editor__operations-header button')!
      .click();
    expect(panel.element.querySelectorAll('.audio-editor__operation')).toHaveLength(0);

    panel.destroy();
  });

  it('yükleme hatasını açık metinle gösterir', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const getWaveform = vi.fn().mockRejectedValue(new AssetStudioApiError('request_failed', 500));
    const client = {
      getWaveform,
      contentUrl: vi.fn(() => '/audio.ogg'),
      saveAudio: vi.fn(),
    } as unknown as AssetStudioClient;
    const panel = new AudioEditorPanel({
      client,
      t: translate,
      onClose: vi.fn(),
      onToast: vi.fn(),
      onSaved: vi.fn(),
    });
    document.body.append(panel.element);

    await panel.open(
      asset({
        id: 'audio:click',
        name: 'click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    );

    expect(panel.element.querySelector('.audio-editor__status')?.textContent).toBe(
      translate('errors.request_failed'),
    );
    panel.destroy();
  });
});
