# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.
Aktif iş: VOL.LIFE — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Açık

- [ ] **[P1] Oyunlar Android'i tek bir platform yüklemiyle tanısın.** Üç oyun
      "Android mi?" sorusunu işaretçi türüne soruyor: vol-arachnid çıkış onayını
      ve tam ekran düğmesini `shouldUseTouchControls()` ile kapılıyor; vol-hell
      `hasNativeWindow()` = `isTauri() && !shouldUseTouchControls()` kullanıyor
      ve oyun içi geri işleyicisini yalnız dokunmatikte kuruyor
      (`GameMobileControls.ts`); VOL.LIFE `6b82b2d`de kararı silip düğmeyi sabit
      gösterdi. vol-hell ve vol-arachnid `MainActivity`'si geri tuşunu koşulsuz
      tüketip JS'e iletiyor (`OnBackPressedCallback(true)`); fareli Android'de
      (DeX) dinleyici kurulmayan ekranda geri tuşu hiçbir şey yapmaz — bu kısım
      statik okumadır, DeX'te sınanmadı. VOL.LIFE'ın seçenekler ve ekran yönü
      işi bu yükleme bağlı. vol-hell `vite.config.ts` `TAURI_ENV_*`
      değişkenlerini istemciye açıyor (`envPrefix`); VOL.LIFE ve vol-arachnid
      açmıyor. Kapanır: tauri-v2'de ortak bir yüklem (Android / masaüstü Tauri /
      tarayıcı) testle yazılır; üç oyun tam ekran düğmesi, çıkış onayı ve native
      pencere özellikleri için onu kullanır.
- [ ] **[P1] tauri-v2 Android'de ekran yönünü uygulayabilsin.** WebView'ın
      `screen.orientation.lock()`u cihazda `NotSupportedError` veriyor (VOL.LIFE,
      SM-G990B2, Android 16, WebView 152; DOM tam ekranında da) ve resmî Tauri
      eklentileri arasında yön kilidi yok. Kapanır: tauri-v2'ye Kotlin eklentisi
      girer (`setRequestedOrientation`); oyun kelimesi bilmez, yönü uygular,
      uygulanan gerçek yönü döner ve kayıtlı yönü Activity açılışında
      uygulayacak yardımcıyı sunar; izni yetenek dosyalarına ve üretilen şemaya
      eklenir; masaüstü derlemesi etkilenmez (Rust kapısı). Köprü iki aileyi de
      sunar: `sensor*` telefonun döndürme kilidini yok sayar (vol-hell ve
      vol-arachnid manifestte bunu kullanıyor), `user*` kilide uyar; VOL.LIFE
      `user*`ı seçti ([games/vol-life/DESIGN.md](games/vol-life/DESIGN.md) §9).
- [ ] **[P1] Görüntü kipi uygulayıcısı ortak pakete çıksın.** vol-hell'in
      `VideoSettingsController`ı F11'i native pencereye yönlendirmeyi, pencere
      yöneticisinden gelen değişimi ayara yansıtmayı ve sıralı uygulamayı oyunun
      çözünürlük ve grafik kalitesiyle aynı sınıfta taşıyor. VOL.LIFE masaüstünde
      aynı davranışa ihtiyaç duyuyor; kopyalanırsa sıralama ve nesil denetimi iki
      yerde yaşar. Kapanır: oyun bilmeyen kısım tauri-v2'ye (CORE
      `FullscreenController` ve `TauriWindowAdapter` üstüne) taşınır ve
      testlenir; vol-hell onu kullanır ve mevcut testleri geçer; VOL.LIFE aynı
      parçayı kullanır.
- [ ] **[P2] Android 16 geniş ekranda yön kilidini yok saymasın.** Üç oyunda
      `targetSdk = 36` ve hiçbir manifestte `android:appCategory` yok. Android 16
      davranış değişikliğine göre en dar kenarı 600dp ve üstü ekranlarda
      `screenOrientation` ve `setRequestedOrientation()` yok sayılır; oyunlar
      (`android:appCategory="game"`) muaf. Yani tablette vol-hell ve
      vol-arachnid'in `sensorLandscape` kilidi tutmaz, VOL.LIFE'ın yön seçimi
      işlemez. SM-G990B2 (384dp) etkilenmez; geniş ekranda sınanmadı. Kapanır: üç
      manifestin `<application>`ına `android:appCategory="game"` girer ve drift
      testleri kilitler; en dar kenarı 600dp ve üstü emülatörde yön kilidi
      doğrulanır.
- [ ] **[P3] vol-hell telefonda HUD arenayı örtüyor.** Cihazda ölçüldü
      (SM-G990B2, yatay 832×384 CSS): sol üst Can/Dash/Spark panelleri arena
      köşesinin üstünde duruyor ve bir düşman Dash çubuğunun altında kaldı; sağ
      istatistik sütunu arena çizgisini kesiyor. Arena kenar boşluğu HUD'u
      hesaba katmıyor; `Border.ts` onu yalnız ekran boyutundan hesaplıyor:
      `min(60, genişlik × 0,25, yükseklik × 0,25)`. Kapanır: dokunmatik ve
      küçük ekranda arena HUD bölgelerini dışarıda bırakır ya da HUD sıkışır;
      cihaz ekran görüntüsüyle doğrulanır.
- [ ] **[P3] vol-hell dokunmatikte yetenek yuvalarını iki kez gösteriyor.**
      Cihazda ölçüldü: alttaki `AbilityHud` kutuları ile sağdaki `TouchControls`
      yetenek düğmeleri aynı iki yuvayı birlikte çiziyor. `AbilityHud`
      dokunmatiği hiç bilmiyor ve klavye tuş etiketi (`SLOT_KEY_LABELS`)
      üretiyor; bunu bilinçli kılan bir kod ya da belge yok. Kapanır: dokunmatikte
      tek temsil seçilir, karar kodda yazılı olur ve cihazda doğrulanır.
- [ ] **[P3] iOS/WKWebView MP3 fallback'i ses build'ine bağlansın.** Bugün elle
      koşuluyor (`pnpm convert:ios`); iOS hedefe girdiğinde yapılır.

## Kapatılanlar

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
