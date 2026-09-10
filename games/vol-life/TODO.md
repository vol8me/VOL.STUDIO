# VOL.LIFE — iş listesi

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Zemin

- [ ] **`SimulationClock` `partialStep: 'defer'` ile kurulur;** seçim testle
      kilitlenir.
- [ ] **E2E:** `test:e2e` script'i ve `justfile` `e2e` tarifi, çizilecek içerik
      geldiğinde birlikte eklenir.
- [ ] **Ölçekleme bütçesi:** benchmark betiği ve `quality.json` →
      `scaling.<paket>.$measure` Adım 2'de yazılır.
- [ ] **`DESIGN.md` koda göre güncellenir:** §8 ölçekleme kapısı (runner
      genel), §9 cihaz ölçümü (vol-life `APPS`te) ve `src-tauri` (kurulu), §17
      `device-benchmark` maddesi.
- [ ] **`lifeHud.test.ts` dil testi yeniden yazılır:** başlığın yeniden
      yazıldığını iddia eder; `languageChanged` aboneliği kaldırıldığında
      düşer.

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
