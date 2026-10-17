import { describe, expect, it } from 'vitest';
import { DEBRIS } from '@/config/debris';
import { LIGHT, TANK_SHADOW_HEIGHT } from '@/config/light';
import { SPIDER_ART } from '@/config/spiders';

describe('ortak ışık', () => {
  it('örümcek ve enkaz aynı ışık yönünü kullanır, ışık aşağı-sağa düşer', () => {
    expect(SPIDER_ART.light).toBe(LIGHT);
    expect(DEBRIS.light).toBe(LIGHT);
    expect(LIGHT.x).toBeGreaterThan(0);
    expect(LIGHT.y).toBeGreaterThan(LIGHT.x);
  });

  it('tank gölgesi aynı yönde, gövde yüksekliğiyle orantılı kayar', () => {
    expect(TANK_SHADOW_HEIGHT).toBeGreaterThan(0);
    expect((LIGHT.y * TANK_SHADOW_HEIGHT) / (LIGHT.x * TANK_SHADOW_HEIGHT)).toBeCloseTo(
      LIGHT.y / LIGHT.x,
    );
  });
});
