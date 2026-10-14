/**
 * Parça hasarı: palet ve bacak dayanımı, aşınmanın sönümü, onarım ve kırık parçanın sürüşe etkisi.
 * Sayılar oynanıştır; bölge mantığı `sim/combat/PartWear.ts`, sürüş etkisi `Tank` ve `Walker`dadır.
 * Dayanım aracın canının oranıdır: zayıf araç parçasını da çabuk kaybeder, ağır zırhlı geç.
 */
export const PARTS = {
  wear: {
    /** Son darbeden bu süre sonra aşınma sönmeye başlar (ms), sonra saniyede bu kadar can karşılığı. */
    decayDelayMs: 2600,
    decayPerSecond: 7,
  },
  repair: {
    /** Bu kadar süre hiç hasar alınmazsa kırık parça yerine oturur (can yenilenmesiyle aynı sessizlik fikri). */
    quietMs: 12000,
    /** Sessizlik sürdükçe her bu kadar sürede bir parça yerine oturur. */
    intervalMs: 3500,
  },
  tank: {
    /** Bir yan paletin dayanımı: aracın canının oranı. */
    healthShare: 0.5,
    /** Yarı genişliğin bu oranından dışa düşen darbe palete gider; içte kalan gövdeye. */
    sideStart: 0.45,
    /** Kenara bu oranda yakın darbe kritiktir: aşınma çarpanı büyür. */
    criticalStart: 0.82,
    criticalGain: 1.4,
    /** Kırık palet yerde sürünen ölü yüktür: yuvarlanma direnci bu kadar katına çıkar. */
    dragGain: 5,
    /** Palet koparken gövdenin sarsılması [0, 1]. */
    jolt: 0.55,
  },
  walker: {
    /** Tek bir bacağın dayanımı: aracın canının oranı. */
    healthShare: 0.3,
    /** Gövdenin ön/arka yüzüne gelen darbe bacağı bu oranda aşındırır (yanlar tam). */
    centreWeight: 0.4,
    sideStart: 0.3,
    criticalStart: 0.85,
    criticalGain: 1.3,
    /** Darbe iki bacak arasına düşünce ikisi de aşınır: yayılma, istasyon aralığının oranıdır. */
    spread: 0.62,
    /** Bacak istasyonlarının gövde boyunca konumu (önden arkaya, dünya birimi): `SpiderLook.hips` x'i ile aynı. */
    stations: { arachnid: [20, 11, 2, -5], widow: [28, 21, 14, 10] },
    /** Her kaybedilen bacak azami hızı ve ivmeyi bu oranda keser; taban çevik kalan alt sınırdır. */
    legLoss: 0.075,
    floor: 0.3,
    /** Bir yanın bacakları eksikse yürüyüş o yana sürüklenir (rad/s, tam tek yanlı kayıpta, hız oranıyla). */
    drift: 0.9,
    /** Tökezleme: eksik bacaklı yan, adım uzunluğunda bir kez çöker (hız kesilir, gövde o yana savrulur). */
    stumble: { stride: 56, dip: 0.45, sway: 1.1 },
    /** Bacak koparken gövdenin sarsılması [0, 1]. */
    jolt: 0.6,
  },
} as const;
