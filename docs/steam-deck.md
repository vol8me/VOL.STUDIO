# Steam Deck

Steam Deck dağıtımı native Linux AppDir üzerinden yapılır. Devkit sondası
ortamı ölçer; ürün kabulü gönderilen oyunun gerçek paketiyle yapılır. Devkit
başarısı gerçek App ID, yayımlanmış Steam Input düzeni veya Valve incelemesi
yerine geçmez. Açık işler [TODO.md](../TODO.md), yeni ürün kabulü
[yeni oyun rehberi](new-game.md) içindedir.

## Ürün hedefleri

| Alan          | Depo sözleşmesi                                                |
| ------------- | -------------------------------------------------------------- |
| Kontrolcü     | İlk kareden çıkışa kadar yalnız kolla bütün içeriğe erişim     |
| Glif          | Gerçek aygıt ve etkin girdiyle değişen glif ailesi             |
| Metin         | Türkçe destekli gamepad klavyesi; varsa Steamworks sağlayıcısı |
| Görüntü       | 1280×800 birincil, 16:9 ve TV çözünürlüklerine uyum            |
| Okunabilirlik | 1280×800 üzerinde en az 12 px görünen metin                    |
| Zamanlama     | 60 FPS hedefi, kare süresi p95 ≤ 18 ms                         |
| Yaşam döngüsü | Uyku ve çıkış öncesi güvenli kayıt, uyanınca ses toparlama     |
| Çevrimdışı    | Tek oyunculu içeriğin internet olmadan çalışması               |
| Kalıcılık     | İlerleme `synced`, cihaz tercihleri `device` kapsamında        |

Bu eşikler ürün hedefidir; ölçülmemiş ürün ya da donanım geçmiş sayılmaz.
OLED Deck ve diğer Valve donanımları LCD referansından otomatik kabul almaz.

## Paketleme

Repo kökünden `pnpm build:linux-steamrt4` steamrt4 SDK kabında üretim yapar.
Hedef çalışma zamanı Steam Linux Runtime 4.0'dır; steamrt4 ile derleme
tek başına oyunun pressure-vessel içinde açıldığını kanıtlamaz. Pressure-vessel içinde FUSE
olmaması nedeniyle cihazda açılmış AppDir kullanılır; giriş `AppRun`dur.

WebKitGTK, GTK, GLib, ICU, libmanette ve gerekli ses codec/çıkış eklentileri
pakete girer. Grafik sürücü kütüphaneleri host'tan alınır. ELF bağımlılık
kapısı çıktıdaki GLIBC gereksiniminin hedef tabanı aşmadığını doğrular.
Host'ta üretilmiş daha yeni glibc bağımlı paket aynı hedefte kabul edilmez.
Paketleme ayrıntıları [Linux rehberindedir](linux.md).

Tauri kimliği veri yolunu belirler. Her ürün kendi kimliğini taşır; kimlik
geçişi kayıt yolunu da değiştirir ve yedekli veri geçişi gerektirir. Steam
Auto-Cloud yalnız ilerleme kapsamını eşitler, cihaz ayarını taşımaz.

## Oturum ve çizim

Kabuk gamescope oturumunu ortam yetenekleriyle tanır; JS'e `getSessionKind`
üzerinden bildirir. Gamescope ve Big Picture başlangıçta kol kipini seçer.
Gamescope pencereyi tam ekrana zorlar; etkisiz pencere/çözünürlük ayarları
`displayCapabilitiesForSession` ile gizlenir. Fare ve analog nişan aynı
oturumda birlikte kullanılabilir.

Ölçülmüş LCD gamescope ortamında WebKit DRM vblank yolu yükten bağımsız
50 Hz tempo verebilir. Kabuk bu oturumda `WEBKIT_FORCE_VBLANK_TIMER=1`
kullanır ve DMA-BUF çizimini açık bırakır; dışarıdan verilmiş değişkeni
üzerine yazmaz. Diğer ortamlara ölçülmeden aynı kural genişletilmez.

Referans sonda koşulu Phaser WebGL, 1280×800 ve 4000 hareketli sprite'tır:
varsayılan yol yaklaşık 50 FPS; timer yolu Steam Linux Runtime 4.0'da
59,9 FPS ve p50/p95/p99 17/18/19 ms üretmiştir. Bu sayı ürün ölçümü değildir.
Timer'ın serbest temposu panel sunumuyla birebir eşit kabul edilmez;
gamescope sunum istatistikleri ve daha uzun pencereyle doğrulanır. OLED
90 Hz davranışı ölçülmemiştir.

