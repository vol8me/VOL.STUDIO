# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.
Aktif iş: VOL.LIFE — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Açık

- [ ] **[P2] Android 16 geniş ekranda yön kilidini yok saymasın.** Android 16,
      en dar kenarı 600dp ve üstü ekranlarda `screenOrientation`ı yok sayar;
      oyun kategorisi (`android:appCategory="game"`) muaftır. Üç manifestte
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

## Kapatılanlar

### 2026-09-12 — Tauri SQL/GameStateDb çıkarma ve vol-hell AppImage çizim kuralı

- [x] **[P3] Paylaşılan Tauri kabuğundan SQL eklentisi ve GameStateDb tamamen
      çıkarıldı.** `tauri-v2/src-tauri/src/lib.rs` artık `tauri_plugin_sql`
      kaydetmiyor; üç oyunun `Cargo.toml`undan `tauri-plugin-sql`
      bağımlılığı kalktı; `tauri-v2/package.json`dan `@tauri-apps/plugin-sql`
      kalktı; `tauri-v2/src/index.ts` ve `tauri-v2/src/storage/` GameStateDb
      sarmalayıcı/error dosyaları silindi; `capability` dosyalarından
      `sql:default`/`sql:allow-execute` izinleri kalktı. Kanıt: `cargo tree` ile
      `tauri-v2` ve üç oyun crate'inde `sqlx`/`sqlite` yok; `VOL.LIFE` release
      ikilisinde `tauri_plugin_sql` sembolü yok; `just quick` ve `just rust`
      geçti.

- [x] **[P2] vol-hell AppImage'ı Linux çizim kuralına girdi.**
      `games/vol-hell/src-tauri/linux.AppRun` artık `WEBKIT_DISABLE_DMABUF_RENDERER`
      değişkenini dayatmıyor; ayrıca linuxdeploy GTK hook'unun `GDK_BACKEND=x11`
      dayatmasını, dışarıdan verilmediyse ve oturum Wayland ise Wayland'e
      çeviriyor (`GDK_BACKEND` tercihini koruyor). `docs/android.md` güncellendi.
      Yeniden derlenen AppImage (`VOL.HELL_0.1.0_amd64.AppImage`) NVIDIA +
      yerel Wayland oturumunda çizim yolunu WebKit DMA-BUF ile açtı: WebKit
      alt sürecinde `WEBKIT_DISABLE_DMABUF_RENDERER=0` ve
      `__NV_DISABLE_EXPLICIT_SYNC=1` gözüktü, WebKitWebProcess %26 CPU'da
      çalıştı; XWayland (`GDK_BACKEND=x11`) yolunda da menü çizdi,
      `WEBKIT_DISABLE_DMABUF_RENDERER=1`, WebKitWebProcess %100 CPU'da.
      Ekran görüntüleri: `/tmp/appimage-wayland.png`, `/tmp/appimage-x11.png`.
      `just quick` ve `just rust` geçti.

### 2026-09-11 — platform yüklemi, Android yönü, görüntü kipi, vol-hell HUD, CORE `Sheet`

- [x] **[P1] Oyunlar Android'i tek yüklemle tanıyor.** `@volstudio/tauri-v2`
      `getRuntimePlatform()` (`web` / `desktop` / `android`) testle yazıldı;
      vol-arachnid tam ekran düğmesini ve çıkış onayını, vol-hell native pencere
      ve görüntü ayarlarını, VOL.LIFE düğme kümesini ve çıkış onayını ona bağladı.
      Ekran üstü kontroller işaretçi türüne bağlı kaldı. Telefonda (SM-G990B2):
      vol-arachnid'de tam ekran düğmesi yok, geri tuşu onayı açıyor, ikinci geri
      onayı kapatıyor. Madde metnindeki "vol-hell oyun içi geri işleyicisini
      yalnız dokunmatikte kuruyor" okuması yanlıştı: `GameMobileControls` onu
      zaten koşulsuz kuruyordu.
