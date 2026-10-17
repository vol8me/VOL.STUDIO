export const NETWORK = {
  /** Dolu dünyadan sonra taşma odası kurulur; ölçüm kanıtı olmadan artırılmaz. */
  maxPlayers: 24,
  /** Birincil ve taşma odalarının toplam güvenlik tavanı; ölçülmüş oyuncu kapasitesi değildir. */
  maxRooms: 4,
  /** Sunucu ve öngörü `GAME.simulationStepMs` ile aynı adımı kullanır (testle kilitli). */
  tickRate: 60,
  /** Geciken girdiler toplu boşalabilir; nominal 60/sn'nin dört katı aşılırsa bağlantı düşer. */
  maxMessagesPerSecond: 240,
  maxEventBatch: 4096,
  /** Geliştirme sunucusu; üretim adresi derleme zamanı `VITE_VOLTEST_SERVER` ile verilir. */
  defaultEndpoint: 'http://127.0.0.1:2567',
  fallbackName: 'Pilot',
  /** Büyük sıçrama yeniden doğma/ışınlanma sayılır; ara değer uygulanmaz. */
  snapDistance: 180,
  patchRateMs: 50,
  /** Girdi gelmeyen adımda son niyetin kaç sabit adım daha tutulacağı (ateş tutulmaz). */
  inputHoldSteps: 6,
  /** Sınır aşılınca en eski girdi atılır. */
  inputBuffer: 8,
  /** Son dilim iki simülasyon adımıdır; uzun hitch dahil toplam iş tamponu aşamaz. */
  prediction: { sliceSteps: 2, maxSlices: 2 },
  /** Titreşim tamponu, `lead - 1` adım geç kalmayı boş simülasyon adımı üretmeden karşılar. */
  inputLead: 2,
  reconnectSeconds: 15,
  /** İlk başarılı katılımdan itibaren geçici kopmayı yeniden dener; SDK'nın 5 sn eşiği kullanılmaz. */
  reconnectMinUptimeMs: 0,
  interpolationDelayMs: 100,
  /** Kuyruk sınırı graceMs boyunca kesintisiz aşılırsa yavaş tüketici atılır. */
  slowConsumer: { limitBytes: 256 * 1024, graceMs: 5000, sweepMs: 1000 },
  /** Eşik yoksa SDK sapmayı ölçmez (hep 0); kalıcı sapma bunu aşarsa uyarır. 1 m = 32 birim. */
  divergenceTolerance: 4,
  metricsReportMs: 1000,
} as const;
