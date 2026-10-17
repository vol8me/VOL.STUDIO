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

**Güncel VOL.TEST paket kanıtı (2026-10-17):** temiz `922a83dd` kaynağındaki
aynı `chrome105` frontend'den steamrt4 SDK `4.0.20260805.254769` release
AppImage üretildi. 280 ELF dosyası GLIBC ≤ 2.41 sınırında, yasak GPU sürücü
kütüphanesi sıfır; 14 GStreamer eklentisi ve paketli OGG/Vorbis çözme PASS.
Geçici erişim kaybı sonrası cihazdaki ikili ve AppRun hash'leri eşleşti.
Resmî sabit runtime arşivinin SHA-256'sı doğrulanıp ayrı devkit alanına kuruldu;
gerçek oyun süreci `steamrt`/`4`/`4.0.20260805.254769` kökünde ve pressure-vessel
içinde çalıştı. Yeni pakette işletim sistemi sanal koluyla menü/garaj/ayarlar,
alıştırma, Start ile pause, iç ayardan tek B ile geri, ikinci B ile devam
ve menüye dönüp yeniden giriş PASS. İlk paketin menü/garaj D-pad/A/B FAIL'i
CORE gezinme tüketimiyle kapandı. GameMode pencere kipini sunmaz; F11
no-op/canlılık PASS, gerçek native kip döngüsü NOT-RUN'dır.
İlk `07ae25a9` paketin kısa HTTP/WS ağ turu geçti; yeni paketin son ağ turu
başlarken erişim yeniden kayboldu ve bu kabul henüz tamamlanmadı.
Fiziksel düğmeler, uyku/uyanma, WSS/WAN ve uzun oturum bu koşuda NOT-RUN;
[monorepo denetimi](monorepo-audit.md) kapsamı ayırır.

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
- Sanal klavye: `devtools/deck/scripts/virtual-keys.py` (`KEYS_WARMUP=2 python3 virtual-keys.py SHIFT+B`)
  `/dev/uinput` ile sanal klavye yaratır; tuşlar A–Z, 0–9, ENTER, ESC, TAB, SPACE, ok tuşları, HOME, END, PAGEUP,
  PAGEDOWN; `SHIFT+B` birlikte basılır. gamescope odağındaki pencereye normal klavye olayı olarak ulaşır ve URL
  yazmadan vitrinin kare ölçerini (`Shift+B`) başlatır, ölçüm sonuç penceresinde HOME/PAGEDOWN ile sayfalar gezilir.
  Sanal kol gibi işletim sistemi düzeyindedir, fiziksel klavye ya da Steam ekran klavyesi değildir.
- gamescope kuralı (DMA-BUF açık) altında **2D canvas boş kalır** (vitrinde Curve Editor): HOST derlemesinde
  (2026-10-08) ve **SLR4 derlemesinde de** (2026-10-10, aynı sayfa, aynı cihaz) ölçüldü; `WEBKIT_DISABLE_DMABUF_RENDERER=1`
  ile aynı sayfa çizer. Uygulanan çözüm: küçük arayüz tuvalleri
  `getContext('2d', { willReadFrequently: true })` ile **CPU tuvali** ister (`CurveEditor`, `MinimapPanel`,
  vitrinin dokunma sekmesi). **Doğrulama (SLR4, 2026-10-10, gamescope, LCD Deck, ekran görüntüsü):** Curve Editor
  (ızgara, eğri, noktalar) ve HUD sekmesindeki Minimap (ızgara, bloklar, işaretler) çiziliyor; yama öncesi aynı
  derlemede Curve Editor boştu. Doğrulanmayanlar: dokunma sekmesinin dünya kamerası tuvali ve **HOST derlemesinde yamalı
  koşu**; host/SLR4 aynı örnekle A/B değildir. Phaser/WebGL oyun tuvali bu ölçümün **dışındadır**: canvas kullanan oyun, kabuğun gamescope
  kuralını kendi tuvaliyle yeniden sınamadan teslim edilmez (UI-12 / F08).
- **.desktop şablonu tuzağı:** `devtools/vol-showcase/src-tauri/linux.desktop.hbs` anahtar=değer satır biçimidir. Biçimleyici (Prettier'ın
  Handlebars ayrıştırıcısı) satırları tek satıra birleştirince AppImage paketlemesi bozulur ve Deck'te pencere boş
  açılır. Şablon `.prettierignore`dadır ve `scripts/quality/tests/desktopTemplate.test.mjs` çok satırlılığı korur.
- **Ölçüm tuzağı:** önceki koşudan kalan **ikinci bir `VOL.UI` süreci** kare hızını yarıya indirir ve ölçümü geçersiz
  kılar. Ölçümden önce tüm `VOL.UI` süreçleri kapatılır (`pgrep -ax VOL.UI` boş dönmeli); aksi halde sayı atılır.

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

