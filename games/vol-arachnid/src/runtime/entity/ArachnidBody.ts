import {
  Cooldown,
  Spring1D,
  Vector2,
  clamp,
  clamp01,
  clampSimulationStep,
  finiteOr,
  wrap,
  type Vector2 as Vec,
} from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { playerConfig } from '@/config/player';
import type { LocomotionSignals } from '@/runtime/entity/locomotionSignals';

const MS_PER_SEC = 1000;
/** Bunun altındaki hızda seyahat yönü anlamsızdır; bakış yönü kullanılır. */
const TRAVEL_HEADING_MIN_SPEED = 1e-3;
/** Atılım şiddetinin sönme süresi — iz ve duruş payı bir anda kesilmez. */
const DASH_BLEND_FALLOFF_MS = 220;

/**
 * Duvara çarpma yankısı; sunum katmanı bunu bir kez tüketir.
 *
 * Bir karede birden çok eksende temas olabilir (köşeye atılım). Bunlar AYRI
 * olaylar değildir: tek bir çarpmanın iki bileşenidir ve `mergeImpact` onları
 * bileşke normalde birleştirir. Ayrı tutulduklarında ikincisi birincisini
 * eziyordu — köşeye çarpan gövde iki eksende birden sekiyor ama tek, üstelik
 * YANLIŞ yönlü bir yankı bırakıyordu.
 */
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
  private pendingDashLanding = false;
  private pendingDashLaunch = false;
  /** Basılı tutmak cooldown sonunda kendiliğinden ikinci atılım üretmemeli. */
  private dashHeld = false;
  private wallRecoveryMs = 0;
  private pendingImpact: WallImpact | null = null;
  /**
   * Kare sinyallerinin TEK örneği; her karede yeniden yazılır.
   *
   * Her karede yeni bir nesne kurmak sıcak yolda gereksiz bir tahsisti ve
   * tüketici sayısıyla çarpılıyordu. Nesne ÖDÜNÇTÜR: çağıran onu bir sonraki
   * kareye taşımak isterse kopyalamalıdır.
   */
  private readonly frameSignals: LocomotionSignals = {
    x: 0,
    y: 0,
    velX: 0,
    velY: 0,
    speed: 0,
    accelX: 0,
    accelY: 0,
    travelHeadingRad: 0,
    facingHeadingRad: 0,
    turnRateRadPerSec: 0,
    dash01: 0,
    grounded: true,
  };

  constructor(x: number, y: number) {
    this.position.set(x, y);
  }

  /**
   * Gövdenin bu kareki durumu — tüketicilerin ORTAK sözlüğü.
   *
   * Dönen nesne ödünçtür ve bir sonraki `update`te yeniden yazılır.
   */
  get signals(): LocomotionSignals {
    const signals = this.frameSignals;
    signals.x = this.position.x;
    signals.y = this.position.y;
    signals.velX = this.velocity.x;
    signals.velY = this.velocity.y;
    signals.speed = this.velocity.length();
    signals.accelX = this.acceleration.x;
    signals.accelY = this.acceleration.y;
    /*
     * SEYAHAT yönü hızdan okunur; gövde duruyorken hızın yönü anlamsızdır ve
     * son bakış yönüne düşülür. Bakış yönünü seyahat yerine kullanmak sert bir
     * dönüşte tempoyu gövdenin GİTMEDİĞİ yöne bağlardı.
     */
    signals.travelHeadingRad =
      signals.speed > TRAVEL_HEADING_MIN_SPEED
        ? Math.atan2(this.velocity.y, this.velocity.x)
        : this.facing.value;
    signals.facingHeadingRad = this.facing.value;
    signals.turnRateRadPerSec = this.facing.velocity;
    signals.dash01 = this.dashBlend;
    signals.grounded = this.dashRemainingMs <= 0;
    return signals;
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

  /** Atılımın BAŞLADIĞI kareyi bir kez verir. */
  consumeDashLaunch(): boolean {
    const launched = this.pendingDashLaunch;
    this.pendingDashLaunch = false;
    return launched;
  }

  /**
   * Atılımın BİTTİĞİ kareyi bir kez verir.
   *
   * Atılım sırasında ayaklar yere değmez; toz da o yüzden kesilir. Yere dönüş
   * tek bir olaydır ve kendi tozunu hak eder.
   */
  consumeDashLanding(): boolean {
    const landed = this.pendingDashLanding;
    this.pendingDashLanding = false;
    return landed;
  }

  /** Duvar çarpmasını bir KEZ verir; sunum katmanı tetiklediğinde tükenir. */
  consumeWallImpact(): WallImpact | null {
    const impact = this.pendingImpact;
    this.pendingImpact = null;
    return impact;
  }

  update(moveIntent: Vec, dashPressed: boolean, deltaMs: number): void {
    /*
     * TEK etkin delta. Bir dönem bu metot üç farklı zaman anlayışı taşıyordu:
     * konum entegrasyonu kelepçeli `dt`yi, cooldown/atılım/sekme sayaçları ham
     * `deltaMs`i, dönüş adımı ise ayrı bir kelepçeyi kullanıyordu. 500 ms'lik
     * tek bir karede gövde 100 ms yol alıyor ama atılımın 140 ms'si bir anda
     * tükeniyordu — aynı karede farklı sistemler farklı kadar yaşıyordu.
     *
     * Kelepçe `clampSimulationStep` ile CORE'dan gelir; sahne de aynı tavanı
     * uygular, yani burada ikinci kez kelepçelemek işlemsizdir. Yine de
     * yapılır: gövde bir genel giriş noktasıdır ve tek bir bozuk kareye teslim
     * olmamalıdır.
     */
    const stepMs = clampSimulationStep(deltaMs);
    if (stepMs <= 0) return;
    const dt = stepMs / MS_PER_SEC;

    const dashJustPressed = dashPressed && !this.dashHeld;
    this.dashHeld = dashPressed;

    this.dashCooldown.update(stepMs);
    this.wallRecoveryMs = Math.max(0, this.wallRecoveryMs - stepMs);

    /*
     * Niyet TEMİZLENİR. Sonsuz bir bileşen `hypot`u da sonsuz yapar ve
     * `x / uzunluk` NaN'e düşer — hız ve konum bir daha toparlanmamak üzere
     * bozulurdu. Girdi katmanı bunu üretmez ama gövde tek bir bozuk kareye
     * teslim olmamalıdır.
     */
    const intentX = finiteOr(moveIntent.x, 0);
    const intentY = finiteOr(moveIntent.y, 0);
    const intentLength = Math.hypot(intentX, intentY);
    // Sekmeden toparlanırken girdi yok sayılır: aksi halde duvara yaslanan
    // oyuncu sekmeyi anında ezer ve çarpma hiç hissedilmez.
    const hasIntent = intentLength > 1e-3 && this.wallRecoveryMs <= 0;

    if (dashJustPressed && this.wallRecoveryMs <= 0 && this.dashCooldown.tryTrigger()) {
      this.dashRemainingMs = playerConfig.dash.durationMs;
      this.pendingDashLaunch = true;
      // Dash yönü: girdi varsa oraya, yoksa gövdenin baktığı yöne.
      if (intentLength > 1e-3)
        this.dashDirection.set(intentX / intentLength, intentY / intentLength);
      else this.dashDirection.set(Math.cos(this.facing.value), Math.sin(this.facing.value));
    }

    const previousX = this.velocity.x;
    const previousY = this.velocity.y;

    const wasDashing = this.dashRemainingMs > 0;
    /*
     * Atılımın bu karedeki PAYI. `dashRemainingMs -= stepMs` deyip tüm kareyi
     * atılım hızında geçirmek, atılımı kare sınırına yuvarlıyordu: 140 ms'lik
     * bir atılım 16 ms'lik karelerde 144 ms sürüyor, kat edilen yol kare
     * hızına göre değişiyordu. Pay ayrı ölçülür ve konum entegrasyonu ikiye
     * bölünür — atılım mesafesi artık kare hızından bağımsızdır.
     */
    const dashDt = Math.max(0, Math.min(this.dashRemainingMs, stepMs)) / MS_PER_SEC;
    const cruiseDt = dt - dashDt;
    if (this.dashRemainingMs > 0) {
      this.dashRemainingMs -= stepMs;
      this.velocity.set(
        this.dashDirection.x * playerConfig.dash.speedPxPerSec,
        this.dashDirection.y * playerConfig.dash.speedPxPerSec,
      );
      // Atılım kare ORTASINDA bittiyse kalan süre atılım hızıyla geçmez; gövde
      // o payda normal sürüşe (ivme ya da fren) döner. Kalan süreyi de atılım
      // hızında saymak, atılımı kare sınırına yuvarlıyordu.
      if (cruiseDt > 0) this.driveVelocity(hasIntent, intentX, intentY, intentLength, cruiseDt);
    } else {
      this.driveVelocity(hasIntent, intentX, intentY, intentLength, dt);
    }

    /*
     * Konum iki payda entegre edilir: atılım payı atılım hızıyla, kalanı kare
     * sonundaki hızla. Atılım dışı karelerde `dashDt` sıfırdır ve bu, tek
     * terimli entegrasyona indirgenir.
     */
    const dashSpeed = playerConfig.dash.speedPxPerSec;
    this.position.set(
      this.position.x + this.dashDirection.x * dashSpeed * dashDt + this.velocity.x * cruiseDt,
      this.position.y + this.dashDirection.y * dashSpeed * dashDt + this.velocity.y * cruiseDt,
    );
    this.resolveArenaBounds();

    /*
     * İvme sınır çözümünden SONRA okunur.
     *
     * Önce okunduğunda sekmenin hız değişimi ivmeye HİÇ girmiyordu: sonraki
     * karenin `previousX`i zaten sekme sonrası değerdi, yani impulse iki kare
     * arasında kayboluyordu. Gövde yaslanması duvara çarpmayı göremiyor, temas
     * yalnız kamera sarsıntısıyla anlatılıyordu.
     */
    this.acceleration.set((this.velocity.x - previousX) / dt, (this.velocity.y - previousY) / dt);

    // Duvara çarpma da atılımı bitirir; iniş her iki yolda da bildirilir.
    if (wasDashing && this.dashRemainingMs <= 0) this.pendingDashLanding = true;

    this.updateFacing(intentX, intentY, hasIntent, stepMs);
    this.updateDashBlend(stepMs);
  }

  /**
   * Bir zaman payı boyunca hızı sürer: niyet varsa hedefe ivmelenir, yoksa
   * frenler. Pay `dt`den küçük olabilir — atılımın karenin ortasında bittiği
   * durumda kalan süre buradan geçer.
   */
  private driveVelocity(
    hasIntent: boolean,
    intentX: number,
    intentY: number,
    intentLength: number,
    dtSeconds: number,
  ): void {
    if (!hasIntent) {
      this.approachVelocity(0, 0, playerConfig.brakePxPerSec2 * dtSeconds);
      return;
    }
    // Niyetin BÜYÜKLÜĞÜ hız kesridir: yarıya itilen bir çubuk yarım hız verir.
    const scale = Math.min(1, intentLength) * this.turnSpeedScale();
    this.approachVelocity(
      (intentX / intentLength) * playerConfig.maxSpeed * scale,
      (intentY / intentLength) * playerConfig.maxSpeed * scale,
      playerConfig.accelerationPxPerSec2 * dtSeconds,
    );
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
      this.mergeImpact({
        x,
        y,
        normalX,
        normalY,
        strength01: clamp01(
          (speedIntoWall - playerConfig.wall.impactSpeedPxPerSec) /
            Math.max(1, playerConfig.dash.speedPxPerSec - playerConfig.wall.impactSpeedPxPerSec),
        ),
      });
      return;
    }

    // Eşiğin altında yalnız duvara dik bileşen sönür; yanal kayma korunur.
    this.velocity.set(
      this.velocity.x + speedIntoWall * normalX,
      this.velocity.y + speedIntoWall * normalY,
    );
  }

  /**
   * Aynı karedeki ikinci teması BİRLEŞTİRİR.
   *
   * Köşeye çarpan gövde X ve Y eksenlerinde ayrı ayrı seker ama bu tek bir
   * olaydır. Tek slotu ezmek ikinci normali yazıp birincisini siliyordu: ses,
   * titreşim ve arena parlaması köşeyi düz bir duvar gibi gösteriyordu.
   * Bileşke normal normalize edilir, şiddet ise en güçlü temasınkidir.
   */
  private mergeImpact(impact: WallImpact): void {
    const previous = this.pendingImpact;
    if (!previous) {
      this.pendingImpact = impact;
      return;
    }

    const nx = previous.normalX + impact.normalX;
    const ny = previous.normalY + impact.normalY;
    const length = Math.hypot(nx, ny);
    const strongest = impact.strength01 >= previous.strength01 ? impact : previous;

    this.pendingImpact = {
      // Temas noktası köşenin kendisidir: her eksenin kelepçelenmiş bileşeni.
      x: impact.normalX !== 0 ? impact.x : previous.x,
      y: impact.normalY !== 0 ? impact.y : previous.y,
      // Zıt normaller (iki karşılıklı duvar aynı karede) toplamda sıfırlanır;
      // o durumda en güçlü temasın normali korunur.
      normalX: length > 1e-6 ? nx / length : strongest.normalX,
      normalY: length > 1e-6 ? ny / length : strongest.normalY,
      strength01: Math.max(previous.strength01, impact.strength01),
    };
  }

  /**
   * Hedef yön: girdi varsa oraya, yoksa son yön korunur (durunca gövde
   * savrulmaz). Yay ±π sarımında sıçramasın diye hedef, mevcut açıya en yakın
   * "sarılmamış" karşılığına taşınır.
   *
   * Yayın kendi hızı ayrıca tavanlanır: büyük bir açı farkında yay ilk
   * karelerde ağır bir gövdeye yakışmayan bir açısal hıza fırlar.
   */
  private updateFacing(intentX: number, intentY: number, hasIntent: boolean, stepMs: number): void {
    // Atılım sürerken yön KİLİTLİDİR: gövde uçtuğu yöne bakar. Dümen kırmak
    // hem ağırlığı hem uzuv duruşunu bozuyordu (bkz. `playerConfig.dash`).
    const target = this.isDashing
      ? Math.atan2(this.dashDirection.y, this.dashDirection.x)
      : hasIntent
      ? Math.atan2(intentY, intentX)
      : this.facing.value;
    const shortest = wrap(target - this.facing.value, -Math.PI, Math.PI);
    const before = this.facing.value;

    this.facing.update(before + shortest, stepMs, playerConfig.facingSpring);
    this.facing.velocity = clamp(
      this.facing.velocity,
      -playerConfig.maxTurnRateRadPerSec,
      playerConfig.maxTurnRateRadPerSec,
    );
    // Yayın ürettiği adım da tavana göre yeniden kurulur; yalnız hızı kırpmak
    // aynı karede zaten alınmış büyük adımı geri almazdı.
    const maxStep = (playerConfig.maxTurnRateRadPerSec * stepMs) / MS_PER_SEC;
    const step = clamp(wrap(this.facing.value - before, -Math.PI, Math.PI), -maxStep, maxStep);
    this.facing.value = wrap(before + step, -Math.PI, Math.PI);
  }

  private updateDashBlend(stepMs: number): void {
    if (this.dashRemainingMs > 0) {
      this.dashBlend = 1;
      return;
    }
    this.dashBlend = Math.max(0, this.dashBlend - stepMs / DASH_BLEND_FALLOFF_MS);
  }
}
