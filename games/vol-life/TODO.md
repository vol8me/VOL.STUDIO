# VOL.LIFE — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Zemin

- [ ] **[P1] `LifeScene` viewport sözleşmesine bağlansın.** `create()`
      `applyVolViewport(this)` çağırmıyor; vol-hell ve vol-arachnid çağırıyor.
      Arka tampon DPR ile büyüyor ama kamera yakınlaştırılmıyor. Ölçüldü:
      tarayıcıda DPR 2 → 1600×1200 tampon / 800×600 CSS; cihazda (SM-G990B2)
      DPR 2,81 → 1080×2340 / 384×832. Kapanır: çağrı eklenir; DPR 1/2/3'te
      kamera zoom'unun rasterleme çarpanına eşit olduğunu doğrulayan
      entegrasyon testi yazılır.
- [ ] **[P2] Açılış hata sınırı kurulsun.** `bootstrap.ts` üst düzey `await`
      ile korumasız koşuyor. Ölçüldü: WebGL kurulamazsa canvas 0, HUD yok, ekran
      boş; hata yalnız konsolda ("Cannot create WebGL context, aborting.").
      Kapanır: açılış zinciri korunur, i18n'li görünür hata yüzeyi çıkar
      (vol-hell `showFatalError` deseni) ve WebGL kapalı tarayıcıda sınanır.
- [ ] **[P2] `DESIGN.md` koda göre güncellensin.** §16 "21 test, kapsam 100,
      eşik 98/98/98/98" ve bundle rakamları eski (bugün 42 test, eşik
      87/87/83/86); klasör ağacında `ui/` "HUD (henüz yok)" diyor ama
      `LifeHud` ve `LifeExitPrompt` var; `WebGLRenderer.js:709/904` satır
      atıfları API düzeyinde ifadeye çevrilir; "Tek geçerli yoğun render yolu"
      başlığı ve `graphics.ts` yorumu benchmark sonuçlanana kadar hipotez
      olarak yazılır; §13'teki "Adım 0 tamamlandı" hükmü bu bölümün P1/P2
      maddeleri kapanınca yeniden verilir.
- [ ] **[P3] Tam ekran düğmesi dokunmatikte gizlensin.** `6b82b2d`
      `showFullscreenToggle: !touchDevice` kararını `true` yaptı. Ölçüldü:
      cihazda (`pointer: coarse`) düğme görünüyor. Kapanır: karar platforma
      bağlanır ve `LifeScene` düzeyinde test edilir; bugün yalnız `LifeHud`
      bileşeni sınanıyor.
- [ ] **[P3] `createSimRandom(0)` `0x5eed` ile aynı diziyi üretmesin.**
      Ölçüldü: iki tohum bayt bayt aynı diziyi veriyor; mulberry32 için 0
      dejenere değil, `rng.ts` yorumu yanlış. Kapanır: 0 geçerli tohum olur ve
      takma adı yakalayan test yazılır. CORE eşi kök TODO'da.
