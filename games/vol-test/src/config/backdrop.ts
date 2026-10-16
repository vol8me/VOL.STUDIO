/** Menü arka planı: menülerin arkasında ekrandan geçen yürüyüş alayının sayıları (sahne `BackdropScene`). */
export const BACKDROP = {
  /** Aynı anda ekrandan geçen araç sayısı: seçilebilir aralık ve varsayılan. */
  density: { min: 2, max: 10, default: 6 },
  /** Araç sırasını, giriş yönlerini ve zamanlamaları tohumlar. */
  seed: 1907,
  /**
   * Alay: araçlar dünya merkezindeki sahnenin `radius` uzağındaki bir noktadan girer, karşı yöne yakın
   * bir noktaya (`skew` rad kadar sapmış: çaprazdan ve bir yandan geçerler) yürür ve çıkınca yeniden
   * başlar. `radius` ekranın köşegeninden büyüktür: araç hep ekran dışında doğar ve söner.
   */
  parade: {
    radius: 1250,
    skew: 0.7,
    /** Açılışta araçlar arası en az uzaklık ve yol verme: kaçınma menzili ile ağırlığı (birim). */
    spawnGap: 320,
    avoidRange: 240,
    avoidWeight: 1.6,
    /** Hedefe bu kadar yaklaşan araç yoldan kalkar (birim). */
    arrive: 90,
    /** Bu kadar ms yerinden oynamayan araç sıkışmış sayılır ve yeniden başlatılır. */
    stuckMs: 5000,
    /** Atılım/sıçrama gösterisi: iki gösteri arası ve gösteri süresi (ms, [en az, en çok]). */
    boostGapMs: [4500, 11_000],
    boostMs: [900, 1500],
    /** Ayrılan aracın yerine yenisi gelmeden önceki bekleme (ms, [en az, en çok]). */
    respawnMs: [400, 2400],
  },
  /** Kamera: sabit yakınlaştırma, sahnenin menüdeki boş alanda oturduğu yükseklik (0 üst, 1 alt) ve oturma süresi. */
  camera: { zoom: 1.05, focusHeight: 0.5, followMs: 700 },
  /** Menü okunurluğu için sahnenin üstüne konan karartma. */
  dim: { alpha: 0.3 },
  /** Sahne hazır olunca arka planın görünüşe girme süresi (ms). */
  fadeInMs: 700,
} as const;
