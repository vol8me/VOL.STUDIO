import { describe, expect, it } from 'vitest';
import { compassDegrees, formatHeading, formatMetres, formatSpeed } from '@/hud/format';

describe('format', () => {
  it('hızı metre/saniye yazar', () => {
    expect(formatSpeed(230, 32)).toBe('7.2');
    expect(formatSpeed(0, 32)).toBe('0.0');
  });

  it('ekran açısını pusula derecesine çevirir', () => {
    expect(compassDegrees(-Math.PI / 2)).toBe(0);
    expect(compassDegrees(0)).toBe(90);
    expect(compassDegrees(Math.PI / 2)).toBe(180);
    expect(compassDegrees(Math.PI)).toBe(270);
    expect(compassDegrees(-Math.PI)).toBe(270);
  });

  it('rotayı üç haneli yazar, konumu metreye çevirir', () => {
    expect(formatHeading(-Math.PI / 2)).toBe('000°');
    expect(formatHeading(0)).toBe('090°');
    expect(formatMetres(2048, 32)).toBe('64');
  });
});
