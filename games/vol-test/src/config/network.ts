/** Çok oyunculu oda değerleri yalnız oyunun yapılandırmasındadır. */
export const NETWORK = {
  /** Oda başına eşzamanlı araç; dolu odadan sonra `joinOrCreate` yenisini kurar. */
  maxPlayers: 12,
  /**
   * Sunucunun ve istemci öngörüsünün sabit adım hızı (Hz). `GAME.simulationStepMs` ile aynı
   * adımdır (testle kilitli): öngörü ve yeniden oynatma sunucuyla aynı `dt` ile ilerler.
   */
  tickRate: 60,
  /**
   * İstemci her sabit adımda bir girdi yollar (60/sn) ve Colyseus bunların hepsini mesaj sayar.
   * Bağlantı durup toplu boşalınca bir saniyelik pencereye iki saniyelik girdi sığabilir; sınır
   * nominalin dört katıdır, aşan istemci Colyseus tarafından düşürülür.
   */
  maxMessagesPerSecond: 240,
  /** Ad vermeyen oyuncuya atanan ad; araç numarası eklenir. */
  fallbackName: 'Pilot',
  /** Doğma yuvalarının dünya merkezine uzaklığı. */
  seatRadius: 360,
  /** Sunucu durum yayını aralığı; uzlaştırma ve uzak araç ara değeri bu aralıkla beslenir. */
  patchRateMs: 50,
  /** Girdi gelmeyen adımda son niyetin kaç sabit adım daha tutulacağı (ateş tutulmaz). */
  inputHoldSteps: 6,
  /** Sunucunun oyuncu başına tamponladığı en çok girdi; aşılırsa en eskisi atılır. */
  inputBuffer: 8,
  /**
   * Tüketime başlamadan önce tamponda bekletilen girdi sayısı (titreşim tamponu). Sunucu her adımda
   * dünyayı ilerlettiği için girdisi geç kalan araç boşta adım atar; istemcinin tahmin etmediği bu
   * adım düzeltme olarak geri döner. Bir adımlık pay, `lead - 1` adımı aşmayan geç kalmayı eler.
   */
  inputLead: 2,
  /** Kopan oyuncunun aracının yeniden bağlanmayı bekleme süresi (sn). */
  reconnectSeconds: 15,
  /** Uzak araçların çizildiği geriye dönük süre (ms): iki yama arasını ara değerle doldurur. */
  interpolationDelayMs: 100,
} as const;

export interface MatchConfig {
  readonly scoreLimit: { readonly ffa: number; readonly teams: number };
  readonly intermissionMs: number;
  readonly teams: number;
  readonly privateMaxPlayers: number;
}

/** Maç kuralları: skor sınırı, ara verme ve takım sayısı. */
export const MATCH: MatchConfig = {
  /** Takımsız maçta ilk bu kadar öldürmeye ulaşan, takımlıda takım toplamı. */
  scoreLimit: { ffa: 10, teams: 20 },
  /** Maç bitince sonuç ekranının sürdüğü süre; sonra skorlar sıfırlanır ve herkes doğar. */
  intermissionMs: 8000,
  teams: 2,
  /** Özel odanın en çok kaç oyuncuyla kurulacağı. */
  privateMaxPlayers: 8,
};
