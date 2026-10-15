import { describe, expect, it } from 'vitest';
import { freeArea } from '@/view/menuLayout';

const STACKED = 0.7;

describe('freeArea', () => {
  it('panel yoksa ya da genişliği sıfırsa tüm ekran boştur', () => {
    expect(freeArea(1280, 800, STACKED)).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
    expect(freeArea(1280, 800, STACKED, { top: 0, left: 0, right: 0, width: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 800,
    });
  });

  it('sağ şeritte boş alan solda, sol şeritte sağdadır', () => {
    expect(freeArea(1280, 800, STACKED, { top: 0, left: 840, right: 1280, width: 440 })).toEqual({
      x: 0,
      y: 0,
      width: 840,
      height: 800,
    });
    expect(freeArea(1280, 800, STACKED, { top: 0, left: 0, right: 440, width: 440 })).toEqual({
      x: 440,
      y: 0,
      width: 840,
      height: 800,
    });
  });

  it('ekranı kaplayan alt levhada boş alan levhanın üstüdür ve ekranı aşmaz', () => {
    expect(freeArea(600, 900, STACKED, { top: 500, left: 0, right: 600, width: 600 })).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 500,
    });
    expect(freeArea(600, 900, STACKED, { top: 4000, left: 0, right: 600, width: 600 }).height).toBe(
      900,
    );
  });
});
