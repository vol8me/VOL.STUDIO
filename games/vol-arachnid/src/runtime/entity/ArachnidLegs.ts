import {
  LegGait,
  clamp,
  clamp01,
  clampSimulationStep,
  finiteOr,
  lerp,
  solveTwoBoneIk,
  wrap,
  type LegGaitLeg,
} from '@volstudio/core';
import { gaitConfig, type LimbStance } from '@/config/gait';
import { RIG_FACING_OFFSET_RAD } from '@/config/rig';
import type { ArachnidRig, LimbRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;
/** Duruş açıları İLERİ eksenden ölçülür; rig yerel uzayında ileri −Y'dir. */
const FORWARD_RAD = -Math.PI / 2;

export interface LimbDriveState {
  bodyX: number;
  bodyY: number;
  /** Gövdenin görsel yönü (radyan) — rig ofseti burada eklenir. */
  bodyRad: number;
  velX: number;
  velY: number;
  /** Dönüşün anlık şiddeti (rad/s) — adım temposunun ikinci kaynağı. */
  turnRate: number;
  /** [0,1] yürüyüş temposu — arka uzuvların itiş payını ölçekler. */
  motion01: number;
  /** [0,1] atılım şiddeti — ön uzuvları öne, arka uzuvları geriye taşır. */
  dash01: number;
  /** [0,1] çömelme — uzuvları gövdeye çeker. */
  crouch01: number;
  /**
   * Ayaklar yerde DEĞİL mi? Atılım boyunca gövde uçar; yürüyüş döngüsü
   * tamamen durur ve uzuvlar tek bir uçuş pozunda tutulur.
   */
  airborne: boolean;
}

interface LimbDriver {
  rig: LimbRig;
  stance: LimbStance;
  /** Tüm kemiklerin toplamı; erişim oranı bununla çarpılır. */
  totalLength: number;
  /** Sabit kök kemiği olan uzuvlarda çözülmüş kök payı; yoksa `null`. */
  rootDrive: { follow: number; yawLimitRad: number } | null;
}

/**
 * Uzuvları yürüyüşe ve ters kinematiğe bağlar.
 *
 * Ayaklar DÜNYA uzayında sabitlenir; gövde ilerledikçe geride kalırlar ve
 * eşiği aşınca öne adım atarlar. Her kare her uzuv, ayağı gövde-yerel uzaya
 * çevirip pozlanır — uzuv açısı elle animasyondan değil, ayağın nerede
 * durduğundan çıkar.
 *
 * Üç kemikli zincirde çözüm tek değildir. Belirsizlik OMUZLA kapatılır: omuz
 * duruş açısıyla ayak yönü arasında sabit bir oranda paylaşır, kalan iki kemik
 * iki kemikli IK ile çözülür. Böylece uzuv hem gövdeye bağlı bir dizilim
 * korur hem ayağı takip eder.
 */
export class ArachnidLegs {
  private readonly gait: LegGait;
  private readonly drivers: LimbDriver[];
  /** Ayakların gövde merkezine ORTALAMA uzaklığı — dönüşün teğetsel hızı için. */
  private readonly stanceRadiusPx: number;
  /** Ayak hedefleri gövde-yerel uzayda; kaynağı ya yürüyüş döngüsü ya uçuş pozudur. */
  private readonly footLocalX: number[];
  private readonly footLocalY: number[];
  private readonly footLift: number[];
  private airborne = false;

  constructor(rig: ArachnidRig) {
    this.drivers = rig.limbs.map((limb) => {
      const stance = gaitConfig.stance[limb.id];
      if (!stance) throw new Error(`"${limb.id}" uzvu için duruş tanımı yok`);
      if (limb.root && (stance.rootFollow === undefined || stance.rootYawLimitDeg === undefined)) {
        throw new Error(`"${limb.id}" uzvunun sabit kök kemiği var ama kök payı tanımlı değil`);
      }
      return {
        rig: limb,
        stance,
        totalLength: limb.rootLength + limb.upperLength + limb.lowerLength,
        rootDrive: limb.root
          ? {
              follow: stance.rootFollow ?? 0,
              yawLimitRad: (stance.rootYawLimitDeg ?? 0) * DEG,
            }
          : null,
      };
    });

    const entries: LegGaitLeg[] = this.drivers.map((driver) => {
      const home = restingHome(driver, 0, 0, 0);
      return {
        homeX: home.x,
        homeY: home.y,
        group: driver.stance.group,
        strideScale: driver.stance.strideScale,
        freeStep: driver.stance.freeStep,
      };
    });
    this.footLocalX = new Array<number>(entries.length).fill(0);
    this.footLocalY = new Array<number>(entries.length).fill(0);
    this.footLift = new Array<number>(entries.length).fill(0);
    this.stanceRadiusPx =
      entries.reduce((total, entry) => total + Math.hypot(entry.homeX, entry.homeY), 0) /
      entries.length;

    this.gait = new LegGait(entries, {
      stepTriggerPx: gaitConfig.stepTriggerPx,
      stepDurationMs: gaitConfig.stepDurationMs,
      stepLeadSeconds: gaitConfig.stepLeadSeconds,
      maxStrainPx: gaitConfig.emergencyStrainPx,
    });
  }

  /** Ayakları gövdenin altına adımsız yerleştirir (doğuş/ışınlanma). */
  reset(bodyX: number, bodyY: number, bodyRad: number): void {
    const rigRad = bodyRad + RIG_FACING_OFFSET_RAD;
    this.airborne = false;
    this.applyStance(0, 0, 0);
    this.gait.reset(bodyX, bodyY, rigRad);
    this.readGaitFeet(bodyX, bodyY, rigRad);
    this.pose(0);
  }

  update(rawState: LimbDriveState, deltaMs: number): void {
    /*
     * Akış değerleri TEMİZLENİR, reddedilmez. Bir kare bozuk geldiğinde
     * (sekme sonrası dev delta, sıfıra bölme ürünü bir hız) uzuv pozunun
     * kalıcı olarak NaN'e düşmesi orantısız olurdu; CORE'un `Spring1D` ve
     * `Cooldown` için izlediği politika da budur.
     *
     * Süre gövdeyle AYNI tavana kelepçelenir. Sahne zaten kelepçelenmiş bir
     * değer verir, yani bu işlemsizdir; savunma amaçlıdır. Yürüyüş döngüsü
     * gövdeden farklı bir zaman yaşadığında ayaklar gövdenin gitmediği yere
     * basar ve hata uzuvda değil, ZAMANDA olduğu için uzuv koduna bakarak
     * bulunamaz.
     */
    const state = sanitiseDriveState(rawState);
    const stepMs = clampSimulationStep(deltaMs);
    const rigRad = state.bodyRad + RIG_FACING_OFFSET_RAD;
    this.applyStance(state.motion01, state.dash01, state.crouch01);

    if (state.airborne) {
      // Yürüyüş döngüsü DURUR. Açık bırakıldığında uzuvlar sıra disiplinini
      // delip acil adım yağmuruna giriyor, gövde düz uçarken bacaklar yerinde
      // titriyordu.
      this.airborne = true;
      this.readFlightFeet();
      this.pose(state.dash01);
      return;
    }

    if (this.airborne) {
      // İniş: bütün ayaklar aynı anda evlerine basar. Havadaki pozdan yürüyüşe
      // adım adım dönmek, inişi bulanık bir sürüklenmeye çevirirdi.
      this.airborne = false;
      this.gait.reset(state.bodyX, state.bodyY, rigRad);
    }

    const speed = Math.hypot(state.velX, state.velY);
    /*
     * Dönüş de bir TEMPO kaynağıdır. Yerinde dönen bir gövdenin doğrusal hızı
     * sıfırdır ama ayakların ev konumları teğetsel olarak savrulur; tempoyu
     * yalnız hızdan okumak adımları en yavaş ayarında bırakıyor ve uzuvlar
     * gövdenin arkasında sürükleniyordu.
     */
    const tangentialSpeed = Math.abs(state.turnRate) * this.stanceRadiusPx;
    const tempo = clamp01(Math.max(speed, tangentialSpeed) / gaitConfig.fullTempoSpeedPxPerSec);

    this.gait.setStepTuning({
      stepTriggerPx: lerp(gaitConfig.stepTriggerPx, gaitConfig.runStepTriggerPx, tempo),
      stepDurationMs: lerp(gaitConfig.stepDurationMs, gaitConfig.runStepDurationMs, tempo),
    });

    // Atılım hızı adım hedefini erişim dışına fırlatmamalı; gövde yine gerçek
    // hızla ilerler, yalnız ayağın öngörü mesafesi tam tempo hızında doyar.
    const leadScale =
      speed > gaitConfig.fullTempoSpeedPxPerSec ? gaitConfig.fullTempoSpeedPxPerSec / speed : 1;
    this.gait.update(
      state.bodyX,
      state.bodyY,
      rigRad,
      state.velX * leadScale,
      state.velY * leadScale,
      stepMs,
    );
    this.readGaitFeet(state.bodyX, state.bodyY, rigRad);
    this.pose(state.dash01);
  }

  /**
   * O anda havada olan UZUV sayısı — arka itici uzuvlar dahil, çünkü onlar da
   * adım atar ve gövdeyi taşır. Teşhis ve denge okumaları için.
   */
  get steppingLimbCount(): number {
    return this.gait.steppingCount;
  }

  /**
   * Sırayı DELEREK adıma girmiş uzuv sayısı. Sıfırken "gövde karşı grubun
   * tamamı üstündedir" güvencesi geçerlidir; sıfırdan büyükken bilinçli olarak
   * askıdadır (bkz. CORE `LegGait`).
   */
  get emergencyLimbCount(): number {
    return this.gait.emergencySteppingCount;
  }

  /** Bu karede yere basan ayakların dünya konumlarını gezer (toz, ses). */
  forEachPlant(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.drivers.length; i++) {
      if (this.gait.justPlanted(i)) visit(this.gait.footX(i), this.gait.footY(i));
    }
  }

  /** TÜM ayakların dünya konumlarını gezer — atılım inişi gibi toplu olaylar. */
  forEachFoot(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.drivers.length; i++) visit(this.gait.footX(i), this.gait.footY(i));
  }

  /**
   * Duruşu canlı yeniden yazar. Ev konumu yalnız bir SONRAKİ adımın hedefini
   * etkiler; basılı ayak yerinde kalır, yani çömelirken ya da atılırken
   * ayaklar kaymaz, uzuvlar bükülür.
   */
  private applyStance(motion01: number, dash01: number, crouch01: number): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const home = restingHome(this.drivers[i], motion01, dash01, crouch01);
      this.gait.setLegHome(i, home.x, home.y);
    }
  }

  /** Yürüyüş döngüsünün dünya ayaklarını gövde-yerel uzaya çevirir. */
  private readGaitFeet(bodyX: number, bodyY: number, rigRad: number): void {
    // IK hedefleri rig'in gerçek render dönüşüyle aynı uzayda çözülmelidir.
    const cos = Math.cos(-rigRad);
    const sin = Math.sin(-rigRad);
    for (let i = 0; i < this.drivers.length; i++) {
      const worldDx = this.gait.footX(i) - bodyX;
      const worldDy = this.gait.footY(i) - bodyY;
      this.footLocalX[i] = worldDx * cos - worldDy * sin;
      this.footLocalY[i] = worldDx * sin + worldDy * cos;
      this.footLift[i] = this.gait.lift(i);
    }
  }

  /** Uçuş pozu: ayaklar EV konumlarında tutulur, hepsi eşit kaldırılır. */
  private readFlightFeet(): void {
    for (let i = 0; i < this.drivers.length; i++) {
      this.footLocalX[i] = this.gait.homeX(i);
      this.footLocalY[i] = this.gait.homeY(i);
      this.footLift[i] = gaitConfig.flightLift;
    }
  }

  private pose(dash01: number): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const driver = this.drivers[i];
      const limb = driver.rig;

      let dx = this.footLocalX[i] - limb.hipX;
      let dy = this.footLocalY[i] - limb.hipY;

      // Havadaki ayağı kalçaya doğru çek: diz daha çok bükülür, uzuv yerden
      // kalkmış görünür. Üstten bakışta "yükseklik" ancak böyle okunur.
      const lift = this.footLift[i];
      if (lift > 0) {
        const reach = Math.hypot(dx, dy);
        if (reach > 1e-3) {
          // Kısaltma hedefi [1, reach] aralığına kelepçelenir: ayak zaten
          // kalçanın dibindeyken çıkarma negatife düşer ve uzvu KISALTMAK
          // yerine uzatırdı.
          const tucked = clamp(reach - gaitConfig.swingTuckPx * lift, 1, reach);
          dx *= tucked / reach;
          dy *= tucked / reach;
        }
      }

      /*
       * Sabit kök kemik varsa (bacaklar) önce o pozlanır ve IK onun UCUNDAN
       * başlar; yoksa (arka itici uzuvlar) IK doğrudan kalçadan başlar ve uzun
       * kemik çiftin ilki olur.
       *
       * Container dönüşleri EBEVEYNE görelidir. Göreli açılar ±π aralığına
       * sarılır: atan2 farkları seam'de 360° sıçrar. Render için fark etmez
       * (dönüş modülerdir) ama sarılmamış bir açı, bu değerleri yumuşatan her
       * ileri adım için gizli bir tuzaktır.
       */
      let baseRad = 0;
      let originX = 0;
      let originY = 0;
      if (limb.root && driver.rootDrive) {
        const stanceRad = stanceAngleRad(driver.stance, dash01);
        const yaw = clamp(
          wrap(Math.atan2(dy, dx) - stanceRad, -Math.PI, Math.PI) * driver.rootDrive.follow,
          -driver.rootDrive.yawLimitRad,
          driver.rootDrive.yawLimitRad,
        );
        baseRad = stanceRad + yaw;
        originX = Math.cos(baseRad) * limb.rootLength;
        originY = Math.sin(baseRad) * limb.rootLength;
        limb.root.rotation = wrap(baseRad, -Math.PI, Math.PI);
      }

      const solved = solveTwoBoneIk(
        dx - originX,
        dy - originY,
        limb.upperLength,
        limb.lowerLength,
        driver.stance.bendSign,
      );

      limb.upper.rotation = wrap(solved.upperRad - baseRad, -Math.PI, Math.PI);
      limb.lower.rotation = wrap(solved.lowerRad - solved.upperRad, -Math.PI, Math.PI);
      if (limb.tip) {
        limb.tip.rotation =
          lerp(gaitConfig.clawPlantedCurlDeg, gaitConfig.clawLiftCurlDeg, lift) * DEG;
      }
    }
  }
}

