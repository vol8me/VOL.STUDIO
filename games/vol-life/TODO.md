# VOL.LIFE — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Öncelikli — seçenekler ve ekran yönü

Platform kararı kök TODO'daki ortak yüklemden gelir; CORE ve tauri-v2
önkoşulları da orada. Yerleşim ve platform tablosu DESIGN §6'da, ekran yönü
kararı §9'da.

- [ ] **[P1] Sağ üst düğme kümesi platforma göre kurulsun.** Web: tam ekran ve
      seçenekler düğmesi; Windows/Linux ve Android çıktısı: yalnız seçenekler.
      Bugün `LifeScene` her platformda `showFullscreenToggle: true` geçiriyor
      (`6b82b2d`); Android'de ölçüldü (SM-G990B2, 2026-09-10): DOM tam ekranı
      görünür etki olmadan açılıyor ve geri tuşundan sonra açık kalıyor.
      Seçenekler düğmesi (`IconButton`, ayar simgesi) her platformda köşede aynı
      yerde durur; tam ekran yalnız web'de onun soluna eklenir. Konum tek bir
      flex kümesinden gelir, platforma göre koordinat yazılmaz (bugün
      `.vol-life-hud__fullscreen` tek başına mutlak konumlu). Düğme UI kökünün
      içine kurulan bir `Popover` (`bottom-end`) açar; Escape ve Android geri
      tuşu onu kapatır. Android'de DOM tam ekranı kurulmaz; masaüstünde F11
      native pencereye gider (görüntü kipi maddesi). Kapanır: `LifeScene` testi
      kümeyi üç platformda sınar; tarayıcıda iki düğme, telefonda dikey ve
      yatayda tek düğme ekran görüntüsüyle doğrulanır.
- [ ] **[P1] Dikey / yatay seçimi eklensin.** Seçenekler panelinde CORE
      `SegmentedControl`; etiketler tr/en. Android'de seçim native uygulanır:
      WebView'ın `screen.orientation.lock()`u cihazda hem normalde hem DOM tam
      ekranında `NotSupportedError` veriyor (SM-G990B2, Android 16, WebView 152).
      Tercih native tarafta saklanır ve `MainActivity` açılışında uygulanır;
      sayfa yüklendikten sonra uygulanırsa her açılışta ekran bir kez döner. Web
      ve masaüstünde kontrol pasiftir, ekranın o anki yönünü gösterir ve yön
      değişince güncellenir. Android isteği uygulamazsa (en dar kenarı 600dp ve
      üstü ekran, DeX) seçim gerçek yöne döner; Android TV'de pasiftir. Yön
      değişimi simülasyonu sıfırlamaz (`configChanges` `orientation` taşıyor) ve
      kamera bakılan noktayı korur. Varsayılan dikey, aile `userPortrait` /
      `userLandscape` (DESIGN §9). Kapanır: manifest başlangıcı varsayılanla
      aynı olur ve drift testi kilitler; platform matrisi ve istek
      uygulanmadığında gerçek yöne dönüş testle sınanır; telefonda iki seçim,
      telefon çevrilince kilidin tutması ve kapatıp açınca tercihin geri gelmesi
      ekran görüntüsüyle doğrulanır.
- [ ] **[P1] Masaüstünde görüntü kipi seçeneği eklensin.** Windows/Linux
      çıktısında tam ekran düğmesi yok; seçenekler panelinde pencere / tam ekran
      seçimi olur (vol-hell deseni; iki seçenek olduğu için `SegmentedControl`).
      Web ve Android panelinde bu seçenek yer almaz. Bugün `LifeScene` F11'i DOM
      tam ekranına bağlıyor (`FullscreenController`, `onToggleRequest` yok);
      masaüstünde F11 native pencereyi değiştirir ve pencere yöneticisinden
      gelen değişim seçeneğe yansır. Tercih `SaveManager` ve `TauriStoreAdapter`
      ile saklanıp açılışta uygulanır; VOL.LIFE'ta henüz `SaveManager` yok.
      Uygulama mantığı vol-hell'den kopyalanmaz (kök TODO). Kapanır: kip
      değişimi, F11 ve dış değişim testle sınanır; Linux masaüstü derlemesinde
      elle doğrulanır.

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
- [ ] **[P2] `runtime/sim` sınırı testle kapılansın.** DESIGN §12 bu sınırı
      pazarlıksız sayıyor ama hiçbir test ya da betik `src/runtime/sim/`
      importlarını denetlemiyor. Kapanır: `sim/` Phaser'ı, `scene/`, `ui/`,
      `render/` katmanlarını ya da kök `@volstudio/core` barrel'ını (Phaser'a
      bağlı modülleri yeniden ihraç ediyor, DESIGN §11) import ederse düşen bir
      test yazılır ve bilerek bozulmuş bir importla sınanır.
