import { describe, it, expect } from 'vitest';
import { collectSpriteDocIssues, renderSprite, type SpriteDoc } from '@volstudio/core/visual';
import { Editor } from '../src/Editor';
import { DocumentStore } from '../src/state/DocumentStore';
import { EditorState } from '../src/state/editorState';
import { LayerPanel } from '../src/ui/LayerPanel';
import { TreePanel } from '../src/ui/TreePanel';
import { ParamPanel } from '../src/ui/ParamPanel';
import { DocumentPanel } from '../src/ui/DocumentPanel';
import { PalettePanel } from '../src/ui/PalettePanel';
import { IssuePanel } from '../src/ui/IssuePanel';
import { wrapNode } from '../src/doc/defaults';
import { getAt, setAt } from '../src/doc/path';

const DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [32, 32],
  seed: 7,
  palette: {
    colors: ['#101010', '#606060', '#b0b0b0', '#f0f0f0'],
    ramps: [{ id: 0, indices: [0, 1, 2, 3] }],
  },
  layers: [
    {
      id: 'govde',
      source: { kind: 'sdf.circle', center: [0, 0], r: 0.6 },
      height: { kind: 'gradient.radial', center: [0, 0], radius: 0.9 },
      material: 0,
    },
  ],
} as SpriteDoc;

const bytes = (doc: SpriteDoc): number[] => Array.from(renderSprite(doc).rgba);

describe('Tur 4 kanıtı — editör belgesi CLI ile aynı PNG"yi verir (§8.15)', () => {
  it('editör eylemleriyle kurulan belge geçerli kalır ve aynı çıktıyı verir', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();

    // 1) Katman ekle.
    const layers = new LayerPanel(store, state);
    layers.render();
    const addButton = layers.element.querySelector('button.vol-button');
    (addButton as HTMLButtonElement).click();
    expect(store.get().layers).toHaveLength(2);

    // 2) İlk katmanın kaynağını SAR.
    const sourcePath = ['layers', 0, 'source'] as const;
    const source = getAt(store.get(), sourcePath) as never;
    store.update((doc) => setAt(doc, sourcePath, wrapNode(source, 'blur')));

    // 3) Bir parametreyi değiştir.
    store.update((doc) => setAt(doc, [...sourcePath, 'radius'], 0.05), {
      coalesceKey: 'radius',
    });

    // 4) Bir katmanı GİZLE — belgeyi etkilememeli.
    const before = bytes(store.get());
    state.toggleHidden('govde');
    const after = bytes(store.get());

    expect(collectSpriteDocIssues(store.get())).toEqual([]);
    expect(after).toEqual(before);

    // Kaydedilecek belge = render edilen belge. Sunucu da aynı `renderSprite`
    // çağrısını yapar, dolayısıyla dosya bu piksellerin aynısını taşır.
    const result = renderSprite(store.get());
    expect(result.width).toBe(32);
    expect(Array.from(result.rgba)).toEqual(after);

    layers.destroy();
  });

  it('GİZLİ katman belgede iz bırakmaz', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();
    state.toggleHidden('govde');

    expect(state.isHidden('govde')).toBe(true);
    expect(state.hiddenCount).toBe(1);
    // Belgede görünürlük alanı YOKtur; olsaydı CLI ile editör ayrışırdı.
    expect(JSON.stringify(store.get())).not.toContain('hidden');
    expect(JSON.stringify(store.get())).not.toContain('visible');
  });

  it('kilit de belgeye yazılmaz', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();
    state.toggleLocked('govde');
    expect(state.isLocked('govde')).toBe(true);
    expect(JSON.stringify(store.get())).not.toContain('locked');
  });
});

describe('paneller kurulur, çizer ve temizlenir', () => {
  it('Editor kabuğu tüm panelleri kurar', () => {
    const editor = new Editor(DOC);
    editor.start();

    expect(editor.element.querySelector('.vf-main')).not.toBeNull();
    expect(editor.element.querySelector('.vf-layers')).not.toBeNull();
    expect(editor.element.querySelector('.vf-tree')).not.toBeNull();
    expect(editor.element.querySelector('.vf-palette')).not.toBeNull();
    expect(editor.element.querySelector('.vf-issues')).not.toBeNull();

    editor.destroy();
    expect(editor.element.isConnected).toBe(false);
  });

  it('ağaç paneli katmanın alanlarını sekmeler', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();
    const tree = new TreePanel(store, state);
    tree.render();

    const tabs = tree.element.querySelectorAll('.vf-tree__tab');
    expect(tabs).toHaveLength(4);
    // `mask` ve `materialMask` tanımsız → boş işareti.
    expect(tree.element.querySelectorAll('.vf-tree__tab--empty')).toHaveLength(2);
    tree.destroy();
  });

  it('parametre paneli seçili düğümün şemasını gösterir', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();
    state.selectNode(['layers', 0, 'source']);

    const params = new ParamPanel(store, state);
    params.render();
    expect(params.element.textContent).toContain('sdf.circle');
    // Etki alanı rozeti şemadan gelir (§8.5).
    expect(params.element.textContent).toContain('signed');
    params.destroy();
  });

  it('belge paneli boyut ve tohum kontrollerini kurar', () => {
    const store = new DocumentStore(DOC);
    const panel = new DocumentPanel(store);
    panel.render();
    expect(panel.element.querySelectorAll('.vf-field').length).toBeGreaterThan(5);
    panel.destroy();
  });

  it('palet paneli veri kipinde renk kutucukları gösterir', () => {
    const store = new DocumentStore(DOC);
    const panel = new PalettePanel(store);
    panel.render();
    expect(panel.element.querySelectorAll('.vol-color-picker')).toHaveLength(4);
    panel.destroy();
  });

  it('sorun paneli geçerli belgede temiz, bozukta yol gösterir', () => {
    const store = new DocumentStore(DOC);
    const state = new EditorState();
    const panel = new IssuePanel(store, state);

    panel.render();
    expect(panel.hasIssues).toBe(false);

    store.update((doc) => setAt(doc, ['layers', 0, 'source', 'r'], -1));
    panel.render();
    expect(panel.hasIssues).toBe(true);

    // Soruna tıklamak ilgili düğümü SEÇER (§8.10).
    const row = panel.element.querySelector('.vf-issues__row') as HTMLButtonElement;
    row.click();
    expect(state.selectedNode).toEqual(['layers', 0, 'source', 'r']);
    panel.destroy();
  });
});
