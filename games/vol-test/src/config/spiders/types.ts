import type { SpringConfig } from '@volstudio/core/math';
import { LIGHT } from '../light';
import type { SensorArt } from '../sensors';
import type { WalkerId } from '../vehicles';

/** Bir parçanın SVG kutusu (dünya birimi) ve eklem merkezi; `assets/vehicles/<örümcek>/<parça>.svg` ile aynıdır. */
export interface PartBox {
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

/** Bir örümceğin bütün el çizimi parçaları; dosya adı parça kimliğidir. */
export const SPIDER_PARTS = [
  'femur',
  'tibia',
  'tarsus',
  'joint',
  'contact',
  'thorax',
  'thorax-shadow',
  'abdomen',
  'abdomen-shadow',
  'cannon-housing',
  'cannon-barrels',
] as const;
export type SpiderPartId = (typeof SPIDER_PARTS)[number];

/** Bir bacak kalçası: gövde merkezine göre (dünya birimi) ve gövde eksenine göre çıkış açısı (derece). */
export interface SpiderHip {
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
}

/**
 * Bütün örümceklerin ortak sunum sabitleri. Sanat DÜNYA BİRİMİNDE çizilir (tank parçalarıyla aynı
 * ölçek): kenar kalınlığı, perçin ve mercek boyu tankla eşit çıkar. Yükseklik üç şeye dönüşür:
 * parçanın perspektifle büyümesi, konumun gövde merkezinden dışarı itilmesi ve yere düşen gölgenin
 * yükseklikle orantılı kayması.
 */
export const SPIDER_ART = {
  depth: 10,
  /** Yüksekliğin parçayı büyütmesi ve konumu dışarı itmesi (dünya birimi başına). */
  perspective: 0.0117,
  parallax: 0.0061,
  /** Işığın tersine düşen gölge kayması (yükseklik başına): güneş sol-üstten gelir. */
  light: LIGHT,
  /** Göğüs ve karın gölgesinin koyuluğu: tank gölgesine (0,32) yakın, bacak çizgisinden biraz koyu. */
  shadowAlpha: 0.36,
} as const;

/** Bir kareden ötekine bu kadar uzağa giden araç ışınlanmıştır (yeniden doğuş). */
export const SPIDER_TELEPORT_UNITS = 160;

export interface SpiderBody {
  /** Kalçanın zeminden yüksekliği: ayakta duruş. Çömelme, sıçrama ve çarpma bunu değiştirir. */
  readonly hipHeight: number;
  /** Göğüs ve karın üst yüzeyinin yerden yüksekliği: gölge kaymasını belirler. */
  readonly thoraxHeight: number;
  readonly abdomenHeight: number;
  /** Göğüs merkezinin ve karnın göğse saplandığı noktanın gövde merkezine göre x konumu. */
  readonly thoraxX: number;
  readonly abdomenPivotX: number;
}

export interface SpiderLeg {
  /** Kemik uzunlukları: `femur.svg`/`tibia.svg` ile aynı (kalça-dizin ve diz-ayak merkezleri arası). */
  readonly femur: number;
  readonly tibia: number;
  /** Dinlenme ayak mesafesi (kalçadan, yatay). */
  readonly restDistance: number;
  /** Adımın en yüksek noktası: havadaki ayak bu kadar kalkar. */
  readonly swingPeak: number;
  /** Temas karartısı çapı ve gölge çizgisi kalınlığı ile opaklığı. */
  readonly contactPx: number;
  readonly shadowWidth: number;
  readonly shadowAlpha: number;
  /** Çömelme uzuvları gövdeye çeker (dinlenme mesafesi oranı). */
  readonly crouchReachDrop: number;
  /** Pençenin havada kıvrılması ve yerde düzelmesi (derece). */
  readonly clawLiftCurlDeg: number;
  readonly clawPlantedCurlDeg: number;
}

/** Yürüyüş döngüsü: dönüşümlü dört-ayaklı (alternating tetrapod). */
export interface SpiderGait {
  readonly stepTriggerPx: number;
  readonly runStepTriggerPx: number;
  readonly stepDurationMs: number;
  readonly runStepDurationMs: number;
  /** Sıra disiplinini delen gerginlik: bacak erişimi dar olduğundan sırasını bekleyen bacak bundan fazla geride kalamaz. */
  readonly emergencyStrainPx: number;
  /** Sıranın açık kalma payı (adım süresinin kesri): yavaş dönüşte karşı grubun aç kalmasını önler. */
  readonly turnWindow: number;
  readonly stepLeadSeconds: number;
  /** Bu hızda (birim/s) tam tempo adım değerleri kullanılır: yürüyüş tavanı. */
  readonly fullTempoSpeed: number;
  /** Havadaki ayağı kalçaya çeken kısaltma: diz bükülür, uzuv yerden toplanır. */
  readonly swingTuckPx: number;
}

/** Gövdenin ikincil hareketi: hepsi yaylardır, ham girdiden değil gerçek hız ve ivmeden beslenir. */
export interface SpiderMotion {
  readonly idleHeightDrop: number;
  readonly impactHeightDrop: number;
  readonly heightSpring: SpringConfig;
  /** Her adımda gövde kısa bir iner. */
  readonly stepBobPx: number;
  readonly bobSpring: SpringConfig;
  /** Gövde ivmenin tersine yaslanır. */
  readonly leanSpring: SpringConfig;
  readonly accelForMaxLean: number;
  readonly maxLeanPx: number;
  /** Karın, gövdenin dönüşünü ve yanal ivmeyi geriden izler. */
  readonly abdomenSpring: SpringConfig;
  readonly abdomenYawPerRadPerSec: number;
  readonly abdomenYawPerLateralAccel: number;
  readonly abdomenMaxYawRad: number;
  readonly abdomenIdleSwayRad: number;
  readonly abdomenIdleSwayHz: number;
  readonly abdomenStretch: number;
  /** Göğüs dönüşe önden yatar. */
  readonly thoraxYawSpring: SpringConfig;
  readonly thoraxYawPerRadPerSec: number;
  readonly thoraxMaxYawRad: number;
  /** Bu hızda tam ayağa kalkılır. */
  readonly standSpeed: number;
  readonly impactFalloffMs: number;
}

export interface SpiderDust {
  readonly emitter: {
    readonly speed: { readonly min: number; readonly max: number };
    readonly lifespan: { readonly min: number; readonly max: number };
    readonly scale: { readonly start: number; readonly end: number };
    readonly alpha: { readonly start: number; readonly end: number };
    readonly tint: number;
    readonly emitting: false;
  };
  readonly depth: number;
  readonly countMin: number;
  readonly countMax: number;
}

/** Silah yuvasının sunumu: gövde (yuva) ve namlu demeti iki parçadır, demet atışta geri kayar. */
export interface SpiderCannon {
  /** Namlu ucunun yuva milinden uzaklığı: `ARACHNID`/`WIDOW` yuvalarının `reach` değeridir. */
  readonly muzzleX: number;
  /** Isınma ışığının namlu boyunca konumu ve çapı (ışık dokusu 64 px). */
  readonly coilX: number;
  readonly coilGlowPx: number;
  readonly glow: number;
  /** Topun zeminden yüksekliği: gölge kaymasını belirler. */
  readonly height: number;
  readonly recoil: SpringConfig & { readonly kick: number; readonly max: number };
  readonly housingKick: SpringConfig & { readonly kick: number; readonly max: number };
  readonly flashMs: number;
  readonly flashScale: number;
  readonly flashLengthScale: number;
  readonly flashWidthScale: number;
  readonly heatMs: number;
  readonly idleGlow: {
    readonly alpha: number;
    readonly pulseAlpha: number;
    readonly pulseHz: number;
  };
}

/**
 * Sıçrayan örümceğin (Arachnid, Widow) hava pozu. Sıçrama balistik bir yaydır: bacaklar kalkışta arkaya
 * itilir, zirvede gövdeye toplanır, inişe doğru öne uzanır; gövde zirvede perspektifle büyür ve gölgesi
 * ayrılır. Kalkış kısa bir çömelmeyle başlar, iniş gövdeyi çökertir ve ayakları sırayla basar.
 */
export interface SpiderLeap {
  /** Zirvede kalçanın kalktığı yükseklik (dünya birimi). */
  readonly rise: number;
  /** Ayakların kalçadan uzaklığı (dinlenme mesafesi oranı): kalkışta itilmiş, zirvede toplanmış, inişte uzanmış. */
  readonly pushReach: number;
  readonly tuckReach: number;
  readonly landReach: number;
  /** Uç bacakların gövde ekseninde kayması (dünya birimi): kalkışta arkadakiler geri, inişte öndekiler ileri. */
  readonly reachShiftPx: number;
  /** Zirvede ayakların yerden yüksekliği (kalça yüksekliğinin oranı). */
  readonly footLift: number;
  /** Kalkış çömelmesi (kalça inişi) ve süresi; iniş çökmesinin hız darbesi. */
  readonly coilDrop: number;
  readonly coilMs: number;
  readonly landKick: number;
  /** Uçuşta zemin gölgesinin soluklaşması (yay tepesinde saydamlığın azalan payı). */
  readonly shadowFade: number;
  /** Gövdenin kalkışta geri, inişte ileri yaslanması (dünya birimi) ve karnın kalkışta gerilmesi. */
  readonly leanPx: number;
  readonly stretch: number;
  /** Kalkışta ve inişte ayak başına toz sayısı. */
  readonly dustLaunch: number;
  readonly dustLand: number;
}

/**
 * Kalkanlı örümceğin (Goliath) enerji kubbesi. Kubbe gövdeyi çevreler: iç gradyan, iki katmanlı altıgen
 * örgü, parlak kenar ve dönen yay vurguları. Hasar emilince vuruş açısında dalga yayılır.
 */
export interface SpiderShield {
  /** Kubbe yarıçapı (dünya birimi). */
  readonly radius: number;
  /** Kubbe gövdesinin ve sıcak kenarının rengi. */
  readonly tint: number;
  readonly rim: number;
  /** Örgünün dönüş hızı (rad/s) ve nabız sıklığı (Hz). */
  readonly spin: number;
  readonly pulseHz: number;
  /** Bitişten önce kubbenin titreyerek uyardığı son süre (ms) ve vuruş dalgasının ömrü (ms). */
  readonly warnMs: number;
  readonly rippleMs: number;
  /** Açılış yayı: kubbe küçükten büyür, aşar ve oturur. */
  readonly raise: SpringConfig;
}

export interface SpiderLook {
  readonly id: WalkerId;
  readonly parts: Readonly<Record<SpiderPartId, PartBox>>;
  readonly body: SpiderBody;
  /** Sağ taraf; sol taraf yansımadır. Sıra önden arkaya. */
  readonly hips: readonly SpiderHip[];
  readonly leg: SpiderLeg;
  readonly gait: SpiderGait;
  readonly motion: SpiderMotion;
  readonly dust: SpiderDust;
  /** Yalnız sıçrayan örümcekte (yetenek `leap`). */
  readonly leap?: SpiderLeap;
  /** Yalnız kalkanlı örümcekte (yetenek `shield`). */
  readonly shield?: SpiderShield;
  readonly cannon: SpiderCannon;
  /**
   * Göğsün çekirdek ışığı ve ön duyargaları (konumlar göğüs milinden başlar). Striker'ın çekirdek
   * nabzı ve yaylı duyargalarıyla aynı hareket dilidir.
   */
  readonly sensors: SensorArt;
}