- [ ] **[P3] Tauri izinleri en az yetkiye insin.** Frontend yalnız
      `TauriWindowAdapter`ı (`exit_application`) kullanıyor; `store:default`,
      `sql:default` ve `6b82b2d`de eklenen `sql:allow-execute` hiç
      kullanılmıyor (vol-hell ve vol-arachnid'de `allow-execute` yok). Kapanır:
      kalıcılık gelene kadar üçü masaüstü/mobil yetkilerinden ve üretilen
      şemadan kalkar; cihazda açılış ve çıkış onayı doğrulanır.
- [ ] **`SimulationClock` `partialStep: 'defer'` ile kurulur;** seçim testle
      kilitlenir. `resolveMaxStepsForSpeed` hız çarpanıyla bu saate bağlanır;
      bugün hiçbir kod onu çağırmıyor.
- [ ] **E2E:** ilk görsel substratla birlikte gerçek WebGL Playwright testi
      (DPR 2 ve WebGL kapalı senaryosu dahil); `test:e2e` script'i ve
      `justfile` `e2e` tarifi birlikte eklenir.
- [ ] **Ölçekleme bütçesi:** benchmark betiği ve `quality.json` →
      `scaling.<paket>.$measure` Adım 2'de yazılır.

## Adım 1 — dünya substratı

- [ ] **`FieldSet`:** `flow` (iki bileşen), `nutrient`, `energy`,
      `temperature`, `disturbance`; `Float32Array` paralel diziler, alan başına
      nesne yok.
- [ ] **Difüzyon:** çözünürlük ve tempo bu makinede ölçülerek seçilir (512²
      kademeli ve 256² tam güncelleme karşılaştırılır); ölçülmeden bütçe
      yazılmaz.
- [ ] **Çift doğrusal örnekleme:** alan değeri organizmanın konumunda okunur,
      hücre merkezine yuvarlanmaz.
- [ ] **Kaynak tohumlama:** kaynak dünyanın verisidir, açılışta tohumlanır.
- [ ] **Toroidal sarma:** kenar `worldConfig.sizeUnits`; alan indeksinde ve
      mesafe hesabında tutarlı. Komşuluk mesafesi özellik testiyle kilitlenir:
      x=1 ile x=1023 arası 2 birimdir, 1022 değil.

## Adım 2 — parçacık yaşamı

- [ ] **[P1] Render yolu benchmark'la seçilsin.** "Tek geçerli yol:
      `SpriteGPULayer`" hükmü kanıtın önünde. Phaser 4.2.1 kaynağı sık buffer
      güncellemesini pahalı sayıyor (`SpriteGPULayer.js` JSDoc); VOL.LIFE ise
      konumu her tick CPU'da değiştirecek. Kapanır: CPU'da güncellenen
      10k/50k/100k/250k ajan için `SpriteGPULayer` (segment güncellemeli) ve en
      az bir alternatif; CPU güncelleme, GPU yükleme ve kare süresi p50/p95
      ölçülür, karar `DESIGN.md`ye yazılır.
- [ ] **SoA `AgentStore`:** paralel `Float32Array`/`Uint8Array`, ajan başına
      nesne yok; `Uint32` handle (düşük bitler indeks, yüksek bitler kuşak, 0
      geçersiz). CORE `SpatialIndex`i nesne kimliğine bağlı olduğu için
      kullanılmaz.
- [ ] **Uzamsal hash:** counting sort, `Map` yok, sıcak yolda tahsis yok.
- [ ] **Kuvvet birikimi ve entegrasyon ayrı;** entegrasyon tek yerde yapılır.
- [ ] **Tick sırası:** komutlar → ızgara → kuvvetler → entegrasyon → difüzyon;
      testle kilitlenir.
- [ ] **Render benchmark'ın seçtiği yolla kurulur;** `SpriteGPULayer`
      seçilirse `scale = worldUnits / textureSizePx`.
- [ ] **Silme yerine `alpha = 0`;** `removeMembers` splice yapar ve indeksleri
      kaydırır.
- [ ] **Ölü ajanın üyesi görünür kalmaz;** görünürlük ayrıca izlenir.

## Adım 3 — matris araması

- [ ] **"İlginç" metriği tanımlanır;** `maxCellOccupancy` yeterli değil.
- [ ] **Tarama altyapısı:** matris uzayı deterministik tohumlarla taranır;
      sonuç `src/config/` altında veri olarak saklanır.
- [ ] **Alan kuvvetleri morfoloji oturana kadar kapalı kalır.**

## Adım 4+

Kalemler önceki adım ekranda doğrulandığında yazılır; kilometre taşları
[DESIGN.md](DESIGN.md) §13'te.

## Her adımda

- Adım gerçek tarayıcıda görüntüyle kapanır.
- Phaser API'si kaynaktan doğrulanır; `camera.setBounds`un beşinci argümanı
  (`centerOn`) verilmezse pencereden küçük dünya sol üste yapışır.
- Mantık Phaser sahnesinde birikmez.
- Ölçmeden optimize edilmez; ölçüm kaynak yorumuna değil `DESIGN.md`ye yazılır.
- Kapsam eşiği düşürülerek kapı geçilmez; eşikler `quality.json`da.
- Dünya kamerası (pan/zoom) kurulduğu adımda resize onu sıfırlamaz: kamera
  `data` bayrağı `preserveCameraState` kullanılır; yön değişiminde bakılan
  nokta ve zoom testle korunur.

## Kapatılanlar

### 2026-09-10 — denetim düzeltmeleri (`6b82b2d`)

- [x] **[P2] RNG 0-durumu geri yükleme:** `setState(0)` artık fallback'e
      çevrilmiyor; sıfır durumundaki anlık görüntü birebir sürüyor. Kurucudaki
      0 takma adı Zemin'de yeniden açıldı.
- [x] **[P2] Sahne DESTROY yaşam döngüsü:** SHUTDOWN yanında DESTROY de
      kapsamı topluyor.
- [x] **[P2] Android geri hareketi:** `LifeExitPrompt` işaretçi türünden
      bağımsız kuruluyor.
- [x] **[P3] HUD `aria-label` dil değişiminde yenileniyor.**
- [x] **[P3] Tam ekran etiketi başlangıç durumuyla kuruluyor**
      (`initialFullscreen`). Düğmenin dokunmatikte görünmesi Zemin'de yeniden
      açıldı.
- [x] **[P2] `resolveMaxStepsForSpeed` yazıldı ve test edildi.** Simülasyona
      bağlanması Zemin'deki `SimulationClock` maddesinde.
- [x] **[P2] CORE headless alt yolları** (`math`, `grid`, `collections`).
- [x] **[P2] `ViewportManager` serbest kamera koruması**
      (`preserveCameraState`).
- [x] **[P3] `DESIGN.md` SoA/`SpatialIndex` açıklaması güncellendi.**
- [x] **[P3] `sql:allow-execute` izni eklendi.** Kullanılmıyor; en az yetki
      maddesi Zemin'de.

### 2026-09-10 — kalite turu (`064de4e`)

- [x] **`DESIGN.md`'nin dört eski cümlesi düzeltildi:** ölçekleme kapısı,
      cihaz ölçümü, `src-tauri`, §17.
- [x] **LifeHud dil testi yeniden yazıldı;** dil aboneliği kaldırılınca düşüyor.

### 2026-09-09 — cihaz ölçümü (`a38fe22`)

- [x] **`scripts/device-benchmark.mjs` vol-life'ı ölçüyor;** `deviceApps`
      bekçisi listeyi kapılıyor.
