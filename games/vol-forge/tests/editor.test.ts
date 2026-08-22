import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisualPreset, renderSprite, type SpriteDoc } from '@volstudio/core/visual';
import { Editor } from '../src/Editor';

const DOC = createVisualPreset('softGlow', { size: 32, seed: 1337 });
const bytes = (doc: SpriteDoc): number[] => Array.from(renderSprite(doc).rgba);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VOL Forge tek ekran ürün sözleşmesi', () => {
  it('tek üretim çalışma alanı kurar; kip, Tabs ve gelişmiş editör kalıntısı taşımaz', () => {
    const editor = new Editor(DOC, 'effect');
    editor.start();

    expect(editor.element.querySelector('.vf-workspace')).not.toBeNull();
    expect(editor.element.querySelector('.vf-intent')).not.toBeNull();
    expect(editor.element.querySelector('.vf-preview')).not.toBeNull();
    expect(editor.element.querySelector('.vf-quick')).not.toBeNull();
    expect(editor.element.querySelector('.vf-save')).not.toBeNull();
    expect(editor.element.querySelector('.vol-tabs')).toBeNull();
    expect(editor.element.querySelector('[data-mode]')).toBeNull();
    expect(editor.element.querySelector('.vf-layers')).toBeNull();
    expect(editor.element.textContent).not.toContain('İleri düzenleme');
    editor.destroy();
  });

  it('“solucan” yazıldığında ayrı nesne tarifini canlı üretir', () => {
    vi.useFakeTimers();
    const editor = new Editor(DOC, 'effect');
    editor.start();
    const before = bytes(editor.getDocument());
    const prompt = editor.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'mor solucan';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(320);

    expect(editor.getDocument().layers.map((layer) => layer.id)).toEqual(['body', 'eye']);
    expect(editor.getDocument().palette.generate?.[0]?.base).toBe('#8b67c6');
    expect(bytes(editor.getDocument())).not.toEqual(before);
    editor.destroy();
  });

  it('bilinmeyen prompt görüntüyü değiştirmez ve dürüst uyarı verir', () => {
    vi.useFakeTimers();
    const editor = new Editor(DOC);
    editor.start();
    const before = JSON.stringify(editor.getDocument());
    const prompt = editor.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'xyzzy';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(320);

    expect(JSON.stringify(editor.getDocument())).toBe(before);
    expect(editor.element.querySelector('.vf-intent__status')?.textContent).toContain(
      'değiştirilmedi',
    );
    editor.destroy();
  });

  it('başlangıç kartı ikinci onay beklemeden tarifi uygular', () => {
    const editor = new Editor(DOC);
    editor.start();
    editor.element.querySelector<HTMLButtonElement>('[data-preset="cutMineral"]')!.click();
    expect(editor.getDocument().layers[0]?.id).toBe('facet');
    editor.destroy();
  });

  it('genişlik ve yükseklik 128 kilidi olmadan 2048 sınırına kadar girilebilir', () => {
    const editor = new Editor(DOC);
    editor.start();
    const dimensions = editor.element.querySelectorAll<HTMLInputElement>(
      '.vf-quick__dimensions input[type="number"]',
    );
    expect(dimensions).toHaveLength(2);
    expect(dimensions[0].max).toBe('2048');
    dimensions[0].value = '1536';
    dimensions[0].dispatchEvent(new Event('change', { bubbles: true }));
    dimensions[1].value = '768';
    dimensions[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.getDocument().size).toEqual([1536, 768]);
    editor.destroy();
  });

  it('yeni varyasyon hem tohumu hem gerçek pikselleri değiştirir', () => {
    const editor = new Editor(DOC, 'effect');
    editor.start();
    const beforeSeed = editor.getDocument().seed;
    const before = bytes(editor.getDocument());
    editor.element.querySelector<HTMLButtonElement>('.vf-quick__variation')!.click();
    expect(editor.getDocument().seed).not.toBe(beforeSeed);
    expect(bytes(editor.getDocument())).not.toEqual(before);
    editor.destroy();
  });

  it('geri al ve yinele gerçek belge geçmişine bağlıdır', () => {
    const editor = new Editor(DOC);
    editor.start();
    const undo = editor.element.querySelector<HTMLButtonElement>('[aria-label="Geri al"]')!;
    const redo = editor.element.querySelector<HTMLButtonElement>('[aria-label="Yinele"]')!;
    expect(undo.disabled).toBe(true);
    editor.element.querySelector<HTMLButtonElement>('[data-preset="organicCluster"]')!.click();
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(editor.getDocument().layers[0]?.id).toBe('halo');
    expect(redo.disabled).toBe(false);
    redo.click();
    expect(editor.getDocument().layers[0]?.id).toBe('stem');
    editor.destroy();
  });
});
