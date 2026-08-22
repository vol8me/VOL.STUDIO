import { Button } from '@volstudio/core';
import type { LayerSpec, SpriteDoc } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import type { EditorState } from '../state/editorState';
import { defaultLayer } from '../doc/defaults';
import { ChildScope, el, t } from './dom';

/**
 * Katman listesi — §8.4.
 *
 * Sürükle-sırala ve yukarı/aşağı düğmeleri BELGEYİ değiştirir: katman sırası
 * bileşim sırasıdır (D10). Göz ve kilit ise editör durumudur ve belgeye
 * yazılmaz — gizlenen bir katman render'ı etkileseydi Tur 4'ün kanıtı çökerdi.
 */
export class LayerPanel {
  readonly element: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly scope = new ChildScope();
  private dragIndex = -1;

  constructor(
    private readonly store: DocumentStore,
    private readonly state: EditorState,
  ) {
    this.element = el('div', 'vf-layers');
    this.list = el('div', 'vf-layers__list');
    this.element.appendChild(this.list);

    const add = this.scope.add(
      new Button(t('layer.add'), { size: 'sm', onClick: () => this.addLayer() }),
    );
    this.element.appendChild(add.element);
  }

  render(): void {
    this.list.textContent = '';
    const doc = this.store.get();

    doc.layers.forEach((layer, index) => {
      this.list.appendChild(this.buildRow(layer, index, doc));
    });
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private buildRow(layer: LayerSpec, index: number, doc: SpriteDoc): HTMLElement {
    const row = el('div', 'vf-layer');
    if (index === this.state.selectedLayer) row.classList.add('vf-layer--selected');
    if (this.state.isHidden(layer.id)) row.classList.add('vf-layer--hidden');
    row.draggable = true;

    row.addEventListener('dragstart', () => {
      this.dragIndex = index;
    });
    row.addEventListener('dragover', (event) => event.preventDefault());
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      this.move(this.dragIndex, index);
      this.dragIndex = -1;
    });

    const name = el('button', 'vf-layer__name', layer.id);
    name.type = 'button';
    name.addEventListener('click', () => this.state.selectLayer(index));
    row.appendChild(name);

    row.appendChild(
      this.iconButton(
        this.state.isHidden(layer.id) ? '◌' : '●',
        this.state.isHidden(layer.id) ? t('layer.show') : t('layer.hide'),
        () => this.state.toggleHidden(layer.id),
      ),
    );
    row.appendChild(
      this.iconButton(this.state.isLocked(layer.id) ? '🔒' : '🔓', t('layer.lock'), () =>
        this.state.toggleLocked(layer.id),
      ),
    );
    row.appendChild(this.iconButton('↑', t('layer.moveUp'), () => this.move(index, index - 1)));
    row.appendChild(this.iconButton('↓', t('layer.moveDown'), () => this.move(index, index + 1)));
    row.appendChild(
      this.iconButton('✕', t('layer.remove'), () => this.remove(index), doc.layers.length <= 1),
    );

    return row;
  }

  private iconButton(
    glyph: string,
    title: string,
    onClick: () => void,
    disabled = false,
  ): HTMLButtonElement {
    const button = el('button', 'vf-layer__action', glyph);
    button.type = 'button';
    button.title = title;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  private move(from: number, to: number): void {
    const doc = this.store.get();
    if (from < 0 || to < 0 || from >= doc.layers.length || to >= doc.layers.length) return;
    if (from === to) return;

    const layers = [...doc.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    this.store.set({ ...doc, layers });
    this.state.selectLayer(to);
  }

  private remove(index: number): void {
    const doc = this.store.get();
    if (doc.layers.length <= 1) return;
    const layers = doc.layers.filter((_, i) => i !== index);
    this.store.set({ ...doc, layers });
    this.state.selectLayer(Math.min(index, layers.length - 1));
  }

  private addLayer(): void {
    const doc = this.store.get();
    // Kimlik BELGE GENELİNDE benzersiz olmalı (D5 tohum yolu); mevcut
    // kimlikleri tarayıp ilk boş numarayı al.
    const used = new Set(doc.layers.map((layer) => layer.id));
    let index = doc.layers.length + 1;
    while (used.has(`katman${index}`)) index++;

    const layers = [...doc.layers, defaultLayer(`katman${index}`)];
    this.store.set({ ...doc, layers });
    this.state.selectLayer(layers.length - 1);
  }
}
