# VOL.LIFE — iş listesi

> **TODO Disiplini:** Tamamlanan maddeler minimalleştirilerek `[x]` ile kapatılır ve
> dosyanın en sonundaki `## Kapatılanlar` bölümüne taşınır; aktif işler yukarıda
> temiz kalır. Sonraki agent'lar bu kuralı bozmaz.

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Zemin

- [ ] **`SimulationClock` `partialStep: 'defer'` ile kurulur;** seçim testle
      kilitlenir.
- [ ] **E2E:** `test:e2e` script'i ve `justfile` `e2e` tarifi, çizilecek içerik
      geldiğinde birlikte eklenir.
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
      mesafe hesabında tutarlı.

## Adım 2 — parçacık yaşamı

- [ ] **SoA `AgentStore`:** paralel `Float32Array`/`Uint8Array`, ajan başına
      nesne yok; `Uint32` handle (düşük bitler indeks, yüksek bitler kuşak, 0
      geçersiz). CORE `SpatialIndex`i nesne kimliğine bağlı olduğu için
      kullanılmaz.
- [ ] **Uzamsal hash:** counting sort, `Map` yok, sıcak yolda tahsis yok.
- [ ] **Kuvvet birikimi ve entegrasyon ayrı;** entegrasyon tek yerde yapılır.
- [ ] **Tick sırası:** komutlar → ızgara → kuvvetler → entegrasyon → difüzyon;
      testle kilitlenir.
- [ ] **Render `SpriteGPULayer` ile** (tek instanced draw call);
      `scale = worldUnits / textureSizePx`.
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

## Kapatılanlar (2026-09-10 Denetim Düzeltmeleri)

- [x] **[P2] RNG 0-durumu geri yükleme:** `setState` içindeki 0'ı fallback seed ile ezen mantık kaldırıldı; snapshot aktarımı 0 durumunda tam determinizmle korundu (`rng.ts`, `rng.test.ts`).
- [x] **[P2] Sahne DESTROY yaşam döngüsü:** `LifeScene`'e `SHUTDOWN` yanında `DESTROY` olay dinleyicisi eklendi; doğrudan yok edilmede HUD/prompt sızıntısı önlendi (`LifeScene.ts`, `lifeScene.test.ts`).
- [x] **[P2] Android geri hareketi:** `LifeExitPrompt` işaretçi türünden bağımsızlaştırıldı; DeX/fareli Android cihazlarda geri hareketi modal açılışı korundu (`LifeScene.ts`).
- [x] **[P3] HUD i18n aria-label:** Dil değişiminde `this.root`'un `aria-label` özniteliği güncellenerek erişilebilirlik paritesi sağlandı (`LifeHud.ts`, `lifeHud.test.ts`).
- [x] **[P3] Fullscreen senkronizasyonu:** `initialFullscreen` seçeneği ve sahne kurulumunda anlık tam ekran durumu aktarımı ile buton etiketinin ters başlaması çözüldü (`LifeHud.ts`, `LifeScene.ts`, `lifeHud.test.ts`).
- [x] **[P2] Simülasyon hız tavanı:** `resolveMaxStepsForSpeed` fonksiyonu ile 4x hızda 30/60 FPS ekranlarda adım kaybı engellendi (`world.ts`, `world.test.ts`).
- [x] **[P2] Headless CORE export haritası:** `@volstudio/core/math`, `grid`, `collections` alt yolları açılarak Node simülasyonlarında Phaser/window bağımsızlığı sağlandı (`core/package.json`, `core/src/math/index.ts`).
- [x] **[P2] ViewportManager serbest kamera:** `preserveCameraState` seçeneği ve kamera data bayrağı ile serbest gözlem kamerasının resize'da sıfırlanması önlendi (`ViewportManager.ts`, `viewportManager.test.ts`).
- [x] **[P3] DESIGN.md SoA/SpatialIndex:** SpatialIndex dokümantasyonu numeric handle/getter wrapper gerçeğiyle güncellendi (`DESIGN.md`).
- [x] **[P3] SQLite allow-execute:** Masaüstü ve mobil Tauri capability dosyalarına `sql:allow-execute` izni eklendi (`desktop.json`, `mobile.json`).
