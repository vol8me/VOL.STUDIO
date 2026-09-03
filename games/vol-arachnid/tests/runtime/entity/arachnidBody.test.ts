import { describe, expect, it } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';
import { ArachnidBody } from '@/runtime/entity/ArachnidBody';

const FRAME_MS = 16;
const CENTER_X = arenaConfig.widthPx / 2;
const CENTER_Y = arenaConfig.heightPx / 2;

const intentAt = (rad: number) => new Vector2(Math.cos(rad), Math.sin(rad));

/**
 * Atılımı gerçek karelerle tüketir.
 *
 * Testler bir dönem tüm atılımı TEK bir `durationMs` karesiyle geçiriyordu; bu
 * yalnız atılım sayacı ham `deltaMs`i harcadığı için işe yarıyordu. Simülasyon
 * adımı `TECH.MAX_SIM_STEP_MS`e kelepçelendiğinden 140 ms'lik bir kare artık
 * 100 ms yaşar — doğrusu da budur, çünkü aynı karede gövde de yalnız 100 ms
 * yol alır. Atılım artık gerçekten geçmesi gereken kadar kare sürüyor.
 */
function runOutDash(body: ArachnidBody, frameMs = FRAME_MS): void {
  for (let i = 0; i < 200 && body.isDashing; i++) {
    body.update(Vector2.zero(), false, frameMs);
  }
}