## VOL.TEST cihaz referansı

LCD Deck, gamescope, 1280×800; steamrt4 AppDir ve glibc bağımlılık kapısı
geçti. Native devkit kısayolunda ölçülen çalışma ortamı **host**tur;
Steam Linux Runtime 4.0 ürün kabulü açık kalır. `WEBKIT_FORCE_VBLANK_TIMER=1`
ve DMA-BUF açık, tohum 731. Her koşul 25 saniyelik ölçüm isteğiyle başlatıldı;
başlatma/sonlandırma aralıkları kayıtta korunur. Tabloda ilk 10 saniyelik
pencere sonrası tam pencereler verilir; açılış karesi gizlice ayıklanmaz.

| Senaryo / hava       | Kademe |       FPS | p95 (ms) | Güncelleme CPU ort. (ms) |
| -------------------- | ------ | --------: | -------: | -----------------------: |
| Boş / açık           | Düşük  | 59,7–60,0 |    18–19 |                  0,8–0,9 |
| Slalom / açık        | Düşük  | 59,2–59,6 |    18–20 |                  1,1–1,2 |
| Hedefler / açık      | Düşük  | 59,4–59,5 |    18–19 |                      1,1 |
| Fizik alanı / açık   | Düşük  |      59,6 |       19 |                      2,0 |
| Çoklu tank / açık    | Düşük  | 59,3–59,7 |       20 |                  1,7–1,8 |
| Fizik alanı / yağmur | Yüksek | 59,1–59,5 |    20–21 |                  2,7–2,8 |
| Fizik alanı / kar    | Yüksek | 59,6–59,7 |       19 |                  2,6–2,7 |
| Fizik alanı / toz    | Yüksek |      59,5 |       20 |                      2,6 |

İlk pencereler 57,1–59,2 FPS ve p95 19–20 ms verdi. Eski fizik alanı
referansı ısınmış pencerede 59,4–59,6 FPS / p95 19–20 ms idi. Android'deki
büyük çizim kazancı Deck'e aynı büyüklükte FPS artışı olarak genellenmez.
Güncelleme CPU süresi GPU veya panel sunum süresi değildir. Ortalama FPS
hedefe yakın olsa da **p95 ≤18 ms kabulü bütün koşullarda karşılanmadı**.
Sunum temposu, host/SLR4 farkı ve uzun süreli ısınma ayrıca ölçülmelidir.

Devkit ölçümü ekran görüntüsü ve SIGTERM kayıtlarını da topladı. Gerçek uyku,
Steamworks istemci bağlantısı, motor hissi, hot-plug ve Steam/QAM odağı bu
kare ölçümünün kabulü değildir.

## Girdi ve glif

Steam Input API'siz oyun fiziksel kolu sanal Xbox aygıtı üzerinden görür;
trackpad fare girdisi üretebilir. WebView dokunmatik paneli `maxTouchPoints`
ile tam bildirmeyebilir; cihaz adından dokunma zorunluluğu türetilmez.
Arka tuş, gyro ve trackpad'in ham durumu ayrı Steam Input yeteneğidir.

CORE `GamepadController` standart eşlemeyi, ölü bölgeyi ve analog eylemleri;
`InputModeArbiter` anlamlı son girdiyi; `FocusNavController` uzamsal odağı
sağlar. Eylem bağları oyunun config verisidir. Android geri, Escape ve
B aynı `triggerBack` yığınına gider; tek basış iki kez tüketilmez.

Glif çözüm sırası Steamworks girdi türü, native sanal kol bilgisi, gamepad
kimliği, Deck ortam işareti ve Xbox yedeğidir. Sanal kol yuvası ile Gamepad
sırasının çoklu kol eşlemesi ölçülmediği için native kestirim yalnız tek
kolda kullanılır. Hot-plug ve kip değişimi glifi yeniler. Valve omuzları
L1/R1 olarak adlandırılır.

Partner glif çizimleri repoya girmez. Çalışma zamanında Steam istemcisinin
sağladığı glif yolu ya da depodaki açık lisanslı girdi glifleri kullanılır;
marka logosu çizilmez.

## Metin ve titreşim

Gamepad kipinde `Input` ve `TextArea` platform metin sağlayıcısına başvurur.
Steamworks kullanılabilir ise ekran klavyesi açılır; yoksa Türkçe Q düzenli
`OnScreenKeyboard` çalışır. `maxLength`, parola maskesi, ortak geri yığını,
iptalde başlangıç değerine dönüş ve commit sonrası alan odağı korunur.