- [x] **[P1] tauri-v2 Android'de ekran yönünü uyguluyor.**
      `tauri-v2/plugins/vol-orientation`: Kotlin `setRequestedOrientation`,
      `user*` ve `sensor*` aileleri, uygulanan gerçek yön ve Activity açılışında
      kayıtlı yönü uygulayan `OrientationStore.applySaved`. İzin `mobile.json`da
      ve üretilen şemada; masaüstünde komutlar hata döner. Telefonda yatay seçimi
      `ROTATION_90`, sistem tersini isterken kilit tutuyor, yeniden açılışta
      tercih geliyor; açılış dönüşü VOL.LIFE odak almadan bitiyor (541 ms /
      728 ms, odaklıyken 66 örneğin hiçbiri dikey değil).
- [x] **[P1] Görüntü kipi uygulayıcısı `@volstudio/tauri-v2`de.**
      `DisplayModeController` native pencereyi ya da DOM tam ekranını uygular,
      F11'i yönlendirir, dış değişimi tercihe yazar ve yalnız en son isteği
      uygular (11 test); vol-hell `VideoSettingsController`ı ve VOL.LIFE
      masaüstü onu kullanıyor. Linux'ta pencere yöneticisinin değişimi
      görünmüyordu: tao 0.35 `is_fullscreen()` yalnız uygulamanın kendi
      isteğini hatırlıyor. Paylaşılan kabuğa GDK durumunu okuyan
      `window_fullscreen_state` komutu girdi, `TauriWindowAdapter` onu okuyor.
      KDE Plasma'da girdisiz ölçüldü: KWin pencereyi pencere / tam ekran /
      pencere yapınca tercih `windowed` / `fullscreen` / `windowed` oldu
      (düzeltmeden önce üçünde de `fullscreen` kalıyordu); tercih tam ekranken
      uygulama tam ekran açıldı. Çekmeceden seçim ve F11 kullanıcı tarafından
      elle doğrulandı.
- [x] **[P2] `tauri dev` üç oyunda dev sunucusu yerine son derlemeyi
      gösteriyordu.** Oyun crate'leri paylaşılan kabuğu
      `features = ["custom-protocol"]` ile bağlıyordu; `tauri dev`in
      `--no-default-features`ı bağımlılığın özelliğini kapatamadığı için pencere
      son `vite build` çıktısını yüklüyordu (ölçüldü: yeni komut `dist`te yoktu
      ve hiç çağrılmıyordu).
      Özellik artık oyunun `custom-protocol`una bağlı. Üretim yolu değişmedi:
      üç APK yeniden derlenip telefonda `http://tauri.localhost/` üzerinden
      tuvaliyle açıldı. Aynı turda VOL.LIFE ve vol-arachnid vite ayarı
      `src-tauri`yi izleme dışı bıraktı (Android derlemesi açık dev penceresini
      defalarca yeniden yüklüyordu) ve VOL.LIFE'ın dev sunucusu izin listesine
      tükettiği `tauri-v2` girdi.
- [x] **[P1] Linux masaüstünde kare hızı NVIDIA + Wayland'da 18'e kilitliydi
      (kullanıcı bildirdi).** Paylaşılan kabuk WebKit'in DMA-BUF çizicisini
      koşulsuz kapatıyordu; o yolda her kare CPU üzerinden kopyalanıyor. Ölçüldü
      (RTX 3050 / sürücü 610.57, KDE Plasma 6.7, WebKitGTK 2.52, 1920×1080, boş
      sahne, arka plan boşta): çizici kapalıyken 18 FPS ve web işlemi %89;
      açıkken yerel Wayland'da explicit sync protokol hatasıyla (Gdk Error 71)
      açılışta çöküş, XWayland'da boş pencere; açık ve
      `__NV_DISABLE_EXPLICIT_SYNC=1` ile sabit 60 FPS ve %12. GBM'siz yol 36–40,
      SHM zorlama 24–25, vblank zamanlayıcısı 17–18 FPS'te kaldı. Kabuk artık
      yalnız ekranı tek başına NVIDIA sürücüsünün sürdüğü yerel Wayland
      oturumunda çiziciyi açık bırakıp explicit sync'i kapatıyor; XWayland'da
      ve diğer sürücülerde güvenli yol sürüyor, dışarıdan verilen değişken
      ezilmiyor. Hiçbir değişken verilmeden ölçüldü: yerel Wayland 60 FPS / %12,
      XWayland çiziliyor (44 FPS). Ölçümlerin kaynağı `FpsMeter` tarayıcıda
      bağımsız bir kare sayacıyla karşılaştırıldı: yüksüz, 25 ms, 45 ms ve 8/40 ms
      dalgalı yükte sayım 60,0 / 33,9 / 20,2 / 34,4, gösterge 60 / 34 / 20 / 34.
