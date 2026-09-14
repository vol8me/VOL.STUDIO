import { describe, expect, it } from 'vitest';
import { resolveCameraDomain } from '@/runtime/render/cameraDomain';

const BBOX = { x: 100, y: 200, width: 400, height: 300 };

describe('resolveCameraDomain', () => {
  it('habitat kutusuna Void payı ekler ve merkezde kalır', () => {
    const domain = resolveCameraDomain(BBOX, 0.15);
    expect(domain.x).toBe(100 - 60);
    expect(domain.y).toBe(200 - 60);
    expect(domain.width).toBe(400 + 120);
    expect(domain.height).toBe(300 + 120);
  });

  it('sıfır pay kutunun kendisini döndürür', () => {
    const domain = resolveCameraDomain(BBOX, 0);
    expect(domain).toEqual(BBOX);
  });

  it('geçersiz Void payını reddeder', () => {
    expect(() => resolveCameraDomain(BBOX, -1)).toThrow(RangeError);
    expect(() => resolveCameraDomain(BBOX, Number.NaN)).toThrow(RangeError);
  });

  it('geçersiz habitat kutusunu reddeder', () => {
    expect(() => resolveCameraDomain({ x: 0, y: 0, width: 0, height: 10 }, 0.1)).toThrow(
      RangeError,
    );
    expect(() => resolveCameraDomain({ x: 0, y: 0, width: 10, height: 0 }, 0.1)).toThrow(
      RangeError,
    );
  });

  it('büyük Void payı büyük gezinme alanı üretir', () => {
    const small = resolveCameraDomain(BBOX, 0.1);
    const large = resolveCameraDomain(BBOX, 0.5);
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });
});
