import { afterEach, describe, expect, it } from 'vitest';
import { CustomCursor } from '@/runtime/ui/CustomCursor';
import { PlayerAimIndicator } from '@/runtime/ui/PlayerAimIndicator';
import {
  approachAngle,
  quantizeEightDirection,
  writeFireDirection,
} from '@/runtime/utils/direction';

describe('oyuncu yön geri bildirimi', () => {
  it('hareket vektörünü sekiz yöne sabitler', () => {
    expect(quantizeEightDirection(0, -1)).toBe(-Math.PI / 2);
    expect(quantizeEightDirection(1, 1)).toBe(Math.PI / 4);
    expect(quantizeEightDirection(-1, 0)).toBe(Math.PI);
    expect(quantizeEightDirection(0, 0)).toBeNull();
  });

  it('açı geçişi 2π sınırında en kısa yolu seçer', () => {
    const current = Math.PI - 0.1;
    const target = -Math.PI + 0.1;
    const result = approachAngle(current, target, 0.5);
    expect(result).toBeCloseTo(Math.PI, 5);
  });

  it('manuel nişan otomatik hedeften önceliklidir', () => {
    const out = { x: 0, y: 0 };
    const written = writeFireDirection(out, 0, 0, 0, -2, [{ x: 10, y: 0, isAlive: true }]);

    expect(written).toBe(true);
    expect(out).toEqual({ x: 0, y: -1 });
  });

  it('aim yoksa en yakın canlı ve sonlu hedefi seçer', () => {
    const out = { x: 9, y: 9 };
    writeFireDirection(out, 0, 0, 0, 0, [
      { x: 1, y: 0, isAlive: false },
      { x: Number.NaN, y: 0, isAlive: true },
      { x: 0, y: 20, isAlive: true },
      { x: 5, y: 0, isAlive: true },
    ]);

    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBeCloseTo(0, 6);
  });

  it('eşit uzaklıkta ilk hedefi ve tam çakışmada deterministik yedeği kullanır', () => {
    const out = { x: 0, y: 0 };
    writeFireDirection(out, 0, 0, 0, 0, [
      { x: 0, y: 0, isAlive: true },
      { x: -1, y: 0, isAlive: true },
    ]);
    expect(out).toEqual({ x: 1, y: 0 });

    writeFireDirection(out, 0, 0, 0, 0, [
      { x: 1, y: 0, isAlive: true },
      { x: 0, y: 1, isAlive: true },
    ]);
    expect(out).toEqual({ x: 1, y: 0 });
  });

  it('canlı hedef yoksa yönü sıfırlar ve ateşi reddeder', () => {
    const out = { x: 4, y: 2 };
    expect(writeFireDirection(out, 0, 0, 0, 0, [])).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('CustomCursor', () => {
  afterEach(() => {
    document.documentElement.classList.remove('vol-custom-cursor-enabled');
    document.body.replaceChildren();
  });

  it('pointer hareketini izler, basılı/onay durumlarını gösterir ve dispose olur', () => {
    const cursor = new CustomCursor(document.body, { enabled: true });
    const move = new Event('pointermove');
    Object.defineProperties(move, { clientX: { value: 120 }, clientY: { value: 80 } });
    document.dispatchEvent(move);
    expect(cursor.element.style.left).toBe('120px');
    expect(cursor.element.style.top).toBe('80px');
    expect(cursor.element.classList.contains('vol-custom-cursor--visible')).toBe(true);

    document.dispatchEvent(new Event('pointerdown'));
    expect(cursor.element.classList.contains('vol-custom-cursor--pressed')).toBe(true);
    document.dispatchEvent(new Event('pointerup'));
    document.dispatchEvent(new Event('click'));
    expect(cursor.element.classList.contains('vol-custom-cursor--confirm')).toBe(true);

    cursor.destroy();
    expect(document.documentElement.classList.contains('vol-custom-cursor-enabled')).toBe(false);
    expect(document.querySelector('.vol-custom-cursor')).toBeNull();
  });

  it('yeni ekran açıldığında pointer hareketi beklemeden görünür', () => {
    const cursor = new CustomCursor(document.body, { enabled: true });

    expect(cursor.element.classList.contains('vol-custom-cursor--visible')).toBe(true);
    expect(cursor.element.style.left).not.toBe('');
    expect(cursor.element.style.top).not.toBe('');

    cursor.destroy();
  });

  it('devre dışı durumda sistem cursor davranışına dokunmaz', () => {
    const cursor = new CustomCursor(document.body, { enabled: false });
    expect(cursor.element.hidden).toBe(true);
    expect(document.documentElement.classList.contains('vol-custom-cursor-enabled')).toBe(false);
    cursor.destroy();
  });
});

describe('PlayerAimIndicator', () => {
  it('gerçek atışta çizimi görünür kılar ve ömrü bitince saklar', () => {
    const calls: string[] = [];
    const graphics = {
      visible: false,
      setDepth: () => graphics,
      setVisible: (value: boolean) => {
        graphics.visible = value;
        return graphics;
      },
      setPosition: () => graphics,
      clear: () => {
        calls.push('clear');
        return graphics;
      },
      lineStyle: () => {
        calls.push('lineStyle');
        return graphics;
      },
      beginPath: () => graphics,
      moveTo: () => graphics,
      lineTo: () => graphics,
      strokePath: () => {
        calls.push('strokePath');
        return graphics;
      },
      destroy: () => {},
    };
    const scene = { add: { graphics: () => graphics } } as never;
    const indicator = new PlayerAimIndicator(scene);

    indicator.show(100, 100, 1, 0);
    expect(graphics.visible).toBe(true);
    expect(calls).toContain('strokePath');

    indicator.update(200, 100, 100);
    expect(graphics.visible).toBe(false);
    indicator.destroy();
  });
});
