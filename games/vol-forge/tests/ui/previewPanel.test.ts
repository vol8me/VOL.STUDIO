import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderSprite, type SpriteDoc } from '@volstudio/core/visual';
import { PreviewPanel } from '../../src/ui/PreviewPanel';
import type { PreviewFrame } from '../../src/preview/PreviewRenderer';

const DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [16, 12],
  seed: 3,
  palette: {
    colors: ['#101010', '#606060', '#b0b0b0', '#f0f0f0'],
    ramps: [{ id: 0, indices: [0, 1, 2, 3] }],
  },
  layers: [
    {
      id: 'a',
      source: { kind: 'sdf.circle', r: 0.6 },
      height: { kind: 'gradient.radial', radius: 0.9 },
      material: 0,
    },
  ],
} as SpriteDoc;

function frameFor(doc: SpriteDoc = DOC): PreviewFrame {
  return {
    result: renderSprite(doc),
    error: null,
    full: true,
    elapsedMs: 1,
    outputSize: doc.size,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('tek ekran canlı kamera', () => {
  it('final pikselleri ve gerçek çıktı boyunu gösterir', () => {
    const panel = new PreviewPanel();
    panel.setFrame(frameFor());
    const canvas = panel.element.querySelector<HTMLCanvasElement>('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([16, 12]);
    expect(panel.element.querySelector('.vf-preview__status')?.textContent).toContain('16×12');
    expect(panel.element.querySelector('.vf-preview__badges')).toBeNull();
    panel.destroy();
  });

  it('dama çalışma kâğıdını kameranın İÇİNDE tutar', () => {
    const panel = new PreviewPanel();
    const cameraCanvas = panel.element.querySelector('.vol-pinch-zoom__canvas')!;
    const artboard = panel.element.querySelector('.vf-preview__artboard')!;
    expect(cameraCanvas.contains(artboard)).toBe(true);
    expect(artboard.contains(panel.element.querySelector('canvas'))).toBe(true);
    panel.destroy();
  });

  it('tutup sürükleme bütün artboard kamerasını taşır', () => {
    const panel = new PreviewPanel();
    const viewport = panel.element.querySelector<HTMLElement>('.vol-pinch-zoom__viewport')!;
    const camera = panel.element.querySelector<HTMLElement>('.vol-pinch-zoom__canvas')!;
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 4, clientX: 20, clientY: 30, bubbles: true }),
    );
    viewport.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 4, clientX: 55, clientY: 48, bubbles: true }),
    );
    expect(camera.style.transform).toContain('translate(35px, 18px)');
    expect(panel.element.classList.contains('vf-preview__artboard')).toBe(false);
    panel.destroy();
  });

  it('yakınlaştırma düğmeleri CORE kamerayı ve yüzdeyi birlikte günceller', () => {
    const panel = new PreviewPanel();
    const buttons = panel.element.querySelectorAll<HTMLButtonElement>(
      '.vf-preview__camera-tools button',
    );
    buttons[1].click();
    expect(panel.element.querySelector('.vf-preview__zoom')?.textContent).toBe('125%');
    expect(
      panel.element.querySelector<HTMLElement>('.vol-pinch-zoom__canvas')?.style.transform,
    ).toContain('scale(1.25)');
    panel.destroy();
  });

  it('Sığdır görünümü artboard ölçüsü ve sahne alanından hesaplar', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const panel = new PreviewPanel();
    const stage = panel.element.querySelector<HTMLElement>('.vf-preview__stage')!;
    Object.defineProperty(stage, 'clientWidth', { value: 232 });
    Object.defineProperty(stage, 'clientHeight', { value: 192 });
    panel.setFrame(frameFor());
    panel.element.querySelector<HTMLButtonElement>('.vf-preview__fit')!.click();
    // kullanılabilir alan 160×120, artboard 16×12 → 10×
    expect(
      panel.element.querySelector<HTMLElement>('.vol-pinch-zoom__canvas')?.style.transform,
    ).toContain('scale(10)');
    panel.destroy();
  });

  it('hatalı karede eski sonucu başarı gibi raporlamaz', () => {
    const panel = new PreviewPanel();
    panel.setFrame({
      result: null,
      error: 'bozuk',
      full: false,
      elapsedMs: 0,
      outputSize: [16, 12],
    });
    const status = panel.element.querySelector<HTMLElement>('.vf-preview__status')!;
    expect(status.dataset.tone).toBe('error');
    expect(status.textContent).toBeTruthy();
    panel.destroy();
  });
});
