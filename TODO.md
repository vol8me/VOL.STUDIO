# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.

## Açık

- [ ] **[P2] Android 16 geniş ekranda yön kilidini yok saymasın.** Android 16,
      en dar kenarı 600dp ve üstü ekranlarda `screenOrientation`ı yok sayar;
      oyun kategorisi (`android:appCategory="game"`) belirtilirse yön kilidi
      uygulanır. Manifestlerde kategori eklendi ancak gerçek cihazda veya
      emülatörde ölçülmedi: `device-benchmark.mjs` içinde kategori var mı yok
      mu denetimi yok; oyun çalıştırılmadan paket bilgisi okunmuyor; Android
      16 davranışını doğrulayan bir CI/yerel kapı yok; `ORIENTATION_MAP`te
      kategori var ve drift testleri kilitliyor. Kapanır: 600dp ve üstü
      emülatörde ya da tablette, kategori varken yön isteğinin uygulandığı
      ölçülür. Fiziksel tablet (TB350FU, Android 14, sw588) kriteri
      karşılamıyor; `vol-tablet-36` emülatörü (API 36, pixel_tablet, sw800)
      açılıp uygulama başlatılabiliyor ama misafir image'ının DMA mapper'ı
      (`!rcEnc->featureInfo()->hasReadColorBufferDma`) bozuk: SurfaceFlinger,
      `screencap` ve `dumpsys` aynı assert ile çöküyor; görsel ölçüm ve yön
      kanıtı yapılamıyor. Çözüm: farklı Android 16 imajı (`default`/`android-36`)
      denemek, Cuttlefish kurmak (root gerekir) veya Android 16 büyük ekranlı
      fiziksel cihaz bulmak.

### Steam Deck ve Valve donanım ailesi

Ölçümler, kök nedenler ve kararlar: [docs/steam-deck.md](docs/steam-deck.md).
Sıra D0 → D8'dir ve audio-synth kapanışından sonra başlar. Frozen oyun
ağaçları ancak lifecycle yeniden aktifleştirmesiyle değişir (D7).

- [ ] **[P1] D0 — Deck'te insan eliyle açık ölçümler.** Gamepad API eşlemesi
      ve sanal kol yuvası ↔ Gamepad sırası, arka tuşlar, trackpad ve
      dokunmatik olay türleri, Steam ve Quick Access düğmesinin odak
      olayları, uyku-uyanma (rAF, AudioContext, saat), Steam "Oyundan çık"
      sinyal sırası ve süresi, kap içinden evdev titreşimi, 60 ve 30 FPS'te
      pil gücü. Kapanır: her sonuç tarih ve cihazla `docs/steam-deck.md`nin
      ölçülmüş bölümlerine taşınır; "Açık ölçümler"de yalnız eldeki cihazla
      ölçülemeyenler kalır.
- [ ] **[P1] D1 — Linux derlemesi steamrt4 SDK kabında.** Rust ikilisi ve
      paketleme sürümü sabitlenmiş steamrt4 SDK imajında (podman), ön yüz
      host'ta derlenir; çıktı FUSE'süz çalışan AppDir'dir. Grafik sürücü
      kütüphaneleri pakete girmez; GStreamer medya zinciri kap çıktısında
      gerçek bir OGG ile sınanır; `linux.AppRun` ürün adını yapılandırmadan
      türetir. `build-linux-appimage.mjs`nin host derlemesi bu hatta geçer.
      Kapanır: paketteki hiçbir ELF `GLIBC_2.41` üstü sürüm istemez ve bunu
      bir bekçi testi zorlar; AppDir SteamOS host'unda ve Steam Linux Runtime
      4.0'da açılıp OGG çalar.
