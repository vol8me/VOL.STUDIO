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
- [x] **[P1] D3 — `core` gamepad sağlayıcısı ve girdi kipi politikası.**
      Standart eşleme, ölü bölge, analog hareket ve nişan; eylem → düğme bağı
      veridir (`GamepadController` + `GamepadState`, 11 test). Son anlamlı
      girdi kenar-zamanıyla kazanır (`InputModeArbiter`, 10 test); fare ve
      çubuk nişanı `InputManager` birleşiminde birikir, biri ötekini
      kilitlemez (14 test). `inputModeForSession('gamescope')` ilk kareden
      kol kipi verir. vol-ui `touch` sekmesinde canlı kol paneli var.
      Gerçek Deck'te oyun başlangıcı D7'nin kabul turunda doğrulanır.
- [x] **[P1] D3 — Kolla arayüz gezinmesi.** `FocusNavController`: D-pad ve
      çubukla uzamsal odak, A tıklar, B `triggerBack` üzerinden Android geri
      ve Escape ile aynı yığına düşer; Menu `onMenu`'ye, LB/RB sekme
      geçişine gider. Halka `vol-focusnav-current` ile yalnız kol/klavye
      kipinde görünür; `listFocusable` modal/inert sınırlarını sayar
      (Modal aynı seçiciyi kullanır). 16 birim testi; sanal kol E2E'si
      6/6 yeşil (`devtools/vol-ui/tests/e2e/gamepad.spec.ts`).
- [x] **[P1] D4 — Glif sistemi.** `core/src/ui/glyphs/`: `Glyph` bileşeni
      (img + metin çipi yedeği), `resolveGlyphFamily` (Steamworks tipi →
      `Gamepad.id` kalıbı → `SteamDeck=1` → `xbox`), `glyphNameForButton`
      standart-düzen eşlemesi. Varlıklar Kenney Input Prompts 1.5 (CC0)
      alt kümesi, `core/public/assets/glyphs/` 139 dosya; kaynak kaydı
      `SOURCES.md`. vol-ui `touch` sekmesinde kip-bağımlı glif satırı;
      E2E glif testi yeşil (kol→xbox, klavye→keyboard, dokunmatik→yok).
      Not: donmuş-saat ortamında kip geçişi test edilemez — E2E taze
      bağlamda gerçek saatle koşar.
- [x] **[P2] D4 — Linux'ta titreşimin native yolu.** `tauri-v2` haptik
      sürücüsü çift arka uçlu: **hidraw** (Deck HID 0xEB rumble raporu)
      öncelikli; **evdev** FF_RUMBLE yedek (sanal kol EVIOCSFF'i EFAULT
      verir — uinput yükleme servisi devkit oyununda yok). `planRumblePulses`
      desen tablosu her iki uca da veri taşır. Sonda Deck'te
      `backend:"hidraw", device:"hidraw2"` bildirdi ve `vol_haptics_rumble`
      `ok` döndü — rapor süreç içinden kabul edildi (2026-09-27). Motorun
      hissedilmesi insan eliyle kalır (güç sensörü çözünürlüğü yetmedi).
- [x] **[P1] D5 — Okunabilirlik ve ölçek kapısı.** Playwright WebKit
      projesinde 1280×800 ve 1280×720'de görünen her metin ≥ 12 px;
      1920×1080 ve 3840×2160'ta oturma mesafesine göre UI ölçeği; kapsam
      `core` bileşenleri ve aktif oyunlar. Kapanır: kapı `high`da koşar ve
      ihlali dosya ve seçiciyle bildirir; mevcut ihlaller giderilmiştir.
      Kapı `devtools/vol-ui/tests/e2e/readability.spec.ts`'te (webkit
      projesi, 4/4 yeşil); `--vol-text-micro` 12px tabanına çıkarıldı,
      `--vol-ui-zoom` medya sorgularıyla 1080p→1.5×/2160p→3× ölçeklenir
      (2026-09-27).
- [x] **[P2] D5 — Kolla metin girişi.** `core` metin girişi isteği sözleşmesi;
      Steamworks varsa kayan klavye, yoksa `core`'un yalnız kolla kullanılan,
      Türkçe karakterli ekran klavyesi. Kapanır: `Input` ve `TextArea` kol
      kipinde odaklanınca klavye kendiliğinden açılır; vol-ui vitrinindedir.
      `core/src/ui/textEntry/`: `requestTextEntryForElement` focus kancası +
      `TextEntryProvider` sağlayıcı dikişi (D6 Steamworks buraya takılır) +
      `OnScreenKeyboard` Türkçe Q düzeni (İ/ı dahil), ortak geri yığınıyla
      iptal. `InputManager` kip probunu kurulumda kaydeder. Birim 6/6, E2E
      1/1 yeşil (2026-09-27).
- [x] **[P2] D5 — Gamescope altında görüntü ayarları.** Pencere kipi ve
      çözünürlük seçenekleri gamescope oturumunda sunulmaz; Deck'in
      varsayılan grafik kalitesi `device` kapsamında tutulur. Kapanır: Deck'te
      ayar ekranında etkisiz seçenek yoktur; ilk açılışta hiçbir ayarı
      değiştirmek gerekmez.
      `displayCapabilitiesForSession` (`core/platform`) yetenek tablosudur;
      vol-ui forms sekmesinde oturum simülasyonuyla görünür (satır gizlenir,
      devre dışı kalmaz), kalite `device.` kapsamına kaydeder. Deck
      doğrulaması D7 oyun entegrasyonunda. Birim 2/2, E2E 2/2 yeşil
      (2026-09-27).
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
