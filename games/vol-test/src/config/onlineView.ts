/** Çevrimiçi sunumun renk ve ölçüleri; oynanış sayısı değildir, yalnız çizimi belirler. */
export const ONLINE_VIEW = {
  /** Takımsız maçta oyuncu kendi rengini, rakipler tek rengi taşır; takımlı maçta takım rengi. */
  colors: {
    self: 0x52f5cf,
    foe: 0xe8644a,
    teams: [0xe8964a, 0x4aa8e8] as readonly number[],
    protection: 0xeafff9,
    /** Bot rozeti (etiket ve harita): insan oyunculardan ayıran küçük sarı nokta. */
    bot: 0xffd23c,
  },
  tag: {
    depth: 40,
    /** Etiketin araç merkezinden yukarı uzaklığı (dünya birimi). */
    offsetY: -38,
    barWidth: 40,
    barHeight: 4,
    fontSize: 12,
    /** Bot rozetinin yarıçapı ve yazıdan uzaklığı (dünya birimi). */
    badgeRadius: 3,
    badgeGap: 5,
    /** Ölü aracın etiketi bu alfayla solar. */
    deadAlpha: 0.35,
    /** Etiket yazısının çizim çözünürlüğü; kamera yakınlaşınca bulanmasın. */
    resolution: 2,
  },
  /** Skor tablosu: kompakt görünümde en çok bu kadar satır (kendi satırınız her zaman görünür). */
  board: { compactRows: 5 },
  /** Panel sayaçlarının DOM'a yazılma aralığı (ms). */
  panelIntervalMs: 250,
  /** Bildirim akışında tutulan satır sayısı. */
  feedEntries: 6,
} as const;

/** Bağlantı kalitesi eşikleri (ms gidiş-dönüş): iyi, orta, kötü. */
export const PING_GRADES = { good: 80, fair: 160 } as const;
