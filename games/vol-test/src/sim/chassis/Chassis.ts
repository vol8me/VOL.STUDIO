import {
  createContact,
  resolveWallContacts,
  RigidBody,
  type Contact,
  type ContactShape,
} from '@volstudio/core/physics';
import type { SuspensionConfig } from '@/config/tank';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { BoostReserve, type BoostConfig } from './BoostReserve';
import { createChassisState, type ChassisPose, type ChassisState } from './ChassisState';
import { Suspension } from './Suspension';
import { Turret, type TurretConfig } from './Turret';

/** Şasi türü: paletli tank ya da bacaklı yürüyücü. */
export type ChassisKind = 'tank' | 'walker';

/** Her şasinin ortak gövde, temas ve depo sayıları; türe özgü sürüş sayıları kendi yapılandırmasındadır. */
export interface ChassisConfig extends BoostConfig, TurretConfig {
  readonly mass: number;
  /** Gövde ve ayak izi (yarı boy, yarı en): temas şekli ve doğma kelepçesi bunu okur. */
  readonly halfLength: number;
  readonly halfWidth: number;
  /** Zemini ezen iki yanın gövde ekseninden uzaklığı (palet merkezi ya da bacak sırası). */
  readonly trackOffset: number;
  readonly wallRestitution: number;
  readonly wallFriction: number;
  /** Bu normal hızın altındaki duvar teması çarpma olayı üretmez (dayanma). */
  readonly impactEventSpeed: number;
  /** Çarpmanın süspansiyona vuruşu: normal hızın bu oranı (birim/s). */
  readonly impactKick: number;
}

/**
 * Sürülebilir bir aracın fiziksel gövdesi: katı cisim, taret, depo ve yaylı süspansiyon. Paletli
 * tank ile yürüyücü yalnızca nasıl itildikleriyle ayrışır (`step`); poz, durum, temas ve
 * ağ uzlaştırması ortaktır, bu yüzden simülasyon, öngörü ve görünüm şasinin türünü bilmeden çalışır.
 *
 * İki yan yüzey alanı (`track*`, `tread*`, `ground*`, `surface*`, `slide*`, `slip`) türe göre
 * yorumlanır: tankta palet, yürüyücüde o yandaki bacak sırası. Anlamları aynı kalır (yüzey hızı,
 * katedilen yol, zeminin hızı, kayma), böylece iz, toz, kar ezilmesi ve yürüyüş döngüsü aynı
 * sinyallerden beslenir.
 */
export abstract class Chassis extends RigidBody {
  abstract readonly kind: ChassisKind;

  /** Yan yüzey hızları (birim/s). */
  trackLeft = 0;
  trackRight = 0;
  /** Yan yüzeyin katettiği işaretli yol; görünüm palet dokusunu ve bacak fazını bununla sürer. */
  treadLeft = 0;
  treadRight = 0;
  /**
   * Yanların yerde katettiği MUTLAK yol (birim); iz ve kar ezilmesi bununla yapılır. Bu alan HIZ
   * DEĞİLDİR: geri koşuda bile artar. Zemin hızı `surfaceLeft`/`surfaceRight`'tadır.
   */
  groundLeft = 0;
  groundRight = 0;
  /** Yan yüzeyin zemine göre ANLIK hızı (birim/s). */
  surfaceLeft = 0;
  surfaceRight = 0;
  /** Yan yüzeyin zemine göre kayma hızı (birim/s); izler ve toz bununla seçilir. */
  slideLeft = 0;
  slideRight = 0;
  /** İki yanın en büyük kayma hızı: patinaj, kilitli kayma ya da yanal kayma. */
  slip = 0;
  /** Bu adımdaki en sert DUVAR teması; `speed` 0 ise temas yok. */
  readonly contact: Contact = createContact();
  readonly suspension: Suspension;
  readonly previous: ChassisPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
  /** Ayak izi ve temas malzemesi (duvar ve araç teması aynı şekli kullanır). */
  readonly shape: ContactShape;
  protected readonly turretMount: Turret;
  protected readonly reserve: BoostReserve;
  private readonly substepContact: Contact = createContact();

  protected constructor(
    protected readonly config: ChassisConfig,
    suspension: SuspensionConfig,
    inertia: number,
  ) {
    super(config.mass, inertia);
    this.turretMount = new Turret(config);
    this.reserve = new BoostReserve(config);
    this.suspension = new Suspension(suspension);
    this.shape = {
      halfLength: config.halfLength,
      halfWidth: config.halfWidth,
      restitution: config.wallRestitution,
      friction: config.wallFriction,
    };
  }

  /** Dikdörtgen ayak izinin kütle eylemsizliği; alt sınıf yapıcıları `super`e bunu verir. */
  static footprintInertia(config: ChassisConfig): number {
    return RigidBody.boxInertia(config.mass, config.halfLength * 2, config.halfWidth * 2);
  }

  /** Zemini ezen yanların gövde ekseninden uzaklığı. */
  get trackOffset(): number {
    return this.config.trackOffset;
  }

  /** Bu çarpma hızının altı olay üretmez. */
  get impactEventSpeed(): number {
    return this.config.impactEventSpeed;
  }

  /** Gövde yönü: katı cismin açısı. */
  get hull(): number {
    return this.angle;
  }

  set hull(value: number) {
    this.angle = value;
  }

  get turret(): number {
    return this.turretMount.angle;
  }

  get boost(): number {
    return this.reserve.energy;
  }

  get boosting(): boolean {
    return this.reserve.active;
  }

  get boostCapacity(): number {
    return this.config.boostCapacity;
  }

  /** Geri vitesteyim (yalnız paletli tankta anlamlıdır). */
  abstract get reversing(): boolean;