- [ ] **[P1] D1 — `deck:*` otomasyonu ve kalıcı ölçüm sondası.** mDNS keşfi
      (sabit IP yok); devkit sözleşmesiyle yükleme ve Steam kaydı (oyun
      kimliği deseni, `argv[0]` kuralı, ortam için başlatıcı betik);
      başlatma; `gamescopectl` ekran görüntüsü; LAN üzerinden Diagnostics ile
      kare süresi, CPU ve pil ölçümü; `steamos-delete` ile temizlik. Adaylar
      lifecycle'dan keşfedilir, frozen reddedilir. Ölçüm sondası (WebGL
      fazları, Gamepad, ses, yaşam döngüsü) repoda devtool olur ve ortamı
      izin listesiyle okur. Kapı değil, referans ölçümdür. Kapanır: tek komut
      derler, yükler, başlatır, ölçer ve ekran görüntüsü alır; ölçüm sürümlü
      kayda yazılır; komut sözleşmeleri testlidir.
- [ ] **[P1] D2 — `tauri-v2` Linux WebView kuralı gamescope'u bilir.**
      Gamescope oturumunda `WEBKIT_FORCE_VBLANK_TIMER=1` verilir ve DMA-BUF
      çizicisi açık kalır; NVIDIA kuralı korunur; dışarıdan verilen değişken
      ezilmez; kabuk gamescope oturumunu JS'e yetenek olarak bildirir.
      Kapanır: kural tablosu birim testlidir; aktif oyun Deck'te 1280×800'de
      ≥ 59 FPS ve p95 ≤ 18 ms ölçülür; NVIDIA masaüstü ölçümü gerilemez;
      `docs/android.md` ve `docs/steam-deck.md` tabloları günceldir.
- [ ] **[P1] D2 — Atomik kayıt ve kapanışta boşaltma.** `tauri-v2` atomik
      yazıcı: geçici dosya → `fsync` → `rename` → dizin `fsync`, önceki nesil
      yedek, bozuk kayıtta yedeğe dönüş ve rapor; `TauriStoreAdapter` onu
      kullanır. SIGTERM/SIGINT/SIGHUP ve logind `PrepareForSleep` gecikme
      kilidi bir boşaltma olayı üretir; `core` bekleyen yazıları süre sınırı
      içinde boşaltıp onaylar. Kapanır: yazmanın ortasında SIGKILL enjekte
      eden test kaydı bozamaz; SIGTERM ve uyku yollarında son değer diske
      ulaşır ve bu Deck'te ölçülür.
- [ ] **[P1] D2 — `core` kalıcılığında `synced` / `device` kapsamı.** İlerleme
      ile cihaz ayarları (grafik, pencere, cihaz sesi) ayrı dosyalarda; Steam
      Cloud yalnız `synced` dizinini eşitler; veri dizini oyuna özgü
      kimlikten türer. Kapanır: kapsamsız anahtar derlenmez; tek dosyalı eski
      kayıttan iki kapsama kayıpsız ve yedekli geçiş testlidir.
- [ ] **[P2] D2 — Uykudan dönüşte zaman güvenliği.** Uyanışta `Date.now()`
      sıçraması ve uzun kare aralığı simülasyonu, bekleme sürelerini ve
      otomatik kaydı bozmaz; oyun uyanınca duraklatılmış döner. Kapanır: saat
      sıçraması birim testlidir; Deck'te uyku-uyanma turu ölçülür.
- [ ] **[P1] D3 — `core` gamepad sağlayıcısı ve girdi kipi politikası.**
      Standart eşleme, ölü bölge, analog hareket ve nişan; eylem → düğme bağı
      veridir. Son anlamlı girdi histerezisle kazanır; fare ve çubuk nişanı
      birikir, biri ötekini kilitlemez; Deck'te ilk kareden kol kipi.
      `InputManager`'ın "dokunmatik önce" kuralı bu politikaya taşınır.
      Kapanır: sağlayıcı ve politika birim testlidir; vol-ui'de canlı
      gösterilir; hiçbir ayar değiştirilmeden kolla oyun başlar.
