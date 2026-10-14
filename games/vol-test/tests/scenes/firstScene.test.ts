import { describe, expect, it } from 'vitest';
import { firstScene } from '@/scenes/firstScene';

describe('firstScene', () => {
  const player = { measurements: undefined };

  it('oyuncuya ana menüyü gösterir', () => {
    expect(firstScene(player, '')).toBe('Menu');
    expect(firstScene(player, '?weather=rain')).toBe('Menu');
    expect(firstScene(player, '?start=garage')).toBe('Menu');
  });

  it('start=world bağlantısı menüyü atlar', () => {
    expect(firstScene(player, '?start=world')).toBe('World');
    expect(firstScene(player, '?weather=rain&start=world')).toBe('World');
  });

  it('ölçüm koşusu ve hizmetsiz açılış doğrudan dünyayı açar', () => {
    expect(firstScene({ measurements: {} as never }, '')).toBe('World');
    expect(firstScene(undefined, '')).toBe('World');
  });
});
