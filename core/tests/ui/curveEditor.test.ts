import { describe, it, expect, vi } from 'vitest';
import { CurveEditor } from '../../src/ui/primitives/CurveEditor';

function canvasOf(editor: CurveEditor): HTMLCanvasElement {
  return editor.element.querySelector('canvas')!;
}

/**
 * jsdom `getBoundingClientRect` sıfır döndürür; düzenleyici o durumda birebir
 * ölçek varsayar, dolayısıyla clientX/Y doğrudan tuval koordinatıdır.
 */
function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, ...init });
}

describe('CurveEditor', () => {
  it('varsayılan kimlik eğrisidir', () => {
    const editor = new CurveEditor();
    expect(editor.getPoints()).toEqual([
      [0, 0],
      [1, 1],
    ]);
    editor.destroy();
  });

  it('noktalar x"e göre SIRALI tutulur', () => {
    const editor = new CurveEditor({
      points: [
        [1, 1],
        [0.2, 0.9],
        [0, 0],
      ],
    });
    expect(editor.getPoints().map((point) => point[0])).toEqual([0, 0.2, 1]);
    editor.destroy();
  });

  it('sample parçalı doğrusal değerlendirir', () => {
    const editor = new CurveEditor({
      points: [
        [0, 0],
        [0.5, 0.9],
        [1, 1],
      ],
    });
    expect(editor.sample(0)).toBeCloseTo(0, 10);
    expect(editor.sample(0.25)).toBeCloseTo(0.45, 10);
    expect(editor.sample(0.5)).toBeCloseTo(0.9, 10);
    expect(editor.sample(0.75)).toBeCloseTo(0.95, 10);
    editor.destroy();
  });

  it('aralık dışı girdi UÇ değerde kelepçelenir', () => {
    const editor = new CurveEditor({
      points: [
        [0.2, 0.3],
        [0.8, 0.7],
      ],
    });
    expect(editor.sample(-1)).toBe(0.3);
    expect(editor.sample(5)).toBe(0.7);
    editor.destroy();
  });

  it('getPoints KOPYA döndürür — dışarıdan bozulamaz', () => {
    const editor = new CurveEditor();
    const points = editor.getPoints();
    (points[0] as unknown as number[])[1] = 9;
    expect(editor.getPoints()[0][1]).toBe(0);
    editor.destroy();
  });

  it('çift tıkla nokta EKLENİR', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({ width: 100, height: 100, onInput });
    canvasOf(editor).dispatchEvent(
      new MouseEvent('dblclick', { clientX: 50, clientY: 50, bubbles: true }),
    );

    expect(editor.getPoints()).toHaveLength(3);
    expect(onInput).toHaveBeenCalled();
    editor.destroy();
  });

  it('Alt+tık nokta SİLER ama ikinin altına inmez', () => {
    const editor = new CurveEditor({
      width: 100,
      height: 100,
      points: [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ],
    });
    const canvas = canvasOf(editor);

    // Ortadaki nokta tuvalde (50, 50).
    canvas.dispatchEvent(pointer('pointerdown', 50, 50, { altKey: true }));
    expect(editor.getPoints()).toHaveLength(2);

    // Kalan iki noktadan birini silmeye çalış: eğri tanımsız olurdu.
    canvas.dispatchEvent(pointer('pointerdown', 0, 100, { altKey: true }));
    expect(editor.getPoints()).toHaveLength(2);
    editor.destroy();
  });

  it('sürükleme noktayı taşır ve alan içinde KELEPÇELER', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({
      width: 100,
      height: 100,
      points: [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ],
      onInput,
    });
    const canvas = canvasOf(editor);

    canvas.dispatchEvent(pointer('pointerdown', 50, 50));
    canvas.dispatchEvent(pointer('pointermove', 60, 20));
    const moved = editor.getPoints()[1];
    expect(moved[0]).toBeCloseTo(0.6, 5);
    expect(moved[1]).toBeCloseTo(0.8, 5);

    // Alan dışına sürüklemek kelepçelenir.
    canvas.dispatchEvent(pointer('pointermove', 500, -500));
    expect(editor.getPoints()[2]).toEqual([1, 1]);
    canvas.dispatchEvent(pointer('pointerup', 500, -500));
    expect(onInput).toHaveBeenCalled();
    editor.destroy();
  });

  it('sürüklenen nokta komşusunu GEÇSE de elden kaçmaz', () => {
    const editor = new CurveEditor({
      width: 100,
      height: 100,
      points: [
        [0, 0],
        [0.3, 0.5],
        [0.6, 0.5],
        [1, 1],
      ],
    });
    const canvas = canvasOf(editor);

    canvas.dispatchEvent(pointer('pointerdown', 30, 50));
    // Komşunun ötesine taşı; sıralama değişir ama sürükleme sürmeli.
    canvas.dispatchEvent(pointer('pointermove', 80, 50));
    canvas.dispatchEvent(pointer('pointermove', 90, 20));

    const points = editor.getPoints();
    expect(points.map((point) => point[0])).toEqual(
      [...points.map((p) => p[0])].sort((a, b) => a - b),
    );
    expect(points[2][0]).toBeCloseTo(0.9, 5);
    editor.destroy();
  });

  it('boş alana tıklamak sürükleme BAŞLATMAZ', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({ width: 100, height: 100, onInput });
    const canvas = canvasOf(editor);
    canvas.dispatchEvent(pointer('pointerdown', 50, 10));
    canvas.dispatchEvent(pointer('pointermove', 60, 20));
    expect(onInput).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('devre dışıyken düzenlenemez', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({ width: 100, height: 100, disabled: true, onInput });
    const canvas = canvasOf(editor);
    canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 50, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointerdown', 0, 100));
    expect(editor.getPoints()).toHaveLength(2);
    expect(onInput).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('setPoints callback TETİKLEMEZ', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({ onInput });
    editor.setPoints([
      [0, 1],
      [1, 0],
    ]);
    expect(onInput).not.toHaveBeenCalled();
    expect(editor.sample(0.5)).toBeCloseTo(0.5, 10);
    editor.destroy();
  });

  it('destroy dinleyicileri bırakır', () => {
    const onInput = vi.fn();
    const editor = new CurveEditor({ width: 100, height: 100, onInput });
    const canvas = canvasOf(editor);
    document.body.appendChild(editor.element);
    editor.destroy();

    canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 50, clientY: 50 }));
    expect(onInput).not.toHaveBeenCalled();
    expect(editor.element.isConnected).toBe(false);
  });
});
