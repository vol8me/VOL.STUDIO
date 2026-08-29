import { afterEach, describe, expect, it } from 'vitest';
import { CustomCursor } from '@/runtime/ui/CustomCursor';
import { PlayerAimIndicator } from '@/runtime/ui/PlayerAimIndicator';
import { PlayerDirectionIndicator } from '@/runtime/ui/PlayerDirectionIndicator';
import { uiConfig } from '@/config/ui';
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

/**
 * Phaser `Graphics` sahtesi — çizim çağrılarını sırayla kaydeder.
 *
 * Göstergeler `scene.add.graphics()` dışında Phaser'a hiç dokunmaz; gerçek bir
 * sahne kurmak testi Phaser'ın canvas'ına bağlardı.
 */
function fakeGraphics() {
  const lineStyles: { width: number; color: number; alpha: number }[] = [];
  const positions: { x: number; y: number }[] = [];
  const graphics = {
    visible: false,
    lineStyles,
    positions,
    setDepth: () => graphics,
    setVisible: (value: boolean) => {
      graphics.visible = value;
      return graphics;
    },
    setPosition: (x: number, y: number) => {
      positions.push({ x, y });
      return graphics;
    },
    clear: () => graphics,
    lineStyle: (width: number, color: number, alpha: number) => {
      lineStyles.push({ width, color, alpha });
      return graphics;
    },
    beginPath: () => graphics,
    moveTo: () => graphics,
    lineTo: () => graphics,
    strokePath: () => graphics,
    destroy: () => {},
  };
  return graphics;
}

describe('PlayerDirectionIndicator', () => {
  function make() {
    const graphics = fakeGraphics();
    const indicator = new PlayerDirectionIndicator({
      add: { graphics: () => graphics },
    } as never);
    return { graphics, indicator };
  }

  it('hareket varken görünür olur ve oyuncuyu takip eder', () => {
    const { graphics, indicator } = make();

    indicator.update(16, 300, 200, 1, 0);
    expect(graphics.visible).toBe(true);
    expect(graphics.positions.at(-1)).toEqual({ x: 300, y: 200 });

    indicator.update(16, 320, 210, 1, 0);
    expect(graphics.positions.at(-1)).toEqual({ x: 320, y: 210 });
    indicator.destroy();
  });

  it('hareket kesilince sönerek görünmez olur', () => {
    const { graphics, indicator } = make();
    for (let i = 0; i < 20; i++) indicator.update(16, 0, 0, 1, 0);
    expect(graphics.visible).toBe(true);

    // Sönme üstel yaklaşımdır: tek kare yetmez, birkaç kare sonra eşiğin altına iner.
    for (let i = 0; i < 60; i++) indicator.update(16, 0, 0, 0, 0);
    expect(graphics.visible).toBe(false);
    indicator.destroy();
  });

  it("rengi config'ten okur — runtime dosyasında hex sabiti kalmaz", () => {
    const { graphics, indicator } = make();
    indicator.update(16, 0, 0, 0, 1);

    expect(graphics.lineStyles.at(-1)?.color).toBe(uiConfig.playerFeedback.direction.color);
    expect(graphics.lineStyles.at(-1)?.width).toBe(uiConfig.playerFeedback.direction.lineWidthPx);
    indicator.destroy();
  });

  it('reset dalga sınırında çizimi ve görünürlüğü bırakır', () => {
    const { graphics, indicator } = make();
    for (let i = 0; i < 10; i++) indicator.update(16, 0, 0, 1, 0);
    expect(graphics.visible).toBe(true);

    indicator.reset();
    expect(graphics.visible).toBe(false);
    indicator.destroy();
  });

  it('destroy iki kez çağrılabilir ve sonrasında update sessizdir', () => {
    const { graphics, indicator } = make();
    indicator.destroy();
    expect(() => indicator.destroy()).not.toThrow();

    const before = graphics.positions.length;
    indicator.update(16, 5, 5, 1, 0);
    indicator.reset();
    expect(graphics.positions.length).toBe(before);
  });

  it('sonlu olmayan delta çizimi bozmaz', () => {
    const { indicator } = make();
    expect(() => indicator.update(Number.NaN, 0, 0, 1, 0)).not.toThrow();
    expect(() => indicator.update(-50, 0, 0, 1, 0)).not.toThrow();
    indicator.destroy();
  });
});
