import { describe, expect, it } from 'vitest';
import { FrameWindow } from '../../src/time/FrameWindow';

describe('FrameWindow', () => {
  it('sıfır saat başlangıcını ve aynı pencerenin yük örneklerini korur', () => {
    const window = new FrameWindow(30);
    expect(window.push(0, 'game:10', { enemies: 10, updateMs: 0 })).toBeNull();
    expect(window.push(16, 'game:10', { enemies: 11, updateMs: 2 })).toBeNull();
    expect(window.push(32, 'game:10', { enemies: 12, updateMs: 4 })).toMatchObject({
      context: 'game:10',
      start: 0,
      end: 32,
      frames: 2,
      metrics: { enemies: { min: 11, max: 12, avg: 11.5, samples: 2 } },
    });
  });
  it('menü ve pause geçişindeki aralığı oynanışa yazmaz', () => {
    const window = new FrameWindow();
    window.push(0, 'game', { enemies: 20 });
    window.push(16, 'game', { enemies: 20 });
    expect(window.push(1000, 'pause', {})).toMatchObject({
      context: 'game',
      frames: 1,
      p95: 16,
      end: 16,
    });
    window.push(1016, 'pause', {});
    expect(window.flush()).toMatchObject({ context: 'pause', frames: 1, p95: 16 });
    expect(window.flush()).toBeNull();
  });
  it('ters ve geçersiz saatler istatistiğe girmez; tek ilk kare boş özet bırakır', () => {
    const window = new FrameWindow();
    window.push(NaN, 'game', {});
    window.push(20, 'game', {});
    window.push(10, 'game', {});
    expect(window.flush()).toBeNull();
  });
});