- [x] **[P3] vol-hell HUD arenayı örtmüyor.** HUD tek üst şerit: can ve dash
      yan yana, altlarında Spark; ortada dalga; sağda 2×2 istatistik (44 px).
      `GameHud.measureReserve` şeridin ve masaüstü yetenek satırının gerçek
      yüksekliğini ölçüyor, `Border` sahayı bu bantların dışında kuruyor (toplam
      rezerv en çok ekranın %70'i). Telefonda (832×384): şerit ve duraklatma
      28–72 px, arena çizgisi 83 px'ten başlıyor, arena 241 px (HUD'u hesaba
      katmayan kenarla 264 px'ti ve HUD sahaya biniyordu). Web: 1280×720'de 577,
      640×360 dokunmatikte 218 px; hiçbir HUD dikdörtgeni arenayla kesişmiyor.
- [x] **[P3] vol-hell dokunmatikte yetenekleri tek yerde gösteriyor.**
      Dokunmatik kararı sahne açılışında bir kez alınıyor; `TouchControls`
      düğmeleri tek temsil, `GameHud` masaüstü Q/E satırını kurmuyor ve karar
      kurucuda yazılı. Mobil kopya CSS'i ve kullanılmayan simge dalı silindi.
      Telefonda `.vol-ability-hud` yok, iki dokunmatik yetenek düğmesi var.
- [x] **[P3] iOS/WKWebView MP3 fallback'i karar olarak kapatıldı.** iOS cihaz
      erişimi yok; kullanıcı yeniden açana kadar kilitli. Dönüşüm elle koşuyor
      (`pnpm convert:ios`).
- [x] **[P2] CORE `Sheet` girdi.** Sağdan açılan, başlıklı ve kendi içinde
      kayan çekmece; en az yarım genişlik, 480 px ve altında tam genişlik. Scrim,
      odak, Escape ve Android geri sözleşmesi `Modal`dan gelir; açık `Modal`
      artık geri hareketini de tüketiyor, `Select` ve `Popup` Escape'i önce
      kendileri tüketiyor. `StatsPanel` bu kabuğa taşındı; vol-ui PANELS
      sekmesi, layout e2e'si ve `core/docs/public-surface.md` (227 → 228; kayda
      geçmemiş 223 → 227 girdisi de eklendi) güncellendi.
- [x] **[P2] Dokunsal yetenek masaüstü Chromium'da yanlış pozitifti.**
      `navigator.vibrate` tanımlı ama motorsuz; VOL.LIFE seçeneklerinde işe
      yaramayan bir anahtar olarak görüldü. Titreşim katmanı artık yalnız mobil
      cihazda sayılıyor (UA-CH `mobile`, yoksa kullanıcı ajanı); telefonda satır
      görünür kaldı.

### 2026-09-10 — CORE önkoşulları: rastgelelik, simge, SegmentedControl, geri tuşu

- [x] **[P1] `SegmentedControl` genel eksikleri kapandı:** `setOptions` ile
      etiket yenileme, `ariaLabel` / `setAriaLabel`, WAI-ARIA radyo grubu
      klavyesi (tek sekme durağı, oklar, Home/End, sağdan sola) ve pasif görünüm
      (`vol-segmented--disabled`); 12 test, vol-ui forms sekmesinde pasif örnek.
- [x] **[P1] CORE simge setine `settings` girdi;** vol-ui'deki `ICON_GEAR`
      kopyası kalktı, buttons sekmesi CORE simgesini kullanıyor.
- [x] **[P1] Açılır katmanlar Android geri tuşunda kapanıyor:** `Popup` açıkken
      `pushBackHandler` kaydı tutuyor (Popover, Select, ContextMenu da); yığın
      sırası ve kayıt sızıntısı testle sınandı.