Titreşim yeteneği tarayıcı ve native sürücülerle ayrı bildirilir. WebKit'in
Gamepad actuator sağlamadığı ortamda kabuk Steamworks Steam Input,
uyumlu hidraw veya çalışır evdev FF yolunu seçebilir. Sanal kolun FF
beyan etmesi yükleme komutunun kabul edildiğini kanıtlamaz. Motorun
hissedilmesi insan kontrolüdür; yalnız komut sonucu üzerinden onaylanmaz.

## Kayıt, uyku ve çıkış

Native depolama geçici dosya, fsync, yedek ve atomik rename ile çalışır.
Güncel dosya yazma sırasında kaybolmaz; disk işi ana iş parçacığının dışında
ve ad başına sıralıdır. Eksik/bozuk güncel kayıtta yedek ya da tam geçici
dosya kurtarılır. Kurtarma olmazsa bozuk veri karantinaya alınır; bütünlük
durumu `createScopedStores` tüketicisine bildirilir.

SIGTERM, SIGINT ve SIGHUP kapanış olayıyla JS boşaltmasını bekler. Normal
pencere kapanışı aynı `registerShutdownFlush` yolunu kullanır ve uygulama
çıkışıyla tamamlanır. SIGKILL altında güvence atomik yazımdır.

Logind uyku geciktirme kilidiyle `registerSuspendFlush` kancalarını bekler;
uyanış `onSystemResume` üzerinden bildirilir. Bekleme sınırlıdır ve ses
bağlamı uyanışta toparlanır. Uyku sırasında ağ kaybolabilir; simülasyon adımı
ve duvar saati aynı kabul edilmez. Gerçek uyku/uyanış ve motor hissi
cihaz başında ayrıca doğrulanır.

## Steamworks

`tauri-v2/plugins/vol-steamworks` oyun başına opt-in eklentidir. Cargo
`steamworks` feature'ı kapalıysa native komutlar desteklenmeyen durumu
bildirir; uygulama kol, glif ve yerel klavyeyle çalışmaya devam eder.
JS yüzeyi oyunun tükettiği durum, aksiyon seti, glif bağlamı, metin girişi
ve overlay işlemleridir.

Action Manifest ilk Steam Input frame'inden önce kaydedilir ve ürünün
resource paketine girer. Digital action origins gerçek App ID ve aktif
bağlama düzeniyle doğrulanır; devkit test kimliğinde boş origin ürüne
onay vermez. Overlay olayı taşınır, duraklatma kararı oyunundur. Native
Steam API kütüphanesi build çıktısından paketlenir; binary repoya girmez.

## Devkit

`pnpm deck` otomasyonu `discover`, `deploy`, `run`, `stop`, `log`, `shot`,
`power`, `measure`, `mode`, `clean` ve `full` komutlarını sunar. Cihaz
mDNS/devkit keşfinden seçilir; adres sabit koda yazılmaz. Başlatıcı yüklenen
oyun dizininin içinde olur, native çalışma seçilir ve ortam gerekli ise
başlatıcı üzerinden verilir. Cihaz kayıtları devtools/deck/records/
altında git dışıdır.

VOL.TEST ölçüm oturumu `VOL_DECK_MEASURE=1` ile açılır. Geçici seçimler
`VOL_DECK_SCENARIO` (0/10/20/30/40), `VOL_DECK_SEED` (uint32),
`VOL_DECK_WEATHER` (clear/dust/rain/snow), `VOL_DECK_SEASON`
(spring/summer/autumn/winter) ve `VOL_DECK_QUALITY` (low/high) değişkenleridir.
Oyun ve rapor aynı izin listesini kullanır. Bu seçimler cihaz tercihini
değiştirmez; ölçüm modu dışında uygulanmaz.

Teşhis yalnız izin listeli ortam bilgisini toplar; Steam ortamının tamamı
kaydedilmez. Kullanıcı kimliği, adres ve oturum belirteci belgeye, loga veya
commit'e girmez. Dağıtımın bıraktığı geçici dosya ve kısayol raporlanır.

Ürün kabulünde hot-plug, çoklu kol, arka tuşlar, trackpad/dokunma olayları,
Steam ve Quick Access odağı, uyku/uyanış, ses, kayıt, çıkış, titreşim hissi
ve güç tüketimi gerçek cihazda ölçülür. Yapılmayan adım bekleyen olarak
kalır; cihaz ölçümü otomatik kalite kapısı değildir.
