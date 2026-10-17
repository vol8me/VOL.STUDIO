import { describe, expect, it } from 'vitest';
import { FollowCamera, type FollowCameraConfig } from '../../src/camera/FollowCamera';

const CAMERA: FollowCameraConfig = {
  followMs: 90,
  zoomMin: 0.55,
  zoomMax: 1.9,
  zoomDefault: 1.5,
  zoomStep: 1.18,
  zoomMs: 140,
  kick: { stiffness: 260, damping: 18, max: 14 },
  shakeMax: 8,
  shakeDecay: 2.8,
};

function run(camera: FollowCamera, x: number, y: number, ms: number, frameMs = 1000 / 60): void {
  for (let elapsed = 0; elapsed < ms; elapsed += frameMs) camera.update(x, y, frameMs);
}

function camera(size = 4096): FollowCamera {
  const result = new FollowCamera(CAMERA, size, size);
  result.setViewport(800, 600);
  result.snapTo(size / 2, size / 2);
  return result;
}

describe('FollowCamera', () => {
  it('hedefe zaman sabitiyle yetişir', () => {
    const subject = camera();
    subject.update(2248, 2048, CAMERA.followMs);
    expect(subject.x - 2048).toBeCloseTo(200 * (1 - Math.exp(-1)), 3);
    run(subject, 2248, 1848, 1000);
    expect(subject.x).toBeCloseTo(2248, 1);
    expect(subject.y).toBeCloseTo(1848, 1);
  });

  it('kare hızından bağımsız aynı yere varır', () => {
    const slow = camera();
    const fast = camera();
    run(slow, 2448, 2048, 300, 1000 / 30);
    run(fast, 2448, 2048, 300, 1000 / 120);
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(0.5);
  });

  it('ileri bakmaz: duran hedefte hedefin tam üstünde durur', () => {
    const subject = camera();
    run(subject, 2100, 2000, 2000);
    expect(subject.offsetX).toBeCloseTo(0);
    expect(subject.x).toBeCloseTo(2100, 3);
  });

  it('dünya kenarında görüntüyü dünyada tutar', () => {
    const subject = camera();
    subject.snapTo(0, 0);
    expect(subject.x).toBeCloseTo(400 / CAMERA.zoomDefault);
    const rect = subject.visibleRect();
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
  });

  it('dünyadan büyük görüntüde dünyayı ortalar', () => {
    const subject = new FollowCamera(CAMERA, 500, 400);
    subject.setViewport(1600, 1200);
    subject.snapTo(10, 10);
    expect(subject.x).toBe(250);
    expect(subject.y).toBe(200);
  });

  it('zoom kademelidir, sınırlanır ve yumuşak oturur', () => {
    const subject = camera();
    subject.zoomBy(1);
    expect(subject.zoomTarget).toBeCloseTo(CAMERA.zoomDefault * CAMERA.zoomStep);
    subject.update(2048, 2048, 16);
    expect(subject.zoom).toBeGreaterThan(CAMERA.zoomDefault);
    expect(subject.zoom).toBeLessThan(subject.zoomTarget);
    subject.zoomBy(50);
    expect(subject.zoomTarget).toBe(CAMERA.zoomMax);
    subject.setZoom(0);
    expect(subject.zoomTarget).toBe(CAMERA.zoomMin);
  });

  it('ateş tepmesi görüntüyü atışın tersine iter ve yayla geri gelir', () => {
    const subject = camera();
    subject.kick(0, 150);
    subject.update(2048, 2048, 16);
    expect(subject.offsetX).toBeLessThan(0);
    expect(Math.abs(subject.offsetY)).toBeLessThan(1e-9);
    let peak = 0;
    for (let frame = 0; frame < 20; frame++) {
      subject.update(2048, 2048, 16);
      peak = Math.max(peak, Math.abs(subject.offsetX));
    }
    expect(peak).toBeLessThanOrEqual(CAMERA.kick.max);
    run(subject, 2048, 2048, 1500);
    expect(Math.abs(subject.offsetX)).toBeLessThan(0.05);
  });

  it('çarpma sarsıntısı sınırlıdır ve söner', () => {
    const subject = camera();
    subject.addTrauma(5);
    let peak = 0;
    for (let frame = 0; frame < 20; frame++) {
      subject.update(2048, 2048, 16);
      peak = Math.max(peak, Math.abs(subject.shakeX), Math.abs(subject.shakeY));
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(CAMERA.shakeMax);
    run(subject, 2048, 2048, 1000);
    expect(subject.shakeX).toBe(0);
  });
});
