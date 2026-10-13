# VOL.FORGE tasarımı

## Neden var

VOL.TEST tek odalı bir savaş prototipidir. Hedef ürün ise kalıcı bir otomasyon ve savunma
dünyasıdır: binlerce konveyör, yüzlerce birim, oyuncu yokken işleyen dünya. Bu yükü taşıyıp
taşıyamayacağımızı bir tahminle değil, ölçümle söylemek için ayrı bir oyun paketi gerekti.
Oynanış bilinçli olarak küçük tutulur; her kural bir ölçüm sorusuna hizmet eder. Bulgular ve
karar [backend araştırmasındadır](../../docs/backend-research.md).

## Simülasyon

- Durum tile başına düz tiplenmiş dizilerdedir (`ForgeState`). Nesne tahsisi ve `Map` yoktur;
  adım başına ayırma yalnız taret atışı kayıtlarındadır.
- Konveyör eşyası sabit noktalıdır (`0..1023`, kare başına 4 yuva, 256 aralık). Kayan nokta
  yalnız birimlerin konumundadır; birim hareketi `Math.sqrt` ve dört işlem kullanır
  (`Math.hypot` ve trigonometri durum değiştiren kodda yoktur). Aynı sayıların farklı motor
  ve işlemci mimarisinde aynı çıkması buna bağlıdır; kural bozulursa `scripts/engines.ts` ve
  cihaz denemesi karmaların ayrıştığını gösterir.
- Adım sırası sabittir: yol alanı, makineler, bantlar, dalga, uzamsal indeks, taretler, birimler.
  Komutlar adımlar arasında uygulanır ve `state.tick` ile damgalanır. RNG `mulberry32`'dir ve
  durumu anlık görüntüye girer.
- Yol alanı çekirdekten genişlik öncelikli taramadır (`FlowSolver`). CORE `FlowField` hücre
  başına nesne ayırdığı için 65 bin hücrede seçilmedi; katı bina değişince en çok 15 adımda
  bir yeniden hesaplanır. `flowDir` bu yüzden anlık görüntüye girer: geçmişe bağlıdır.
- Taret hedefi eşit uzaklıkta düşük yuvayı seçer; hücre içi sıra geri yüklemede değişse de
  sonuç aynıdır. Çekirdek, yarıçapındaki taretleri levha harcayarak besler (lojistik
  sadeleştirmesi); bantla beslemek de çalışır.
- `Ledger` oyuncu başına son komut sırasını tutar. Yeniden gönderilen komut ikinci kez
  uygulanmaz, önbellekteki sonuç döner. Defter anlık görüntüye girer.

## Eşitleme: Colyseus taşıyıcıdır, protokol bizimdir

Colyseus odaları, WebSocket taşımasını, oturum yeniden bağlanmasını ve oda sınırlarını sağlar.
Dünya durumu Colyseus `Schema` ile eşitlenmez: mesajlar sayıyla adlandırılmış ham baytlardır
(`src/net/protocol.ts`, `WIRE_VERSION`). Gerekçe ve karşılaştırma araştırma belgesindedir.

- **Kilit adımlı (`lockstep`, birincil).** İstemci aynı `ForgeSim`'i koşturur. Sunucu iki adımda
  bir paket gönderir (`NET.syncEvery`): o aralıkta uygulanan komutlar ve adım sayısı; her 150
  adımda durum karması. Yük bant sayısına değil komut sayısına bağlıdır. İstemci karmayı kendi
  durumuyla karşılaştırır; ayrışırsa `desynced` olur ve yeniden el sıkışarak yeni anlık görüntü
  ister (`NET.minHelloIntervalMs` aralığıyla; sık istek sayılır ve 64 ihlalde oyuncu düşer).
