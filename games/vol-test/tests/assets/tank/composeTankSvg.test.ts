import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeTankSvg, type TankSvgParts } from '@/assets/tank/composeTankSvg';

const names = {
  hull: 'hull',
  turret: 'turret',
  tread: 'tread',
  treadEnd: 'tread-end',
  core: 'core',
  feeler: 'feeler',
};
const parts = Object.fromEntries(
  Object.entries(names).map(([key, name]) => [
    key,
    readFileSync(resolve(process.cwd(), `src/assets/tank/${name}.svg`), 'utf8'),
  ]),
) as unknown as TankSvgParts;

describe('birleşik tank SVG', () => {
  it('viewBox taşımayan parçayı reddeder', () => {
    expect(() =>
      composeTankSvg({ ...parts, hull: '<svg/>' }, { size: 64, heading: 0, turret: 0 }),
    ).toThrow('viewBox');
  });
  it('gerçek parçalardan geçerli, bağımsız taret açılı ve çakışmasız SVG kurar', () => {
    const svg = composeTankSvg(parts, { size: 1024, heading: -45, turret: -20 });
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.documentElement.getAttribute('width')).toBe('1024');
    expect(xml.documentElement.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg).toContain('rotate(-45)');
    expect(svg).toContain('rotate(25)');
    const ids = [...xml.querySelectorAll('[id]')].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of svg.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(match[1]);
    expect(xml.querySelectorAll('[data-part="treadEnd"]')).toHaveLength(4);
    expect(xml.querySelectorAll('[data-part="hull"]')).toHaveLength(1);
  });
});