- [ ] **[P1] D3 — Kolla arayüz gezinmesi.** D-pad ve çubukla uzamsal odak,
      A etkinleştirir; Android geri, Escape ve kolun B'si tek geri yığınını
      paylaşır; Menu duraklatır; L1/R1 sekme değiştirir; odak halkası yalnız
      kol ve klavye kipinde görünür; modal ve sheet odak tuzaklarıyla
      uyumludur. Kapanır: vol-ui vitrinindeki her etkileşimli bileşen sanal
      Gamepad'li E2E'de yalnız kolla kullanılır.
- [ ] **[P1] D4 — Glif sistemi.** `core` `Glyph` bileşeni ve aile
      çözümleyici: Steamworks → `SteamVirtualGamepadInfo` köprüsü →
      `Gamepad.id` → `SteamDeck=1` → Xbox. Aileler: Xbox, PlayStation,
      Nintendo, Valve (Deck ve Steam Controller; L1/R1 adlandırması), klavye,
      fare. Varlıklar CC0 kaynaklıdır ve kaynak kaydı tutulur; logo ve Valve
      partner çizimi depoya girmez. Kapanır: glif etkin girdiyle eşleşir ve
      girdi değişince değişir, kol kipinde klavye/fare glifi görünmez (E2E);
      vol-ui vitrini ve README sekme tablosu günceldir.
- [ ] **[P2] D4 — Linux'ta titreşimin native yolu.** `tauri-v2` haptik
      sürücüsü: Steamworks varsa Steam Input titreşimi, yoksa sanal kola
      evdev force-feedback; WebKit ≥ 2.54 paketlenince tarayıcı yolu
      kendiliğinden öne geçer. Kapanır: `core` haptik desenleri Deck'te
      hissedilir ve ölçülür; titreşim ayarı Deck'te sunulur.
- [ ] **[P1] D5 — Okunabilirlik ve ölçek kapısı.** Playwright WebKit
      projesinde 1280×800 ve 1280×720'de görünen her metin ≥ 12 px;
      1920×1080 ve 3840×2160'ta oturma mesafesine göre UI ölçeği; kapsam
      `core` bileşenleri ve aktif oyunlar. Kapanır: kapı `high`da koşar ve
      ihlali dosya ve seçiciyle bildirir; mevcut ihlaller giderilmiştir.
- [ ] **[P2] D5 — Kolla metin girişi.** `core` metin girişi isteği sözleşmesi;
      Steamworks varsa kayan klavye, yoksa `core`'un yalnız kolla kullanılan,
      Türkçe karakterli ekran klavyesi. Kapanır: `Input` ve `TextArea` kol
      kipinde odaklanınca klavye kendiliğinden açılır; vol-ui vitrinindedir.
- [ ] **[P2] D5 — Gamescope altında görüntü ayarları.** Pencere kipi ve
      çözünürlük seçenekleri gamescope oturumunda sunulmaz; Deck'in
      varsayılan grafik kalitesi `device` kapsamında tutulur. Kapanır: Deck'te
      ayar ekranında etkisiz seçenek yoktur; ilk açılışta hiçbir ayarı
      değiştirmek gerekmez.
- [ ] **[P2] D6 — İsteğe bağlı Steamworks katmanı.** `tauri-v2` eklentisi
      (`steamworks` crate): Steam Input aksiyon seti ve aksiyon manifesti,
      glif yolu, Deck algılama, kayan klavye, overlay açılınca duraklatma,
      uyanma bildirimi, Steam Cloud. Oyun başına açılır; SDK ikilisi depoya
      girmez; geliştirme App ID'si 480'dir. Kapanır: eklentili ve eklentisiz
      iki yapılandırma testlidir; eklentisiz oyun Deck kriterlerini yine
      karşılar; gerçek App ID ile Deck'te Steam Input glifleri ve kayan
      klavye görülür.
