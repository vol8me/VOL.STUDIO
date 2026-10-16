import Phaser from 'phaser';
import { clamp01 } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { SPIDER_ART, type SpiderShield } from '@/config/spiders';
import { TEXTURE, VEHICLE_ATLAS } from '../textures';
import { SHIELD_TEXTURE, SHIELD_TEXTURE_SIZE } from './shieldTextures';

const TAU = Math.PI * 2;
/** Eşzamanlı vuruş dalgası sayısı ve yayın çizim kalınlıkları. */
const RIPPLES = 4;
/** Açılış ve kapanış vurgularının süresi (ms): halka yayılır, kubbe parlar. */
const SURGE_MS = 380;
const PULSE_MS = 520;
const DISSOLVE_MS = 320;
/** Kubbenin yerde bıraktığı ışık lekesinin çapı (kubbe çapına oranı) ve spark dokusunun kenarı. */
const GROUND = { span: 2.5, texture: 16 } as const;
const RING_TEXTURE = 64;
/** Dönen vurgu yaylarının sayısı, başlarının hızı (örgü hızına oranla) ve kuyruk dilimleri. */
const COMETS = { count: 3, speed: 2.6, tail: 6, step: 0.11 } as const;

interface Ripple {
  active: boolean;
  angle: number;
  ageMs: number;
}

/**
 * Kalkanlı yürüyücünün (Goliath) enerji kubbesi. Gövdeyi çevreler ve katmanlıdır: yerde yumuşak bir
 * ışık lekesi, kenara doğru parlayan şeffaf kubbe, birbirine ters dönen iki altıgen örgü (iç örgü daha
 * küçük, derinlik verir), çentikli ve düğümlü sıcak kenar halkası ve kenarda dönen üç kuyruklu yay.
 * Açılışta kubbe küçükten büyür, aşar ve oturur; bir halka dışarı yayılır. Bitişe `warnMs` kala titreyerek
 * uyarır, sönerken parlayıp küçülür. Hasar emilince vuruş açısında yay dalgası ve bir parlama oluşur.
 * Bütün zaman kare süresinden birikir: duraklatmada (süre 0) kubbe donar.
 */
