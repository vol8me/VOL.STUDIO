/** Menü, garaj ve ayar ekranlarının sayıları (sahne düzeni, vitrin hareketi, geçiş). */
export const MENU = {
  showroom: {
    /** Araç vitrininin en büyük kamera yakınlaştırması (dünya biriminin CSS piksel karşılığı). */
    zoom: 4,
    /** Araç ve uzuvlarının kapladığı en geniş alan (dünya birimi): boş alan darsa yakınlaştırma bununla küçülür. */
    extent: 150,
    /**
     * Varsayılandan geniş kaplayan araçların alanı (dünya birimi): bacak açıklığı gövdeden büyük
     * yürüyücü, dar boş alanda kenara değmesin diye daha çok küçülür.
     */
    vehicleExtent: { goliath: 190 } as Readonly<Partial<Record<string, number>>>,
    /** Panel genişliği ekranın bu oranını aşarsa alt levha sayılır ve araç panelin üstünde durur. */
    stackedFraction: 0.7,
    /** Dönen tabla hızı (rad/s). */
    turntableRate: 0.3,
    /** Taretin gövde etrafındaki salınım genliği (rad) ve hızı (rad/s). */
    turretSweep: 0.55,
    turretSweepRate: 0.8,
    /** Zemin ızgarasının yarı genişliği ve adımı (dünya birimi). */
    groundHalf: 1600,
    gridStep: 64,
    /** Saydam zeminde araç altı: gölgenin katman yarıçap oranları ve toplam saydamlığı, halka ölçüsü. */
    disc: {
      shadow: { layers: [1, 0.82, 0.64, 0.46] as readonly number[], alpha: 0.5 },
      ring: { radius: 0.5, width: 1.5, alpha: 0.55 },
    },
  },
  /**
   * Ekranlar arası geçişin süresi (ms): panel kenardan kayarak çıkar ve bu sürenin sonunda sahne değişir.
   * CSS çıkış geçişi aynı süreyi `ScreenScene.goto`dan alır.
   */
  fadeMs: 200,
  /** Panelin giriş ve çıkışta kaydığı mesafe (CSS piksel). */
  slidePx: 36,
} as const;