### Güncel commit, 10 dakikalık uzun oturum

`093e4c8d` commit'inden WSL Ubuntu 24.04'te üretilen **host** AppImage (SLR4 değil), gamescope, LCD Deck,
çoklu tank, kar, yüksek kalite, tohum 731; işletim sistemi düzeyinde sanal Xbox kolu (`devtools/deck/scripts/virtual-pad.py`)
ateş tetiğini sürekli basılı tutup sol çubuğu dört yönde döndürdü. 60 pencerede (toplam 600 sn): FPS medyan 60,0
(en düşük 58,9), p95 19 ms (pencere aralığı 19–20), p99 medyan 21 ms (en çok 25); 34 ms'yi aşan kare toplam 5,
20 ms'yi aşan 662 (≈%1,8). Paket gücü 7,2 → 6,1 W, GPU sıcaklığı 56 → 61 °C, pil bağlı değildi. **p95 ≤18 ms hedefi
1 ms farkla karşılanmadı** (kare aralığı 16,7/20 ms basamaklarında kümelenir; vsync zamanlayıcısı ve host/SLR4 farkı
bu ölçüm SLR4 kabulü değildir). GPU/panel süreleri `null`. Bu, fiziksel kol, gerçek uyku ve Steam
istemci kabulü değildir.

### 15 Ekim yapısı, 120 saniyelik ölçüm

`e6395317` ağacından WSL Ubuntu 24.04'te üretilen **host** AppImage (SLR4 değil; yeni çevrimiçi HUD, çekirdek nabzı ve
duyargalar, hasar sayıları, göller ve batış sesi dahil), aynı Deck, gamescope, 1280×800, çoklu tank, kar, yüksek
kalite, ölçüm kipi, girdi verilmedi. 12 pencerede (10 sn) FPS 52,7 → 59,9: ilk iki pencere ısınmadır (52,7 ve 56,8
FPS, p95 29 ve 23 ms), sonraki on pencerede 58,1–59,9 FPS ve p95 19–21 ms; 34 ms'yi aşan kare toplam 30. **≥59 FPS ve
p95 ≤18 ms ürün hedefi karşılanmadı**: ısınma dışında bile p95 19–21 ms'dedir ve karelerin 16,7/20 ms basamaklarında
kümelenmesi önceki ölçümle aynıdır. Ekran görüntüsü yeni HUD'u (can/enerji çubukları, harita ve göller) ve 60 FPS
göstergesini gösterir. Bu fiziksel kol, gerçek uyku ve Steam istemci kabulü değildir; SLR4 derlemesi ve insan
beğenisi yapılmadı.

### Ölçüm çağrısı

deck mode taban kimliğe, deploy ayrı release kısayoluna yazar.
Ayrı çağrıldığında ölçüm ortamı çalışan kısayola ulaşmayabilir. deck full
build/deploy/mode/measure akışını aynı release üzerinde yürütür.
Devkit çıktısı kendi sonda kabulüdür; ürün için gerçek paket ve build
kimliğiyle host ve SLR4 ayrı ölçülür. Açık kabul [kök TODO](../TODO.md)'dadır.

## Vitrin kare ölçümü: Deck'te neden 60 FPS sabit değildi