- [ ] **[P1] D7 — VOL.HELL Deck referansı: yeniden aktifleştir, kabul et,
      yeniden dondur.** Lifecycle prosedürüyle aktifleşir; oyuna özgü kimlik
      ve kayıt geçişi; kayıt kapsamları; duraklatma Menu'de, nişan sağ
      çubukta, bütün ekranlar kolla gezilir. Kapanır: Steam Linux Runtime
      4.0'da hiçbir ayar değiştirilmeden baştan sona kolla oynanır; 60 FPS
      hedefi ölçüm kaydıyla karşılanır; Verified kriterleri madde madde
      işaretlenir; kullanıcı onayıyla yeni annotated freeze etiketi atılır.
- [ ] **[P2] D8 — Yeni oyun rehberi Deck listesini taşır.**
      `games/docs/new-game.md`: oyuna özgü kimlik, kayıt kapsamları, kol
      eylem bağları, glif, `deck:*` adaylığı, okunabilirlik kapısı. Kapanır:
      rehberdeki her Deck maddesi onu zorlayan kapıya bağlıdır.
- [ ] **[P3] OLED Deck ve Steam Machine'de kare zamanlaması.** 90 Hz panelde
      ve TV çıkışında vblank zamanlayıcısı kuralı ölçülür. Kapanır: cihaz
      bulunduğunda ölçüm `docs/steam-deck.md`ye girer.

## Kapatılanlar

### 2026-09-20 — deneysel paketleri emekliye ayırma ve CORE kazanımları

- [x] **Kanıtlanmamış ürün/araç yüzeyleri framework'e fosilleştirilmeden
      kaldırıldı.** Yapay yaşam deneyi, görsel sentez prototipi ve varlık
      çalışma ortamı workspace, kalite kapıları, Android/cihaz ölçümü, komutlar,
      lockfile ve belgelerden birlikte çıkarıldı. Gönderilen oyunların build
      grafiği bu paketlerden bağımsız kaldı.
- [x] **Kanıtlanmış ortak mekanizmalar CORE'a taşındı.** Durumu alınabilir
      deterministik RNG, seri son-değer-kazanır otomatik kayıt, doğrulama
      politikasını tüketicide bırakan gözlemlenebilir kalıcı state ve i18n
      başlamadan çalışabilen fatal açılış yüzeyi generic sözleşme ve regresyon
      testleriyle eklendi. VOL.HELL'in görüntü, ses ve tuş ayarları ortak
      kalıcılık mekanizmasının gerçek tüketicileri oldu; fatal yüzey vol-ui'de
      sergilendi.
- [x] **Mevcut CORE kazanımları korundu.** `CommandHistory`, `Sheet`,
      `SimulationClock`, haptics platform seam'i ve geliştirilmiş
      `WorldCameraController` gerçek kalan tüketici/sözleşmeleriyle yaşamaya
      devam ediyor; ürün alanına bağlı simülasyon, SDF, alan ve codec kodu
      CORE'a taşınmadı.

### 2026-09-10 — kanıtlı kapsam şekli, taze veri, ürün ikonları

- [x] **Büyük ve kritik dosyalar test kanıtına bağlandı.** `coverageShape`
      gerekçe haritasını kanıtlı hâle getirdi; `BossController`, `GameAudio`,
      `PCController` ve `TouchController` doğrudan birim testleriyle
      kapsandı.
- [x] **1000 satır sınırı CSS dahil tüm kaynak türlerine genişletildi.**
      Büyük stil dosyaları bileşen sınırlarında bölündü; `cssImports`
      bekçisi sahipsiz stil dosyalarını engelledi.
- [x] **Her oyun kendi ürün kimliğini taşır.** Ortak Tauri şablon ikonları
      kaldırıldı, oyunlar kendi SVG kaynaklarından üretilmiş ikon setlerini
      kendi `src-tauri` ağaçlarına aldı; `productIcons` ayrışmayı kilitledi.
- [x] **Rust push kapısına dahil edildi.** `cargoLockParity` tauri/wry/tao
      sürümlerini kilitledi, `just rust` üç yerli crate'in format/clippy/check
      adımlarını birleştirdi.
- [x] **TODO arşivi temizlendi.** Kapanan 16 madde git geçmişine devredildi,
      dosya yalnız aktif borcu tutan boyuta indirildi.
