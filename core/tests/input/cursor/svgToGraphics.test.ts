import { describe, it, expect } from 'vitest';
import { parseSvgPath, convertCommands, VOL_CURSOR_ASSETS } from '../../../src/input/cursor';

describe('svgToGraphics', () => {
  it('default cursor pathini çözümler', () => {
    const commands = parseSvgPath(VOL_CURSOR_ASSETS.default.layers[0].d);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0]?.type).toBe('M');
    expect(commands.some((c) => c.type === 'Z')).toBe(true);
  });

  it('text cursor pathini çözümler', () => {
    const commands = parseSvgPath(VOL_CURSOR_ASSETS.text.layers[0].d);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((c) => ['M', 'L', 'Z'].includes(c.type))).toBe(true);
  });

  it('target cursor pathini yayları ve çizgileri çözümler', () => {
    const commands = parseSvgPath(VOL_CURSOR_ASSETS.target.layers[0].d);
    expect(commands.some((c) => c.type === 'A')).toBe(true);
    expect(commands.some((c) => c.type === 'L')).toBe(true);
  });

  it('default cursor pathini kapatır (Z komutu)', () => {
    const commands = parseSvgPath(VOL_CURSOR_ASSETS.default.layers[0].d);
    expect(commands.some((c) => c.type === 'Z')).toBe(true);
  });

  it('yaylar DrawCommand listesine çevrilir', () => {
    const commands = parseSvgPath('M12 6 A6 6 0 1 1 12 18 A6 6 0 1 1 12 6');
    const draw = convertCommands(commands);
    expect(draw.length).toBeGreaterThan(0);
    expect(draw.some((c) => c.type === 'arc')).toBe(true);
  });

  it('elips ve döndürülmüş yay merkez parametrizasyonunu korur', () => {
    const commands = parseSvgPath('M0 0 A8 4 45 0 1 10 10');
    const draw = convertCommands(commands);
    const arc = draw.find((c) => c.type === 'arc');
    expect(arc).toBeDefined();
    if (arc?.type === 'arc') {
      expect(arc.rx).toBe(8);
      expect(arc.ry).toBe(4);
      expect(arc.rotation).toBe(45);
      expect(arc.x).toBe(10);
      expect(arc.y).toBe(10);
    }
  });

  it('desteklenmeyen komut hata verir', () => {
    expect(() => parseSvgPath('M0 0 X1 1')).toThrow();
  });
});
