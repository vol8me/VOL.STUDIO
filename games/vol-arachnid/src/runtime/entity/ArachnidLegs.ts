import {
  LegGait,
  clamp,
  clamp01,
  clampSimulationStep,
  finiteOr,
  lerp,
  measureSupport,
  solveTwoBoneIk,
  wrap,
  type LegGaitLeg,
  type SupportFoot,
  type SupportState,
} from '@volstudio/core';
import { gaitConfig, type LimbStance } from '@/config/gait';
import { RIG_FACING_OFFSET_RAD } from '@/config/rig';
import type { LocomotionSignals, PoseSignals } from '@/runtime/entity/locomotionSignals';
import type { ArachnidRig, LimbRig } from '@/runtime/rig/arachnidRig';

const DEG = Math.PI / 180;
/** Duruş açıları İLERİ eksenden ölçülür; rig yerel uzayında ileri −Y'dir. */
const FORWARD_RAD = -Math.PI / 2;

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
  /**
   * Destek ölçümünün ödünç girdisi ve çıktısı.
   *
   * Ölçüm her karede koşar; ayak dizisini ve sonuç nesnesini her seferinde
   * yeniden kurmak sıcak yolda gereksiz bir tahsis olurdu.
   */
  private readonly supportFeet: SupportFoot[];
  /**
   * Adım ayarının ödünç nesnesi.
   *
   * `setStepTuning` alanları KOPYALAR, referansı tutmaz; her karede yeni bir
   * nesne kurmak sıcak yolda gereksiz bir tahsisti.
   */
  private readonly stepTuning = { stepTriggerPx: 0, stepDurationMs: 0 };
  private readonly supportState: SupportState = {
    groundedCount: 0,
    areaPx2: 0,
    inside: false,
    marginPx: 0,
    stability01: 0,
  };

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
    this.supportFeet = entries.map(() => ({ x: 0, y: 0, grounded: false }));
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
    this.measureSupportState(bodyX, bodyY, 0, 0);
    this.pose(0);
  }

  update(body: LocomotionSignals, pose: PoseSignals, deltaMs: number): void {
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
    const stepMs = clampSimulationStep(deltaMs);
    // Temizlik YERİNDE yapılır, yeni bir nesneye kopyalanarak değil: bu sıcak
    // yol her karede koşar ve tahsis gerektirmez.
    const bodyX = finiteOr(body.x, 0);
    const bodyY = finiteOr(body.y, 0);
    const velX = finiteOr(body.velX, 0);
    const velY = finiteOr(body.velY, 0);
    const turnRate = finiteOr(body.turnRateRadPerSec, 0);
    const motion01 = clamp01(finiteOr(pose.motion01, 0));
    const dash01 = clamp01(finiteOr(body.dash01, 0));
    const crouch01 = clamp01(finiteOr(pose.crouch01, 0));
    const impact01 = clamp01(finiteOr(body.impact01, 0));

    const rigRad = finiteOr(body.facingHeadingRad, 0) + RIG_FACING_OFFSET_RAD;
    this.applyStance(motion01, dash01, crouch01);

    if (!body.grounded) {
      // Yürüyüş döngüsü DURUR. Açık bırakıldığında uzuvlar sıra disiplinini
      // delip acil adım yağmuruna giriyor, gövde düz uçarken bacaklar yerinde
      // titriyordu.
      this.airborne = true;
      this.readFlightFeet();
      // Havadayken destek yoktur; ölçüm sıfırlanır ki tüketici bir önceki
      // karenin dengesini "hâlâ geçerli" sanmasın.
      this.clearSupportState();
      this.pose(dash01, impact01);
      return;
    }

    if (this.airborne) {
      // İniş: bütün ayaklar aynı anda evlerine basar. Havadaki pozdan yürüyüşe
      // adım adım dönmek, inişi bulanık bir sürüklenmeye çevirirdi.
      this.airborne = false;
      this.gait.reset(bodyX, bodyY, rigRad);
    }

    const speed = Math.hypot(velX, velY);
    /*
     * Dönüş de bir TEMPO kaynağıdır. Yerinde dönen bir gövdenin doğrusal hızı
     * sıfırdır ama ayakların ev konumları teğetsel olarak savrulur; tempoyu
     * yalnız hızdan okumak adımları en yavaş ayarında bırakıyor ve uzuvlar
     * gövdenin arkasında sürükleniyordu.
     */
    const tangentialSpeed = Math.abs(turnRate) * this.stanceRadiusPx;
    const tempo = clamp01(Math.max(speed, tangentialSpeed) / gaitConfig.fullTempoSpeedPxPerSec);

    this.stepTuning.stepTriggerPx = lerp(
      gaitConfig.stepTriggerPx,
      gaitConfig.runStepTriggerPx,
      tempo,
    );
    this.stepTuning.stepDurationMs = lerp(
      gaitConfig.stepDurationMs,
      gaitConfig.runStepDurationMs,
      tempo,
    );
    this.gait.setStepTuning(this.stepTuning);

    // Atılım hızı adım hedefini erişim dışına fırlatmamalı; gövde yine gerçek
    // hızla ilerler, yalnız ayağın öngörü mesafesi tam tempo hızında doyar.
    const leadScale =
      speed > gaitConfig.fullTempoSpeedPxPerSec ? gaitConfig.fullTempoSpeedPxPerSec / speed : 1;
    this.gait.update(bodyX, bodyY, rigRad, velX * leadScale, velY * leadScale, stepMs);
    this.readGaitFeet(bodyX, bodyY, rigRad);
    this.measureSupportState(bodyX, bodyY, velX, velY);
    this.pose(dash01, impact01);
  }

  /**
   * O anda havada olan UZUV sayısı — arka itici uzuvlar dahil, çünkü onlar da
   * adım atar ve gövdeyi taşır. Teşhis ve denge okumaları için.
   */
  get steppingLimbCount(): number {
    return this.gait.steppingCount;
  }

  /**
   * Gövdenin DESTEK ölçümü — hangi ayaklar yerde, çevreledikleri alan ne kadar
   * ve gövde o alanın içinde mi?
   *
   * Yürüyüş döngüsü dengeyi SIRA disipliniyle dolaylı olarak koruyor; bu ölçüm
   * güvencenin gerçekten tuttuğunu SÖYLER. Bir karar üretmez: düzeltici adım,
   * çömelme ya da sendeleme gibi tepkiler tüketicinin işidir.
   *
   * Dönen nesne ödünçtür ve bir sonraki `update`te yeniden yazılır.
   */
  get support(): SupportState {
    return this.supportState;
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

  /**
   * Destek poligonunu ve denge payını ölçer.
   *
   * İleri bakış BİR ADIM SÜRESİDİR: anlık denge çok geç bir sinyaldir, gövde
   * devrildiğini ancak devrildikten sonra bildirir. Bir adım kadar ileriye
   * bakmak, düzeltici bir adımın yetişebileceği kadar erken uyarır.
   */
  private measureSupportState(bodyX: number, bodyY: number, velX: number, velY: number): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const foot = this.supportFeet[i];
      foot.x = this.gait.footX(i);
      foot.y = this.gait.footY(i);
      foot.grounded = !this.gait.isStepping(i);
    }
    measureSupport(
      this.supportFeet,
      {
        centerX: bodyX,
        centerY: bodyY,
        velX,
        velY,
        lookaheadSeconds: gaitConfig.stepDurationMs / 1000,
        safeMarginPx: gaitConfig.supportSafeMarginPx,
      },
      this.supportState,
    );
  }

  private clearSupportState(): void {
    this.supportState.groundedCount = 0;
    this.supportState.areaPx2 = 0;
    this.supportState.inside = false;
    this.supportState.marginPx = 0;
    this.supportState.stability01 = 0;
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

  private pose(dash01: number, impact01 = 0): void {
    for (let i = 0; i < this.drivers.length; i++) {
      const driver = this.drivers[i];
      const limb = driver.rig;

      let dx = this.footLocalX[i] - limb.hipX;
      let dy = this.footLocalY[i] - limb.hipY;

      /*
       * Ayağı kalçaya doğru ÇEK. İki kaynak aynı mekanizmayı paylaşır:
       *
       * - `lift` — havadaki ayak: diz daha çok bükülür, uzuv yerden kalkmış
       *   görünür. Üstten bakışta "yükseklik" ancak böyle okunur.
       * - `impact01` — duvar çarpması: uzuv o karede bükülür ama AYAK YERİNDE
       *   kalır, yani darbe emilmiş görünür. Duruş evine yazılsaydı görünmezdi;
       *   ev yalnız bir sonraki adımın hedefini etkiler.
       */
      const lift = this.footLift[i];
      const tuckPx = gaitConfig.swingTuckPx * lift + gaitConfig.impactTuckPx * impact01;
      if (tuckPx > 0) {
        const reach = Math.hypot(dx, dy);
        if (reach > 1e-3) {
          // Kısaltma hedefi [1, reach] aralığına kelepçelenir: ayak zaten
          // kalçanın dibindeyken çıkarma negatife düşer ve uzvu KISALTMAK
          // yerine uzatırdı.
          const tucked = clamp(reach - tuckPx, 1, reach);
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

/**
 * Uzvun o kareki gövde-yerel ev (dinlenme) ayak konumu.
 *
 * Sonuç ÖDÜNÇ bir nesneye yazılır. Her uzuv için karede bir `{x, y}` kurmak on
 * uzuvda saniyede altı yüz tahsis demekti; `TouchStickState` aynı sınıf sorunu
 * çoktan buffer'larla çözmüşken burada duruyordu.
 */
const restingHomeScratch = { x: 0, y: 0 };

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
  restingHomeScratch.x = driver.rig.hipX + Math.cos(angle) * radius;
  restingHomeScratch.y = driver.rig.hipY + Math.sin(angle) * radius;
  return restingHomeScratch;
}

function stanceAngleRad(stance: LimbStance, dash01: number): number {
  return FORWARD_RAD + (stance.angleDeg + stance.dashAngleDeltaDeg * dash01) * DEG;
}
