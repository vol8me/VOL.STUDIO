/** Çok oyunculu oda değerleri yalnız oyunun yapılandırmasındadır. */
export const NETWORK = {
  /** Oda başına eşzamanlı araç; dolu odadan sonra `joinOrCreate` yenisini kurar. */
  maxPlayers: 12,
  /**
   * İstemci her sabit adımda bir niyet yollar (60/sn). Saat yakalama patlaması
   * ve ağ birikimi için pay bırakılır; aşan istemci Colyseus tarafından düşürülür.
   */
  maxMessagesPerSecond: 120,
  /** Doğma yuvalarının dünya merkezine uzaklığı. */
  seatRadius: 360,
  /** Sunucu durum yayını aralığı. */
  patchRateMs: 50,
  /** Yeni niyet gelmediğinde son niyetin kaç sabit adım daha tutulacağı. */
  inputHoldSteps: 3,
} as const;