- **İlgi alanı (`aoi`, seçmeli).** Sunucu her istemciye yalnız baktığı chunk'ların yapı, dinamik
  varlık, bant ve HUD bölümlerini çerçeve olarak yollar. Savaş sisi ve gizli bilgi gerektiren
  PvP için ayrılmış yoldur: kilit adımda her istemci bütün dünyayı bilir. İstemci arayüzü bu
  biçimi desteklemez; bağlanırsa söyler ve odadan ayrılır. Yük ve CPU ölçümü içindir.
- **Adım saati.** Sunucu adımı Colyseus `setFixedTimestep` ile değil `StepClock` ile sürer: 10 ms'lik
  tetiklemelerde geçen süre biriktirilir, birikim adım süresini aşınca adım koşar. `setFixedTimestep` aralığı
  adım süresine (33,33 ms) eşitler; Node `setInterval` bunu 33 ms'ye kırptığı için her yüz tetiklemede bir
  adım atlanır ve adımlar arası p99 iki adıma çıkar. Ortalama hız her iki durumda 30 Hz'dir; fark titreşim ve
  ack gecikmesidir ([ölçüm](../../docs/backend-research.md)). Uzun duraklamadan sonra en çok 5 adım yakalanır.
- **El sıkışma.** İstemci işleyicilerini kurduktan sonra `hello` yollar; sunucu karşılama ve
  (lockstep için) zlib ile sıkıştırılmış anlık görüntü döndürür. Yeniden `hello` yeniden
  eşitleme isteğidir. Anlık görüntü sıkıştırması iş parçacığı havuzundadır, adım döngüsünü
  bekletmez; eşzamanlı katılım sayısı sınırlıdır.
- **Komut.** İstemci komutu oyuncu sırası ile yollar; sunucu doğrular, uygular ve günlüğe yazar,
  kalıcı olduktan sonra `ack` döner (sonuç kodu ve adım). Oyuncu başına saniyede 20 komut,
  bağlantı başına saniyede 120 mesaj sınırı vardır; bozuk mesaj yağdıran oyuncu düşürülür.
- **Sürüm uyumu.** Katılımda istemci `protocol`, `wire` ve `sim` sürümünü yollar; sunucu uyuşmazlığı
  anlık görüntü sıkıştırması harcamadan reddeder (`sim` için tanınan hata kodu, istemci güncelleme ister).
  `SIM_VERSION` kurallar (bant hızı, adım sırası, sabitler) değişince elle artırılır; unutulmasını
  `tests/sim/golden.test.ts` kural parmak iziyle yakalar. Farklı kuralları koşturan bir istemci her karma
  denetiminde ayrışıp sürekli yeni anlık görüntü isteyeceği için eski istemciyi sunucuda tutmak desteklenmez:
  Steam ve Android güncellemeleri aynı anda yayımlanmazsa eski sürüm güncellenene dek bağlanamaz.
- **Oyuncu anahtarı kimlik doğrulaması değildir.** İstemcinin ürettiği rastgele bir dizedir;
  aynı anahtarla yeni bağlantı eskisini yerinden eder. Gerçek kimlik (Steam, hesap) ürün
  kararıdır ve burada yoktur.

## Kalıcılık ve çökme

`server/store.ts` dünya başına bir dizin yönetir: `snapshot-<adım>.bin` ve `journal-<adım>.log`.

- `snapshot.ts` kalıcı durumun kanonik ikili biçimidir ve sonunda FNV-1a sağlaması taşır.
  Okuyucu önce bütün alanları ayrıştırır, sonra uygular: bozuk dosya canlı durumu kirletmez.
  Türetilmiş listeler ve chunk sürümleri kaydedilmez, geri yüklemede kurulur. Son iki anlık
  görüntü tutulur; bozuk olan atlanıp öncekine düşülür.
- Günlük (`journal.ts`) anlık görüntüden sonra kabul edilen her komutu ve her 30 adımda bir
  durum karmasını taşır. Çerçeve `[uzunluk][crc32][yük]`'tür; kesik ya da bozuk kuyruk ilk
  kötü çerçevede durur. Komutlar grup halinde yazılır ve **ack, kayıt kalıcı olduktan sonra**
  gider.
