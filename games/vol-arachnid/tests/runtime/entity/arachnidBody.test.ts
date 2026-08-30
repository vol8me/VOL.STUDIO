import { describe, expect, it } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';

const FRAME_MS = 16;
const CENTER_X = arenaConfig.widthPx / 2;
const CENTER_Y = arenaConfig.heightPx / 2;

const intentAt = (rad: number) => new Vector2(Math.cos(rad), Math.sin(rad));

function circularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

describe('ArachnidBody hareketi', () => {
  it('hareket niyetine anlık sıçramak yerine ivmeyle yaklaşır', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    const deltaMs = 100;

    body.update(new Vector2(1, 0), false, deltaMs);

    const expectedSpeed = Math.min(
      playerConfig.maxSpeed,
      playerConfig.accelerationPxPerSec2 * (deltaMs / 1000),
    );
    expect(body.velocity.x).toBeCloseTo(expectedSpeed, 8);
    expect(body.velocity.y).toBe(0);
    expect(body.position.x).toBeCloseTo(CENTER_X + expectedSpeed * (deltaMs / 1000), 8);
  });

  it('girdi bırakıldığında hızı hedefi aşmadan frenler', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    body.update(new Vector2(1, 0), false, 100);
    const speedBeforeBrake = body.speed;

    const brakeMs = 50;
    body.update(Vector2.zero(), false, brakeMs);

    const expected = Math.max(0, speedBeforeBrake - playerConfig.brakePxPerSec2 * (brakeMs / 1000));
    expect(body.speed).toBeCloseTo(expected, 8);
    expect(body.speed).toBeLessThan(speedBeforeBrake);
  });

  it('dash yönünü başlangıçta kilitler ve cooldown dolmadan yeniden tetiklemez', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    expect(body.dashProgress).toBe(1);
    body.update(new Vector2(1, 0), true, FRAME_MS);

    expect(body.isDashing).toBe(true);
    expect(body.speed).toBeCloseTo(playerConfig.dash.speedPxPerSec, 8);
    expect(body.velocity.x).toBeGreaterThan(0);
    expect(body.dashProgress).toBe(0);

    body.update(new Vector2(-1, 0), true, FRAME_MS);
    expect(body.velocity.x).toBeGreaterThan(0);

    body.update(Vector2.zero(), false, playerConfig.dash.durationMs);
    expect(body.isDashing).toBe(false);
    body.update(new Vector2(-1, 0), true, 1);
    expect(body.isDashing).toBe(false);

    body.update(Vector2.zero(), false, playerConfig.dash.cooldownMs);
    body.update(new Vector2(-1, 0), true, 1);
    expect(body.isDashing).toBe(true);
    expect(body.velocity.x).toBeLessThan(0);
  });

  it('niyet yokken baktığı yönde dash atar', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(Vector2.zero(), true, FRAME_MS);

    expect(body.velocity.x).toBeCloseTo(0, 8);
    expect(body.velocity.y).toBeCloseTo(-playerConfig.dash.speedPxPerSec, 8);
  });

  it.each([
    [
      'sol',
      arenaConfig.bodyRadiusPx + 1,
      CENTER_Y,
      new Vector2(-1, 0),
      'x',
      arenaConfig.bodyRadiusPx,
    ],
    [
      'sağ',
      arenaConfig.widthPx - arenaConfig.bodyRadiusPx - 1,
      CENTER_Y,
      new Vector2(1, 0),
      'x',
      arenaConfig.widthPx - arenaConfig.bodyRadiusPx,
    ],
    [
      'üst',
      CENTER_X,
      arenaConfig.bodyRadiusPx + 1,
      new Vector2(0, -1),
      'y',
      arenaConfig.bodyRadiusPx,
    ],
    [
      'alt',
      CENTER_X,
      arenaConfig.heightPx - arenaConfig.bodyRadiusPx - 1,
      new Vector2(0, 1),
      'y',
      arenaConfig.heightPx - arenaConfig.bodyRadiusPx,
    ],
  ] as const)(
    '%s duvarında konumu kelepçeler ve dışarı yönlü hızı sıfırlar',
    (_label, x, y, intent, axis, edge) => {
      const body = new ArachnidBody(x, y);

      body.update(intent, true, FRAME_MS);

      expect(body.position[axis]).toBe(edge);
      expect(body.velocity[axis]).toBe(0);
    },
  );

  it('±π sınırında en kısa yönden dönüp açıyı sarılı aralıkta tutar', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    const beforeSeam = Math.PI - 0.05;

    for (let i = 0; i < 300; i += 1) {
      body.position.set(CENTER_X, CENTER_Y);
      body.velocity.set(0, 0);
      body.update(intentAt(beforeSeam), false, FRAME_MS);
    }

    expect(circularDistance(body.facingRad, beforeSeam)).toBeLessThan(1e-3);
    const previous = body.facingRad;
    body.update(intentAt(-Math.PI + 0.05), false, FRAME_MS);

    expect(body.turnRate).toBeGreaterThan(0);
    expect(circularDistance(body.facingRad, previous)).toBeLessThan(0.1);
    expect(body.facingRad).toBeGreaterThanOrEqual(-Math.PI);
    expect(body.facingRad).toBeLessThanOrEqual(Math.PI);
  });

  it('pozitif olmayan delta değerinde durumu değiştirmez', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(new Vector2(1, 0), true, 0);

    expect(body.position.x).toBe(CENTER_X);
    expect(body.position.y).toBe(CENTER_Y);
    expect(body.speed).toBe(0);
    expect(body.dashProgress).toBe(1);
  });
});
