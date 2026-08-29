import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/math/Vector2';
import {
  distance,
  distanceSquared,
  segmentCircleOverlap,
  circlesOverlap,
  pointInCircle,
  pointInRect,
  rectsOverlap,
  circleRectOverlap,
  raycastCircles,
} from '../../src/math/geometry';

describe('geometri', () => {
  it('distanceSquared kare kök almadan hesaplar', () => {
    expect(distanceSquared(0, 0, 3, 4)).toBe(25);
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('segmentCircleOverlap segment içindeki daireyi endpoint olmadan yakalar', () => {
    expect(segmentCircleOverlap(0, 0, 100, 0, 50, 0, 3)).toBe(true);
    expect(segmentCircleOverlap(0, 0, 100, 0, 50, 5, 3)).toBe(false);
    expect(segmentCircleOverlap(0, 0, 0, 0, 0, 0, 1)).toBe(true);
  });

  it('circlesOverlap teğet durumu kesişme SAYAR', () => {
    const a = { x: 0, y: 0, radius: 5 };
    expect(circlesOverlap(a, { x: 10, y: 0, radius: 5 })).toBe(true);
    expect(circlesOverlap(a, { x: 10.1, y: 0, radius: 5 })).toBe(false);
  });

  it('pointInCircle sınırı dahil eder', () => {
    const c = { x: 0, y: 0, radius: 5 };
    expect(pointInCircle(5, 0, c)).toBe(true);
    expect(pointInCircle(5.1, 0, c)).toBe(false);
  });

  it('pointInRect sınırı dahil eder', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(pointInRect(0, 0, r)).toBe(true);
    expect(pointInRect(10, 10, r)).toBe(true);
    expect(pointInRect(10.1, 5, r)).toBe(false);
  });

  it('rectsOverlap kesişmeyi ve ayrıklığı ayırır', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
  });

  it('circleRectOverlap KÖŞE temasını yakalar', () => {
    // Kaba bir "merkez dikdörtgende mi" testi bunu kaçırırdı: daire merkezi
    // dikdörtgenin dışında ama köşeye değiyor.
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(circleRectOverlap({ x: -2, y: -2, radius: 3 }, rect)).toBe(true);
    expect(circleRectOverlap({ x: -5, y: -5, radius: 3 }, rect)).toBe(false);
  });

  it('circleRectOverlap kenar teması ve içeride olma durumunu kapsar', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(circleRectOverlap({ x: 5, y: 5, radius: 1 }, rect)).toBe(true);
    expect(circleRectOverlap({ x: 13, y: 5, radius: 3 }, rect)).toBe(true);
  });
});

describe('raycastCircles', () => {
  const right = new Vector2(1, 0);
  const origin = new Vector2(0, 0);

  it('en YAKIN hedefi döner', () => {
    const near = { x: 50, y: 0, radius: 5 };
    const far = { x: 200, y: 0, radius: 5 };

    const hit = raycastCircles(origin, right, [far, near]);
    expect(hit?.target).toBe(near);
    expect(hit?.distance).toBeCloseTo(45, 5);
  });

  it('ışının ARKASINDAKİ hedefi vurmaz', () => {
    // "Arkamdaki düşmanı vurdum" hatasının kaynağı budur.
    const behind = { x: -50, y: 0, radius: 5 };
    expect(raycastCircles(origin, right, [behind])).toBeNull();
  });

  it('ışın çizgisinden uzaktaki hedefi ıskalar', () => {
    const off = { x: 50, y: 40, radius: 5 };
    expect(raycastCircles(origin, right, [off])).toBeNull();
  });

  it('maxDistance ötesindeki hedef elenir', () => {
    const far = { x: 200, y: 0, radius: 5 };
    expect(raycastCircles(origin, right, [far], 100)).toBeNull();
    expect(raycastCircles(origin, right, [far], 250)?.target).toBe(far);
  });

  it('ışın dairenin İÇİNDE başlıyorsa mesafe 0 döner', () => {
    const around = { x: 0, y: 0, radius: 10 };
    expect(raycastCircles(origin, right, [around])?.distance).toBe(0);
  });

  it('normalize edilmemiş yön aynı sonucu verir', () => {
    const target = { x: 50, y: 0, radius: 5 };
    const long = raycastCircles(origin, new Vector2(100, 0), [target]);
    const unit = raycastCircles(origin, right, [target]);

    expect(long?.distance).toBeCloseTo(unit?.distance ?? -1, 10);
  });

  it('sıfır uzunlukta yön null döner (yönsüz ışın vuramaz)', () => {
    expect(raycastCircles(origin, Vector2.zero(), [{ x: 5, y: 0, radius: 5 }])).toBeNull();
  });

  it('hedef yoksa null döner', () => {
    expect(raycastCircles(origin, right, [])).toBeNull();
  });
});
