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
  },
  /** Ekranlar arası geçişin solma süresi (ms). */
  fadeMs: 180,
} as const;