Vitrinde (`Shift+B` ya da `?bench`; `devtools/vol-showcase/src/frameBench.ts`) her sekme sabit hızla ileri-geri
kaydırılır ve **sunulan** kareler (rAF aralığı) ölçülür; aynı yöntem Deck'te (WebKitGTK), Android'de (Chrome) ve
masaüstünde koşar. Durağan bir sayfa kare üretmez (gamescope `fps` değeri boşta 0,3'e düşer), bu yüzden bu sayı
oyun FPS'i değil "sayfa kaydırılırken kaç kare sunuluyor"dur. Yavaş sekmelerde ölçer kendiliğinden kart kart gizleyip
ve CSS özelliklerini tek tek kapatıp yeniden ölçer (maliyetin kaynağı).

**Ölçüm (2026-10-08, LCD Deck, host AppImage, 1280×800, gamescope sınırı 60 Hz / 60 FPS):** 14 sekmenin 12'si 60 FPS
verdi; **Forms 42,9 FPS** (kare başına p50 23 ms, kareler %93 oranında 20 ms üstü) ve **Touch 46,5 FPS** (%72). Aynı
sayfalar Samsung S21 FE ve Lenovo tablette (Chrome) 60 FPS kilitli. Ölçüm sırasında web süreci ≈ %150 CPU, GPU
meşguliyeti %0 ve GPU saati en alt kademede: sayfa **CPU'da boyanıyordu** (gamescope yenileme ve FPS sınırı değil,
bunlar 60'tı). Aynı sayfanın FPS'i koşudan koşuya 43–54 arasında salındı (CPU governor `powersave`, 2,4 GHz); gözle
görülen "30–40" bu salınım ile ağır sekmenin birleşimidir.

Kaynak ayrıştırması (aynı cihazda): tek kart gizlenince FPS 55–61'e çıktı (Timer Bar +18, Radio Group +13, Checkbox +13,
Select +12, Color Picker +12): maliyet tek karta değil **birçok yüzeye yayılmış boyama**. CSS özelliği kapatma:
`box-shadow` +4,5…+6, `border-radius` +2,5…+4,7, karışım/gradyan ≈ 0. Katman terfisi: **her kart `will-change: transform`**
Forms'u 54 → 60,1, Touch'ı 55 → 60,0 yaptı; sayfa ya da kaydırıcı ölçeğinde terfi tersine etki etti (−6…−14 FPS, dev
dokular). Karar: `.vol-showcase-card` kendi bileşik katmanı (tasarım değişmez); kural yalnız WebKitGTK'de açılır (`data-vol-engine='webkitgtk'`, `devtools/vol-showcase/src/engine.ts`), çünkü Chromium bileşik katmanda LCD metin yumuşatmasını kaybedip görünümü değiştirir. Sonuç: 14 sekmenin tamamı **57–60,6 FPS,
ortanca 60,2**; Forms 60,0, Touch 59,4. Motor-kapsamlı kuralla yeniden dağıtım ve ölçüm sonucu aynı: 14 sekme 57,3–60,6 FPS, ortanca 60,2; Forms 60,0, Touch 59,1. Kalan: HUD sekmesinde tek 129–130 ms kare (en kötü kare, %2 yavaş; neden ölçülmedi),
Text sekmesinin 53–59 ms'lik tek kareleri.

**SLR4 ölçümü (2026-10-10, LCD Deck, `pnpm build:linux-steamrt4` AppDir'i, 1280×800, DPR 1, tek `VOL.UI` süreci,
gamescope; kullanıcı aracı `AppleWebKit/605.1.15 Version/60.5 Safari`, X11):** 15 sekmenin tamamı **57,8–60,6 FPS,
ortanca 59,5**. En düşük TEXT 57,8 (kareler %6 oranında 20 ms üstü); en kötü tek kare FORMS 71 ms; p95 19–21 ms.
THEME sekmesi (yeni, iki canvas ve çok kutu) 60,0 FPS. Aynı derlemenin yama öncesi ilk temiz koşusu: ortanca 59,5, en
düşük 58,1. Gamescope açılış görüntüsünde tam ekran düğmesi yoktur ve dil düğmesi boşluğu doldurur. Bu sayı "kaydırılırken sunulan kare"dir, oyun FPS'i değildir.

**13 px etiket ve açık-katman düzeltmesi sonrası (2026-10-10, aynı cihaz, SLR4 derlemesi #4):** 15 sekme ortanca **59,8 FPS**,
en düşük FORMS 58,4, p95 18–21 ms; kart başlığı etiketinin büyük harf yüksekliği **9 ekran px (1,06 mm)**, önceki 8 px'in yerine
(Valve alt sınırı ≥ 9). Aynı turda bulunan kusur: Tema sekmesinde `Select` listesi açıkken LB/RB sekmeyi değiştirip listeyi
sayfa köşesinde sahipsiz bırakıyordu; vitrin açık katmanda omuz düğmelerini yutar ve `Popup` tetikleyicisi kalkınca kapanır.
Doğrulama: Formlar sekmesi listesi fareyle açık, LB sekmeyi değiştirmedi, B kapattı, RB yine sekme değiştirdi. **Cihaz tuzağı:** her
`devtools/deck/scripts/virtual-pad.py` çağrısı yeni bir sanal kol açar; D-pad basışlarının bir kısmı etki göstermeyebilir, bu yüzden
adım adım yürüyüşte ekran görüntüsüyle sonucu doğrulayın (düğme basışları LB/RB/A/B güvenilir çıktı). Gamescope'ta fare tıklaması
için `DISPLAY=:1 xdotool` çalışır.

Sınırlar: host derlemesi (Ubuntu WebKitGTK 2.4x, Cairo CPU boyama) ve SLR4 sayıları birbirinden ayrı ölçülmüştür;
birbirinin yerine geçmez; bu kayıt **host/SLR4 aynı örnekle A/B** kanıtı değildir. SLR4 koşusu **ısınmamış** tek pencere
ölçümüdür (10 dk termal ve MangoHud/gamescope sunum istatistiği NOT-RUN). CPU governor/termal etkisi ve oyun
(Phaser/WebGL) FPS'i ayrıdır (VOL.TEST 60 medyan, p95 19 ms; yukarıdaki bölüm). Oyun arayüzüne taşınırken aynı ilke
geçerlidir: bağımsız HUD plakalarını (kart boyunda) katmana terfi ettir, devasa tek katman kurma.

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
