import {
  Cooldown,
  Spring1D,
  Vector2,
  clamp,
  clamp01,
  wrap,
  type Vector2 as Vec,
} from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';

const MS_PER_SEC = 1000;
/** Atılım şiddetinin sönme süresi — iz ve duruş payı bir anda kesilmez. */
const DASH_BLEND_FALLOFF_MS = 220;

/** Duvara çarpma yankısı; sunum katmanı bunu bir kez tüketir. */
export interface WallImpact {
  /** Temas noktasının dünya konumu — gövde merkezi değil, DUVARIN üstü. */
  x: number;
  y: number;
  /** Duvarın içeri bakan normali (birim). */
  normalX: number;
  normalY: number;
  /** [0,1] — çarpma şiddeti; eşikte 0, atılım hızında 1. */
  strength01: number;
}

/**
 * Örümceğin gövde hareketi: ivmeli hız, sürtünmeli duruş, yay ile yumuşatılan
 * ve hızı TAVANLANAN dönüş, arena sınırından sekme.
 *
 * Hız doğrudan girdiye EŞİTLENMEZ; hedefe ivmeyle yaklaşır ve girdi kesilince
 * frenle söner. Yön de anlık değişmez — yay gövdeyi hedefe doğru döndürürken
 * dönüşün şiddetini de (`turnRate`) verir; sert dönüş ayrıca hızı keser, çünkü
 * ağır bir gövde tam hızda yön değiştiremez.
 */
export class ArachnidBody {
  readonly position = new Vector2(0, 0);
  readonly velocity = new Vector2(0, 0);

  private readonly facing = new Spring1D(-Math.PI / 2);
  private readonly dashCooldown = new Cooldown(playerConfig.dash.cooldownMs);
  private readonly dashDirection = new Vector2(0, -1);
  private readonly acceleration = new Vector2(0, 0);
  private dashRemainingMs = 0;
  private dashBlend = 0;
  private wallRecoveryMs = 0;
  private pendingImpact: WallImpact | null = null;

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

  /** Son karenin ivmesi (px/s²) — gövde yaslanmasının kaynağı. */
  get accelerationVector(): Vec {
    return this.acceleration;
  }

  get isDashing(): boolean {
    return this.dashRemainingMs > 0;
  }

  /**
   * [0,1] — atılımın sunum şiddeti. `isDashing` sert bir anahtardır; iz,
   * gerilme ve uzuv payı atılım bittiğinde bir karede kesilmemeli.
   */
  get dash01(): number {
    return this.dashBlend;
  }

  /** [0,1] — dash'in yeniden hazır olma ilerlemesi; HUD tüketir. */
  get dashProgress(): number {
    return this.dashCooldown.getProgress();
  }

  /** Duvar çarpmasını bir KEZ verir; sunum katmanı tetiklediğinde tükenir. */
  consumeWallImpact(): WallImpact | null {
    const impact = this.pendingImpact;
    this.pendingImpact = null;
    return impact;
  }