  /** Fren basılı: sürüş kilitli (yalnız paletli tankta anlamlıdır). */
  abstract get braking(): boolean;

  /** Ağ durumundan gelen geri vites bayrağını sürüşe yazar. */
  protected abstract setReversing(value: boolean): void;

  /** Yeniden doğuşta türe özgü sürüş belleğini (hedefler, vites) sıfırlar. */
  protected abstract resetDrive(): void;

  /** Bir sabit adım: komutu sürüşe çevirir, gövdeyi ilerletir, duvarı çözer, tareti döndürür. */
  abstract step(
    command: TankCommand,
    world: World,
    dt: number,
    surface?: { readonly grip: number; readonly rollingResistance: number },
  ): void;

  /**
   * Çarpmanın süspansiyona vuruşu: gövde çarpma yönüne yaylanır. Duvar ve araç teması aynı
   * yoldan geçer.
   */
  kickFrom(hit: Contact): void {
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const kick = hit.speed * this.config.impactKick;
    this.suspension.kick(
      -(hit.normalX * fx + hit.normalY * fy) * kick,
      -(-hit.normalX * fy + hit.normalY * fx) * kick,
    );
  }

  place(x: number, y: number, hull = -Math.PI / 2): void {
    this.reset(x, y, hull);
    this.turretMount.reset(this.angle);
    this.trackLeft = 0;
    this.trackRight = 0;
    this.capturePose();
  }

  /** Yeniden doğan araç önceki sürüşten yüzey, yay ve depo durumu taşımaz. */
  resetForRespawn(x: number, y: number, hull = -Math.PI / 2): void {
    this.place(x, y, hull);
    this.reserve.reset();
    this.suspension.reset();
    this.treadLeft = 0;
    this.treadRight = 0;
    this.groundLeft = 0;
    this.groundRight = 0;
    this.surfaceLeft = 0;
    this.surfaceRight = 0;
    this.slideLeft = 0;
    this.slideRight = 0;
    this.slip = 0;
    this.contact.speed = 0;
    this.resetDrive();
    this.capturePose();
  }

  /** Bir sonraki adımı belirleyen bütün skaler durumu `out`a yazar. */
  captureState(out: ChassisState = createChassisState()): ChassisState {
    out.x = this.x;
    out.y = this.y;
    out.vx = this.vx;
    out.vy = this.vy;
    out.hull = this.angle;
    out.angularVelocity = this.angularVelocity;
    out.turret = this.turretMount.angle;
    out.trackLeft = this.trackLeft;
    out.trackRight = this.trackRight;
    out.treadLeft = this.treadLeft;
    out.treadRight = this.treadRight;
    out.groundLeft = this.groundLeft;
    out.groundRight = this.groundRight;
    out.surfaceLeft = this.surfaceLeft;
    out.surfaceRight = this.surfaceRight;
    out.slideLeft = this.slideLeft;
    out.slideRight = this.slideRight;
    out.slip = this.slip;
    out.boost = this.reserve.energy;
    out.boosting = this.reserve.active;
    out.reversing = this.reversing;
    out.pitch = this.suspension.pitch;
    out.pitchVelocity = this.suspension.pitchVelocity;
    out.roll = this.suspension.roll;
    out.rollVelocity = this.suspension.rollVelocity;
    return out;
  }

  /**
   * Yetkili durumu şasiye kurar (ağ uzlaştırması). `previous` poz da yeni konuma çekilir; yoksa
   * görünüm eski konumdan yeni konuma bir kare süzülürdü.
   */
  restoreState(state: ChassisState): void {
    this.x = state.x;
    this.y = state.y;
    this.vx = state.vx;
    this.vy = state.vy;
    this.angle = state.hull;
    this.angularVelocity = state.angularVelocity;
    this.turretMount.angle = state.turret;
    this.trackLeft = state.trackLeft;
    this.trackRight = state.trackRight;
    this.treadLeft = state.treadLeft;
    this.treadRight = state.treadRight;
    this.groundLeft = state.groundLeft;
    this.groundRight = state.groundRight;
    this.surfaceLeft = state.surfaceLeft;
    this.surfaceRight = state.surfaceRight;
    this.slideLeft = state.slideLeft;
    this.slideRight = state.slideRight;
    this.slip = state.slip;
    this.reserve.energy = state.boost;
    this.reserve.active = state.boosting;
    this.setReversing(state.reversing);
    this.suspension.restore(state.pitch, state.pitchVelocity, state.roll, state.rollVelocity);
    this.contact.speed = 0;
    this.capturePose();
  }

  /** Adım başında çağrılır; render bu pozdan günceline ara değer alır. */
  capturePose(): void {
    this.readPose(this.previous);
  }

  /** Güncel adımın pozunu `out`a yazar (atış ve nişan geometrisi bunu okur). */
  readPose(out: ChassisPose): ChassisPose {
    out.x = this.x;
    out.y = this.y;
    out.hull = this.angle;
    out.turret = this.turretMount.angle;
    out.pitch = this.suspension.pitch;
    out.roll = this.suspension.roll;
    return out;
  }

  /** Taret komuttaki nişana döner; her tür adımının sonunda bunu çağırır. */
  protected updateTurret(command: TankCommand, dt: number): void {
    this.turretMount.update(command, dt);
  }

  /**
   * Duvar temasını çözer; adımdaki en sert duvar çarpması kaydedilir. Araç teması gövdeyi duvara
   * geri itebilir: çağıran, itme sonrası bunu yeniden çağırarak duvarı son sözü söyleyen sert
   * sınır yapar.
   */
  settleAgainst(world: World): void {
    const hit = resolveWallContacts(this, world.walls, this.shape, this.substepContact);
    if (hit.speed <= this.contact.speed) return;
    Object.assign(this.contact, hit);
    this.kickFrom(hit);
  }
}
