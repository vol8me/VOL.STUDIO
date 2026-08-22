import { describe, it, expect } from 'vitest';
import { renderSprite, type SpriteDoc } from '@volstudio/core/visual';
import { EditorState, type ChannelView } from '../../src/state/editorState';
import { PreviewPanel } from '../../src/ui/PreviewPanel';
import type { PreviewFrame } from '../../src/preview/PreviewRenderer';

const DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [16, 16],
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
  shade: { light: [-0.5, -0.6, 0.6], relief: 0.5 },
  post: { outline: { px: 1, mode: 'outside', colorIndex: 0 } },
} as SpriteDoc;

function frameFor(doc: SpriteDoc): PreviewFrame {
  return {
    result: renderSprite(doc),
    error: null,
    full: true,
    elapsedMs: 1,
    outputSize: doc.size,
  };
}

describe('önizleme paneli (§8.9)', () => {
  it('yedi kanalın hepsini çizebilir', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    const frame = frameFor(DOC);

    const channels: ChannelView[] = [
      'final',
      'coverage',
      'height',
      'material',
      'shade',
      'normal',
      'outline',
    ];
    for (const channel of channels) {
      state.setChannel(channel);
      expect(() => panel.setFrame(frame), channel).not.toThrow();
    }
    panel.destroy();
  });

  it('3×3 döşemede tuval dokuz kat büyür', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    panel.setFrame(frameFor(DOC));

    const canvas = panel.element.querySelector('canvas')!;
    expect(canvas.width).toBe(16);

    state.setLayout('tile3x3');
    panel.render();
    expect(canvas.width).toBe(48);
    expect(canvas.height).toBe(48);
    panel.destroy();
  });

  it('yakınlaştırma TAMSAYIdır — kesirli ölçek yanıltır', () => {
    const state = new EditorState();
    state.setZoom(3.6);
    expect(state.zoom).toBe(4);
    state.setZoom(0);
    expect(state.zoom).toBe(1);
  });

  it('durum satırı önizleme ve ÇIKTI boyunu birlikte gösterir', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    panel.setFrame({
      result: renderSprite(DOC, { size: [8, 8] }),
      error: null,
      full: false,
      elapsedMs: 2,
      outputSize: [16, 16],
    });

    const status = panel.element.querySelector('.vf-preview__status')!.textContent ?? '';
    expect(status).toContain('8×8');
    expect(status).toContain('16×16');
    panel.destroy();
  });

  it('ölçüm rozetleri gösterilir', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    panel.setFrame(frameFor(DOC));
    expect(panel.element.querySelectorAll('.vf-badge').length).toBeGreaterThan(2);
    panel.destroy();
  });

  it('gizli katman varken UYARI rozeti çıkar', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    state.toggleHidden('a');
    panel.setFrame(frameFor(DOC));
    expect(panel.element.querySelector('.vf-badge--warn')).not.toBeNull();
    panel.destroy();
  });

  it('hatalı kare çizim yerine mesaj gösterir', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    panel.setFrame({
      result: null,
      error: 'bozuk',
      full: false,
      elapsedMs: 0,
      outputSize: [16, 16],
    });
    expect(panel.element.querySelector('.vf-preview__status')?.textContent).toBeTruthy();
    panel.destroy();
  });

  it('kanal çubuğu yedi düğme kurar', () => {
    const state = new EditorState();
    const panel = new PreviewPanel(state);
    const bar = panel.buildChannelBar();
    expect(bar.querySelectorAll('button')).toHaveLength(7);

    (bar.querySelector('[data-channel="height"]') as HTMLButtonElement).click();
    expect(state.channel).toBe('height');
    panel.destroy();
  });
});