- [ ] **[P3] Tauri izinleri en az yetkiye insin.** Frontend yalnız
      `TauriWindowAdapter`ı (`exit_application`) kullanıyor; `store:default`,
      `sql:default` ve `6b82b2d`de eklenen `sql:allow-execute` hiç
      kullanılmıyor (vol-hell ve vol-arachnid'de `allow-execute` yok). Kapanır:
      kalıcılık gelene kadar üçü masaüstü/mobil yetkilerinden ve üretilen
      şemadan kalkar; masaüstü görüntü kipi maddesi önce kapanırsa `store`
      masaüstünde kalır; cihazda açılış ve çıkış onayı doğrulanır.

## Adım 1 — dünya substratı

- [ ] **Saat:** `SimulationClock` `partialStep: 'defer'` ile kurulur ve seçim
      testle kilitlenir. Canlı dünya 1× koşar ve hız çarpanı almaz (DESIGN §1);
      `resolveMaxStepsForSpeed` yalnız tekrar kipinde (Adım 8) bağlanır.
- [ ] **Tempo zamanlayıcısı:** DESIGN §11'deki tempo tablosu tek bir
      deterministik zamanlayıcıda uygulanır; her sistem duvar saatinden değil
      tick sayısından koşar. İlk tüketici difüzyondur. Kapanır: 60 tick'te
      10 Hz'lik sistemin tam 10 kez koştuğu test.
- [ ] **`FieldSet`:** `flow` (iki bileşen), `nutrient`, `light`,
      `temperature`, `disturbance`; `Float32Array` paralel diziler, alan başına
      nesne yok. Dış girdinin adı `energy` değil `light`tır (DESIGN §2).
- [ ] **Difüzyon:** çözünürlük ve tempo bu makinede ölçülerek seçilir (512²
      kademeli ve 256² tam güncelleme karşılaştırılır); çözünürlük 2'nin
      kuvvetidir çünkü alan dokusu tekrarlı örneklenir (WebGL1, DESIGN §2);
      ölçülmeden bütçe yazılmaz.
- [ ] **Çift doğrusal örnekleme:** alan değeri parçacığın konumunda okunur,
      hücre merkezine yuvarlanmaz.
- [ ] **Kaynak tohumlama ve yenilenme:** besin açılışta tohumdan tohumlanır ve
      `light` girdisiyle tavana doğru yenilenir; `light` tohumdan türeyen,
      yavaşça kayan yumuşak kaynaklardır (DESIGN §2). Kapanır: aynı tohum aynı
      alanları verir; kaynaklar kaydıkça zenginleşen ve fakirleşen bölgeler
      ekranda görülür.
- [ ] **Toroidal sarma:** kenar `worldConfig.sizeUnits`; alan indeksinde ve
      mesafe hesabında tutarlı. Komşuluk mesafesi özellik testiyle kilitlenir:
      x=1 ile x=1023 arası 2 birimdir, 1022 değil.
- [ ] **[P1] Dünya kamerası:** açılışta dünyayı sığdırır; sürükleme, tekerlek
      ve iki parmakla gezilir; uzaklaşma bir dünya genişliğiyle sınırlıdır ve
      görüntü kameraya göre sarılır (DESIGN §2); resize ve yön değişiminde
      bakılan nokta ve yakınlaştırma korunur (`preserveCameraState`). Zemin'deki
      viewport maddesine bağlıdır. CORE'da Phaser dünya kamerası için bu
      denetleyici yok: `CanvasViewportController` editör tuvalidir (sol sürükleme
      pan değildir), `PinchZoomController` bir DOM elemanını sarar; vol-hell ve
      vol-arachnid'de de yok. Mekanizma oyun kelimesi bilmediği için CORE'a
      girer. Kapanır: CORE denetleyicisi testle sınanır ve vol-ui'de sergilenir;
      VOL.LIFE'ta masaüstünde ve telefonda gezinme ekran görüntüsüyle
      doğrulanır.
- [ ] **Alan görüntüsü:** varsayılan görünümde alanlar çok hafif çizilir ve
      dünya çoğunlukla karanlık kalır; katman görünümü seçili alanı tam
      kontrastla gösterir (DESIGN §6). Katman görünümünü oyuncuya açan düğme
      Adım 7'de gelir. Kapanır: iki görünüm tarayıcıda ve telefonda ekran
      görüntüsüyle doğrulanır; alan dokusunun yüklenme süresi ölçülüp
      `DESIGN.md`ye yazılır.
- [ ] **Determinizm testi başlar:** aynı tohum ve aynı tick sayısı alan
      dizilerini bayt bayt aynı verir; ara noktada alınan kopyadan devam aynı
      sonuca varır (DESIGN §8). Sonraki her adım bu testi kendi durumuyla
      genişletir.
- [ ] **E2E:** ilk görsel substratla birlikte gerçek WebGL Playwright testi
      (DPR 2 ve WebGL kapalı senaryosu dahil); `test:e2e` script'i ve
      `justfile` `e2e` tarifi birlikte eklenir.

## Adım 2 — parçacık yaşamı

- [ ] **Kuvvet çekirdeği:** tür sayısı ve etkileşim matrisi `config/`
      verisidir; yakın mesafede her türe ortak itme, orta menzilde matrise bağlı
      çekme ya da itme, kesme yarıçapı, sürtünme ve hız tavanı; mesafe
      toroidaldir. Matris simetrik değildir (DESIGN §3: altı türde 36 boyut).
      Kapanır: kesme, itme ve toroidal kenar birim testleri ve iki parçacıklı
      senaryolar.
- [ ] **SoA `ParticleStore`:** sabit boyutlu paralel `Float32Array` /
      `Uint8Array`, parçacık başına nesne yok. Parçacık silinmez (madde korunur,
      DESIGN §3); indeks kimliktir. Kuşaklı `Uint32` handle organizma kaydına
      aittir (Adım 4). CORE `SpatialIndex`i nesne kimliğine bağlı olduğu için
      kullanılmaz.
- [ ] **Uzamsal hash:** counting sort, `Map` yok, sıcak yolda tahsis yok.
- [ ] **Kuvvet birikimi ve entegrasyon ayrı;** entegrasyon tek yerde yapılır.
- [ ] **Tick sırası:** komutlar → ızgara → kuvvetler → entegrasyon → difüzyon
      (kendi temposunda); testle kilitlenir.
- [ ] **Başlangıç yerleşimi:** tür ve konum tohumdan gelir; determinizm testine
      parçacık dizileri eklenir.
- [ ] **Dünya paleti:** tür renkleri `config/` verisidir ve `VOL_COLORS`tan
      ayrıdır (DESIGN §6).
- [ ] **[P1] Render adaptörü:** simülasyon dizilerini okuyan tek arayüz;
      parçacık kameraya en yakın kopyasında çizilir (DESIGN §2). Parçacık sayısı
      sabit olduğundan render üyesi eklenip silinmez; `removeMembers` indeksleri
      kaydırdığı için kullanılmaz. Kapanır: ilk yol 100 / 1.000 / 5.000
      parçacıkta kare süresi p50/p95 ile ölçülür ve DESIGN §11'e yazılır; yol
      değişimi yalnız adaptörü değiştirir.
- [ ] **Çizim boyutu dünya birimiyle kilitlenir:** ekrandaki boyut dünya birimi
      çarpı kamera yakınlaştırmasıdır; `SpriteGPULayer` seçilirse
      `scale = worldUnits / textureSizePx`. DPR 1/2/3'te testle kilitlenir
      (DESIGN §14, ders 1).
- [ ] **Ölçekleme bütçesi:** benchmark betiği ve `quality.json` →
      `scaling.<paket>.$measure`; ölçülen çekirdek uzamsal hash ve kuvvet
      adımıdır, girdi dört katına çıkınca süre oranı kapılanır.

## Adım 3 — matris araması

- [ ] **Tek kare küme tespiti:** uzamsal hash üstünde komşuluk; kümenin tür
      katmanlaşmasını (çekirdek türü içte, zar türü dışta) ölçer. Metrik kümeyi
      tanımadan zar-çekirdek yapısını ölçemez; kareler arası kimlik Adım 4'te.
      Kapanır: tek küme, iki küme ve dağınık sentetik yerleşimlerle test.
- [ ] **"İlginç" metriği:** çok bileşenlidir (kararlı yapı sayısı, yapı başına
      katmanlaşma, kalıcılık süresi, hareketlilik) ve tek skalara indirilmez;
      ağırlıklar `config/` verisidir (DESIGN §6, §8). `maxCellOccupancy` yeterli
      değil.
- [ ] **Tarama altyapısı:** Phaser'sız koşucu; matris uzayı deterministik
      tohumlarla taranır, tohumlar sürümlenmiş bir korpustur (DESIGN §8); sonuç
      `src/config/` altında veri olarak saklanır.
- [ ] **Adaylar gözle doğrulanır:** en iyi adaylar tarayıcıda açılıp izlenir;
      metrik görüntüyle çürürse metrik değişir (DESIGN §14, ders 3).
- [ ] **Alan kuvvetleri morfoloji oturana kadar kapalı kalır.**

## Adım 4–10

Kalemler önceki adım ekranda doğrulandığında yazılır; kilometre taşları
[DESIGN.md](DESIGN.md) §13'te. Önceden verilmiş kararlar DESIGN'dadır: madde
korunur, ölüm dağılmadır, kimlik üye örtüşmesiyle izlenir (§3); tüketimin
sunumu ve katman görünümü (§6). Canlı dünya hızlandırılmaz; zaman denetimi yalnız tekrardadır (§1, §7).

## Adım 11 — ölçek

- [ ] **[P1] Render yolu yoğun ölçekte benchmark'la seçilsin.** "Tek geçerli
      yol: `SpriteGPULayer`" hükmü kanıtın önündeydi; Phaser 4.2.1 kaynağı sık
      tampon güncellemesini pahalı sayıyor (`SpriteGPULayer.js` JSDoc), VOL.LIFE
      ise konumu ve rengi her adımda CPU'da değiştiriyor. Kapanır: Adım 2'nin
      adaptörü arkasında, CPU'da güncellenen 10k/50k/100k/250k parçacık için
      `SpriteGPULayer` (dilim güncellemeli) ve en az bir alternatif; CPU
      güncelleme, GPU yükleme ve kare süresi p50/p95 ölçülür, karar DESIGN
      §11'e yazılır.
- [ ] **Worker havuzu değerlendirilir:** tempo bütçesi yetmezse sıradaki yol
      budur (DESIGN §11). `SharedArrayBuffer` tarayıcıda çapraz köken yalıtımı
      (COOP/COEP başlıkları) ister; web yayınında ve Tauri'de bu başlıkların
      verilebildiği ayrıca doğrulanır. Kapanır: ölçümle verilen karar DESIGN
      §11'e yazılır.

## Her adımda

- Adım gerçek tarayıcıda görüntüyle kapanır.
- Kabuğa ya da sunuma dokunan adım Android cihazda açılıp ekran görüntüsüyle
  doğrulanır (DESIGN §9).
- Phaser API'si kaynaktan doğrulanır; `camera.setBounds`un beşinci argümanı
  (`centerOn`) verilmezse pencereden küçük dünya sol üste yapışır.
- Mantık Phaser sahnesinde birikmez.
- Ölçmeden optimize edilmez; ölçüm kaynak yorumuna değil `DESIGN.md`ye yazılır.
- Kapsam eşiği düşürülerek kapı geçilmez; eşikler `quality.json`da.
- Kamera Adım 1'de kurulur; sonraki hiçbir adım resize ya da yön değişiminde
  bakılan noktayı ve yakınlaştırmayı sıfırlamaz.

## Kapatılanlar

### 2026-09-10 — rastgelelik sözleşmesi

- [x] **[P3] `createSimRandom(0)` ayrı bir dizi üretiyor;** sözleşme CORE ile
      aynı (0 geçerli, 32 bite indirgeme, sonlu olmayan tohum ve durum
      reddediliyor); parite testi sınır tohumlarını kapsıyor.

### 2026-09-10 — tasarım kararları ve belge güncellemesi

- [x] **[P2] `DESIGN.md` koda göre güncellendi.** §16 yeniden ölçüldü (42 test;
      eşik 87/87/83/86; gzip app 29 / vendor 345,1 / css 17 KB); klasör ağacı
      `ui/` ve `src-tauri/`ı gösteriyor; `WebGLRenderer` satır atıfları API
      düzeyine çevrildi; `SpriteGPULayer` başlığı ve `graphics.ts` yorumu
      hipotez diliyle yazıldı; §13'teki "Adım 0 tamamlandı" hükmü kaldırıldı.
- [x] **Tasarım kararları `DESIGN.md`ye yazıldı:** madde korunur ve enerji
      organizmanın deposudur (§3); dış girdi `light` ve toroidal görüntü kuralı
      (§2); tüketimin sunumu, katman görünümü ve kabuk yerleşimi (§6); ekran
      yönü, varsayılan dikey ve `user*` ailesi (§9).

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
      (`initialFullscreen`). Düğmenin dokunmatikte görünmesi Öncelikli bölümde
      yeniden açıldı.
- [x] **[P2] `resolveMaxStepsForSpeed` yazıldı ve test edildi.** Canlı dünya
      hızlandırılmadığı için yalnız tekrar kipinde (Adım 8) bağlanacak.
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
