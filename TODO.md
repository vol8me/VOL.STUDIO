# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.
Aktif iş: VOL.LIFE — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Açık

- [ ] **[P3] CORE `createRandom(0)` ayrı bir dizi üretsin.** 0 sessizce
      varsayılan tohuma (`0x5eed`) çevriliyor. Ölçüldü: `createRandom(0)` ile
      `createRandom()` aynı diziyi veriyor; mulberry32 için 0 dejenere değil
      (0 durumundan dizi 0,2664 · 0,0003 · 0,2233), kaynaktaki yorum yanlış.
      Kapanır: varsayılan yalnız parametre verilmediğinde uygulanır ve takma adı
      yakalayan test yazılır (`core/src/random/random.ts`). VOL.LIFE eşi
      [games/vol-life/TODO.md](games/vol-life/TODO.md)'de.
- [ ] **[P3] iOS/WKWebView MP3 fallback'i ses build'ine bağlansın.** Bugün elle
      koşuluyor (`pnpm convert:ios`); iOS hedefe girdiğinde yapılır.

## Kapatılanlar

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