- [x] **[P3] `createRandom(0)` ayrı bir dizi üretiyor;** varsayılan tohumun ve
      0'ın dizisi testle kilitli, sonlu olmayan tohum `RangeError` veriyor. İki
      oyunun sesi yeniden üretildi; varlıklarda fark yok.

### 2026-09-10 — denetim düzeltmeleri (`6b82b2d`)

- [x] **CORE headless alt yolları:** `@volstudio/core/math`, `grid` ve
      `collections` açıldı; saf Node'da Phaser ve `window` olmadan yükleniyor.
- [x] **`ViewportManager` serbest kamera koruması:** `preserveCameraState`
      seçeneği ve kamera `data` bayrağı; resize dünya kamerasını sıfırlamıyor.
- [x] **VOL.LIFE çalışma zamanı bulguları:** ayrıntı ve yeniden açılan maddeler
      [games/vol-life/TODO.md](games/vol-life/TODO.md)'de.

### 2026-09-10 — kalite ve altyapı (`064de4e`)

- [x] **Kapsam şekli gerekçeleri koda dayanıyor:** BossController, GameAudio,
      PCController ve TouchController tabanın üstünde; GameScene ve
      MainMenuScene gerçek tarayıcı kanıtıyla.
- [x] **`quick` kapsam artığına bağlı değil;** temiz klonda yeşil.
- [x] **Kapsam şekli yalnız o koşunun lcov'unu okuyor** (`coverageRun.mjs`).
- [x] **Rust `high` kapısında.**
- [x] **`sourceSize`, `commentDensity` ve `deadI18n` çalışma ağacını görüyor.**
- [x] **Her oyun kendi ikonunu taşıyor;** `tauri-v2/src-tauri/icons` kalktı,
      `productIcons` bekçisi eklendi.
- [x] **`just tauri-ios` tarifi silindi.**
- [x] **`validateDeviceApps` `workspace-contract`a bağlandı.**
- [x] **Bundle ölçüsü dosya başına gzip.**
- [x] **Vendor sınıflaması yol ayırıcısından bağımsız.**
- [x] **Satır sınırı `.mjs`, `.js`, `.css`, `.rs` ve `.kt`'yi kapsıyor;** 1000
      satırı aşan beş CSS dosyası bölündü.
- [x] **`docs/gates.md` yeni kapıları anlatıyor.**
- [x] **`pnpm dev` vol-life'ı da açıyor.**
- [x] **Cargo kilitlerinde Tauri sürüm eşitliği kapılı;** tauri-v2 kilidi
      hizalandı.
- [x] **vol-hell drift testi açıklamasındaki yol düzeltildi.**
- [x] **`memoryEstimateAccuracy` test yorumu kararı söylüyor.**

### 2026-09-09 — dokunmatik/klavye ve kapılar (`a38fe22`)

- [x] **God-object sınırı:** sınır 1000 satıra çekildi (karar); `advancedTab`
      ve kart testleri bölündü.
- [x] **`SpatialIndex` rebuild ve artımlı yol denkliği testle kilitli.**
- [x] **CORE yüzeyi isim listesiyle korunuyor.**
- [x] **`PlayerController` takma adı kaldırıldı.**
- [x] **Tuş atama oyuncuya açık:** `KeyBindingList` ve vol-hell ayarları.
- [x] **`TouchButton` → `HoldButton`.**
- [x] **Görsel doğrulama iki uçlu değil:** vol-hell e2e kapısı kuruldu.
- [x] **Phaser sahnelerinin düşük kapsamı kapsam şekli kapısına bağlandı.**
- [x] **20 dalgalık elle smoke testi headless dalga zarfı testiyle değişti.**
- [x] **Bazı CORE primitiflerinin ikinci tüketicisi yok** — karar: iş değil.
- [x] **Bellek tahmini modeli sapıyor** — karar: iş değil (visual-synth test
      ortamı).
- [x] **Bulut CI** — karar: kapılar yerelde kalır.
- [x] **`ShopPicker` reroll çıkış animasyonu** — karar: flaş bilinçli,
      gerekçe kodda.
