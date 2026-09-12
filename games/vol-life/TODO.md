# VOL.LIFE — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Zemin

- [ ] **[P1] Uygulama paket bütçesi Adım 1 başlamadan neredeyse tükendi.**
      Ölçüldü (`node scripts/bundle-report.mjs`, 2026-09-12):
      `games/vol-life: app 37,6 KB` / bütçe `40 KB` (gzip, %94 doluluk).
      Adım 1 henüz simülasyon kodu (`FieldSet`, difüzyon, render adaptörü)
      eklemedi — §16 bunu "KASITLI OLARAK yazılmadı" diye kaydediyor; bugünkü
      37,6 KB tamamen kabuğun (seçenekler çekmecesi, HUD, tercih deposu,
      yön/görüntü kipi köprüleri). Kalan pay 2,4 KB, Adım 1'in ilk satırı
      (`FieldSet` + difüzyon) bile muhtemelen bunu aşar. Kapanır: Adım 1
      başlamadan `app` bütçesi ya gerçek bir tavan olarak yeniden ölçülür
      (kabuk + tahmini simülasyon ağırlığına göre) ya da bütçe aşımı riski
      DESIGN §16'ya açıkça yazılır ve bir eşik kararı verilir; karar
      gerekçesiyle kayda geçer.
- [ ] **[P1] Kabuk hiçbir gerçek tarayıcı/WebGL testiyle kanıtlanmıyor.**
      `bootstrap.test.ts` `createVolGame`i tamamen `vi.mock`lar
      (`Promise.resolve({ events, canvas: document.createElement('canvas') })`);
      paketin 14 test dosyası da `jsdom`da koşar (`vitest.config.ts`), hiçbiri
      gerçek Phaser, gerçek WebGL bağlamı ya da gerçek tarayıcı kurmaz.
      vol-hell'in `tests/e2e/boot.spec.ts`i (gerçek Chromium, `vite preview`,
      kanvas boyutu + menü + tema token'ı + konsol hatası yok) VOL.LIFE'ta
      karşılıksız; `justfile`ın `e2e:` tarifi VOL.LIFE'ı hiç çağırmıyor ve
      `workspace-contract.mjs` bunu bir paketin eksik kapısı olarak
      YAKALAMIYOR. Bu, Adım 1'in kendi E2E maddesinden (aşağıda — dünya
      substratının DPR/WebGL-kapalı senaryosu) AYRIDIR: o madde henüz
      yazılmamış simülasyonu kapsayacak, bu madde bugün GÖNDERİLMİŞ kabuğu
      (seçenekler çekmecesi, HUD, tam ekran, ekran yönü) kapsar. Kapanır:
      vol-hell deseninde bir `boot.spec.ts` eklenir (kanvas görünür ve ölçülü,
      seçenekler düğmesi görünür, tema token'ı dolu, konsol hatası yok);
      `test:e2e` script'i ve `justfile e2e:` tarifine paket eklenir.
- [ ] **[P2] Ekran yönü "desteklenir" durumu çalışma anında bayatlıyor.**
      `OrientationPreference.isInteractive()` yalnız `load()`da BİR KEZ okunan
      `this.interactive`i döner; `LifeScene.create()` bunu sahne kurulurken tek
      seferlik okuyup panele geçirir. Native tarafta `isSupported()`
      (`OrientationPlugin.kt`) `activity.isInMultiWindowMode`i her çağrıda
      YENİDEN ölçer — gerçek durum dinamik ama JS tarafı onu dondurup saklıyor.
      Oyuncu açılıştan sonra bölünmüş ekrana/DeX pencere kipine girip çıkarsa
      (ya da tersi) seçenekler panelindeki yön kontrolü YANLIŞ etkin/pasif
      kalır: destek giderken kontrol hâlâ tıklanabilir görünür (`select()`
      cihazda sessizce hiçbir şey yapmaz, yalnız görüntü yönünü bekler) ya da
      destek geri gelince kontrol gereksiz yere pasif kalır. Kapanır:
      Android'de pencere/mod değişimini (native olay ya da görünürlük
      dönüşünde yeniden `getState()` sorgusu) izleyen bir yol eklenir;
      `OrientationPreference` yeni durumu `subscribe()` üzerinden panele
      taşır; cihazda bölünmüş ekrana giriş/çıkışla doğrulanır.