/** Bekleme süresini kelepçeye uyan karelerle geçirir. */
function waitMs(body: ArachnidBody, totalMs: number, frameMs = FRAME_MS): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) {
    body.update(Vector2.zero(), false, frameMs);
  }
}

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

    runOutDash(body);
    expect(body.isDashing).toBe(false);
    body.update(new Vector2(-1, 0), true, 1);
    expect(body.isDashing).toBe(false);

    waitMs(body, playerConfig.dash.cooldownMs);
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

  it('tuş basılı tutulunca cooldown sonunda kendiliğinden yeniden atılmaz', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(new Vector2(1, 0), true, FRAME_MS);
    expect(body.consumeDashLaunch()).toBe(true);

    for (let elapsed = 0; elapsed < playerConfig.dash.cooldownMs + 100; elapsed += FRAME_MS) {
      body.update(new Vector2(1, 0), true, FRAME_MS);
    }
    expect(body.consumeDashLaunch()).toBe(false);
    expect(body.isDashing).toBe(false);

    // Yeniden tetiklemek için gerçek bir bırakma + basma kenarı gerekir.
    body.update(new Vector2(1, 0), false, FRAME_MS);
    body.update(new Vector2(1, 0), true, FRAME_MS);
    expect(body.consumeDashLaunch()).toBe(true);
  });

  it.each([
    [
      'sol',
      arenaConfig.bodyRadiusPx + 1,
      CENTER_Y,
      new Vector2(-1, 0),
      'x',
      arenaConfig.bodyRadiusPx,
      1,
    ],
    [
      'sağ',
      arenaConfig.widthPx - arenaConfig.bodyRadiusPx - 1,
      CENTER_Y,
      new Vector2(1, 0),
      'x',
      arenaConfig.widthPx - arenaConfig.bodyRadiusPx,
      -1,
    ],
    [
      'üst',
      CENTER_X,
      arenaConfig.bodyRadiusPx + 1,
      new Vector2(0, -1),
      'y',
      arenaConfig.bodyRadiusPx,
      1,
    ],
    [
      'alt',
      CENTER_X,
      arenaConfig.heightPx - arenaConfig.bodyRadiusPx - 1,
      new Vector2(0, 1),
      'y',
      arenaConfig.heightPx - arenaConfig.bodyRadiusPx,
      -1,
    ],
  ] as const)(
    '%s duvarında konumu kelepçeler ve atılımı SEKTİRİR',
    (_label, x, y, intent, axis, edge, inwardSign) => {
      const body = new ArachnidBody(x, y);

      body.update(intent, true, FRAME_MS);

      expect(body.position[axis]).toBe(edge);
      // Sekme: hız duvardan İÇERİ döner, sıfırlanmaz.
      expect(body.velocity[axis] * inwardSign).toBeGreaterThan(0);
      expect(body.isDashing).toBe(false);

      const impact = body.consumeWallImpact();
      expect(impact).not.toBeNull();
      expect(impact?.strength01).toBeGreaterThan(0.9);
      // Temas noktası DUVARIN üstündedir; gövde merkezi bir yarıçap içeridedir.
      const contact = axis === 'x' ? impact?.x : impact?.y;
      expect(contact).toBe(edge - inwardSign * arenaConfig.bodyRadiusPx);
      // Aynı çarpma iki kez tüketilemez.
      expect(body.consumeWallImpact()).toBeNull();
    },
  );

  it('eşiğin altındaki temas sekmez, yalnız duvara dik bileşeni söndürür', () => {
    const body = new ArachnidBody(arenaConfig.bodyRadiusPx + 1, CENTER_Y);

    // Yürüyerek duvara dayanmak çarpma DEĞİLDİR: tam yürüyüş hızı bile
    // (235 px/s) çarpma eşiğinin (300 px/s) altındadır.
    for (let i = 0; i < 90; i++) body.update(new Vector2(-1, 0), false, FRAME_MS);
    expect(body.speed).toBeLessThan(playerConfig.wall.impactSpeedPxPerSec);

    expect(body.position.x).toBe(arenaConfig.bodyRadiusPx);
    expect(body.velocity.x).toBe(0);
    expect(body.consumeWallImpact()).toBeNull();
  });

  it('dönüş hızı tavanı aşılamaz ve 180° dönüş bir karede tamamlanmaz', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);
    const start = body.facingRad;

    let maxTurnRate = 0;
    for (let i = 0; i < 8; i++) {
      body.update(intentAt(Math.PI / 2), false, FRAME_MS);
      maxTurnRate = Math.max(maxTurnRate, Math.abs(body.turnRate));
    }

    expect(maxTurnRate).toBeLessThanOrEqual(playerConfig.maxTurnRateRadPerSec + 1e-9);
    // Sekiz karede (128 ms) tavan hızla en fazla ~0.45 rad dönülebilir.
    expect(circularDistance(body.facingRad, start)).toBeLessThan(
      (playerConfig.maxTurnRateRadPerSec * 8 * FRAME_MS) / 1000 + 1e-6,
    );
  });

  it('sert dönüşte hız kesilir', () => {
    const straight = new ArachnidBody(CENTER_X, CENTER_Y);
    for (let i = 0; i < 30; i++) straight.update(intentAt(-Math.PI / 2), false, FRAME_MS);

    const turning = new ArachnidBody(CENTER_X, CENTER_Y);
    for (let i = 0; i < 30; i++) turning.update(intentAt(Math.PI / 2), false, FRAME_MS);

    expect(turning.speed).toBeLessThan(straight.speed);
  });

  it('atılım şiddeti anında dolar ve atılım bitince sönümlenerek iner', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(new Vector2(1, 0), true, FRAME_MS);
    expect(body.dash01).toBe(1);

    runOutDash(body);
    body.update(Vector2.zero(), false, FRAME_MS);
    expect(body.dash01).toBeGreaterThan(0);
    expect(body.dash01).toBeLessThan(1);

    for (let i = 0; i < 30; i++) body.update(Vector2.zero(), false, FRAME_MS);
    expect(body.dash01).toBe(0);
  });

  it('atılım sürerken yön KİLİTLİDİR, girdiyle dümen kırılamaz', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    // Sağa atıl, sonra sola basılı tut: yön SOLA değil, uçulan yöne (+x) döner.
    body.update(new Vector2(1, 0), true, FRAME_MS);
    const beforeLock = circularDistance(body.facingRad, 0);
    for (let i = 0; i < 5; i++) body.update(new Vector2(-1, 0), false, FRAME_MS);

    expect(body.isDashing).toBe(true);
    expect(body.velocity.x).toBeGreaterThan(0);
    // Girdi kazansaydı bu mesafe BÜYÜRDÜ (sol = π uzakta).
    expect(circularDistance(body.facingRad, 0)).toBeLessThan(beforeLock);

    // Atılım bitince kilit kalkar ve gövde girdiye dönmeye başlar.
    runOutDash(body);
    const released = body.facingRad;
    for (let i = 0; i < 20; i++) body.update(new Vector2(-1, 0), false, FRAME_MS);
    expect(circularDistance(body.facingRad, released)).toBeGreaterThan(0.05);
  });

  it('atılımın başladığı kareyi BİR KEZ bildirir', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    expect(body.consumeDashLaunch()).toBe(false);
    body.update(new Vector2(1, 0), true, FRAME_MS);
    expect(body.consumeDashLaunch()).toBe(true);
    expect(body.consumeDashLaunch()).toBe(false);
  });

  it('atılımın bittiği kareyi BİR KEZ bildirir', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(new Vector2(1, 0), true, FRAME_MS);
    expect(body.consumeDashLanding()).toBe(false);

    runOutDash(body);
    expect(body.consumeDashLanding()).toBe(true);
    expect(body.consumeDashLanding()).toBe(false);
  });

  it('duvara çarparak biten atılım da iniş bildirir', () => {
    const body = new ArachnidBody(arenaConfig.bodyRadiusPx + 1, CENTER_Y);

    body.update(new Vector2(-1, 0), true, FRAME_MS);

    expect(body.isDashing).toBe(false);
    expect(body.consumeDashLanding()).toBe(true);
  });

  it('ivme vektörü hızlanma ve frenlemede zıt işaretlidir', () => {
    const body = new ArachnidBody(CENTER_X, CENTER_Y);

    body.update(new Vector2(1, 0), false, FRAME_MS);
    expect(body.accelerationVector.x).toBeGreaterThan(0);

    body.update(Vector2.zero(), false, FRAME_MS);
    expect(body.accelerationVector.x).toBeLessThan(0);
  });

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