  update(moveIntent: Vec, dashPressed: boolean, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / MS_PER_SEC;
    if (dt <= 0) return;

    this.dashCooldown.update(deltaMs);
    this.wallRecoveryMs = Math.max(0, this.wallRecoveryMs - deltaMs);

    const intentLength = moveIntent.length();
    // Sekmeden toparlanırken girdi yok sayılır: aksi halde duvara yaslanan
    // oyuncu sekmeyi anında ezer ve çarpma hiç hissedilmez.
    const hasIntent = intentLength > 1e-3 && this.wallRecoveryMs <= 0;

    if (dashPressed && this.wallRecoveryMs <= 0 && this.dashCooldown.tryTrigger()) {
      this.dashRemainingMs = playerConfig.dash.durationMs;
      // Dash yönü: girdi varsa oraya, yoksa gövdenin baktığı yöne.
      if (intentLength > 1e-3)
        this.dashDirection.set(moveIntent.x / intentLength, moveIntent.y / intentLength);
      else this.dashDirection.set(Math.cos(this.facing.value), Math.sin(this.facing.value));
    }

    const previousX = this.velocity.x;
    const previousY = this.velocity.y;

    if (this.dashRemainingMs > 0) {
      this.dashRemainingMs -= deltaMs;
      this.velocity.set(
        this.dashDirection.x * playerConfig.dash.speedPxPerSec,
        this.dashDirection.y * playerConfig.dash.speedPxPerSec,
      );
    } else if (hasIntent) {
      // Niyetin BÜYÜKLÜĞÜ hız kesridir: yarıya itilen bir çubuk yarım hız verir.
      const scale = Math.min(1, intentLength) * this.turnSpeedScale();
      const targetX = (moveIntent.x / intentLength) * playerConfig.maxSpeed * scale;
      const targetY = (moveIntent.y / intentLength) * playerConfig.maxSpeed * scale;
      this.approachVelocity(targetX, targetY, playerConfig.accelerationPxPerSec2 * dt);
    } else {
      this.approachVelocity(0, 0, playerConfig.brakePxPerSec2 * dt);
    }

    this.acceleration.set((this.velocity.x - previousX) / dt, (this.velocity.y - previousY) / dt);

    this.position.set(
      this.position.x + this.velocity.x * dt,
      this.position.y + this.velocity.y * dt,
    );
    this.resolveArenaBounds();

    this.updateFacing(moveIntent, hasIntent, deltaMs);
    this.updateDashBlend(deltaMs);
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

  /** Sert dönüşte hızın korunan oranı. */
  private turnSpeedScale(): number {
    const turn = clamp01(Math.abs(this.facing.velocity) / playerConfig.turnRateForFullPenalty);
    return 1 - playerConfig.maxTurnSpeedPenalty * turn;
  }

  /**
   * Sınır teması. Gövde kelepçelenir; eşiği aşan bir hızla çarptıysa normal
   * ekseninde SEKER ve atılım kesilir.
   *
   * Hızı sıfırlamak, sınırı görünmez bir yapışkan yüzeye çeviriyordu: gövde
   * duvarda duruyor, çarpmanın hiçbir yankısı olmuyordu.
   */
  private resolveArenaBounds(): void {
    const r = arenaConfig.bodyRadiusPx;
    const maxX = arenaConfig.widthPx - r;
    const maxY = arenaConfig.heightPx - r;

    // Temas noktası duvarın ÜSTÜNDEDİR, gövde merkezinde değil: yankı gövde
    // yarıçapı kadar içeride çizilirse sınırdan kopuk bir çizgi olur.
    if (this.position.x < r) this.hitWall(0, this.position.y, 1, 0, () => (this.position.x = r));
    else if (this.position.x > maxX)
      this.hitWall(arenaConfig.widthPx, this.position.y, -1, 0, () => (this.position.x = maxX));

    if (this.position.y < r) this.hitWall(this.position.x, 0, 0, 1, () => (this.position.y = r));
    else if (this.position.y > maxY)
      this.hitWall(this.position.x, arenaConfig.heightPx, 0, -1, () => (this.position.y = maxY));
  }

  private hitWall(
    x: number,
    y: number,
    normalX: number,
    normalY: number,
    clampPosition: () => void,
  ): void {
    clampPosition();

    // Duvara doğru olan hız bileşeni. Pozitifse gövde duvardan uzaklaşıyordur;
    // sürtünerek geçen bir temas çarpma değildir.
    const into = this.velocity.x * normalX + this.velocity.y * normalY;
    if (into >= 0) return;

    const speedIntoWall = -into;
    if (speedIntoWall >= playerConfig.wall.impactSpeedPxPerSec) {
      const bounce = speedIntoWall * playerConfig.wall.restitution;
      this.velocity.set(
        this.velocity.x + (speedIntoWall + bounce) * normalX,
        this.velocity.y + (speedIntoWall + bounce) * normalY,
      );
      this.dashRemainingMs = 0;
      this.wallRecoveryMs = playerConfig.wall.recoveryMs;
      this.pendingImpact = {
        x,
        y,
        normalX,
        normalY,
        strength01: clamp01(
          (speedIntoWall - playerConfig.wall.impactSpeedPxPerSec) /
            Math.max(1, playerConfig.dash.speedPxPerSec - playerConfig.wall.impactSpeedPxPerSec),
        ),
      };
      return;
    }

    // Eşiğin altında yalnız duvara dik bileşen sönür; yanal kayma korunur.
    this.velocity.set(
      this.velocity.x + speedIntoWall * normalX,
      this.velocity.y + speedIntoWall * normalY,
    );
  }

  /**
   * Hedef yön: girdi varsa oraya, yoksa son yön korunur (durunca gövde
   * savrulmaz). Yay ±π sarımında sıçramasın diye hedef, mevcut açıya en yakın
   * "sarılmamış" karşılığına taşınır.
   *
   * Yayın kendi hızı ayrıca tavanlanır: büyük bir açı farkında yay ilk
   * karelerde ağır bir gövdeye yakışmayan bir açısal hıza fırlar.
   */
  private updateFacing(moveIntent: Vec, hasIntent: boolean, deltaMs: number): void {
    const target = hasIntent ? Math.atan2(moveIntent.y, moveIntent.x) : this.facing.value;
    const shortest = wrap(target - this.facing.value, -Math.PI, Math.PI);
    const before = this.facing.value;

    this.facing.update(before + shortest, deltaMs, playerConfig.facingSpring);
    this.facing.velocity = clamp(
      this.facing.velocity,
      -playerConfig.maxTurnRateRadPerSec,
      playerConfig.maxTurnRateRadPerSec,
    );
    // Yayın ürettiği adım da tavana göre yeniden kurulur; yalnız hızı kırpmak
    // aynı karede zaten alınmış büyük adımı geri almazdı.
    const maxStep = (playerConfig.maxTurnRateRadPerSec * Math.min(deltaMs, 100)) / MS_PER_SEC;
    const step = clamp(wrap(this.facing.value - before, -Math.PI, Math.PI), -maxStep, maxStep);
    this.facing.value = wrap(before + step, -Math.PI, Math.PI);
  }

  private updateDashBlend(deltaMs: number): void {
    if (this.dashRemainingMs > 0) {
      this.dashBlend = 1;
      return;
    }
    this.dashBlend = Math.max(0, this.dashBlend - deltaMs / DASH_BLEND_FALLOFF_MS);
  }
}
