/** Çok oyunculu oda değerleri yalnız oyunun yapılandırmasındadır. */
export const NETWORK = {
  /**
   * Dünya başına eşzamanlı insan. Dolu dünyadan sonra `joinOrCreate` bir taşma dünyası kurar;
   * ölçüm kanıtı olmadan artırılmaz (bkz. DESIGN: kapasite).
   */
  maxPlayers: 24,
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
  /** Geliştirme sunucusu; üretim adresi derleme zamanı `VITE_VOLTEST_SERVER` ile verilir. */
  defaultEndpoint: 'http://127.0.0.1:2567',
  /** Ad vermeyen oyuncuya atanan ad; araç numarası eklenir. */
  fallbackName: 'Pilot',
  /**
   * Bu mesafeden (birim) büyük konum sıçraması yeniden doğma/ışınlanmadır: kayan düzeltme ya da ara
   * değer değil, anında yerleştirme uygulanır.
   */
  snapDistance: 180,
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
  /** Eşik yoksa SDK sapmayı ölçmez (hep 0); kalıcı sapma bunu aşarsa uyarır. 1 m = 32 birim. */
  divergenceTolerance: 4,
} as const;
