import { describe, expect, it } from 'vitest';
import { measureSvg } from '../../src/lab/svg';

const SAMPLE = `<?xml version="1.0"?>
<!-- <path d="M0 0L9 9"/> yorumun içindeki yol sayılmaz -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="a"><stop offset="0"/><stop offset="1"/></linearGradient>
    <radialGradient id="b"><stop offset="0"/></radialGradient>
    <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
    <mask id="m"><rect width="8" height="8"/></mask>
    <clipPath id="c"><circle r="4"/></clipPath>
  </defs>
  <path d="M0 0 L10 0 C 1 2 3 4 5 6 Z" fill="url(#a)"/>
  <path d="m1 1h4v4z"/>
  <g filter="url(#f)"><circle r="3"/></g>
</svg>`;

describe('measureSvg', () => {
  it('etiketleri, yol komutlarını ve özel kaynakları sayar', () => {
    const result = measureSvg(SAMPLE);
    expect(result.paths).toBe(2);
    expect(result.pathCommands).toBe(4 + 4); // M L C Z + m h v z
    expect(result.gradients).toBe(2);
    expect(result.filters).toBe(1);
    expect(result.masks).toBe(1);
    expect(result.clipPaths).toBe(1);
    // svg, defs, 2 gradient, 3 stop, filter, feGaussianBlur, mask, rect, clipPath, circle, 2 path, g, circle
    expect(result.elements).toBe(17);
    expect(result.bytes).toBe(new TextEncoder().encode(SAMPLE).length);
  });

  it('yorum içindeki etiketleri saymaz', () => {
    expect(measureSvg('<!-- <path d="M0 0"/> --><svg/>')).toMatchObject({
      elements: 1,
      paths: 0,
      pathCommands: 0,
    });
  });

  it('boş girdide sıfır verir', () => {
    expect(measureSvg('')).toEqual({
      bytes: 0,
      elements: 0,
      paths: 0,
      pathCommands: 0,
      gradients: 0,
      filters: 0,
      masks: 0,
      clipPaths: 0,
    });
  });
});