export class ShieldView {
  readonly root: Phaser.GameObjects.Container;
  private readonly ground: Phaser.GameObjects.Image;
  private readonly dome: Phaser.GameObjects.Image;
  private readonly outer: Phaser.GameObjects.Image;
  private readonly inner: Phaser.GameObjects.Image;
  private readonly rim: Phaser.GameObjects.Image;
  private readonly pulse: Phaser.GameObjects.Image;
  private readonly flares: Phaser.GameObjects.Image[] = [];
  private readonly arcs: Phaser.GameObjects.Graphics;
  private readonly raise = new Spring1D();
  private readonly ripples: Ripple[] = [];
  private nextRipple = 0;
  private open = false;
  private elapsedMs = 0;
  private clockMs = 0;
  private surgeMs = SURGE_MS;
  private pulseMs = PULSE_MS;
  private dissolveMs = DISSOLVE_MS;
  private x = 0;
  private y = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly look: SpiderShield,
    private readonly durationMs: number,
  ) {
    if (!(durationMs > 0)) throw new RangeError('Kalkan süresi pozitif olmalı');
    const add = (key: string, tint: number): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, VEHICLE_ATLAS, key).setBlendMode(Phaser.BlendModes.ADD).setTint(tint);
    this.dome = add(SHIELD_TEXTURE.dome, look.tint);
    this.outer = add(SHIELD_TEXTURE.mesh, look.tint);
    this.inner = add(SHIELD_TEXTURE.mesh, look.rim);
    this.rim = add(SHIELD_TEXTURE.rim, look.rim);
    this.pulse = add(TEXTURE.ring, look.rim).setVisible(false);
    for (let index = 0; index < RIPPLES; index++) {
      this.flares.push(add(TEXTURE.spark, look.rim).setVisible(false));
      this.ripples.push({ active: false, angle: 0, ageMs: 0 });
    }
    this.arcs = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.root = scene.add
      .container(0, 0, [
        this.dome,
        this.outer,
        this.inner,
        this.rim,
        this.pulse,
        ...this.flares,
        this.arcs,
      ])
      .setDepth(SPIDER_ART.depth + 1.5)
      .setVisible(false);
    // Yerdeki ışık lekesi gövdenin altındadır: kubbenin kendisi ışık saçıyormuş gibi okunur.
    this.ground = add(TEXTURE.spark, look.tint)
      .setDepth(SPIDER_ART.depth - 0.7)
      .setVisible(false);
  }

  /** Kubbe şu an açık mı (kalkan yeteneği aktif). */
  get isOpen(): boolean {
    return this.open;
  }

  /** Açılış yayının değeri: 0 kapalı, 1 tam açık (aşırı salınımla 1'i geçebilir). */
  get power(): number {
    return this.raise.value;
  }

  /** Görünür mü: açık ya da sönme animasyonu sürüyor. */
  get visible(): boolean {
    return this.root.visible;
  }

  /** Yaşayan vuruş dalgası sayısı. */
  get rippleCount(): number {
    return this.ripples.filter((ripple) => ripple.active).length;
  }

  /**
   * Kare güncellemesi. `active` kalkan yeteneğinin açıklığıdır (hız deposu aktifliği); `x`/`y` kubbenin
   * merkezi. Açılış ve kapanış kenarları tek seferlik vurguları tetikler.
   */
  update(active: boolean, deltaMs: number, x: number, y: number): void {
    const step = Math.max(0, deltaMs);
    if (active && !this.open) this.opened();
    else if (!active && this.open) this.closed();
    this.open = active;
    this.x = x;
    this.y = y;
    this.clockMs += step;
    if (active) this.elapsedMs += step;
    this.surgeMs = Math.min(SURGE_MS, this.surgeMs + step);
    this.pulseMs = Math.min(PULSE_MS, this.pulseMs + step);
    this.dissolveMs = Math.min(DISSOLVE_MS, this.dissolveMs + step);
    this.raise.update(active ? 1 : 0, step, this.look.raise);
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;
      ripple.ageMs += step;
      if (ripple.ageMs >= this.look.rippleMs) ripple.active = false;
    }

    const settled =
      !active &&
      this.raise.value < 0.01 &&
      Math.abs(this.raise.velocity) < 0.02 &&
      this.dissolveMs >= DISSOLVE_MS;
    if (settled) {
      this.raise.value = 0;
      this.raise.velocity = 0;
      this.hide();
      return;
    }
    this.draw();
  }

  /**
   * Bir mermi kubbeye değdi (dünya konumu). Kalkan açıksa vuruş açısında dalga ve parlama başlatır ve
   * `true` döner: çağıran gövde kıymığı/kıvılcımı çizmez. Kapalıysa `false`.
   */
  absorb(hitX: number, hitY: number): boolean {
    if (!this.open) return false;
    const ripple = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
    ripple.active = true;
    ripple.ageMs = 0;
    ripple.angle = Math.atan2(hitY - this.y, hitX - this.x);
    return true;
  }

  /** Kubbeyi anında kapatır (araç yok oldu, enkaz oldu ya da yeniden doğdu): hiçbir animasyon sürmez. */
  hide(): void {
    this.open = false;
    this.elapsedMs = 0;
    this.raise.value = 0;
    this.raise.velocity = 0;
    this.surgeMs = SURGE_MS;
    this.pulseMs = PULSE_MS;
    this.dissolveMs = DISSOLVE_MS;
    for (const ripple of this.ripples) ripple.active = false;
    this.root.setVisible(false);
    this.ground.setVisible(false);
  }

  destroy(): void {
    this.ground.destroy();
    this.root.destroy();
  }

  private opened(): void {
    this.elapsedMs = 0;
    this.surgeMs = 0;
    this.pulseMs = 0;
    this.dissolveMs = DISSOLVE_MS;
  }

  private closed(): void {
    this.dissolveMs = 0;
  }

  /** Bitişe kalan süreye göre titreme çarpanı [0.5, 1]: son `warnMs` içinde sıklaşır. */
  private flicker(): number {
    if (!this.open) return 1;
    const remaining = this.durationMs - this.elapsedMs;
    if (remaining >= this.look.warnMs) return 1;
    const urgency = clamp01(1 - remaining / this.look.warnMs);
    const hertz = 5 + 12 * urgency;
    return 0.75 + 0.25 * Math.sin((this.clockMs / 1000) * TAU * hertz);
  }

  private draw(): void {
    const { look } = this;
    const seconds = this.clockMs / 1000;
    const power = this.raise.value;
    const presence = clamp01(power);
    const blink = this.flicker();
    const surge = (1 - this.surgeMs / SURGE_MS) ** 2;
    const dissolve = (1 - this.dissolveMs / DISSOLVE_MS) ** 2;
    let impact = 0;
    for (const ripple of this.ripples)
      if (ripple.active) impact = Math.max(impact, (1 - ripple.ageMs / look.rippleMs) ** 2);
    // Kubbe küçükten büyür ve oturur; sönerken biraz şişip solar.
    const size =
      (0.78 + 0.22 * power + 0.05 * dissolve) * ((look.radius * 2) / SHIELD_TEXTURE_SIZE);
    const radius = look.radius * (0.78 + 0.22 * power + 0.05 * dissolve);
    const breathe = 0.85 + 0.15 * Math.sin(seconds * TAU * look.pulseHz);
    const glow = presence * blink;

    this.root.setPosition(this.x, this.y).setVisible(true);
    this.dome
      .setScale(size)
      .setAlpha(clamp01(0.24 * glow + 0.3 * surge + 0.3 * impact + 0.2 * dissolve));
    this.outer
      .setScale(size)
      .setRotation(seconds * look.spin)
      .setAlpha(clamp01(0.42 * breathe * glow + 0.35 * impact + 0.5 * dissolve));
    this.inner
      .setScale(size * 0.8)
      .setRotation(-seconds * look.spin * 1.35 + 0.5)
      .setAlpha(clamp01(0.22 * (2 - breathe) * glow + 0.25 * impact));
    this.rim
      .setScale(size)
      .setRotation(-seconds * look.spin * 0.6)
      .setAlpha(clamp01(0.7 * glow + 0.4 * surge + 0.35 * impact));
    this.drawPulse(radius);
    this.drawArcs(radius, seconds, glow);
    this.drawFlares(radius);
    this.ground
      .setVisible(true)
      .setPosition(this.x, this.y)
      .setScale(((look.radius * GROUND.span) / GROUND.texture) * (0.85 + 0.15 * power))
      .setAlpha(clamp01(0.16 * glow + 0.2 * surge));
  }

  /** Açılışta kubbeden dışarı yayılan tek halka. */
  private drawPulse(radius: number): void {
    const t = this.pulseMs / PULSE_MS;
    const visible = t < 1;
    this.pulse.setVisible(visible);
    if (!visible) return;
    const grow = 0.75 + 0.95 * (1 - (1 - t) ** 3);
    this.pulse.setScale((radius * 2 * grow) / RING_TEXTURE).setAlpha(0.85 * (1 - t) ** 1.5);
  }

  /** Kenarda dönen kuyruklu yaylar ve her vuruş dalgasının genişleyen yayı. */
  private drawArcs(radius: number, seconds: number, glow: number): void {
    const { look, arcs } = this;
    arcs.setVisible(true);
    arcs.clear();
    const orbit = radius * 0.975;
    for (let comet = 0; comet < COMETS.count; comet++) {
      const head = seconds * look.spin * COMETS.speed + (comet * TAU) / COMETS.count;
      for (let slice = 0; slice < COMETS.tail; slice++) {
        const fade = 1 - slice / COMETS.tail;
        arcs.lineStyle(2.8 * (0.4 + 0.6 * fade), look.rim, clamp01(0.7 * fade * fade * glow));
        arcs.beginPath();
        arcs.arc(0, 0, orbit, head - (slice + 1) * COMETS.step, head - slice * COMETS.step);
        arcs.strokePath();
      }
    }
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;
      const t = ripple.ageMs / look.rippleMs;
      const span = 0.4 + 1.2 * t;
      const reach = radius * (0.985 + 0.06 * t);
      const alpha = (1 - t) ** 1.4;
      arcs.lineStyle(9 * (1 - t) + 2, look.tint, clamp01(0.5 * alpha));
      arcs.beginPath();
      arcs.arc(0, 0, reach, ripple.angle - span, ripple.angle + span);
      arcs.strokePath();
      arcs.lineStyle(3.4 * (1 - t) + 1, look.rim, clamp01(alpha));
      arcs.beginPath();
      arcs.arc(0, 0, reach, ripple.angle - span * 0.8, ripple.angle + span * 0.8);
      arcs.strokePath();
    }
  }

  /** Vuruş noktasındaki parlama: dalga ilerledikçe söner. */
  private drawFlares(radius: number): void {
    this.ripples.forEach((ripple, index) => {
      const flare = this.flares[index];
      flare.setVisible(ripple.active);
      if (!ripple.active) return;
      const t = ripple.ageMs / this.look.rippleMs;
      flare
        .setPosition(Math.cos(ripple.angle) * radius * 0.98, Math.sin(ripple.angle) * radius * 0.98)
        .setScale((radius / 16) * (0.5 + 0.9 * (1 - t) ** 0.5))
        .setAlpha((1 - t) ** 2);
    });
  }
}
