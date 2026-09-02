/**
 * Gövde kabuğunun uzuvlara göre ikincil hareketi.
 *
 * Sinyaller ham girdiden DEĞİL gövdenin gerçek durumundan (hız, ivme, dönüş
 * hızı) türetilir: ham girdiyle sürülen bir kabuk, atılım gibi girdisiz
 * hareketlerde ölü kalır ve duvara çarpınca hiç tepki vermez.
 */
export const bodyMotionConfig = {
  idlePhaseSpeedDegPerSec: 135,
  transformSpring: { stiffness: 95, damping: 16 },

  /** Yanal salınım (px) — bekleme, yürüyüş ve dönüş katkıları. */
  idleSwayPx: 0.8,
  walkSwayPx: 2.2,
  turnSwayPx: 3.4,
  /** Yalpalama (derece). */
  walkRollDeg: 0.8,
  turnRollDeg: 3,
  turnVelocityForMaxRadPerSec: 3.5,

  /**
   * İvme yaslanması: gövde, ivmenin TERSİNE kayar (kalkışta geriye, frende
   * öne). Kütle hissinin en okunur kaynağı budur.
   */
  leanSpring: { stiffness: 78, damping: 13 },
  leanPxPerAccelUnit: 5.2,
  accelForMaxLeanPxPerSec2: 1400,
  maxLeanPx: 9,

  /**
   * Çömelme. Durunca gövde biraz alçalır ve uzuvlar bükülür; kalkışta yayın
   * kendi taşması hafif bir "toparlanma" verir. Üstten bakışta alçalma
   * ÖLÇEKLE okunur — abartılırsa 2B düzlem bozulur.
   */
  crouchSpring: { stiffness: 46, damping: 8.5 },
  crouchBodyScaleDrop: 0.035,
  /** Bu hızın üstünde çömelme tamamen açılır. */
  standSpeedPxPerSec: 90,

  /** Atılımda gövde hareket ekseninde uzar, dikine incelir. */
  dashStretch: 0.075,
  dashStretchSpring: { stiffness: 150, damping: 15 },

  /**
   * Öndeki uç parçalar dönüşe ÖNDEN yatar. Gövdeyle birebir dönerlerse yaratık
   * tek parça bir levha gibi okunur; küçük bir öncülük yönü belli eder.
   */
  snoutLeadSpring: { stiffness: 130, damping: 14 },
  snoutLeadDegPerRadPerSec: 3.6,
  maxSnoutLeadDeg: 13,

  /** Bakış: `core_ring` yuvasının içinde kalan sıçramalı taramalar. */
  gaze: {
    radiusPx: 7.5,
    holdMsMin: 420,
    holdMsMax: 1450,
    saccadeMs: 85,
    /** Avlanma hissi: tetikteyken bekleme bu oranda kısalır. */
    alertHoldScale: 0.34,
    /** Bakış açısının parçaya yansıyan kısmı (derece / tam yarıçap). */
    slitTiltDeg: 9,
    /** Bu hızda uyanıklık tamamlanır. */
    alertSpeedPxPerSec: 160,
  },
} as const;
