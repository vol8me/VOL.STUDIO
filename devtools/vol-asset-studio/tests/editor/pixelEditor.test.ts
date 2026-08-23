import { afterEach, describe, expect, it } from 'vitest';
import { DocumentSession } from '../../src/editor/DocumentSession';
import { PixelEditor } from '../../src/editor/PixelEditor';
import type { Rgba } from '../../src/editor/RasterSurface';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const LABELS = { pencil: 'kalem', eraser: 'silgi', fill: 'doldur', eyedropper: 'damlalık' };

const editors: PixelEditor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function mount(size = 32): {
  editor: PixelEditor;
  session: DocumentSession;
  canvas: HTMLCanvasElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  // jsdom yerleşim ölçmez; kamera hesapları için sabit bir kutu verilir.
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 256, height: 256, right: 256, bottom: 256 }) as DOMRect;
  Object.defineProperty(container, 'clientWidth', { get: () => 256 });
  Object.defineProperty(container, 'clientHeight', { get: () => 256 });

  const session = new DocumentSession({
    assetId: 'a1',
    width: size,
    height: size,
    rgba: new Uint8ClampedArray(size * size * 4),
    revision: 'a'.repeat(64),
  });
  const editor = new PixelEditor({ container, session, labels: LABELS });
  editors.push(editor);
  editor.element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 256, height: 256, right: 256, bottom: 256 }) as DOMRect;
  const canvas = editor.element.querySelector('canvas');
  if (!canvas) throw new Error('canvas bulunamadı');
  return { editor, session, canvas };
}

/** Belge pikselini ekran koordinatına çevirip pointer olayı üretir. */
function pointerAt(
  canvas: HTMLCanvasElement,
  editor: PixelEditor,
  x: number,
  y: number,
  type: string,
  button = 0,
): void {
  const transform = editor.getTransform();
  canvas.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      button,
      clientX: transform.offsetX + (x + 0.5) * transform.zoom,
      clientY: transform.offsetY + (y + 0.5) * transform.zoom,
    }),
  );
}

describe('PixelEditor — girdi yönlendirmesi', () => {
  it('sol sürükleme aracı çalıştırır ve tek undo kaydeder', () => {
    const { editor, session, canvas } = mount();
    editor.setPrimaryColor(RED);

    pointerAt(canvas, editor, 4, 4, 'pointerdown');
    pointerAt(canvas, editor, 10, 4, 'pointermove');
    pointerAt(canvas, editor, 10, 4, 'pointerup');

    expect(session.getPixel(4, 4)).toEqual(RED);
    expect(session.getPixel(10, 4)).toEqual(RED);
    expect(session.getState().canUndo).toBe(true);
    expect(session.isDirty).toBe(true);
    // Tek gesture = tek adım: undo bütün darbeyi geri almalı.
    session.undo();
    expect(session.getPixel(4, 4)).toEqual(CLEAR);
    expect(session.getPixel(10, 4)).toEqual(CLEAR);
  });

  it('Space + sol sürükleme çizmez, kamerayı taşır', () => {
    const { editor, session, canvas } = mount();
    editor.setPrimaryColor(RED);
    const before = editor.getTransform();

    // Kamera Space'i yalnız pointer içerideyken dinler.
    editor.element.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    pointerAt(canvas, editor, 4, 4, 'pointerdown');
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: before.offsetX + 60,
        clientY: before.offsetY + 60,
      }),
    );
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    expect(session.getPixel(4, 4)).toEqual(CLEAR);
    expect(session.getState().canUndo).toBe(false);
    expect(editor.getTransform().offsetX).not.toBe(before.offsetX);
  });

  it('orta tuş çizmez', () => {
    const { editor, session, canvas } = mount();
    editor.setPrimaryColor(RED);

    pointerAt(canvas, editor, 6, 6, 'pointerdown', 1);
    pointerAt(canvas, editor, 6, 6, 'pointerup', 1);

    expect(session.getPixel(6, 6)).toEqual(CLEAR);
    expect(session.getState().canUndo).toBe(false);
  });

  it('pointercancel darbeyi geri sarar ve geçmişe yazmaz', () => {
    const { editor, session, canvas } = mount();
    editor.setPrimaryColor(RED);

    pointerAt(canvas, editor, 3, 3, 'pointerdown');
    pointerAt(canvas, editor, 8, 3, 'pointermove');
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));

    expect(session.getPixel(3, 3)).toEqual(CLEAR);
    expect(session.getPixel(8, 3)).toEqual(CLEAR);
    expect(session.getState().canUndo).toBe(false);
    expect(session.isDirty).toBe(false);
  });

  it('araç değişimi aktif gesture-ı iptal eder', () => {
    const { editor, session, canvas } = mount();
    editor.setPrimaryColor(RED);

    pointerAt(canvas, editor, 5, 5, 'pointerdown');
    editor.setActiveTool('fill');

    expect(session.getPixel(5, 5)).toEqual(CLEAR);
    expect(session.getState().canUndo).toBe(false);
    expect(editor.activeTool).toBe('fill');
  });

  it('damlalık rengi geri yazar ve belgeyi kirletmez', () => {
    const { editor, session, canvas } = mount();
    session.surface.setPixel(7, 7, RED);
    editor.setActiveTool('eyedropper');

    pointerAt(canvas, editor, 7, 7, 'pointerdown');
    pointerAt(canvas, editor, 7, 7, 'pointerup');

    expect(editor.getPrimaryColor()).toEqual(RED);
    expect(session.getState().canUndo).toBe(false);
  });

  it('destroy dinleyici ve DOM bırakmaz', () => {
    const { editor } = mount();
    const element = editor.element;

    editor.destroy();
    editor.destroy();

    expect(element.isConnected).toBe(false);
  });
});
