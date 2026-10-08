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

Native paketleme Linux builder/steamrt4 SDK işidir. Windows kontrol hostu
JS CLI ve remote devkit akışını yürütür; bu native ABI kabulünü sağlamaz.
Host hazırlığı [Windows](windows.md) belgesindedir.

Repo kökünden `pnpm build:linux-steamrt4` steamrt4 SDK kabında üretim yapar.
Hedef çalışma zamanı Steam Linux Runtime 4.0'dır; steamrt4 ile derleme
tek başına oyunun pressure-vessel içinde açıldığını kanıtlamaz. Pressure-vessel içinde FUSE
olmaması nedeniyle cihazda açılmış AppDir kullanılır; giriş `AppRun`dur.

WebKitGTK, GTK, GLib, ICU, libmanette ve gerekli ses codec/çıkış eklentileri
pakete girer. Grafik sürücü kütüphaneleri host'tan alınır. ELF bağımlılık
kapısı çıktıdaki GLIBC gereksiniminin hedef tabanı aşmadığını doğrular.
Host'ta üretilmiş daha yeni glibc bağımlı paket aynı hedefte kabul edilmez.
Paketleme ayrıntıları [Linux rehberindedir](linux.md).

### Host derlemesiyle vitrin (SLR4 kabı yokken)

UI vitrini (`devtools/vol-showcase`) steamrt4 kabı olmadan Deck'te açılabilir;
bu **HOST derlemesidir**, SLR4 kabulü değildir ve ürün kanıtı sayılmaz.
WSL Ubuntu 24.04 (veya başka Linux) içinde `tauri build --bundles appimage`
ardından `node scripts/linux/build-appimage.mjs devtools/vol-showcase`
çalıştırılır; `pnpm deck deploy devtools/vol-showcase --appdir <AppDir>` açık
AppDir'i yükler, `pnpm deck run … --release <kayıt>` Steam kısayolundan
başlatır. Ortam değişkeni `pnpm deck mode … A=B` ile bir sonraki koşuya yazılır
(elle `ssh … ./AppRun` Game Mode'da odak almaz, ekran görüntüsünde Steam
arayüzü kalır).

Ölçülmüş tuzaklar (2026-10-08, Deck LCD, Mesa host):

- Paketleyici wayland ve xcb-render/shm kütüphanelerini **pakete koymaz**
  (`HOST_GRAPHICS_LIBS`, `scripts/linux/build-appimage.mjs`). Ubuntu'dan
  kopyalanan bu kütüphaneler host Mesa'sıyla karışınca `WebKitWebProcess`
  `Could not create default EGL display: EGL_BAD_PARAMETER` ile düşer ve pencere
  boş kalır; `WEBKIT_DISABLE_DMABUF_RENDERER` bunu çözmez.
- Kol yolu cihazda denenebilir: `devtools/deck/scripts/virtual-pad.py` (Deck'e `scp` ile kopyalanır,
  `PAD_WARMUP=8 python3 virtual-pad.py DOWN A:1.0 RB`) `/dev/uinput` ile sanal Xbox 360 kolu
  yaratır; Steam Input onu tanır ve kendi sanal kollarını açar (kol görünmeden önce **en az 8 sn**
  beklenir, kısa beklemede girdi sayfaya ulaşmaz). Bu işletim sistemi düzeyinde sanal koldur,
  **fiziksel Deck düğmeleri değildir**; Steam Input → WebKitGTK Gamepad API → gezinme zincirini sınar.
- gamescope kuralı (DMA-BUF açık) altında HOST derlemesinde **2D canvas boş
  kalır** (vitrinde Curve Editor); `WEBKIT_DISABLE_DMABUF_RENDERER=1` ile aynı
  sayfa çizer. Bunun SLR4 derlemesinde de olup olmadığı **ölçülmedi**; canvas
  2D/WebGL kullanan oyun, kabuğun gamescope kuralını bu ölçümle yeniden
  sınamadan teslim edilmez (UI-12 / F08).

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

## Ölçülmüş VOL.TEST referansı

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

Bu tablo önceki LCD host ölçümünün anonim referansıdır; runId ile
eşlenemez. Güncelleme CPU'su GPU/panel süresi değildir. p95 ≤18 ms
hedefi bütün koşullarda karşılanmadı; host/SLR4, termal yük ve sunum
temposu ayrıca doğrulanır. Ölçüm bu tur yeniden yapılmadı.

RunId zincirli ayrı boş/yüksek açılış referansı sekiz pencerede
57,8–59,5 FPS / p95 18–20 ms; lostReports 0 verdi. GPU/panel süreleri
WebKit yeteneği olmadığından null idi. Güç 4,08→3,23 W, GPU sıcaklığı
49→54 °C ölçüldü. SIGTERM sonrası kayıt yazıldı; vol:terminate timedOut
kök F04/F08'de açık kalır. Bu sonuç gerçek uyku, Steam istemci bağlantısı,
hotplug, QAM odağı veya titreşim hissi kabulü değildir.

### Ölçüm çağrısı

deck mode taban kimliğe, deploy ayrı release kısayoluna yazar.
Ayrı çağrıldığında ölçüm ortamı çalışan kısayola ulaşmayabilir. deck full
build/deploy/mode/measure akışını aynı release üzerinde yürütür.
Devkit çıktısı kendi sonda kabulüdür; ürün için gerçek paket ve build
kimliğiyle host ve SLR4 ayrı ölçülür. Açık kabul [kök TODO](../TODO.md)'dadır.

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
