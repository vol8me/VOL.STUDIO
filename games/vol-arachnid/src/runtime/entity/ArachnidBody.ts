import { Cooldown, Spring1D, Vector2, clamp, type Vector2 as Vec } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';

const MS_PER_SEC = 1000;

/**
 * Örümceğin gövde hareketi: ivmeli hız, sürtünmeli duruş, yay ile yumuşatılan
 * dönüş ve arena sınırına kelepçeleme.
 *
 * Hız doğrudan girdiye EŞİTLENMEZ; hedefe ivmeyle yaklaşır ve girdi kesilince
 * frenle söner. Yön de anlık değişmez — yay, gövdeyi hedefe doğru döndürürken
 * dönüşün şiddetini de (`turnRate`) verir, bacak yürüyüşü bunu kullanır.
 */
export class ArachnidBody {
  readonly position = new Vector2(0, 0);
  readonly velocity = new Vector2(0, 0);

  private readonly facing = new Spring1D(-Math.PI / 2);
  private readonly dashCooldown = new Cooldown(playerConfig.dash.cooldownMs);
  private dashRemainingMs = 0;
  private readonly dashDirection = new Vector2(0, -1);

  constructor(x: number, y: number) {
    this.position.set(x, y);
  }

  /** Yay ile yumuşatılmış görsel yön (radyan). */
  get facingRad(): number {
    return this.facing.value;
  }

  /** Dönüşün anlık şiddeti (rad/s) — uzuv yaslanması bunu tüketir. */
  get turnRate(): number {
    return this.facing.velocity;
  }

  get speed(): number {
    return this.velocity.length();
  }

  get isDashing(): boolean {
    return this.dashRemainingMs > 0;
  }

  /** [0,1] — dash'in yeniden hazır olma ilerlemesi; HUD tüketir. */
  get dashProgress(): number {
    return this.dashCooldown.getProgress();
  }

  update(moveIntent: Vec, dashPressed: boolean, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / MS_PER_SEC;
    if (dt <= 0) return;

    this.dashCooldown.update(deltaMs);

    const intentLength = moveIntent.length();
    const hasIntent = intentLength > 1e-3;

    if (dashPressed && this.dashCooldown.tryTrigger()) {
      this.dashRemainingMs = playerConfig.dash.durationMs;
      // Dash yönü: girdi varsa oraya, yoksa gövdenin baktığı yöne.
      if (hasIntent)
        this.dashDirection.set(moveIntent.x / intentLength, moveIntent.y / intentLength);
      else this.dashDirection.set(Math.cos(this.facing.value), Math.sin(this.facing.value));
    }

    if (this.dashRemainingMs > 0) {
      this.dashRemainingMs -= deltaMs;
      this.velocity.set(
        this.dashDirection.x * playerConfig.dash.speedPxPerSec,
        this.dashDirection.y * playerConfig.dash.speedPxPerSec,
      );
    } else if (hasIntent) {
      // Niyetin BÜYÜKLÜĞÜ hız kesridir: yarıya itilen bir çubuk yarım hız verir.
      const scale = Math.min(1, intentLength);
      const targetX = (moveIntent.x / intentLength) * playerConfig.maxSpeed * scale;
      const targetY = (moveIntent.y / intentLength) * playerConfig.maxSpeed * scale;
      this.approachVelocity(targetX, targetY, playerConfig.accelerationPxPerSec2 * dt);
    } else {
      this.approachVelocity(0, 0, playerConfig.brakePxPerSec2 * dt);
    }

    this.position.set(
      this.position.x + this.velocity.x * dt,
      this.position.y + this.velocity.y * dt,
    );
    this.clampToArena();

    this.updateFacing(moveIntent, hasIntent, deltaMs);
  }

  /** Hızı hedefe doğru en fazla `maxDelta` kadar taşır; hedefi AŞMAZ. */
  private approachVelocity(targetX: number, targetY: number, maxDelta: number): void {
    const dx = targetX - this.velocity.x;
    const dy = targetY - this.velocity.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= maxDelta || distance === 0) {
      this.velocity.set(targetX, targetY);
      return;
    }
    const step = maxDelta / distance;
    this.velocity.set(this.velocity.x + dx * step, this.velocity.y + dy * step);
  }

  /**
   * Duvara çarpınca o eksendeki hız SIFIRLANIR. Sıfırlanmazsa gövde sınırda
   * kelepçeli dururken hız birikmeye devam eder ve tuş bırakıldığında
   * anlamsız bir fırlama olur.
   */
  private clampToArena(): void {
    const r = arenaConfig.bodyRadiusPx;
    const maxX = arenaConfig.widthPx - r;
    const maxY = arenaConfig.heightPx - r;

    if (this.position.x < r) {
      this.position.x = r;
      if (this.velocity.x < 0) this.velocity.x = 0;
    } else if (this.position.x > maxX) {
      this.position.x = maxX;
      if (this.velocity.x > 0) this.velocity.x = 0;
    }

    if (this.position.y < r) {
      this.position.y = r;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else if (this.position.y > maxY) {
      this.position.y = maxY;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }
  }

  /**
   * Hedef yön: girdi varsa oraya, yoksa son yön korunur (durunca gövde
   * savrulmaz). Yay ±π sarımında sıçramasın diye hedef, mevcut açıya en yakın
   * "sarılmamış" karşılığına taşınır.
   */
  private updateFacing(moveIntent: Vec, hasIntent: boolean, deltaMs: number): void {
    const target = hasIntent ? Math.atan2(moveIntent.y, moveIntent.x) : this.facing.value;
    const shortest = wrapPi(target - this.facing.value);
    this.facing.update(this.facing.value + shortest, deltaMs, playerConfig.facingSpring);
    this.facing.value = wrapPi(this.facing.value);
  }
}

function wrapPi(value: number): number {
  const wrapped = clamp(value, -1e6, 1e6);
  const twoPi = Math.PI * 2;
  let v = wrapped % twoPi;
  if (v > Math.PI) v -= twoPi;
  else if (v < -Math.PI) v += twoPi;
  return v;
}