- [ ] **[P2] `applySaved()` çalışma anı yön sözleşmesinden farklı davranıyor.**
      `OrientationPlugin.setOrientation()` isteği yalnız `isSupported()`
      doğruyken (`!television && !isInMultiWindowMode`) pencereye uygular;
      `OrientationStore.applySaved()` ise `MainActivity.onCreate`da bu
      kontrolü YAPMADAN `requestedOrientation`ı koşulsuz yazar (bkz.
      `OrientationStore.kt:33-37`). Android TV'de ya da bölünmüş ekranda
      başlayan bir soğuk açılışta kayıtlı tercih varsa, çalışma anı kuralının
      izin vermeyeceği bir yön isteği yine de pencereye uygulanmış olur.
      Kapanır: `applySaved()` `isSupported()`le aynı kontrolü paylaşır (ortak
      bir yardımcıya taşınır) ya da TV/çoklu pencerede kaydı hiç uygulamaz;
      iki yolun aynı kuralı kullandığını kilitleyen bir test eklenir.
- [ ] **[P3] Açılış zinciri geç hatada oluşturulmuş oyunu geri almıyor.**
      `bootstrap.ts` tek `try/catch` içinde `createVolGame()`den SONRA da
      masaüstünde `DisplayModeController` kuruyor (`controller.start()`); bu
      adım (ya da gelecekte eklenecek bir adım) fırlatırsa `catch` yalnız
      `showFatalError()` çağırır — halihazırda oluşturulmuş `Phaser.Game`
      (kanvas, WebGL bağlamı, RAF döngüsü) hiç `destroy()` edilmez ve hata
      katmanının ALTINDA çalışmaya devam eder. Nadir bir yol (yalnız
      masaüstünde, oyun kurulduktan SONRAKİ bir adım fırlatırsa) ama kod
      yorumunun "Açılış zincirinin TAMAMI tek korumadadır" iddiasını tam
      karşılamıyor. Kapanır: `catch` bloğu `game` değişkenine erişebiliyorsa
      `game.destroy(true)` çağırır; oyun kurulduktan sonraki bir hatayla
      bilerek sınanan bir test eklenir.
- [ ] **[P3] Tercih kaydı başarısızlığı yalnız loglanıyor.**
      `LifePreferences.update()` bellek durumunu ve dinleyicileri HEMEN
      günceller (kullanıcı arayüzü "kaydedildi" gösterir), sonra
      `saveManager.save()`i sıraya alır; yazma başarısız olursa yalnız
      `console.warn` yazılır — kullanıcıya görünür hiçbir geri bildirim
      gitmez. Uygulama bu oturumda kapanmadan yeniden başlarsa (ör.
      Android'de arka plana atılıp sistem tarafından öldürülme) bellek
      durumu diskle HİÇ eşleşmez ve tercih sessizce kaybolur. Kapanır: yazma
      başarısız olduğunda kullanıcıya görünür bir uyarı çıkar ya da yeniden
      deneme kuyruğa girer; davranış DESIGN'a yazılır ve testle sınanır.
- [ ] **[P2] Organizma fenotipi → ses ailesi eşleşmesi VOL.LIFE'ın kendi
      çözümleyicisinde yaşamalı, `@volstudio/audio-synth`ta değil.**
      `devtools/audio-synth` paketi Dalga 5'te ("generic SoundFamily
      üretimi", bkz. `devtools/audio-synth/TODO.md`) domain-agnostik bir
      `SoundFamilyBank` publish formatı kazanacak — bank yalnız generic
      semantic variant metadata (id, tags/state, program hash, descriptor
      özeti) taşır, organizma/fenotip kavramını BİLMEZ. VOL.LIFE'ın
      simülasyonu (kuvvet çekirdeği/tür matrisi, Adım 2-3) çalışma anında bir
      organizmanın (tür kimliği, boyut, davranış durumu gibi) hangi bank
      variant'ına karşılık geldiğine karar vermek zorunda; bu eşleşme mantığı
      `@volstudio/audio-synth`a SIZDIRILMAZ (paket sınırı, kök `CLAUDE.md`
      §Kırmızı Çizgiler madde 1) — VOL.LIFE kendi `runtime`/`sim` katmanında
      (ya da ayrı bir `runtime/audio` alt katmanında) ince bir
      fenotip→variant çözümleyicisi taşır. Bu madde henüz uygulanabilir
      değildir: `SoundFamilyBank` formatı yayınlanmadan (Dalga 5 kapanmadan)
      somut bir çözümleyici yazılamaz; VOL.LIFE'ın kendi ses ihtiyacı da
      DESIGN'da henüz karara bağlanmadı. Kapanır: `SoundFamilyBank`
      yayınlandıktan ve VOL.LIFE'ın ses gereksinimi DESIGN'a yazıldıktan
      sonra, `runtime/sim` sınır testinin (`simBoundary.test.ts`) izin
      verdiği bir katmanda organizma durumunu bank variant kimliğine çeviren
      saf bir fonksiyon eklenir; `audio-synth` paketi bu fonksiyonu ne
      import eder ne de organizma/fenotip tipini bilir.

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

### 2026-09-11 — seçenekler çekmecesi, ekran yönü, görüntü kipi ve zemin

- [x] **[P1] Seçenekler çekmecesi (kullanıcı isteği).** Dişli düğmesi CORE
      `Sheet`ini açıyor: sağdan, en az yarım genişlik, içerik kendi içinde
      kayıyor; dikey telefonda tam genişlik (kullanıcı kabul etti). Ölçüldü:
      masaüstü tarayıcıda 1280 px'in 640'ı, yatay telefonda 832 px'in 420'si.
      Scrim, X, Escape ve Android geri tuşu kapatıyor; telefonda geri tuşu önce
      çekmeceyi kapatıyor, çıkış onayı açılmıyor. Linux masaüstünde Escape
      çekmeceyi kapatıp odağı dişliye döndürüyor. Eski `Popover` paneli kalktı.
- [x] **[P1] Dil seçeneği (kullanıcı isteği).** TR/EN, CORE `Select` ile;
      `SaveManager` üzerinden kalıcı. Telefonda İngilizce seçilince başlık ve
      etiketler değişti, yeniden açılışta dil korundu; tarayıcıda yeniden
      yüklemede korundu.
- [x] **[P1] Kare hızı seçeneği (kullanıcı isteği).** CORE `FpsMeter`,
      varsayılan kapalı, en fazla 250 ms'de bir yazıya çevrilir; tercih kalıcı.
      Telefonda "60 FPS" görüldü ve yeniden açılışta açık kaldı.
- [x] **[P1] Dokunsal geri bildirim seçeneği (kullanıcı isteği, vol-hell
      deseni).** Satır yalnız titreşim motoru olan cihazda görünür; varsayılan
      kapalı ve kalıcı; seçenek değişimleri `select` deseniyle titrer. Telefonda
      görünür ve yeniden açılışta açık kaldı; Linux Tauri'de ve masaüstü
      Chromium'da gizli (kök TODO'daki yetenek düzeltmesi).