- Geri yüklemede günlük yeniden oynatılır ve karma kayıtlarıyla doğrulanır; sapma sayılır
  (`hashMismatches`). Dünya başına tek yazıcı kilidi vardır; ikinci süreç `WorldLockedError`
  alır. Her açılış yeni bir `epoch` üretir. Günlük yazımı hata verirse dünya salt okunur olur
  (`fault`) ve komutlar kabul edilmez; sessizce kayıpla devam etmez.
- Oyuncu yokken dünya adım atmaya devam eder; anlık görüntü aralığı oyuncudan bağımsızdır.

## İstemci

Phaser 4 yalnız çizer; kural ve durum `ForgeSim` ile `ForgeController`dadır (Phaser'a ve DOM'a
dokunmaz). `ForgeScene` CORE `WorldCameraController` ile kamerayı, `TapDetector` ile dokunmayı
(kısa dokunuş eylem, mouse sağ tık ya da dokunmatik uzun basış silme) yönetir. `WorldView` dünyayı
16×16 tile'lık chunk dokularına çizer; doku yalnız chunk sürümü değişince yenilenir
(kare başına en çok 8), bellekte en çok 96 doku tutulur, bant eşyaları ve birimler uzak
yakınlaştırmada çizilmez. `Pacer` simülasyonu çizim karesinden bağımsız ilerletir ve sunucudan
geride kalmayı hedef tampona çeker. Arayüz CORE `Input`, `Button`, `BuildMenu` ve `ToastManager`
bileşenleridir; metinler i18n anahtarıdır.

Kare aralığı, adım süresi ve karma denetimi sayısı HUD'da ve `data-*` özniteliklerinde yayımlanır
(`App.refresh`); e2e ve cihaz denemeleri bunları okur.

`src/net/installWebSocketShim.ts` Colyseus SDK'nın Node imzasındaki `new WebSocket(url, { headers,
protocols })` çağrısını tarayıcı imzasına çevirir. SDK `WebSocket`i modül yüklenirken önbelleğe
aldığı için `main.ts` bu modülü ilk import eder; WebKit aksi halde "Wrong protocol" hatası verir.

## Bilinen sınırlar

- Kilit adımda her istemci bütün durumu bilir: savaş sisi ve gizli bilgi yoktur (AOI yolu bunun için).
- Tek dünya tek JS olay döngüsüdür; dünyalar birden çok süreçte dağıtılır, süreçler arası
  eşleştirme ve keşif henüz yoktur.
- Oyuncu kimliği ve yetkilendirme yoktur (yukarıya bakın); WSS ve belirteç ürün kararıdır.
- Paketli uygulama (Tauri WebView) ağ ve performans açısından ölçülmedi; cihaz sayıları tarayıcı motorundandır.
- `ForgeSession`, kilit adımlı istemci ve protokol bu pakettedir; ikinci bir oyun aynısını isterse
  `@volstudio/network`a taşınır ([TODO](TODO.md)).

## Ölçüm araçları

`scripts/capacity.ts` adım süresini aşama aşama ve tek iş parçacığında çok dünya olarak ölçer.
`scripts/soak.ts` hızlandırılmış zamanda saatlerce işletip GC sonrası yığın eğimini yazar.
`scripts/loadtest.ts` ayrı süreçlerde gerçek sunucu ve WebSocket botlarıyla uçtan uca yükü ölçer;
`--sample` ile kararlılık pencereleri alır. `scripts/bandwidth.ts` istemci başına çoğaltma baytını,
`scripts/schema-control.ts` Colyseus Schema karşılığını, `scripts/engines.ts` ve
`scripts/device-bench.ts` motorlar ve cihazlar arası determinizmi ve adım süresini verir.
`scripts/scaling.ts` kapıdaki algoritmik ölçekleme oranını verir. Sayılar ve çıkarımlar
`docs/backend-research.md` içindedir.