function sanitiseDriveState(state: LimbDriveState): LimbDriveState {
  return {
    bodyX: finiteOr(state.bodyX, 0),
    bodyY: finiteOr(state.bodyY, 0),
    bodyRad: finiteOr(state.bodyRad, 0),
    velX: finiteOr(state.velX, 0),
    velY: finiteOr(state.velY, 0),
    turnRate: finiteOr(state.turnRate, 0),
    motion01: clamp01(finiteOr(state.motion01, 0)),
    dash01: clamp01(finiteOr(state.dash01, 0)),
    crouch01: clamp01(finiteOr(state.crouch01, 0)),
    airborne: state.airborne,
  };
}

/** Uzvun o kareki gövde-yerel ev (dinlenme) ayak konumu. */
function restingHome(
  driver: LimbDriver,
  motion01: number,
  dash01: number,
  crouch01: number,
): { x: number; y: number } {
  const angle = stanceAngleRad(driver.stance, dash01);
  const reach =
    (driver.stance.reach +
      driver.stance.dashReachDelta * dash01 +
      driver.stance.pushReachGain * motion01) *
    (1 - gaitConfig.crouchReachDrop * crouch01);
  const radius = driver.totalLength * reach;
  return {
    x: driver.rig.hipX + Math.cos(angle) * radius,
    y: driver.rig.hipY + Math.sin(angle) * radius,
  };
}

function stanceAngleRad(stance: LimbStance, dash01: number): number {
  return FORWARD_RAD + (stance.angleDeg + stance.dashAngleDeltaDeg * dash01) * DEG;
}