- [x] **[P1] Sağ üst düğme kümesi platforma göre kuruluyor.** `LifeScene`
      testi kümeyi üç platformda sınıyor. Tarayıcıda iki düğme (tam ekran ve
      seçenekler); telefonda dikey ve yatayda ve Linux masaüstünde yalnız
      seçenekler (ekran görüntüleri).
- [x] **[P1] Dikey / yatay seçimi eklendi.** Seçim `vol-orientation`
      köprüsüyle native uygulanıyor; manifest başlangıcı `userPortrait` ve drift
      testi kilitliyor; platform matrisi ve istek uygulanmayınca gerçek yöne
      dönüş testte. Telefonda iki seçim, sistem tersini isterken kilidin tutması
      ve yeniden açılışta tercihin gelmesi ölçüldü (`ROTATION_90` /
      `ROTATION_0`); web ve masaüstünde kontrol pasif.
- [x] **[P1] Masaüstünde görüntü kipi seçeneği eklendi.** Çekmecede pencere /
      tam ekran (`SegmentedControl`); tercih `LifePreferences` ve
      `TauriStoreAdapter` ile kalıcı, uygulama ortak `DisplayModeController`dan.
      Kip değişimi, F11 ve dış değişim testte. Linux'ta (KDE Plasma) girdisiz
      ölçüldü: tercih tam ekranken uygulama tam ekran açılıyor, KWin'in pencere
      ve tam ekran değişimi tercihe yansıyor (kök TODO,
      `window_fullscreen_state`). Çekmeceden seçim ve F11 kullanıcı tarafından
      elle doğrulandı.
- [x] **[P1] `LifeScene` viewport sözleşmesine bağlandı.** `create()`
      `applyVolViewport(this)` çağırıyor; DPR 1/2/3'te kamera zoom'unun
      rasterleme çarpanına eşit olduğu `lifeScene.test.ts`te sınanıyor.
- [x] **[P2] Açılış hata sınırı kuruldu.** Açılış zinciri tek korumada, i18n'li
      `showFatalError` yüzeyi `role="alert"` taşıyor. WebGL kapalı Chromium'da
      (`--disable-webgl --disable-3d-apis`) "VOL.LIFE başlatılamadı" başlığı ve
      neden görünüyor.
- [x] **[P2] `runtime/sim` sınırı testle kapılandı.**
      `tests/governance/simBoundary.test.ts` Phaser'ı, sunum ve uygulama
      katmanlarını, kök CORE barrel'ını ve native kabuğu yasaklıyor; bilerek
      bozulmuş sekiz import biçimini yakalıyor.
- [x] **[P3] Tauri izinleri en az yetkiye indi.** `sql:default` ve
      `sql:allow-execute` kalktı; kalıcılık geldiği için `store:default` iki
      yetkide kaldı; masaüstünde ek olarak `core:window:allow-set-fullscreen`,
      mobilde `vol-orientation:default`. Telefonda açılış, tercih kalıcılığı ve
      çıkış onayı doğrulandı.

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
