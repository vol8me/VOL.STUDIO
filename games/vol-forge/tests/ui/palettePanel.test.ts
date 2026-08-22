import { describe, it, expect } from 'vitest';
import { collectSpriteDocIssues, type SpriteDoc } from '@volstudio/core/visual';
import { DocumentStore } from '../../src/state/DocumentStore';
import { PalettePanel } from '../../src/ui/PalettePanel';

const DATA_DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [16, 16],
  seed: 1,
  palette: {
    colors: ['#101010', '#f0f0f0'],
    ramps: [{ id: 0, name: 'taban', indices: [0, 1] }],
  },
  layers: [{ id: 'a', source: { kind: 'sdf.circle', r: 0.5 }, material: 0 }],
} as SpriteDoc;

const GEN_DOC = {
  ...DATA_DOC,
  palette: { generate: [{ base: '#6b5570', steps: 4, hueShift: -18, satCurve: 'arch' }] },
} as SpriteDoc;

/**
 * CORE `Select` yerli `<select>` değil, açılır bir düğme listesidir:
 * tetikleyiciye tıklanır, sonra seçenek düğmesine. Seçenekler popup
 * içinde `document`e bağlanır.
 */
function chooseMode(panel: PalettePanel, label: string): void {
  const trigger = panel.element.querySelector<HTMLButtonElement>('.vol-select')!;
  trigger.click();
  const option = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.vol-select__option'),
  ).find((button) => button.textContent === label);
  option!.click();
}

describe('palet şeridi (§8.7)', () => {
  it('veri kipinde her renk için bir seçici kurar', () => {
    const store = new DocumentStore(DATA_DOC);
    const panel = new PalettePanel(store);
    panel.render();
    expect(panel.element.querySelectorAll('.vol-color-picker')).toHaveLength(2);
    expect(panel.element.querySelectorAll('.vf-palette__ramp')).toHaveLength(1);
    panel.destroy();
  });

  it('renk değişikliği belgeye yazılır', () => {
    const store = new DocumentStore(DATA_DOC);
    const panel = new PalettePanel(store);
    panel.render();

    const hex = panel.element.querySelectorAll<HTMLInputElement>('.vol-color-picker__hex')[1];
    hex.value = '#00ff00';
    hex.dispatchEvent(new Event('input'));

    expect(store.get().palette.colors?.[1]).toBe('#00ff00');
    panel.destroy();
  });

  it('sentez kipinde istek başına kontrol ve canlı kutucuk gösterir', () => {
    const store = new DocumentStore(GEN_DOC);
    const panel = new PalettePanel(store);
    panel.render();

    expect(panel.element.querySelectorAll('.vf-palette__request')).toHaveLength(1);
    // Dört adım → dört kutucuk.
    expect(panel.element.querySelectorAll('.vf-palette__chip')).toHaveLength(4);
    panel.destroy();
  });

  it('kip değişimi KARŞI alanı siler — ikisi bir arada olamaz (§7.1)', () => {
    const store = new DocumentStore(DATA_DOC);
    const panel = new PalettePanel(store);
    panel.render();

    chooseMode(panel, 'Sentez');

    const palette = store.get().palette;
    expect(palette.generate).toBeDefined();
    expect(palette.colors).toBeUndefined();
    expect(palette.ramps).toBeUndefined();
    expect(collectSpriteDocIssues(store.get())).toEqual([]);
    panel.destroy();
  });

  it('sentezden veriye dönüş mevcut sonucu KORUR', () => {
    const store = new DocumentStore(GEN_DOC);
    const panel = new PalettePanel(store);
    panel.render();

    chooseMode(panel, 'Veri');

    const palette = store.get().palette;
    expect(palette.colors).toHaveLength(4);
    expect(palette.ramps?.[0].id).toBe(0);
    expect(palette.generate).toBeUndefined();
    expect(collectSpriteDocIssues(store.get())).toEqual([]);
    panel.destroy();
  });

  it('rampa eklemek yeni bir sentez isteği açar', () => {
    const store = new DocumentStore(GEN_DOC);
    const panel = new PalettePanel(store);
    panel.render();

    const buttons = panel.element.querySelectorAll<HTMLButtonElement>('button.vol-button');
    buttons[buttons.length - 1].click();

    expect(store.get().palette.generate).toHaveLength(2);
    expect(collectSpriteDocIssues(store.get())).toEqual([]);
    panel.destroy();
  });
});
