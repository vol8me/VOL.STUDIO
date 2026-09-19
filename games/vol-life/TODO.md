# VOL.LIFE — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Sıra [DESIGN.md](DESIGN.md) §13'ü izler; repo geneli işler kök
[TODO.md](../../TODO.md)'de.

## Zemin

- [ ] **[P2] Organizma fenotipi → ses ailesi eşleşmesi VOL.LIFE'ın kendi
      katmanında yaşamalı.** `SoundFamilyBank` yayımlanmadan ve LIFE ses
      gereksinimi kararlaştırılmadan kod yazılmaz. `audio-synth` organizma,
      fenotip veya oyun durumunu bilmez.
- [x] **[P2] Büyük dünya depolama backend'i ölçülsün.** `LifeWorldStore`
      portu korunur; 512 aktif madde + active mask + stable ID + reservoir
      snapshot boyutu ölçülür. Gerekirse native binary dosya ve web
      IndexedDB/OPFS; migration, last-known-good ve i18n'li uyumsuz kayıt
      yüzeyi birlikte uygulanır. _Kapatıldı 2026-09-17/18 (Z2): Boyut dört hedefte
      ölçüldü (Node 22, Chromium masaüstü, Lenovo TB350FU, Samsung SM-G990B2). Ham
      binary 1.846.401 bayt (1,761 MB) tüm platformlarda bayt düzeyinde eşit
      kanıtlandı; gzip+base64 taşınan yük ~0,473–0,486 MB (~500 KB) ile localStorage
      5 MB kotasının onda birinde kaldı; native tarafta dosya depolaması kota
      sorunu taşımıyor. Kodlama süresi 113–234 ms. Ayrıntı DESIGN §7'de._

## Adım 1 — dünya substratı

Açık madde yok. Katman görünümü maddesi 2026-09-17'de Adım 7'deki katman
maddesiyle birleştirildi; kapatılan Adım 1 maddeleri Kapatılanlar bölümünde.

## Adım 2 — Particle Substrate v2

- [x] **[P0] Eski production fiziği yalnız negatif baseline olarak izole
      edilsin.** V2 default oldu; triangular kernel yalnız benchmark fixture'ında.
- [x] **[P0] `WorldDomain` ve deterministic `HabitatSDF` kurulsun.** Organik
      SDF, pozitif inside, sıfır edge, negatif Void; invariant test edilir.
- [x] **[P0] Field solver habitat maskesine taşınsın.** Void hücreleri kaynak
      üretmez; SDF yüzeyinde no-flux; karşı kenar komşuluğu ve wrap yok.
- [x] **[P0] `ParticleStore` capacity/active/stable-ID sözleşmesi kazansın.**
      512 kapasite; deactivation diziyi kaydırmaz; inactive slot hash/force/
      morphology/render yollarına giremez; slot yeniden kullanılırsa yeni ID.
- [x] **[P0] `VoidSink` ve `MatterReservoir` ayrı sorumluluk olsun.**
      Güvenli alanda Void kuvveti sıfır; dar tidal fringe; SDF crossing
      geri dönüşsüz deactivation + rezervuar muhasebesi. Bounce/clamp yasak.
- [x] **[P0] Generalized multi-band `PairForceKernel` yazılsın.** Hard-core,
      near/mid/far lobe, cutoff, yönlü asimetri; 6×6 strength + 3×3 role/range.
- [x] **[P0] `InitialMatterSeeder` 512 aktif maddeyi lokal yamalara
      dağıtsın.** Patch+cloud dağılımı; uniform soup yasak; genom seed'den bağımsız.
- [x] **[P0] Spatial hash ve integrator aktif maddeye taşınsın.** Brute-force
      oracle ile parite; pair kaçırmama, inactive dışlama, determinism test edilir.
- [x] **[P0] Habitat/Void sunumu kare borderı tamamen kaldırsın.** Fizik SDF
      ile render aynı domain'i tüketir; organik fade, düşük frekanslı animasyon.
- [x] **[P0] Void ölüm sunumu simülasyondan ayrıştırılsın.** Stretch → color
      drain → shrink/smear → fade; sunum hayaleti canlı listeye dönemez.
- [x] **[P1] Adım 2 glyph'leri salt render verisi olarak kilitlensin.** Yalnız
      serbest madde, velocity uzaması ve Void fringe/ölüm biçimleri; glyph
      collision radius ve kuvveti değiştiremez (test). Membrane/core Adım 4,
      tail Adım 6, damage/infection Adım 9'da açılır (DESIGN §6); Adım 2 sahte
      rol enum'u yazmaz.
      _Kapatıldı 2026-09-17 (18437fb): 120 durumda bütün `ParticleStore` dizileri render öncesi/sonrası bayt düzeyinde aynı; kuvvet tamponları yazılmıyor, uzama config tavanını aşmıyor._
- [x] **[P0] Kamera yeni habitat/Controlled-Void domain'ine taşınsın.** Max
      zoom-out bütün habitatı ve anlamlı Void margin'ini gösterir.
- [ ] **[P1] Kamera aday ölçüleri cihazda karşılaştırılsın.** Config kararı
      mouse/touch ekran görüntüsü ve kullanıcı hissiyle verilir.
      _2026-09-17: üç aday ölçüsü (`dengeli`/`cevik`/`agir`) ve DEV seçici
      yazıldı (ae8a59b), aynı gün kamera işinin tamamı kullanıcı kararıyla geri
      alındığı için KALDIRILDI. Madde açık: kamera yeniden ele alındığında aday
      ölçüleri de yeniden tanımlanacak._
- [ ] **[P0] Kamera human acceptance yeniden açılsın.** Masaüstü mouse ve
      trackpad, Samsung S21 ve Lenovo tablette kullanıcı rahat bulmadan
      kapanmaz. Birim testleri ve özellik listesi insan kabulünün yerine
      geçmez.
- [ ] **[P1] 1536² rejiminin kamera sonuçları uygulansın (DESIGN §6).**
      Dünya 1024² → 1536² büyüyünce `fit:'contain'` kompozisyonu korur ama
      `cameraMaxZoomFactor = 3` dünya fit'ine bağlı olduğu için close-up
      kapasitesi ~%33 geriler. Ayrı işler: (a) maksimum yakın zoom dünya
      boyutundan ayrılır — görsel inceleme ölçeğine (birim/ekran-pikseli)
      bağlanır, 1536 için yaklaşık 4,5× karşılığı; (b) aktif drag sınırında
      sert clamp yerine azalan yumuşak direnç, iOS elastik bounce YOK;
      (c) modalite başına momentum — tek `panMomentumMs = 140` bugün
      mouse/touch/trackpad'e aynı uygulanıyor; touch kinetik, mouse neredeyse
      sıfır coast; (d) wheel → zoom ile trackpad scroll → pan ayrımı
      heuristikle çözülür (`ctrlKey + wheel` pinch sinyali), üç hedefte el
      testi şart; (e) orientation geçişinde `zoom / minZoom` oranı yerine
      ekrandaki FİZİKSEL organizma ölçeği korunur, viewport imkânsız
      kılıyorsa clamp; (f) `cameraVoidMarginRatio` 0,15/0,12/0,10 A/B'si
      kullanıcı seçer. Jitter'ın ikinci denemesi (coalesced events sürükleme
      konumu + release velocity) ve tap/drag jest tahkimi hazırlığı aşağıdaki
      v2.1 maddesinin kapsamına girer.
- [x] **[P0] Snapshot v2 domain state'ini taşısın.** V4 codec; habitat digest,
      active mask, stable ID, next ID, reservoir, Void sayaçları, adlandırılmış
      RNG akış tablosu ve kanonik pasif slot doğrulaması; i18n'li uyumsuzluk
      yüzeyi.
- [x] **[P1] 512 bütçesi gerçek hedeflerde ölçülsün.** Headless kernel p50/p95
      ölçüldü (§11); Chromium WebGL ve Android cihaz ölçümleri hâlâ gerekli.
      _Kapatıldı 2026-09-17 (D4): üç hedefte de ölçüldü. Chromium üretim
      derlemesi 62 sn — masaüstü viewport p50 4,70 ms / p95 16,40 ms, mobil
      viewport p50 7,50 ms / p95 17,80 ms (bu ortamda yazılım rasterleme; GPU
      ölçümü DEĞİL, öyle etiketlendi). Lenovo TB350FU (Android 14, debug APK,
      60 sn): 5244 kare, jank %2,56, p50 6 ms / p99 20 ms, kaçan vsync 3, PSS
      196 MB. Samsung SM-G990B2 (Android 16, aynı APK, 60 sn): 2965 kare, jank
      %0,24, p50 7 ms / p90 9 ms / p99 11 ms, kaçan vsync 0, GPU p99 3 ms, PSS
      198 MB (grafik 41,9 MB), çökme yok. Simülasyon payı da ölçüldü: masaüstü
      viewport'ta karenin ~%69'u fizik._
- [x] **[P0] Adım 2 kabulü.** Determinism, güvenli alan, crossing, fringe,
      aktif hash kanıtlandı; cihaz akıcılığı hâlâ gerekli.
      _Kapatıldı 2026-09-17/18: Cihaz akıcılığı üç hedefte de ölçüldü (Lenovo TB350FU,
      Samsung SM-G990B2, Chromium masaüstü); jank %0,24–%2,56 arasında; p50 6-7 ms.
      P1 kabul paketi hazırlandı (`$HOME/vol-life-kanit/kabul/P1-adim2-kabul.md`)._
- [x] **[P1] `FieldRenderer` doku yüklemesi Mali'de EGL image yeniden tahsisi
      tetikliyor.** Lenovo TB350FU'da ölçüldü (2026-09-16): logcat'te
      `MALI DEBUG BAD ALLOC from gles_texture_egl_image_get_2d_template`,
      saniyede ~12,4 kayıt.
      _Kapatıldı 2026-09-18: `FieldRenderer.render()` WebGL modunda `gl.texSubImage2D`
      ile doğrudan GPU üzerinde yerinde doku güncelleme yoluna geçirildi. `gl.texImage2D`
      kaynaklı yeniden tahsis çağrıları ortadan kaldırıldı; birim testi yazıldı
      (`FieldRenderer.test.ts`). Logcat'teki artık debug loglarının ise WebView
      kompozitörünün EGL swap döngüsünden kaynaklandığı CDP üzerinden no-op testiyle
      kanıtlandı._
- [ ] **[P0] Camera v2.1: Aktif input event jitter'ı render cadence'den
      ayrılsın.** Mevcut drag: pointermove event → camera position değiştir →
      apply state — event cadence'ine bağlı. Mouse eventleri düzensiz gelirse
      60 FPS olsa bile kamera mikro sıçramalar gösterir. Çözüm: eventlerde
      delta accumulator'a yaz, camera render/update frame'inde accumulated
      target'a geç. Ağır easing yapma — amaç input lag eklemek değil, event
      jitter'ını render cadence'den ayırmak. Mouse/touch/trackpad momentum
      ayrı normalize edilsin. Active drag world navigation limitinde soft
      resistance. Debug input trace recorder eklensin.
      _2026-09-17'de uygulandı (2a9c34a) ve AYNI GÜN KULLANICI KARARIYLA GERİ
      ALINDI: cihazda kamera kötü hissettirdi. Ölçüm doğruydu (kare başına 1,00
      uygulama) ama insan kabulü gelmedi; ölçüm insan kabulünün yerine geçmez.
      Kod 8b385ad davranışına döndü. Yeniden ele alınırsa önce kullanıcının
      elinde denenmeli, sonra ölçülmeli._
      _2026-09-19 ikinci deneme tasarımı (DESIGN §6): aktif sürükleme neredeyse
      birebir kalır; `getCoalescedEvents()` verisi bugün yalnız release hızını
      besliyor — sürükleme konumu için de kullanılır; filtreleme ağırlıklı
      release velocity üstünde. Ayrıca Adım 4/7 organizma seçimi geldiğinde
      tek parmak drag ile tap çatışacak: kamera mimarisi küçük hareket = tap /
      eşik aşımı = pan jest tahkimine bugünden izin vermelidir; eşik cihazda
      ayarlanır._
- [x] **[P0] Camera açılış ölçeği ECOSYSTEM olsun.** Mevcut: runtime başlangıçta
      `contain` ile bütün dünyayı gösterme eğiliminde — world ekranın ortasında
      küçük yaşam adası, etrafında dev siyah Void. Üç observation scale:
      WORLD (overview) → ECOSYSTEM (açılış) → ORGANISM → MICRO. Fiziksel dünya
      boyutu şimdi değiştirilmez — kamera algısını düzelt, fiziksel boyutu
      Step 3 sonucu üzerinden seç.

      _Kapatıldı — kullanıcı kararıyla reddedildi: 2026-09-17'de uygulandı
      (ebe1ce6, afa3e72) ve AYNI GÜN geri alındı ("bu ilk yakın zoom vs
      bunları da iptal ediyoruz"). Açılış `fit:'contain'` ve zoom 1'de
      KALIR; zorunlu ECOSYSTEM açılış zoom'u requirement değildir. Saved
      world hatırlanan gameplay kamerasına, fresh world `contain`
      overview'a döner (DESIGN §18). İleride güzel bir transition
      bulunursa ayrı human-acceptance deneyi olarak geri gelir — bu madde
      tekrar açılmaz._

## Adım 3 — Morphology Discovery v2

### CURRENT GATE (2026-09-19 consistency pass)

Aşağıdaki `[x]` blokları araştırma provenance'ıdır (F1/F2/F3/F7 kanıtları);
aktif iş yalnız şu açık maddelerdir ve bu sırayla okunur — ayrıntı aşağıdaki
alt bölümlerde:

1. **[P0] Kanonik rejim v2 + v2 seeding** — `1024 / 1536² / 8 origin`,
   origin min ayrımı, penetrasyonsuz doğum, tip kapsama, deterministik
   başarısızlık sözleşmesi.
2. **[P0] Ölçüm katmanı açıkları** — `ClassificationContext` bağlama,
   `voidLossRate` vent-altında ölçüm, kernel kimlik kaydı.
3. **[P0] Vent madde muhasebesi (P0-A)** — rezervuar emisyon anında
   tüketir; Step 5 beklenmez. Ardından [P0-B] deterministic persistence.
4. **[P0] `MatterReturnPolicy` + `SubstrateInteractionModel`** — intrinsic
   kol vent-KAPALI; `kernelId` kilidi açılır, `multi-lobe-v1` profili.
5. **[P0] MorphologyGateFailure taksonomisi + packing metrikleri** —
   `DYNAMIC_STRUCTURED` kaba faz kalır; `clusterQualified` +
   `worldMorphologyQualified` kapısı.
6. **[P1] 1024 canonical device budget** — yeni default world'ün hedef
   cihaz doğrulaması.
7. **[P0] Multi-lobe araması → insan audition** — 512 katastrofik
   ön-filtre, broad/refinement/audition/qualification 1024'te.

Ancak bu kapı gerçekten geçerse Adım 4 açılır.

- [x] **[P0] Sürümlü `PhysicsGenome` şeması kurulsun.** Force profile,
      directed strength/range, damping, speed envelope, local density,
      seeding ve fringe parametrelerinin tamamını taşır. World seed genom
      değildir.
- [x] **[P1] Kernel ailesi falsification noktası tanımlansın.** İlk aday
      generalized asymmetric multi-band'dir. Bu aile faz çeşitliliği
      üretemezse daha serbest multi-lobe ve active-particle alternatifleri aynı
      harness/seed/metriklerle denenir; üç production kernel birden taşınmaz.
      _Kapatıldı 2026-09-17: çürütme noktası SAYIYA döküldü ve testli
      (`scripts/morphology/falsification.ts`, 7 test): (a) geçen aday payı < %1,
      (b) refinement'ta hayatta kalan yok, (c) kullanıcı kısa listeyi tümüyle
      reddetti. Ölçülmemiş koşul "geçti" sayılmıyor; aile sırası ön-kayıtlı
      (DESIGN §8). F3 launch envelope ölçümüyle (103 yapısal aday × 4 seed, 12,4 dk):
      geçen 13 aday = broad'un %0,63'ü (< %1); kural (a) tetiklendi,
      **generalized-asymmetric-multi-band AİLESİ ÇÜRÜDÜ** (`benchmarks/results/f3-launch-envelope.json`)._
- [x] **[P1] V1 negatif kontrol yeniden üretilebilir küçük fixture olsun.** Ham
      50k satırlık artefakt runtime'da tutulmaz; triangular baseline'ın config,
      korpus ve özet sonucu sürümlü benchmark ile yeni adayın aynı ölçümde
      gerçekten daha iyi olduğunu kanıtlar.
      _Kapatıldı 2026-09-17 (F2): özet şeması v2 İKİ KOL taşıyor ve kolların aynı tohumlarda koşması doğrulanıyor; 8 seed × 7200 tick ölçümde reddedilen kernel medyan koruma 0,725 (3 GAS, 3 VOID_LOSS, 1 DYNAMIC_STRUCTURED, 1 STASIS), üretim kerneli 0,398 ve 8/8 VOID_LOSS_DOMINATED. Sonuç beklenen yönde çıkmadı ve DESIGN §8'e böyle yazıldı (`benchmarks/results/v1-negative-control.json`)._
- [x] **[P0] Faz sınıflandırıcısı önce kurulsun.** Dead, stasis, gas/soup,
      crystal/frozen, single-collapse, Void-loss dominated, orbit dominated,
      speed-cap chaos ve dynamic-structured sonuçları ayrı reason code ile
      sınıflandırılır.
- [x] **[P0] Faz sonucu reason code taşısın ve zaman penceresinden karar
      versin.** Serbest metin yerine sabit kod; son örnek yerine pencere;
      `stasisDurationTicks` örnek sayısıyla karşılaştırılmaz; seed sonuçları
      plurality değil çoğunluk kuralıyla birleşir.
      _Kapatıldı 2026-09-17 (329460f): 11 kodluk donmuş enum; süre kuralları saniye cinsinden (eski kod tick'i örnek sayısıyla karşılaştırıyordu); aday kararı ÇOĞUNLUKLA veriliyor ve plurality regresyon testiyle kilitli. Her kod sentetik seriyle, beşi ayrıca gerçek fizikle üretiliyor._
- [x] **[P0] Metrikler v2 fiziğine göre yeniden yazılsın.** Void dwell/loss/
      fringe dependency eklendi. Hareket, yoğunluk, cluster, compactness,
      anisotropy, radial yapı, composition, churn, lifespan, orbit, trajectory
      ve recovery tek skora ezilmez.
- [x] **[P0] Churn, structure lifespan ve recovery zaman serisinde ölçülsün.**
      `MorphologySample` bu alanları taşımıyor.
      _Kapatıldı 2026-09-17: churn küme başına ölçülüyor (`ClusterRecord.churn`,
      tracker ÜYELİĞİNDEN), yapı ömrü `ClusterRecord.ageTicks`, toparlanma
      `PerturbationResult.recovered`/`recoveryTicks` (E15). Uzun ufuk eğrisi
      (F7) her örnekte madde-ağırlıklı churn ve en yaşlı küme yaşını saklıyor;
      `compactSample` testli._
- [x] **[P0] `clusterCompactness` gerçek kompaktlık ölçsün.** 1−std/mean
      halkaya ≈1, düzgün diske ≈0,65 veriyor; `crystal` ve `single-blob`
      eşikleri halka biçimli dağılımı yakalıyor.
      _Kapatıldı 2026-09-16 (6312bc6): ön-kayıtlı kompaktlık SOLIDITY'dir ve per-cluster katmandadır; global alan eski tanımıyla korunarak yedi eşiğin anlamı kaydırılmadı._
- [x] **[P0] Cluster tracker uzun boşluktan sonra ölü yapıyı diriltemesin.**
      Ardışık örnek sözleşmesi ve maksimum gap tanımlandı.
- [x] **[P0] Ucuz broad tarama yalnız faz filtresi olsun.** Candidate bütçesi
      benchmark'la seçilir. Broad sonucu morphology başarısı veya production
      adayı diye sunulmaz.
- [x] **[P1] Broad gerçekten geniş örneklesin; aday bütçesi ölçümle seçilsin.**
      `GenomeSampler` yalnız varsayılan genomun ±jitter komşuluğunu tarıyor;
      `candidateCount` sabit 30.
      _Kapatıldı 2026-09-17 (F3): 2048 aday × 4 seed (123,1 dk, geçersiz 0) koştu;
      N↔2N yakınsama GEÇTİ (fark 0,39 puan, eşik 2); 103 yapısal aday belirlendi
      (`benchmarks/results/f3-candidates.jsonl`, `benchmarks/results/f3-broad.json`)._
- [x] **[P1] Arama hunisi ölçülerek kilitlensin.** Başlangıç hipotezi broad
      30–60 saniye/4–8 seed, refinement birkaç dakika/16 seed, audition 3–8
      aday, qualification 10–30 dakika/32+ seed'dir. Bunlar ölçülmeden sabit
      acceptance değildir; ilk filtre olarak 2/6/24 saat koşulmaz.
      _Kapatıldı 2026-09-17 (F3/F5/F7): kalibrasyondan ölçülen ms/tick ile süre
      bütçesi otomatik kilitleniyor; broad 2048 aday × 4 seed (30 sn), F7 K15 kısa listesi
      (8 aday) × 2 senaryo × 32 tohum ile bütçeye göre kilitli._
- [x] **[P0] Refinement sonrası az aday development audition'a açılsın.**
      Audition yüzeyi production bundle'a qualified olmayan catalog gömmez;
      açık dev/build girdisi ve provenance gösterir. URL/env ile sessiz
      production override yasaktır.
      _Kapatıldı 2026-09-17 (F5, K10): 8 adaylık audition kataloğu (`research-out/audition-catalog.json`),
      dev sunucusu configureServer middleware'iyle servis edilir; üretim derlemesinde
      yokluğu çift build testiyle kanıtlandı (`tests/governance/auditionCatalogAbsence.test.ts`)._
- [x] **[P0] İnsan ön-elemesi long-horizon'dan önce yapılsın.** Core-like,
      membrane-like, mobile, recovering, fragile, chasing ve symbiotic
      ailelerinden anlamlı bir alt küme görülür. Renkli topak, jitter veya
      kalıcı orbit elenir.
      _Kapatıldı 2026-09-17/18: F6 insan ön-elemesi kullanıcı tarafından KABUL
      edildi; kısa listedeki 8 adayın tamamı ön-elemeyi geçti (`humanPreselection: accepted`)._
- [x] **[P0] Çoklu-seed long-horizon ve perturbation çalışsın.** Seed corpus
      sürümlüdür; kesin seed sayısı ve 10–30 dakika bütçesi benchmark sonrası
      kilitlenir. Stasis, soup, tek blob, speed-cap chaos, seed çoğunluğunda
      ölüm ve aşırı Void kaybı kesin FAIL'dir.
      _Kapatıldı 2026-09-17 (F7): K15 kısa listesindeki 8 aday × 2 senaryo × 8 tohum
      (128 birim, 10 simüle dk, 8 worker, 36,1 dk) koşuldu. 8 adayın hiçbiri
      §8.4 teknik kapısını geçemedi (koruma %0,4–%7,4, VOID_LOSS_DOMINATED ve DEAD baskın).
      Sonuçlar `benchmarks/results/f7-long-horizon.json`._
- [x] **[P0] Sızıntı Deneyi (Tur 1 & Tur 2) — madde tutma ve sert çekirdek çözümü kilitlensin.**
      F7'deki kitlesel VOID*LOSS_DOMINATED kök nedeni araştırıldı. Tur 1'de V3 (yeniden ekim)
      tutmayı %82,8'e çıkardı. Tur 2 kombinasyonlarında K3 (V3 yeniden ekim + V4 ıraksak ters-kare
      sert çekirdek + V0 tidalStrength=0) test edildi.
      \_Kapatıldı 2026-09-18: K3 §8.4 kapısını tam puanla geçti (tutma medyanı %82,0 ≥ %70,
      en kötü tohum %62,1 ≥ %40, 8/8 DYNAMIC_STRUCTURED %100 ≥ %75, sıfır sert FAIL,
      cappedFraction %4,72, meanNeighborCount 80,76). K3 kalıcı yapıldı: `PairForceKernel`
      ıraksak sert çekirdeğe çevrildi, `LifeWorld`'a homeostatik vent direktörü kuruldu
      (1 sn kadans tekil doğum, 8-12'lik mikro-grup, 5 sn dinlenme), `defaultVoidProfile.tidalStrength` 0.01
      olarak kalibre edildi (kontrol ayrımı kanıtlandı).*
      _Notlar: (1) `meanNeighborCount = 80,76` 48 birim komşulukta ortalama komşu
      uzaklığı ≈ parçacık çapı demektir — yapılar temas sıkışmasındadır ve
      `DYNAMIC_STRUCTURED` son-örnek kapısı bunu ayırt etmez (DESIGN §8 "Ölçüm
      katmanı açıkları" madde 3). (2) `reseedFraction` vent mimarisiyle ölü
      kaldı; temizlik maddesi aşağıdadır._
- [x] **[P1] Zaman serisi geç çöküşü görünür kılsın.** Final snapshot yerine
      phase, yapı çeşitliliği, lifespan, churn, loss ve recovery eğrileri
      saklansın. 30 dakika sonrasında başlayan çöküş görülürse daha uzun release
      canary ayrıca gerekçelendirilsin.
      _Kapatıldı 2026-09-17 (F8): `collapseDetector.ts` (9 test) F7 eğrilerini
      analiz etti; `54bbf81b62270b94` ve `e31f112e312e6031` adaylarında 8. dk
      sonrası çöküşle canary bayrağı tetiklendi. Zaman serisi eğrileri JSONL
      ve F7 özetinde saklandı._
- [x] **[P1] Candidate/seed işleri deterministic shard edilsin.** Work ID +
      genome + seed aynı sonucu verir; paralel shard'lar seri referansla
      bit düzeyinde eşittir.
- [x] **[P1] Shard'lar gerçek paralel koşsun.** `worker_threads` ile yürütme ve
      seri referansla bayt düzeyinde eşitlik testi; harness bugün seri koşuyor,
      shard kodu yalnız hash ataması yapıyor.
      _Kapatıldı 2026-09-17 (2c5b5b4): `worker_threads` havuzu; 6 seed'lik korpusta seri, 2 worker ve 4 worker sonuçları JSON düzeyinde birebir aynı. Bölme deterministik, birleştirme iş kimliğine göre sıralı._
- [x] **[P0] Qualification artefaktı clean source zorunluluğu taşısın.**
      Revision, config/diff digest, corpus, bütçe, tam genom, zaman serisi,
      reason code ve human-acceptance alanı eksiksizdir. Dirty koşu yalnız
      exploration'dır.
- [x] **[P0] Clean-source zorunluluğu uygulansın.** Qualification komutu git
      revision ve dirty durumunu kaydeder; dirty ağaçtaki koşu exploration
      işaretlenir ve promotion'a giremez (test). `sourceRevision` bugün hep
      `unknown`.
      _Kapatıldı 2026-09-17 (2c5b5b4): kirli ağaç eligibility'yi false yapıyor ve `isQualified` bunu ilk kontrol ediyor; hem sahte sağlayıcıyla hem geçici gerçek depoyla sınandı._
- [x] **[P0] Production promotion bütün genomla yapılır.** Matrix-only kopya
      yasaktır. Promotion sonrası ayrı production canary aynı genomu
      perturbation olmadan çoklu seed'de ölçer.
- [x] **[P0] Promotion tam `SubstrateCandidate`ı production config'ine yazsın
      ve production canary'yi koşsun.** Canary aynı adayı perturbation olmadan
      çoklu seed'de ölçer; insan onayı artefakta açık komutla girer.
      `PromotionFlow` bugün yalnız bellekteki listeye ekliyor.
      _Kapatıldı 2026-09-17/18 (K9/E14 kod kısmı ve F9 kararı): `research:promote`
      ve `research:canary` altyapısı eksiksiz tamamlandı ve testlerle kilitlendi.
      2026-09-18 F7 koşusunda 8 adayın hiçbiri §8.4 teknik kapısını geçemediği
      için dürüstlük kuralı gereği gerçek promotion ve canary çalıştırılmadı;
      durum P3 ve final raporda açıkça tescil edildi._
- [ ] **[P0] Adım 3 kabulü üçlüdür.** Technical gate + long-horizon +
      browser/masaüstü/Samsung/Lenovo kullanıcı audition'ı birlikte geçer.
      Kullanıcı onayı olmadan `[x]` olmaz.
      _2026-09-18 F7 tescili (kapanış DEĞİL, kayıt): 128 birimlik koşu
      tamamlandı, teknik kapıyı geçen aday çıkmadı (0/8); aile F3 kural (a)
      ile çürütülmüştü. Madde açık kalır; sıradaki ön-kayıtlı aile
      `multi-lobe`dur ve önceki açıklar "Adım 3 — multi-lobe turu öncesi"
      bölümündedir (DESIGN §8 "Ölçüm katmanı açıkları")._
- [x] **Alan ve ekoloji kuvvetleri morphology kanıtlanana kadar kapalı kalır.**
      Kanıt ölçülebilir hâle geldi: aynı seed'li iki dünyadan birinin bütün
      alanları her tick'ten önce deterministik olarak bozuluyor (240 tick) ve
      parçacık konum/hız/tür/aktiflik dizileri ile kuvvet tamponları bayt
      düzeyinde aynı kalıyor; bozmanın gerçekleştiği alan farkıyla ayrıca
      gösteriliyor (`fieldForcesClosed.test.ts`). _Adım 5'te bu kapı bilinçli
      olarak yeniden açılacak ve test o zaman kırmızıya dönecek._

### Adım 3 — araştırma sistemi düzeltmeleri

- [x] **[P0] Startup survival resmi morphology kriteri olsun.** Sadece
      compactness, motion, clustering değil — `matterRetention(5s)`,
      `matterRetention(10s)`, `matterRetention(30s)`, `startupVoidLoss`,
      `earlyBurstPeak`, `timeToStructuralRegime` ölçülmeli. İlk 10 saniyede
      dünyanın %30-50 maddesini Void'a fırlatan profile'ın qualification'a
      girmesine izin verilmemeli. Bağımsız reproduksiyon: 8 seed ortalaması
      10sn'de %27.5, 30sn'de %49.3, 60sn'de %61.2 kayıp; bazı seed'lerde 512→71.
      Harness korpusunda (2026-09-15): %26,8 / %45,8 / %52,6; en kötü 512→75.
      _Kapatıldı 2026-09-17 (3aaeb67, 45c1478): kapı §8.4'ten birebir; 12 seed × 60 sn ölçümde varyasyon aday ÜÇ SATIRDAN da düşüyor (10 sn medyan 0,828, en kötü ondalık 0,488, 30 sn 0,609, seed'lerin %100'ünde erken patlama, %67 yatışma), zayıf/sönümlü/v₀=0 yapılandırma üçünü de geçiyor. Ön-kayıtlı 4 sn sabiti ölçülmüş imkânsızlıkla emekli edildi (gerekçe DESIGN §8)._
- [x] **[P0] Seeding rejimi yeniden araştırılsın.** Mevcut 4×70-particle dense
      random patch fazla agresif: patch yarıçapı 70 iken interaction menzili 96
      — başlangıçta yoğun interaction alanlarına spawn. Araştırılacak
      parametreler: patch count, patch radius, patch occupancy, safe-edge
      margin, cloud fraction, initial speed, type distribution. Launch
      envelope: matter survival, velocity explosion, catastrophic Void loss
      kontrol eder. Seed'lerin büyük kısmı bunu geçemiyorsa reroll etmeyiz —
      physics/seeding FAIL deriz.
      _Kapatıldı 2026-09-17 (F1): ön-kayıtlı aralıklarda 512 profil × 8 seed × 30 sn (76,9 dk, geçersiz 0) koştu; launch envelope'u seed'lerin ≥ %90'ında geçen profil SIFIR, en iyi profil (#202) %25. Reroll yok, eşik düşürülmedi: karar **varsayılan fizik/seeding FAIL** ve arama F3'te fizik+seeding birlikte yapılıyor (DESIGN §8, `benchmarks/results/f1-seeding.json`)._
- [x] **[P0] `trajectoryAutocorrelation()` bug'ı düzeltilsin.** İsim
      autocorrelation ama implementasyon gerçekte displacement metriği
      (current position − past position → dx²+dy² ortalıyor). Gerçek periodic
      orbit bir süre sonra aynı pozisyona yakın geri döner — displacement
      küçülebilir. Mevcut sözde autocorrelation tam orbit olduğunda düşük değer
      üretebilir — kavramsal olarak ters çalışabilir. `PhaseClassifier` bu
      birim² değerini birimsiz 0,8 eşiğiyle karşılaştırıyor.
      _Kapatıldı 2026-09-16 (97bfb57): VACF, MSD ve yineleme ayrı ölçüler oldu; birimsiz orbit eşiği kalktı._
- [x] **[P0] `autocorrelationLag` semantiği düzeltilsin.** Config
      `autocorrelationLag=60` ama history her simulation tick'inde değil, her
      metric sample'da kaydediliyor. 60 history entry broad'ta ~30 saniye,
      qualification'da ~60 saniye — aynı lag=60 farklı gerçek süre.
      _Kapatıldı 2026-09-16 (97bfb57): lag SANİYE ile tanımlı ve tempoyla tick'e çevriliyor; 1, 2 ve 4 tick örneklemede aynı değerler ölçüldü._
- [x] **[P0] Lokal micro-orbit detector yazılsın.** Mevcut metrikler global
      — 3 particle sonsuza kadar dönüyor, 300 particle var, global mean o üç
      particle'ın patolojik orbitini yutuyor. Yeni metrikler:
      `persistentMicroOrbitFraction`, `microOrbitLifetime`,
      `angularCoherence`, `trajectoryRecurrence`,
      `membershipExchangeRate`. Küçük cluster için: lokal centroid hesapla,
      particle'ın centroid etrafındaki açısını izle, angular velocity
      sign/persistence izle, radius değişiyor mu, membership değişiyor mu, kaç
      tur tamamlıyor. 3 particle 15 dakika aynı geometrik cycle → kesin red.
      Ama bütün rotasyonu yasaklama — gelecekte organism dönebilir veya
      membrane internal circulation gösterebilir. Kötü orbit: 3 particle,
      closed trajectory, same distance, same membership, no exchange. İyi
      rotation: 50-particle organism, body deforms, members exchange, moves
      through world.
      _Kapatıldı 2026-09-16 (42ae543, 9651ae2): dört eleme ayrı ayrı sınanıyor; gerçek `LifeWorld` fiziğiyle üç parçacık orbit fixture'ı 15 simüle dakika koşuyor (yarıçap değişim katsayısı 0,004)._
- [x] **[P0] Per-cluster morphology metrics yazılsın.** Mevcut
      MorphologyMetrics "cluster stats" adı taşıyor ama bütün aktif world
      particle'larını tek global yapı gibi değerlendiriyor — global centroid,
      global compactness, global anisotropy. Ekranda Organism A + Organism B + free particles olsa bile metric tek dünya bulutu gibi bakıyor.
      _Kapatıldı 2026-09-16 (6312bc6): solidity, delik oranı, normalize gyration ve anizotropi küme başına ölçülüyor._
- [x] **[P0] ClusterTracker → MorphologyMetrics gerçek entegrasyonu
      sağlansın.** ResearchHarness `tracker.update()` çağırıyor ama
      tracker'dan çıkan cluster yapıları MorphologyMetrics'in gerçek
      cluster-level hesaplarına beslenmiyor. Cluster tracker yazılmış ama
      morphology değerlendirmesi esasen global kalmış.
      _Kapatıldı 2026-09-16 (6312bc6): metrikler yeniden kümelemez, küme katmanı tracker ÜYELİĞİNDEN gelir; churn üyelikten hesaplanır._
- [x] **[P0] ClusterTracker split/merge/fragmentation semantiği
      tamamlansın.** Event type birth/death/split/merge/fragmentation
      tanımlanmış ama üretilenler esasen birth/death. Temporary gap/grace gerçek
      kimlik continuity'si sağlamıyor. Tracker membership'te stable particle ID
      yerine slot/index mantığına dayanıyor — slot reuse geldiğinde yanlış
      continuity üretebilir. Kapanış: ardışık örnek sözleşmesi, maksimum gap,
      deterministik tie-break ve slot reuse regresyon testi.
      _Kapatıldı 2026-09-16 (83173e0): stable ID üyeliği, üç eşleşme kapısı ve deterministik greedy; birth/death/split/merge/fragmentation `tests/morphology/clusterTracker.test.ts` ile ayrı ayrı sınanıyor._
- [x] **[P0] Intrinsic morphology vs Void-stress qualification ayrılsın.**
      15 dakika hareket eden güzel yapı Void'a drift edebilir, Step 6 geldiğinde
      nucleus edge danger algılayıp kaçacak. Step 3 "15 dakikada Void'a gitti,
      FAIL" derse iyi morphology'yi reddetmiş oluruz. Çözüm: (1) Intrinsic
      morphology — güvenli interior'da, kendi kendini koruyor mu,
      hareket/deform/recovery var mı; (2) Void stress — fringe yakınında, Void
      yapısal destek veriyor mu, tidal deformation doğru mu, crossing düzgün
      mü. AI gelmeden "kenardan akıllıca uzak dur" beklenmez.
      _Kapatıldı 2026-09-17 (fb1464a): intrinsic kapsam DESIGN §2'nin güvenli alan tanımıdır; kapsam dışı madde `scopedOutCount` ile ayrı sayılır; FRINGE_DEPENDENT iki kapıdan geçer ve entegrasyon testi iki senaryonun karışmadığını gösterir._
- [x] **[P0] VoidProfile Step 2'de sabitlensin — Step 3 intrinsic morphology
      bunu optimize etmez.** GenomeSampler fringe parametrelerini değiştiriyor
      — riskli. Search yanlışlıkla "en güzel yapı Void fringe tarafından
      desteklenince oluyor" çözümünü bulabilir. Void ayrıca stress-test
      senaryosunda değerlendirilir.
      _Kapatıldı 2026-09-16 (ad2529b): Void profili adayın parçası ama arama onu örnekleyemez; `genomeSampler` testi sabitliği ölçüyor._
- [x] **[P1] PhysicsGenome `SubstrateCandidate` profillerine parçalansın.**
      `SubstratePhysicsProfile` (pair force law, strength, ranges, damping,
      speed envelope), `SeedingProfile` (patches, cloud, density, type
      distribution, initial speed), `VoidProfile` (fringe width, tidal stress),
      `ExperimentScenario` (domain seed, matter seed, perturbation, duration).
      Sözleşme DESIGN §3'te; Adım 10'un organizma genomuyla ad çakışmaz.
      _Kapatıldı 2026-09-16 (7e76f08): `SubstrateCandidate` fizik/seeding/Void/senaryo profillerine bölündü; profil başına doğrulama, klon ve kanonik digest `tests/config/candidate.test.ts` ile kilitli._
- [x] **[P1] ResearchHarness düzeltmeleri.** Qualification seed'lerin
      time-series'ını tek düz array'e flatten ediyor — seed sınırları kayboluyor.
      Artifact budget saniyeleri default 0. İnsan onayını artefakta yazacak
      açık bir yol yok. Checkpoint/resume yok. ETA yok. Package scripts'te
      research CLI expose edilmemiş.
      _Kapatıldı 2026-09-17 (2c5b5b4): zaman serisi seed başına ayrı, artefakt v4 kaynak/bütçe/senaryo/korpus taşıyor, bütçeler ölçülüyor ve checkpoint JSONL config digest'i doğruluyor._
- [x] **[P1] Research funnel yeniden kilitlensin.** candidate generation →
      çok ucuz 10-30s sim → dead/soup/collapse/orbit ele → insan shortlist →
      birkaç finalist → dakikalar → qualification. CLI başlamadan önce:
      Candidates, Seeds, Ticks, Estimated wall clock, Workers göstermeli. Uzun
      qualification: explicit ayrı komut. Checkpoint: zorunlu. `--stage all`
      bugün broad aşamasını üç kez koşuyor.
      _Kapatıldı 2026-09-17 (c66dcc6): on ayrı komut, `--stage all` kaldırıldı, preflight kalibrasyondan süre yazıyor ve 10 dakikayı aşan koşu `--yes` istiyor; çıktı dizinsiz koşu reddediliyor._
- [x] **[P1] Qualification artifact DTO temizliği.**
      `serializePhysicsGenome(genome) as unknown as PhysicsGenome` — gerçekte
      string olan şeyi type system'e object diye yutturuyor. Temiz çözüm:
      `serializedGenome: string` veya DTO.
      _Kapatıldı 2026-09-16 (dd67cae, E12'de v4'e yükseldi): aday artefaktta KANONİK METİNDİR, `parseQualificationArtefact` digest doğrular; eski şema açıkça reddedilir._
- [x] **[P1] PerturbationSystem düzeltilsin.** `matter-removal` rezervuar
      muhasebesini atlıyor; perturbation'lar koşu bittikten sonra aynı dünyada
      zincirleme uygulanıyor; hedef seçimi bütün spec'lerde aynı tohumu
      kullanıyor; 0,15 mutlak eşik %10 madde kaybını anında recovered sayıyor.
      _Kapatıldı 2026-09-17 (7ee2838): her spec aynı snapshot'tan bağımsız koşuyor, tohum (seed, spec, tick) üçlüsünden geliyor, madde çıkarma muhasebeli ve toparlanma taban penceresinin ±2σ bandına göre ölçülüyor. Eski sabit eşik %10 madde kaybını ilk kontrolde 'toparlandı' sayıyordu._
- [x] **[P0] Gerçek 3-particle orbit geometrik fixture testi yazılsın.**
      PhaseClassifier.test.ts sentetik scalar metric objeleri veriyor — gerçek
      3-particle orbit oluşturup classifier'ın patolojik sayıp saymadığı testi
      yok.
      _Kapatıldı 2026-09-16 (9651ae2): gerçek `LifeWorld` fiziğiyle üç parçacık
      15 simüle dakika koşuyor; yarıçap değişim katsayısı 0,004 ve dedektör
      kalıcı micro-orbit olarak işaretliyor._
- [x] **[P1] Long-run current default test eklensin.** Mevcut testlerde
      long-run current default yetersiz — 30 dakika koşu yok.
      \_Kapatıldı 2026-09-17 (E17): `tests/long/defaultLongRun.long.ts` 4 seed ×
      30 simüle dakika koşuyor (403 sn); madde muhasebesi her örnekte tutuyor,
      snapshot/restore bayt düzeyinde aynı parmak izini veriyor, tick maliyeti
      parçacık başına normalize ölçülüyor. Ölçülen koruma 0,123–0,309 ve
      dördü de VOID*LOSS_DOMINATED — sonuç gizlenmedi.
      Yeniden ölçüldü 2026-09-18 (K3 sonrası): koruma 0,895–0,957'ye fırladı
      (medyan %90,4); 3/4 DYNAMIC_STRUCTURED, 1/4 GAS; madde muhasebesi ve
      snapshot/restore bayt eşitliği 30 dk boyunca eksiksiz korundu.
      \_Okuma notu: koruma vent'in geri beslediği maddeyi içerir (ekolojik
      sağkalım); DYNAMIC_STRUCTURED etiketi zayıf son-örnek kapısından gelir
      (DESIGN §8 "Ölçüm katmanı açıkları" madde 2 ve 3).*

### Adım 3 — multi-lobe turu öncesi açıklar

Bu maddeler 2026-09-18 kaynak doğrulamasından türedi (DESIGN §8 "Ölçüm
katmanı açıkları"); yeni aile koşusundan ÖNCE kapanır — aksi hâlde yeni
ailenin etiketleri aynı zafiyetleri taşır.

- [ ] **[P0] Kernel kimliği tek aileye kilitli — multi-lobe ifade edilemez.**
      `SubstratePhysicsProfile.kernelId` tip seviyesinde
      `MULTIBAND_KERNEL_ID`'ye sabitli; çürütülen aile dışında aday
      `SubstrateCandidate` ile taşınamaz. Kernel aile kaydı (kimlik + profil
      şeması + doğrulama) kurulur, multi-lobe profili tanımlanır. "Üç
      production kernel taşınmaz" kuralı korunur: deneme ailesi qualified
      olmadan ürün çekirdeği olmaz.
- [ ] **[P0] `ClassificationContext` üretim çağrılarına bağlansın.**
      `seedRunner`, `harness` ve `longRun` context'siz `classify` çağırıyor;
      `STARTUP_MASSACRE`, `FRINGE_DEPENDENT` ve `MICRO_ORBIT_PERSISTENT`
      hunide hiç ateşlenemez (birim testleri context'i doğrudan verdiği için
      yeşildir). Context üretimi ölçüm hattına taşınır: startup katliamı
      bayrağı startup kapısından, micro-orbit serisi tracker'dan,
      fringe-dependent bayrağı `tidalStrength = 0` kontrol kolundan.
- [ ] **[P0] `voidLossRate` vent altında Void kaybını ölçmüyor.** Metrik
      aktif sayım farkı kullanıyor; vent rezervuardan geri bastığı için
      vent'li koşularda VOID_LOSS_DOMINATED yapısal olarak tetiklenemez.
      `reservoir.voidLossTotal` örnekleniyor ama sınıflandırıcı okumuyor.
      Kayıp ölçümü sayaçtan alınır; vent'li ve vent'siz ölçüm ayrıştırılır.
- [ ] **[P0] `DYNAMIC_STRUCTURED` kaba faz olarak kalsın;
      `MorphologyQualification` kapısı kurulsun.** Bugünkü etiket yalnız
      son örnekte global `clusterCompactness > 0,3` + `meanSpeed > 0,05`;
      semantiği DEĞİŞTİRİLMEZ — eski ve yeni artefaktlardaki etiket aynı
      deney sonucunu anlatır (sessiz semantik kayması yasaktır). Yeni
      ayrı kapı iki seviyelidir: per-cluster kayıtlar (solidity, holeRatio,
      normalizedGyration, churn, yaş) `clusterQualified` üretir; dünya
      kararı `worldMorphologyQualified`'dır — yapılı madde payı, qualified
      küme sayısı ve süreklilik penceresi gibi dünya-özet koşulları.
      "1 şahane ring + 900 parçacık soup" PASS olamaz; etiket tek örnekte
      değil pencerede verilir. Akış: `DYNAMIC_STRUCTURED` → packing kapısı
      → yapısal morfoloji kapısı → insan audition → `QUALIFIED_MORPHOLOGY`
      (DESIGN §8 taksonomi katmanları).
- [ ] **[P0-A] Vent madde muhasebesi düzelsin — emisyon anında tüketim,
      Step 5 beklenmez.** `reservoir.reseed(toReseed)` burst'ün tamamını
      baştan düşer ama bekleyen parçacıklar `ventRemainingInBurst`'ta ne
      aktif ne rezervuar sayılır; burst ortasında save+load bekleyen maddeyi
      TAMAMEN siler — yalnız determinizm değil madde kaybıdır. Rezervuar
      her gerçek emisyon anında 1 madde çeker (spawn zamanı geldi →
      rezervuar ≥ 1 → slot var → 1 çek); hayalet kuyruk kalmaz. Bugünkü
      prototip bu hâliyle madde kaybettiği için düzeltme kalıcı VentSite'a
      ertelenemez.
- [ ] **[P0-B] Vent/direktör takvimi deterministik persistence'a bağlansın.**
      `ventRemainingInBurst`, `ventCooldownRemaining`, `ventNextSpawnTick`,
      `ventOriginX/Y` `LifeWorldSnapshot`'ta yok. Aynı örnekte restore
      (longRun, perturbation) açığı maskeliyor; persistence yüklemesi yeni
      örnekte vent takvimini 60 sn başlangıç cooldown'una sıfırlıyor.
      Çözüm: scheduler state'i snapshot'a girer (codec v5) ya da tick+seed'den
      tamamen türetilebilir hâle gelir. "Yükleyince timer reset" seçeneği
      yeterli değildir — kaybolan maddeyi geri getirmez; bu yüzden
      kaldırıldı. Regresyon testiyle kilitlenir.
- [ ] **[P1] Vent doğum konumu fringe içine düşemesin.** Origin
      `safeEdgeMargin + 4 = 28` birimde doğrulanıyor ama parçacık 0–12 birim
      drift ile doğar; outward yönde 16 birime iner ve tidal fringe (24)
      içinde "doğar doğmaz Void stresi" yer. Doğrulanan şey origin değil
      gerçek spawn pozisyonu olmalıdır.
- [ ] **[P1] Ölü config alanları temizlensin veya gerekçesi yazılsın.**
      `reseedFraction` (0,5) hiçbir yolda okunmuyor; `reseedIntervalSeconds`
      yalnız başlangıç cooldown'u; `contactStrength` = 0'a kilitli ama
      `ParticlePhysics` yolu hâlâ bağlı. Silme tercih edilirse doğrulama ve
      config digest etkisi hesaplanır.
- [ ] **[P1] Broad ufkunun faz kapsama haritası çıkarılsın.** 30 sn broad'da
      STASIS/SPEED_CAP_CHAOS (60 sn) ve GAS/SINGLE_COLLAPSE/MICRO_ORBIT
      (300 sn) hiç ateşlenemez; broad dağılımı fiilen dörde iner. Aşama ×
      gözlemlenebilir kural tablosu DESIGN'a işlenir; kapsanmayanlar için
      ufuk uzatma veya erken-proxy metrik kararı verilir.
- [ ] **[P1] Kanonik araştırma rejimi v2 uygulansın ve v1'le karşılaştırılsın.**
      Spec kilitlendi (DESIGN §1, §8): `1024 aktif madde`, `1536×1536`
      depolama, `8 origin yaması`; yama yarıçapı ve payı ilk turda sabit
      (r=70, pay 0,55 — kontrollü geçiş kuralı), final değerler sonraki
      benchmark'tan kilitlenir; field çözünürlüğü de ölçümle seçilir.
      Her artefakt `regimeId`
      taşır (`v1-512-1024` / `v2-1024-1536`) ve karşılaştırma yalnız aynı
      rejim içinde yapılır; v1 yalnız katastrofik ucuz ön-filtre ve
      regresyon referansıdır — "morfoloji üretmiyor" elemesi 512'de
      yapılmaz (yapısal çözünürlüğü kanıtlayan aile düşük çözünürlükte
      yanlış negatifle elenir); broad/refinement/audition/qualification
      1024'te koşar. Nedensellik sınırı: madde/alan/yama aynı anda değişir —
      sonuç "v2 paketi v1'den iyi/kötü" diye okunur; tek-parametre nedensel
      iddia için ablation (v1 / nüfus↑ / alan↑ / tam v2) ayrı koşudur.
      Field çözünürlüğü morfoloji aramasını BLOKLAMAZ — Step 3
      intrinsic'te alan kuvvetleri kapalı; 256-vs-512 ölçümü renderer ve
      Step 5 alan semantiği için yapılır, multi-lobe keşfi bekletilmez
      (render dokusu gözle bozuksa ayrı). İki rejim aynı ailede koşulup
      packing/morfoloji metrikleri karşılaştırılmadan "daha büyük daha iyi"
      varsayımı kanıtlanmış sayılmaz (§17). K3'te 512/1024² rejiminin temas
      sıkışması ürettiği ölçüldü (`meanNeighborCount = 80,76`, çap 9) —
      rejim değişikliği bu ölçümün yanıtıdır.
- [ ] **[P1] 1024/1536² kanonik rejimin hedef cihaz bütçesi doğrulansın.**
      Yeni default world (1024 parçacık, 1536² alan, 8 origin, yeni glyph,
      ileride multi-lobe) için simulation p50/p95, frame p50/p95/p99,
      jank, GPU, PSS, başlangıç maliyeti ve snapshot boyutu Samsung/
      Lenovo/Chromium'da ölçülür — 512'nin kapanmış bütçesi taşınamaz.
      Bu Adım 11 (10k–250k) değildir; "yeni varsayılan dünya cihazda
      güvenli mi" sorusudur. Snapshot boyutu ayrıca P1 regresyon
      ölçümüdür: parçacık ×2 + tipli rezervuar + VentSite state + olası
      `angle[]`/`angularVelocity[]` sütunları toplamı yeniden anlamlı
      kılabilir — tahmin edilmez, bir kez ölçülür.
- [ ] **[P0] v2 seeding revizyonları uygulansın (DESIGN §2).** Üç kusur
      kapanır: (a) origin merkezleri bağımsız `placeInside` yerine minimum
      ayrım mesafeli seçim (blue-noise/Poisson-disc; yapay ızgara yok) —
      bugün iki merkez neredeyse üst üste doğabiliyor ve 8 yamada risk
      büyür; (b) doğum konumu mevcut parçacıklarla üst üste gelemez —
      `placeNear`/`placeInside` yalnız habitat mesafesi soruyor, parçacık-
      parçacık penetrasyonu kontrol edilmiyor; (c) her origin altı tipin
      hepsini temsil eder, kalan parçacıklar random — adil deney koşulu,
      steril eşitlik değil. Kontrollü geçiş: patch/cloud/sparse oranı,
      yama yarıçapı ve başlangıç hızı ilk turda DEĞİŞMEZ. Deterministik
      başarısızlık sözleşmesi: yerleştirme bounded attempt kullanır; config
      geometrik olarak mümkün değilse validation FAIL — min ayrım sessizce
      gevşetilmez, world seed reroll edilmez; doğum mesafesi glyph değil
      fiziksel çapa (9 birim) bağlanır; RNG akışları ayrılır
      (`seeding.origins`/`positions`/`types`/`velocity`) (DESIGN §2).
- [ ] **[P1] Negatif baseline yeni ailede de canlı kalsın.** F2'de
      triangular-v1 üretim kernelinden daha iyi madde tuttu (0,725 vs
      0,398); multi-lobe adayları aynı fixture ve tohumlarla negatif
      baseline'la karşılaştırılır.

### Adım 3 — pozitif morfoloji kabulü ve packing metrikleri (2026-09-19)

Negatif denetimler tek başına jammed topak geçirir; kabul iki katmandır
(DESIGN §8 "Pozitif morfoloji tanımı"): teknik ön-kapı filtreler, insan
görsel kabulü karar verir.

- [ ] **[P0] Packing metrikleri teknik kapıya eklensin.** `overlapFraction`,
      `severeOverlapFraction`, parçacık çapına normalize en-yakın-komşu
      uzaklığı (`r/çap < 0,7` ağır penetrasyon, `0,7–1,0` temas bandı), lokal
      sıkışma dağılımı ve `physicalPackingFraction` (FİZİKSEL yarıçap
      üzerinden projeksiyon alanı payı) zaman serisi olarak ölçülür.
      Simülasyon kapısı sunum ayarından etkilenmez: glyph yarıçapı
      değiştiğinde teknik skor kımıldamaz; `visualOcclusion`/okunabilirlik
      renderer üzerinden insan audition tarafında okunur (DESIGN §8).
- [ ] **[P0] `MorphologyGateFailure` taksonomisi kurulsun; `PACKING_COLLAPSE`
      ilk kodu olsun.** Donmuş `PhaseReasonCode`'a EKLENMEZ — packing
      collapse dinamik faz değil morfoloji yeterlilik başarısızlığıdır
      (DESIGN §8 üç katman). Madde korunmuş, kompakt ve hareketli olsa bile
      normalize en-yakın-komşu uzaklığı kalıcı olarak temas bandının
      altındaysa koşu "structured" değil "jammed" sayılır; K3'ün
      `meanNeighborCount = 80,76` değeri kanıttır. Kardeş kodlar:
      `LOW_TOPOLOGICAL_DIVERSITY`, `EXCESSIVE_OCCLUSION`.
- [ ] **[P0] `holeRatio` ve porosity sınıflandırması.** İçe kapalı stabil
      boşluk POZİTİF kanıt eksenidir, evrensel zorunluluk değildir —
      filament/chain/two-lobed body `holeRatio ≈ 0` ile de geçer
      (DESIGN §8); `holeRatio > X` herkesin kapısı yapılmaz. Tamamen dolu
      topak negatiftir. Per-cluster kayıtlar (solidity, holeRatio, gyration,
      churn, yaş) zaten hesaplanıyor — `clusterQualified` kapısı onları
      tüketir.
- [ ] **[P0] İnsan görsel kabul protokolü kurulsun.** Görsel kalite vektörü
      DESIGN §8'de tanımlı: parçacık okunabilirliği, küme içi organizasyon,
      topoloji çeşitliliği, çeşitlilik≠kaos (konfeti kompozisyonu), hareketin
      anlamı (jitter≠sallanma), deformasyon/iyileşme, şekil+hareket+stres
      birlikte, maddesellik. Kısa turlar (~2 dk/aday), yapılandırılmış not;
      snapshot üstünden açıklamalı not meşru. Bias guardrails: aday/aile adı
      gizli (Candidate A/B), sıra randomize, standart kamera görünümleri,
      aynı kısa seed alt-kümesi; değerlendirme overview klip + close-up klip + perturbation/recovery segmentiyle yapılır — tek kare yetmez.
      Sonuç artefakta `humanAcceptance` altında boyut bazında işlenir;
      "kompakt ve hareketli" tek başına geçemez.
- [ ] **[P1] Morfoloji ailesi etiketleri ve makine-okunur insan notları.**
      Audition kayıtları pozitif sınıflar (`shell`, `ring`, `lobe`, `chain`,
      `satellite`, `appendage-like`, `nested`, `porous`, `type-segregated`)
      ve negatif sınıflar (`amorphous-blobs`, `low-topological-diversity`,
      `confetti-composition`) taşır; `acceptedTraits`, `rejectedTraits`,
      `failureReason` alanları provenance zincirine (aile etiketi, kernel
      kimliği/sürümü, korpus, seed'ler, config digest) eklenir. Araştırma
      etiketi morfolojiyi tanımlar, biyolojik rol atamaz: `tail` Adım 6'nın
      aktüatörüdür → `appendage-like`/`filament-appendage`; `core-like`
      → `core-like-density` (DESIGN §8).
- [ ] **[P1] Retention metriği üçe ayrılsın.** `active population retention`
      (bugünkü) yanına `original matter retention` (başlangıç stable ID'lerinin
      sağkalım eğrisi — vent yeni ID ürettiği için ayrıştırılabilir) ve
      `structure lineage retention` eklenir. Nüfus homeostazı ile madde
      turnover'ı ayrı okunur: active 500 ama orijinal ID'lerden 50'si kaldıysa
      homeostasis başarılı ama turnover yüksek demektir — kötü olmak zorunda
      değil ama metrikler karışmaz. Vent açık ürün kanaryasında özellikle
      anlamlıdır.
- [ ] **[P1] Multi-seed morfoloji grameri kararlılığı ölçülsün.** Aynı aday
      seed'ler arasında TEKRARLAYAN morfoloji grameri/aile özellikleri
      göstermelidir — "her seed aynı sınıfı (ring) üretmeli" değil; ring,
      nested shell, lobe karışabilir ama layering + negatif boşluk +
      deformability grameri sabit kalır (DESIGN §8). Tek şanslı seed kanıt
      değildir.

### Adım 3 — vent/retention ayrımı ve substrate soyutlaması (2026-09-19)

- [ ] **[P0] `MatterReturnPolicy` açık politika olsun.** Araştırma senaryosu
      `none` (saf substrate, dünya tükenebilir), ürün senaryosu
      `ecologicalVent`; gizli if/else yerine açık subsystem policy seçilir.
      İntrinsic morfoloji ölçümü vent-KAPALI kolda koşar (DESIGN §8); vent'li
      kol "ekolojik nüfus bakımı senaryosu" olarak ayrı koşulur ve ürün
      kanaryası olarak korunur — ürün davranışı değişmez, ölçümün okuduğu
      değişir.
- [ ] **[P1] `MatterVentDirector` `LifeWorld`'den ayrılsın.** Vent yaşam
      döngüsü, burst/cooldown takvimi ve spawn origin'i ayrı alt sisteme
      taşınır; `LifeWorld` orkestratör kalır. Vent snapshot açığının (üstteki
      P0-A/P0-B maddeleri) ve Adım 5 büyümesinin ön temizliğidir. Vent hiçbir zaman
      nüfus hedefi okuyamaz — "aktif < N → spawn" yasaktır (Adım 5
      sözleşmesiyle aynı). Hedef mimari Adım 5'teki `MatterVentSystem` +
      kalıcı `VentSite` modelidir; bu madde prototip state'i `LifeWorld`'den
      söker, coğrafya kararı Adım 5 işidir.
- [ ] **[P0] `SubstrateInteractionModel` soyutlaması kurulsun.** `ParticleStore`
      (temel SoA: konum, hız, tür, stable ID, aktif maskesi) korunur; aile
      başına seçilebilir etkileşim modeli ve gerekiyorsa aileye özgü ek SoA
      sütunları (`angle[]`, `angularVelocity[]` — yalnız o aile kullanır)
      eklenir. `PairForceKernel`'ın skaler `magnitude(distance, ownType, otherType)`
      imzası tork/hizalanma/aktif ilerleme taşıyamaz; oriented
      aile arayüzü aşar. Aile seçimi `if kernelId === ...` zinciri değil
      discriminated profile ile yapılır; `kernelId`'nin tek aileye kilitli
      tipi ilk adımdır (üstteki P0 madde). Üretim yine TEK model taşır.
- [ ] **[P1] Glyph/fiziksel yarıçap ayrımı uygulansın (DESIGN §6).**
      `ParticleConfig.physicalRadiusUnits` simülasyon sözleşmesi kalır;
      `LifeGraphicsConfig.particleGlyphRadiusUnits` eklenir (aday aralık
      2,5–3,5 birim, karar cihazda A/B ile). Fizik yarıçapı opak dolu daire
      olarak birebir çizmek merkezleri 7 birime yaklaşan parçacıkları gerçekten
      üst üste bindiriyor; küçük glyph negatif boşluğu görünür kılar. Alfa
      düşürme ana çözüm değildir (penetrasyonu gizler); sahte zar/katman
      çizimi yasaktır; hız izleri/düşük-alfa kalıntı meşru sunum
      zenginliğidir.

### Adım 3 — aile sırası ve deney disiplini (2026-09-19)

Sıra ön-kayıtlıdır (DESIGN §8): `multi-lobe-v1` → `active-particle-v1` →
`oriented-torque-v1`. Her aile aynı korpus, metrikler ve insan kalite
vektörüyle sınanır. Aile adlandırması standardı (DESIGN §8): kanonik
`familyId` + insan adı; eşanlamlı yazımlar kullanılmaz.

- [ ] **[P0] `multi-lobe-v1` ("Multi-Lobe") ailesi tanımlansın.** Çift başına
      bağımsız işaretli loblar (`bandScales` global ölçeklerinin tavanını
      aşar): "10 birimde it, 25'te çek, 50'de it, 75'te çek" ifade
      edilebilmeli; çoklu denge mesafesi (shell/nested ring/satellite)
      üretimi hedeflenir.
- [ ] **[P1] `active-particle-v1` ("Active Particle") ailesi koşullu
      hazırlansın.** Self-propulsion; PPS emsali (bilişsiz protocell-benzeri
      yapı). Yalnız multi-lobe görsel olarak yetersiz kalırsa açılır.
- [ ] **[P1] `oriented-torque-v1` ("Oriented / Torque") ailesi koşullu
      hazırlansın.** Yönlü etkileşim, hizalanma, tork; `PairForceKernel`
      arayüzünü aşar, parçacığa açı/oryantasyon durumu ekler (§3 "aptal
      kalır" kuralı: fiziksel serbestlik derecesi eklemek biliş eklemek
      değildir). Atomic Clusters emsali: merkez-dışı yük noktaları →
      moleküler geometri. En pahalı parçacık-ailesi adımıdır.
- [ ] **[P1] Substrate pivotu ancak dört aile de çürüyünce masaya gelir.**
      Sürekli kütle-korunumlu alan (Flow-Lenia emsali), hibrit parçacık/alan
      veya yapay kimya seçenekleri yalnız o raporun ardından değerlendirilir.
- [ ] **Deney disiplini kuralları:** (a) iki yeni fizik mekanizması tek
      deneyde birleşmez — nedensellik okunamaz; (b) çürütülmüş multi-band
      matrisini ince ayarlamak ana plan değildir; (c) creation pre-roll yalnız
      doğal transient'i gizler, başlangıç patlamasını/sonraki çöküşü
      örtemez; (d) ışık/besin/sıcaklık/akış alanları intrinsic morfoloji
      kanıtında KAPALI kalır — dış alan yapıyı suni tutar; (e) vent'li koşu
      intrinsic kanıt sayılmaz; (f) "hareket eden kompakt blob" hiçbir aileyi
      karşılamaz.

## Adım 4 — organizma kimliği

- [ ] **Kesin blokaj:** Adım 3 üçlü kabulü geçmeden identity kodu yazılmaz.
- [ ] **Identity tracker gözlemcidir.** ON/OFF aynı seed ve adayda particle
      state'i bit düzeyinde aynı üretir.
- [ ] **Stable organism ID üye örtüşmesiyle izlenir.** Split, merge, geçici
      fragmentation, save/load ve ID ölümü olay olarak sınanır.
- [ ] **Tracker stable particle ID kullanmalı — slot index değil.** Slot
      reuse geldiğinde yanlış continuity üretebilir.
- [ ] **Step 4 kabul testleri:** movement, deformation, partial member
      exchange, two organisms crossing, temporary fragmentation, merge, split,
      disappearance, reappearance window, save/reload, deterministic tie-break.
- [ ] **Geometric continuity ≠ biological lifecycle ayrımı future-ready
      kurulsun.** Core predator nucleus'u öldürdüğünde body particle'larının
      %80'i hâlâ orada — membership tracker aynı cluster der ama organism öldü.
      Future lifecycle: geometric entity continuity ≠ living organism
      continuity.
- [ ] **Adım 4 abstraction'ı compound morphology'ye açık kalsın.**
      "cluster = organism" bugünkü blob dünyasında yeterli ama zengin
      morfolojide shell cluster + core cluster + satellite cluster aynı
      biyolojik bedenin parçaları olabilir. Kimlik mimarisi tek küme
      eşlemesine erken kilitlenmez; Adım 3 çıktısı Adım 4 abstraction'ını
      şekillendirir — `organism = graph of coherent components` seviyesi
      morfoloji yakalandığında yeniden gözden geçirilir. Erken tek-cluster-ID
      zorlaması yapılmaz (2026-09-19 analizi).
- [ ] **Bölünme: accidental fragmentation vs genuine reproduction ayrılsın.**
      Accidental: #42 → büyük parça #42, küçük parça transient/new. Genuine:
      Parent #42 → Child #57, Child #58. Biological fission'da parent ID
      daughter'a taşınmaz — soy ağacı temiz olur. Sözleşme DESIGN §8'de
      (Adım 4 gözlemci değişmezliği).
- [ ] **[P1] Membrane ve core glyph'leri yapı kimliğiyle açılsın.** Rol yalnız
      tespit edilmiş yapı üyeliğinden türer; Adım 3 audition'ı rol glyph'i
      kullanmaz (DESIGN §6).

## Adım 5–10 — kararlaştırılmış sonraki sözleşmeler

Bu bölüm hemen uygulanacak iş değildir; Adım 3/4 kapıları geçilmeden kodlanmaz.
Ama yüksek seviye önerilerin kaybolmaması için bağımlılık ve kabul yüzeyleri
şimdiden açık tutulur.

### Adım 5 — enerji, madde ve yaşam döngüsü

- [ ] **[P0] Biyokütle/rezerv defteri Adım 5 kodundan önce kapansın.**
      Sözleşmede nutrient alımı yalnız enerji deposuna yazılıyor; depolanmış
      biyokütle state'i tanımlı değil. DESIGN §3'teki iki adaydan biri seçilir;
      ışık yenilenmesi dışında hiçbir yolun nutrient, biyokütle veya detritus
      yaratmadığı korunum testiyle kilitlenir.
- [ ] Nutrient alımı üye konumu + zar geçirgenliğiyle yerel çalışsın; alınan
      miktar resource grid'den eksilip organism energy store'a yazılsın.
- [ ] Maintenance, büyüme, repair ve locomotion ayrı enerji giderleri olsun;
      bedava cohesion veya burst bırakılmasın.
- [ ] Büyüme yeni particle yaratmasın; serbest aktif maddeyi fiziksel olarak
      bünyeye katma ve üyelik değişimiyle gerçekleşsin.
- [ ] Habitat içi ölüm identity silmekle kalmasın: cohesion/üyelik çözülüp
      beden free matter'a dağılsın; stored biomass detritus'a, enerji
      dissipation'a gitsin.
- [ ] `detritus → nutrient` decomposition hızı config verisi ve kaynak
      muhasebesi olsun; ölüm bölgesinde history/disturbance izi bıraksın.
- [ ] Matter vent reservoir'dan yeni stable-ID'li serbest madde üretsin;
      population hedefi okuyamasın, yerel/görünür ekolojik süreç olsun.
- [ ] **[P0] Prototip vent `MatterVentSystem` + kalıcı `VentSite` modeline
      evrilsin (DESIGN §3, 2026-09-19 devam analizi).** Burst başına random
      origin kalkar; dünya yaratılırken world seed'den sabit site'lar kurulur
      (id, x, y, phase, cooldown, nextEmissionTick — site state'i snapshot'a
      girer). Yer kalıcı, aktivite geçicidir (Yellowstone gayzeri); site
      başına aktivite/dormancy ritmi "coğrafi karakter" üretir. Site konumu
      nüfus okumaz; site'lar birbirinden ve kıyıdan ayrılır (emisyon diski +
      fringe + güvenlik payı). Organizma site üstüne oturabilir — kaynak
      kolonizasyonu emergence'dır, engine engellemez; yasak olan engine'in
      organizmanın içine sonradan vent teleport etmesidir. Site sayısı
      şimdiden kilitlenmez: 1536² dünya ölçümünden sonra karar verilir;
      hedef "her yerde vent" değil ekolojik hotspot. Versioning sözleşmesi:
      site koordinatları dünya yaratımında kalıcı world state'e yazılır VE
      `ventSiteGeneratorVersion` ruleset provenance'ında tutulur —
      placement algoritması değiştiğinde eski kayıtlar kendi koğrafyasını
      korur; her site'ın RNG ritmi site kimliğinden türetilen bağımsız
      substream'dir, yeni site eklemek diğer ventlerin takvimini
      kaydıramaz (DESIGN §3).
- [ ] **[P0] Rezervuar tip-korunumlu olsun.** `external` tek sayaç yerine tip
      başına ayrılır; Void'a giren tip vent'ten aynı tip olarak çıkar. Sessiz
      random retyping kalkar — "Void maddeyi dönüştürür" istenirse ileride
      açık ekoloji mekaniği olarak yazılır (DESIGN §3). Korunum invariantı
      test sözleşmesine yazılır: transmutation gelene kadar her tip için
      `activeMatter[t] + externalReservoir[t] = initialMatter[t]`; Void
      crossing, vent emisyonu, snapshot/load ve slot reuse olmak üzere dört
      durumda sınanır. Tip-başına rezervuar snapshot şemasını değiştirir —
      codec/sürüm migration işi bu maddeye dahildir.
- [ ] **[P0] Rezervuar tüketimi emisyon anında yapılsın.** Burst başında
      toplu düşme kalkar: spawn zamanı geldi → rezervuar ≥ 1 → slot var →
      1 madde çek → 1 parçacık. Hayalet "bekleyen kuyruk" kalmaz; save/load
      madde kaybetmez. Bu davranış Adım 3 P0-A'sında prototip üzerinde
      önceden düzeltilir; bu madde kalıcı `VentSite` mimarisinde aynı
      sözleşmenin taşınmasıdır.
- [ ] **[P1] Vent ritmi deterministik jitter alsın.** Tam 1,000 sn kadans +
      sabit 5 sn cooldown metronomdur; aynı ortalama debiyle jitter'lı kadans
      ve site başına dormancy ritmi kullanılır. Ritim hiçbir zaman nüfus
      sayısına bağlanmaz; RNG deterministik olduğu için replay/save etkilenmez.
      Bugünkü parametreler (`ventCadenceTicks = 60`, burst 8–12, cooldown
      300, ≈40–45/dk) **legacy kalibre baseline**dır — 512/1024²/K3
      dünyasına aittir; 1024/1536² rejimde Void kayıp hızı değişir, debi
      VentSite geçişinde yeniden ölçülür (DESIGN §3).
- [ ] **[P1] Vent sunumu site-aktif görseline evrilsin (DESIGN §6).**
      Parçacık başına 450 ms halka prototype olarak kalır; finalde burst
      boyunca site'da hafif lokal distorsiyon/glow + doğumda en fazla küçük
      flash. Ekran ikonu/RPG kaynak düğümü yok; habitat glow bozulması,
      field ripple, particulate emission dili. Fresh world'de 1024
      parçacığa spawn FX kesinlikle yok (mevcut davranış korunur).
- [ ] Dünya extinction'a gidebilsin; bütün seed'lerin kaçınılmaz tükenmesi ve
      otomatik nüfus tamamlama ayrı regresyon/long-horizon red nedenleri olsun.
- [ ] Bölünme önce morphology'nin doğal kararlılık kırılması olarak ölçülsün;
      çıkmıyorsa enerji eşiğine bağlı en küçük müdahale ayrı deneyle seçilsin.
- [ ] Alan/resource kuvvetleri eklendikten sonra Adım 3 morphology korpusu
      yeniden koşsun; recovery ve kompozisyon gerilerse Adım 5 kapanmasın.

### Adım 6 — algı, utility, nucleus ve locomotion

- [ ] Algı bütçesi görüş, field örnekleme, trace duyarlılığı, canlı yakınlığı,
      `edgeDistance`, `edgeNormal` ve predicted crossing kanallarını yerel
      olarak versin; global harita/koordinat oracle'ı olmasın.
- [ ] Kusurlu hafıza decay, yanlış çağrışım ve ölümle kayıp taşısın; kalıtılan
      fenotip ile yaşarken öğrenilen kayıt aynı state olmasın.
- [ ] Utility girdileri survival, food, rest, reproduction, curiosity ve hunt
      olarak ayrı kalsın; davranış tek enum/script zincirine dönüşmesin.
- [ ] Nucleus mutlak koordinat değil priority, desired heading, locomotion
      intensity ve phase yayarak üye rollerini polarize etsin.
- [ ] Steering ile locomotion ayrı olsun: pursuit/evasion/avoidance kararı,
      body actuator kuvvetini doğrudan taklit etmesin.
- [ ] Kuyruk gerçek member particle'larından oluşsun; phase-offset salınım,
      kuyruk kaybında hız düşüşü ve beden deformasyonu test edilsin.
- [ ] Stalking → burst → fatigue/recovery döngüsü enerji, membrane stress ve
      öz-hasarla bağlı olsun; `predator.speed = sabit` yolu açılmasın.
- [ ] Hız morphology × enerji × anatomi × niyet × flow × hasar sonucundan
      türesin; düşük enerjinin renk, core pulse ve tail amplitude karşılığı olsun.
- [ ] Fear/danger sinyali yerel yayılsın ve sönsün; fenotipe göre kaçış,
      merkeze dönüş, donma veya savunma farklılaşabilsin.
- [ ] `AgentController` kapasite sözleşmesi standart nucleus ve coreless virus
      tropism'ini aynı anatomiye zorlamadan taşısın.
- [ ] Void korkusu ile hunt utility yarışsın; risk tolerance ve prediction
      horizon farklılıkları kıyıda gözlenebilir kararlar üretsin.
- [ ] Tail aktüatör glyph'i gerçek locomotor üyelikle açılsın; sunumu Adım 7
      LOD'uyla doğrulansın (DESIGN §6).

### Adım 7 — sunum ve keşif

- [ ] World/Ecosystem/Organism/Micro semantic LOD continuous crossfade ile
      çalışsın; kamera ölçeği fizik veya sim tick seçmesin.
- [ ] Uzak görünüm activity constellation, yakın görünüm membrane/core/role ve
      deformasyon okusun; aggregate luminance gerçek entity/hitbox olmasın.
- [ ] Habitat ölümü core-sönme → zar çözülme → free-matter/detritus; Void ölümü
      stretch → darken → dissolve diliyle birbirinden ayrılsın.
- [ ] Nutrient tüketimi resource fade ve enerji rengiyle anlatılsın; her canlı
      üstünde bar/lokma efekti ve her emilim için event üretilmesin.
- [ ] Nutrient, light, temperature, disturbance, detritus, territory,
      infection ve history katmanları tek tek açılabilsin; normal view çöplüğe
      dönüşmesin. Katman görünümü Adım 1'de değil BURADA açılır (madde
      2026-09-17'de Adım 1'den buraya taşındı): tarayıcı, Samsung ve Lenovo'da
      ekran görüntüsü olmadan kapanmaz.
- [ ] Sunum aklı yenilik, süre, nüfus etkisi, nadirlik ve coğrafi yayılımı ayrı
      ölçsün; ilk olayları işaretlesin, simülasyona geri yazamasın.
- [ ] Observe/Follow/Free kamera ilişkisi kurulsun; kullanıcının ilk girdisi
      otomatik kamera önerisini anında bıraksın.
- [ ] `SelectionInfoPanel`, `StatsPanel`, `MinimapPanel`, `EventLog`, `ToastManager`,
      `CommandPalette` ve `Sheet` CORE'dan tüketilsin; oyun UI primitive'i
      icat edilmesin.
- [ ] Reduced-motion, renk-kontrastı ve yoğun olay LOD'u aynı olay anlamını
      korusun; tarayıcı + Samsung + Lenovo görsel kanıtı alınsın.

### Adım 8 — kayıt, tekrar ve tarih

- [ ] Snapshot ile replay formatı ayrışsın: snapshot anlık state; replay seed +
      komut günlüğü + tick sayısı olsun.
- [ ] Replay 0×/0.5×/1×/2×/4× hızlarını taşısın; canlı dünya yavaşlatılmaz ve
      hızlandırılmaz. Canlı dünyanın 0× kullanıcı pause'u ayrıdır ve Screen
      Loop'ta kurulur (DESIGN §18).
- [ ] **[P0] Replay formatı kuralları sürümlesin.** `simulationRulesetVersion`,
      `SubstratePhysicsProfile` ve config digest'i, `domainGeneratorVersion`,
      `creationProtocolVersion` ve creation pre-roll config'i taşınır; uyuşmayan
      sürüm sessizce oynatılmaz, i18n'li uyumsuzluk verir (DESIGN §7).
- [ ] Aynı seed/komut dizisi bit düzeyinde tekrar üretilebilsin; tek müdahale
      çatallanarak deney karşılaştırması yapılabilsin.
- [ ] Event log doğum, ölüm, Void kaybı, split/merge, göç, çatışma, salgın,
      mutation ve extinction reason code'ları taşısın.
- [ ] Önemli organizma biyografisi ve tür soy ağacı event log + identity'den
      türesin; her birey için sınırsız geçmiş state'i tutulmasın.
- [ ] Büyük snapshot ölçümünde native binary ve IndexedDB/OPFS adayları;
      migration, CRC, last-known-good ve i18n'li recovery ile birlikte seçilsin.

### Adım 9 — toplum, tehdit ve coğrafya

- [ ] Grup ile koloni ayrışsın: koloni süreklilik, ortak kaynak, tolerans ve
      yerel sinyal ister; aynı konumdaki organism listesi yeterli değildir.
- [ ] Territory sert polygon/çizgi değil, kullanımla oluşan ve terk edilince
      solan influence field olsun; normal görünümde gizli, layer'da okunur olsun.
- [ ] Parçacık avcısı serbest maddeyi tüketip yeni oluşumu baskılasın; kendi
      kaynağını tükettiğinde açlık geri beslemesi yaşasın.
- [ ] Çekirdek avcısı membrane breach sonrası nucleus continuity'yi hedeflesin;
      core ölümü kontrol/hafıza kaybı ve gecikmeli beden dağılması üretsin.
- [ ] Virüs uyumlu zara bağlanıp enerji/metabolizma sızıntısı, çoğalma ve
      bulaşma üretsin; world zoom'da gizli, micro/layer'da okunur olsun.
- [ ] Koloni kırıcı “büyük predator” olmasın; disturbance ve fiziksel ayırmayla
      yerleşimi bozup göç/territory zinciri açsın.
- [ ] Olgun yırtıcı temas, breach, koparma ve madde katılımıyla avlansın;
      uzaktan soyut damage veya rigid sprite kullanmasın.
- [ ] Hasar structural, membrane, core, metabolic, infection ve matter-loss
      bileşenlerinde yaşasın; UI health gösterebilse de gerçek state tek HP olmasın.
- [ ] Yırtıcı yüksek cohesion/repair/kalın zarın enerji maliyetini ödesin;
      savunucu prey, koloni kuşatması, rakip predator, virüs, açlık, Void ve
      kendi burst'ü tarafından öldürülebilsin.
- [ ] Colony defense `GuardUnit` spawn'ı değil, utility + local signal +
      phenotype farkından türesin.
- [ ] Savaş ve göç nutrient depletion, detritus, disturbance, infection
      residue, territory ghost ve edge scar bıraksın; izler ayrı decay taşısın.
- [ ] Ekolojik kabul yalnız olay sayısı olmasın; sessizlik → küçük hareket →
      göç/çatışma → yeniden sakinlik ritmi ve bağlı olay zinciri ölçülsün.
- [ ] Hasar ve enfeksiyon glyph'leri gerçek hasar/enfeksiyon state'iyle
      açılsın; yakın ve layer görünümü Adım 7 LOD'uyla doğrulansın (DESIGN §6).

### Adım 10 — kalıtım, mutasyon ve seçilim

- [ ] Kalıtılabilir fenotip ile global `SubstratePhysicsProfile` ayrışsın; birey mutasyonu
      dünyanın temel pair yasasını rastgele değiştirmesin.
- [ ] Renk, cohesion, membrane, metabolizma, algı, risk tolerance, locomotor
      anatomi ve repair güvenli/morfolojik olarak doğrulanmış aralıklarda evrilsin.
- [ ] Seçilim nutrient, enerji maliyeti, avlanma, hastalık, territory ve Void
      baskısıyla aynı dünyada çalışsın; fitness tek gizli sayı olmasın.
- [ ] Predator, defender ve parazit rolleri spawn etiketiyle değil gözlenen
      fenotip/davranıştan türetilsin.
- [ ] Nesiller boyunca değişim soy ağacı, renk kayması ve davranışla okunur
      olsun; tek tick'te sınıf değiştiren mutation efekti kullanılmasın.

## Adım 11 — ölçek

- [ ] **Yoğunluk ölçek yasası ölçülsün.** `N × πR² / worldArea` komşuluk
      tahmini gerçek histogramla karşılaştırılsın; dünya alanı büyürken aynı
      lokal ekolojiyi koruyacak madde bütçesi sonuçtan türesin.
- [ ] **Üç bütçe ayrı raporlansın.** Particle, stable organism ve cognitive
      agent sayıları tek “entity count” altında saklanmasın; CPU, bellek ve
      kayıt maliyetleri ayrı olsun.
- [ ] **Sistem tempoları worker'dan önce benchmark edilsin.** Hareket, pair
      force, perception, field, territory, evolution ve history her yerde aynı
      sabit tempoyu kullanır; kamera/LOD tempo seçemez.
- [ ] **[P1] Yoğun render yolu benchmark'la seçilsin.** 10k/50k/100k/250k
      CPU-güncellemeli particle için `SpriteGPULayer` ve en az bir alternatif;
      CPU güncelleme, GPU yükleme, frame p50/p95 ve görsel parite ölçülür.
- [ ] **Worker/runtime paralelliği ölçülsün.** Tempo bütçesi yetmezse
      SharedArrayBuffer/Worker yolu; web ve Tauri COOP/COEP gereksinimleri,
      determinism ve kopyalama maliyeti kanıtlanır.
- [ ] **Ölçek kabulü yaşam zincirini korusun.** Daha kalabalık dünya ekrandaki
      bireyleri renkli halıya çeviremez; morphology, identity ve ecology aynı
      korpusta küçük dünya referansıyla davranış paritesi göstermelidir.

## Screen Loop — Product Shell (Lane B)

> Simulation semantics'ini kirletmez; Life Research (Lane A) ile paralel
> ilerler. DESIGN §18'i izler.
>
> **Öncelik notu (2026-09-19):** Lane B teknik olarak Adım 3/4'ten
> bağımsızdır ve iki paralel iş kolu varsa devam edebilir. Ama aynı kapasite
> tek işe ayrılacaksa morfoloji araştırması önceliklidir — mükemmel menüden
> "berbat blob dünyası"na açılan LIFE düğmesi ürün açısından yanlış sıradır.
> Lane B ancak Lane A'nın ürettiği, gözlemlemeye değer dünya bulunduğunda
> tam anlamıyla değerlenir.
>
> **Kapsam sınırı:** Bu hat VOL.HELL'i migrate etmez. VOL.HELL'in
> `MainMenuScene`, `PauseScreen`, `LoadingTransition` ve `PauseController`ı
> yalnız referans/ders kaynağıdır; kopyalanmaz. CORE public API yalnız VOL.LIFE
> ihtiyacıyla kanıtlanır; diğer oyunlarda zorunlu refactor yapılmaz.

### CORE genişletmeleri

- [ ] **[P0] CORE generic `MainMenu` component oluşturulsun.** Slot-based
      full-screen surface: underlay slot (optional), scrim, brand slot, content
      slot, footer slot (optional). CORE yalnız tam ekran geometrisini,
      safe-area'yı, inert/show/hide, focus girişini, scrim katmanını,
      responsive layout'u yönetir. Scene değiştirmez, save bilmez, audio bilmez,
      kamera bilmez. `core/src/ui/layout/MainMenu.ts`.
- [ ] **[P0] CORE `Modal` dismiss request/interception kavramı eklensin.**
      Programmatic `modal.close()` her zaman kapatır. User dismiss girişleri
      (Escape, Android Back, Scrim) önce `onDismissRequest(reason)` callback'e
      gider — consumer close/consume kararı verir. Reason: back, escape, scrim.
- [ ] **[P0] CORE `Sheet` header accessory slot eklensin.** Header: title +
      end (accessory slot + close button). API: `headerAccessory?: Component`.
      LIFE accessory'ye CORE Toolbar koyar. X Sheet'in kendi close button'ı
      olarak kalır. Beş aksiyona kadar 360 px'te başlık `min-width: 0`,
      accessory rail yatay/`nowrap` ve gerekince kayar; X `flex-shrink: 0` ve
      hiçbir genişlikte kaybolmaz.
- [ ] **[P0] CORE `Sheet` scrim policy passthrough eklensin.**
      `SheetOptions: closeOnScrimClick` pass-through almalı. LIFE Pause: `false`
      — scrim tap kapatmaz.
- [ ] **[P0] CORE `Sheet` initial focus explicit olsun.** Açılır açılmaz keyboard
      focus Settings'e gitmesin — Pause açıldığında default focus X/Resume.
- [ ] **[P0] CORE `LoadingScreen` transparent background eklensin.**
      `LoadingBackgroundType`'a `transparent` eklensin — altındaki canlı canvas
      görünmeye devam etsin. Indicator opsiyonel olabilmeli.
- [ ] **[P0] CORE `WorldCameraController` safe programmatic `setState()` API
      eklensin.** Mevcut: `fitWorld()` ve `getState()` var ama dışarıdan
      `setState()` yok. `animateTo()` koyma — controller'ı şişirme. LIFE-specific
      `LifeCameraTransition` animasyonu yönetsin.
- [ ] **[P0] CORE generic `BottomSheet` / `Drawer` component oluşturulsun.**
      Alttan yukarı açılan (`anchor: 'bottom'`), snap point (0.0 kapalı, ~0.48
      yarı açık, 1.0 tam ekran) destekli, scrimli/scrimsiz, focus trap ve
      klavye/gamepad gezinmesi olan generic overlay primitifi. Drag jesti
      (ivmeli fırlatma >1.5 px/ms velocity snapping) ve tek dokunuş
      alternatifi içerir. Oyun kelimesi bilmez; `core/src/ui/overlays/BottomSheet.ts`.
      Eklenince `devtools/vol-ui` showcase'ine sekme olarak eklenir.
- [ ] **[P0] CORE generic `ChevronAffordance` component oluşturulsun.**
      Hafif, yarı saydam, çerçevesiz dikey chevron (`˄`) butonu. Horizontal bar
      değildir; semantik buton (`role="button"`), mobilde yukarı sürükleme / tap,
      masaüstünde click, controller'da focus/select destekler.
      `core/src/ui/primitives/ChevronAffordance.ts`. Showcase'e eklenir.
- [ ] **[P1] CORE `Toolbar`/`ToolButton` opsiyonel semantic haptic eklensin.**
      `ToolButtonOptions.haptic` — pause header action'ları sistemin geri
      kalanıyla aynı dokunsal dile sahip olur.

### VOL.LIFE — screen loop ve session lifecycle

- [ ] **[P0] `LifeAppFlowController` oluşturulsun — explicit screen
      state-machine.** BOOTING, MENU, ENTERING_FRESH_WORLD,
      ENTERING_SAVED_WORLD, PLAYING, PAUSED, RETURNING_TO_MENU. Scattered
      boolean değil. Simulation fiziği bilmez — `ParticleStore` import edilirse
      reddedilir.
- [ ] **[P0] `LifeScreenStack` oluşturulsun — tek lifecycle owner.** MainMenu,
      LoadingScreen, LifeHud, PauseSheet, `ToastManager` vb. kurar, destroy'da güvenli
      temizler. State kararları FlowController'da.
- [ ] **[P0] `LifeRuntime` simulation/presentation clock ayrılsın.**
      `advanceSimulation(delta)` + `updatePresentation(delta)`. Presentation
      her render frame çalışabilir, simulation yalnız flow izin verirse. Death
      animation: world time. Camera transition, menu scrim, habitat decorative
      pulse: real time.
- [ ] **[P0] `LifePauseController` — reason/token modeli.** `user`,
      `background`, `transition`, `system`. Simulation ancak bütün reason'lar
      kalktığında devam eder. Resume: pause süresini catch-up etmez.
- [ ] **[P0] Creation Phase — `FROZEN`, `CREATION`, `LIVE` semantics.** Fresh
      LIFE entry'de substrate ilerler ama Step 5'te energy/ageing/metabolism
      başlamaz. Yalnız `paused: boolean` ile çözülmez. Genesis sürümlüdür:
      `creationProtocolVersion` ve pre-roll tick/config snapshot ile replay
      metadata'sına yazılır.
- [ ] **[P0] `WorldEntryCoordinator` — gerçek loading task registry.** Fake
      progress yok. Task gerçek progress bilmiyorsa percentage gösterme, yalnız
      phase text. Prod: WORLD FORMING, LIFE AWAKENING, READY. Loading sırasında
      main thread kilitlemek yasaktır — task'lar async/chunked/workerized.
- [ ] **[P0] `LifeCameraTransition` — cinematic state interpolation.** Zoom
      log-space: `zoom(t) = exp(lerp(log(startZoom), log(endZoom), easedT))`.
      Easing: smootherstep / ease-in-out-quint. Süre adaptif: yakın ~700-800ms,
      uzak→yakın ölçek geçişi ~900-1100ms, maksimum ~1200ms. Reduced motion:
      100-150ms fade/cut.
- [ ] **[P0] `LifeMainMenu` — LIFE-specific composition.** VOL.LIFE logo,
      organic radial scrim (CORE generic default değil — game CSS'inde),
      LIFE/YAŞAM button (CORE Button, LIFE-specific class border/background
      sıfırlar). Başka visible action yok. LIFE butonu viewport center'a değil
      habitat'ın projected visual centroid'ine bağlı ve safe-area içine
      kıstırılır (notch, sistem çubuğu, ekran kenarı). Touch target ~56-64dp.
      Menu açılınca ilk klavye odağı LIFE'tadır ve gameplay kontrolleri
      inert'tir; borderless görünse de semantik `<button>`dır ve klavye focus
      ring'i korunur.
- [ ] **[P0] Main Menu alt ok (`˄`) affordance'ı.** Ekranın en alt ortasında
      çok hafif, yarı saydam, çerçevesiz dikey `˄` butonu (CORE
      `ChevronAffordance`). Klasik yatay mobil drag handle çizgisi değildir.
      Mobilde yukarı sürükleme / tek dokunma, masaüstünde tıklama,
      controller'da D-pad Down ile focus ve A ile açılma destekler.
- [ ] **[P0] `GenesisDrawer` — alttan açılan dünya parametreleri çekmecesi.**
      CORE `BottomSheet` primitifini tüketir. Ekranın alt %45–50'sini kaplayan
      yarı saydam yüzey. İçerik: World Scale (yalnız EN AZ İKİ qualified
      ölçek varken görünür; tek ölçekle seçici gösterilmez — v1'de kapalı,
      preset'ler qualified oldukça açılır; 512'nin "kanıtlanmış" statüsü
      Adım 2 baseline'ıdır, DESIGN §18),
      Seed seçimi (Random / Explicit Seed), Live/Seed Preview (deterministik
      başlangıç yoğunluğu özeti), Launch aksiyonu.
- [ ] **[P0] Genesis Drawer açılışında dünya reframe animasyonu.** Drawer
      açıldığında arkadaki donmuş dünya kamerası yumuşak bir dikey ofsetle
      yukarı ötelenir (reframe); böylece drawer habitatı ve canlıları örtmez,
      görünür kalır. Drawer kapatıldığında kamera tekrar yumuşakça merkeze döner.
- [ ] **[P0] Main Menu & Genesis Drawer controller ve Steam Deck navigasyonu.**
      D-pad Down `LIFE`'tan alt oka iner; A tuşu Drawer'ı açar; Drawer açıkken
      odak içeri hapsedilir (Focus Trap); D-pad Up/Down ile Scale/Seed/Launch
      arasında gezilir, Left/Right ile presetler değiştirilir; B veya Back/Escape
      Drawer'ı kapatıp dünyayı merkeze reframe eder ve odağı alt oka iade eder.
      D-pad/stick gezintisinde 250ms başlangıç, 100ms repeat throttle uygulanır.
- [ ] **[P1] Steam Deck Verified uyumluluğu ve kontrolleri.** Kontrolcü
      bağlıyken arayüzde dinamik glif gösterimi (`[A]`, `[B]`, `[X]`, `[Y]`,
      `[D-Pad]`) ve klavye/fare tuşlarının ("Click", "Enter") gizlenmesi. Explicit
      Seed için Steamworks sanal klavye açılışı (`ShowFloatingGamepadTextInput`).
      1280×800 çözünürlükte hiçbir metin 9 pikselin altına düşemez (otomatik
      yönetişim testiyle kilitlenir). Suspend/resume sonrası `audioContext.resume()`
      ve WebGL bağlam doğrulaması.
- [ ] **[P0] Main Menu'de dünya tamamen DURUR.** Saved world: son snapshot
      frozen. Fresh world: Habitat oluşturulmuş, particle'lar yerleştirilmiş,
      simulation tick başlamamış. Sadece presentation-only (habitat glow)
      yaşayabilir.
- [ ] **[P0] Menu camera vs gameplay camera ayrımı.** MENU CAMERA:
      whole-world overview. GAMEPLAY CAMERA: saved world'de hatırlanan
      (x, y, zoom), fresh world'de `contain` overview — zorunlu ECOSYSTEM
      açılışı yok (kullanıcı kararıyla reddedildi, üstteki kapanış maddesi).
      Menu overview gameplay camera state'ini overwrite etmez — (x, y, zoom)
      ayrı saklanır.
- [ ] **[P0] Main Menu real world session — world destroy edilmez.** Aynı
      LifeRuntime, world RAM'de, simulation frozen, renderer alive. LIFE'a
      tekrar basınca seamless resume.
- [ ] **[P0] Main Menu'ye dönüş güvenli checkpoint'tir.** PAUSED → save/flush →
      gameplay camera saklanır → kamera overview'a açılır → frozen menu
      preview. Flush tamamlanmadan menu güvenli sayılmaz; world reload yok.
- [ ] **[P0] LIFE transition — üç aşamalı animasyon.** (1) Activation
      ~120-180ms: letter spacing sıkışır, haptic, input kilitlenir,
      AudioContext resume(). (2) Awakening ~300-450ms: scrim çözülür, LIFE
      pulse'a dönüşür, world kontrastına gelir. (3) Entry ~700-1100ms: camera
      hedef kameraya geçer (saved: hatırlanan gameplay kamerası; fresh:
      `contain` overview). Otomatik ECOSYSTEM dalışı requirement değildir —
      ileride ayrı human-acceptance deneyi olarak dönebilir. Reduced motion:
      kısa fade + cut.
- [ ] **[P0] Fresh entry hedef 2.5-4 saniye, hard upper ~8 saniye.** Sabit 10
      saniye yok. Physics'i yavaşça açmak için artificial force ramp eklenmez
      — simulation tick 0'dan gerçek physics. Patlama kabul edilemezse
      InitialMatterSeeder/profile düzeltilsin.
- [ ] **[P0] Saved world'de pre-roll KESİNLİKLE yok.** Saved Main Menu: exact
      snapshot frozen. LIFE: restore/validate → audio warmup → render warmup →
      camera transition → resume exact tick. Gizlice AI çalıştırmayız.
- [ ] **[P0] Fresh world "pat pat" loading sırasında görülebilir.** Menu:
      parçacıklar frozen, LIFE, scrim kalkıyor, partiküller harekete başlıyor.
      LoadingScreen transparent — world canvas alttan görünür.
- [ ] **[P0] İki farklı loading anlamı ayrılsın.** Boot preparation: Main
      Menu'nün var olması için minimum (locale, preferences, orientation,
      snapshot, world preview, renderer). World Entry Loading: LIFE'a basınca
      (audio unlock, creation protocol, camera target, session activation).
      Kısa boot loading yüzeyini flash ettirmez; gösterge küçük bir
      anti-flicker gecikmesinden sonra görünür (eşik ölçümle).
- [ ] **[P0] Bootstrap refactor.** Mevcut `bootstrap.ts` oyun yaratılmadan
      önce `worldPersistence.load()` yapıyor — save yüklenene kadar Phaser/game
      UI yok. Yeni: servisleri kurar → app shell'i kurar → boot/session
      coordinator world preview hazırlar.
- [ ] **[P0] `LifePauseSheet` — tek Sheet, iç view routing.** Header:
      `VOL.LIFE [⚙][X]`, ileride `[Codex][World][God][Settings][X]`. Body: MAIN
      MENU, QUIT GAME. Resume butonu yok — X = resume. Settings'e girince:
      `AYARLAR [⚙ selected][X]` + `<LifeOptionsPanel>`. Android Back:
      Settings → PauseHome, PauseHome → Resume. Scrim tap: resume ETMEZ. God
      aksiyonu yalnız dev/experiment/creative capability varken görünür.
- [ ] **[P1] QUIT platform politikası kararlaştırılsın.** Native: save flush →
      gerçek uygulama kapanışı. Pencere kapatma yeteneği olmayan web'de QUIT'in
      görünürlüğü ve anlamı platform politikasıyla belirlenir.
- [ ] **[P0] `LifeHud` küçültülsün.** Settings Sheet ownership'ını kaybeder,
      Pause button kazanır. Hud: branding, fullscreen? (web only), pause, FPS.
      Pause CORE `IconButton`dır; kendi toggle state'ini taşıyan
      `PauseResumeButton` kullanılmaz.
- [ ] **[P0] `LifeQuitPrompt` — explicit exit confirmation.** Current
      `LifeExitPrompt` global back handler kaydoluyor — yeni sistemde Back
      anlamları değişiyor. Back navigation tek `LifeAppFlowController` sahibine.
- [ ] **[P0] Loading sırasında Android Back abort.** Android Back/Escape:
      entry'i abort edip Main Menu'ye dönebilir. `WorldEntryLoader` AbortSignal
      desteklemeli.
- [ ] **[P0] `LifeCameraTransition` — entry camera target.** Fresh world'de
      last camera yok. `EntryCameraResolver`: active-matter centroid, en yüksek
      local density, habitat safe interior üzerinden deterministik focus.
      Saved world: last gameplay camera.
- [ ] **[P0] Gameplay camera state saklama.** Main Menu'ye çıkarken centerX,
      centerY, zoom saklanmalı. Ayrı `LifeViewState` — world physics
      fingerprint'ine dahil olmaz.
- [ ] **[P0] Audio lifecycle.** Main Menu: sakin menu cue. LIFE'a basınca:
      WebAudio unlock, SoundBank decode/warm, gameplay stems preload, menu cue
      → gameplay ambience crossfade. İlk cold boot'ta menu sessiz olabilir.
      Pause: world SFX 100-200ms fade, music pause mix'e crossfade.
- [ ] **[P0] Reset World — autosave race fix.** `saveManager.delete() +
location.reload()` yasaktır. Flow: Confirm Reset → block autosave →
      cancel/drain pending writes → delete world snapshot → create fresh
      metadata + new seed → Loading/incubation → LifeScene. Preferences
      silinmez. Şimdilik Settings altında, World paneli geldiğinde oraya
      taşınacak.
- [ ] **[P0] Orientation — mevcut native store kullanılsın.** Android manifest
      `userPortrait`, `OrientationStore.applySaved` SharedPreferences'a
      kaydediyor. Agent bunu tekrar LifePreferences içine eklememeli.
- [ ] **[P1] Scrim organic.** Menu scrim uniform siyah opacity olmamalı —
      habitat merkezini biraz daha açık bırakan hafif radial/organic scrim.
- [ ] **[P1] HUD giriş sırası.** LIFE → world wakes → camera arrives → HUD
      arrives. Pause button 150-250ms fade. Main Menu'ye dönüş tersine.
- [ ] **[P1] Uygulama kapalıyken dünya donar.** Açılışta wall-clock catch-up
      yok; kayıt kapanış snapshot'ı olarak açılır. Offline/kaba simülasyon ayrı
      ölçülen gelecekteki özelliktir (DESIGN §7).
- [ ] **[P2] Donmuş Main Menu render temposu ölçülsün.** Simülasyon maliyeti
      sıfırdır; renderer'ın 60 FPS zorunluluğu yok — düşük tempo ölçümden sonra
      seçilir.

### Screen Loop test sözleşmesi

- [ ] **[P0] İlk Android boot: portrait.**
- [ ] **[P0] Saved orientation: çizimden önce uygulanır.**
- [ ] **[P0] Menu 10 dk açık: world tick/RNG değişmez.**
- [ ] **[P0] Fresh preview: particles stationary.**
- [ ] **[P0] Saved preview: snapshot exact frozen.**
- [ ] **[P0] LIFE fresh: creation mode çalışır.**
- [ ] **[P0] LIFE saved: hidden pre-roll yok.**
- [ ] **[P0] Camera entry: endpoint exact, frame-rate independent.**
- [ ] **[P0] Reduced motion: zoom uçuşu atlanır.**
- [ ] **[P0] User Pause: sim tick değişmez.**
- [ ] **[P0] Pause 20 dk: energy/AI/RNG değişmez.**
- [ ] **[P0] User Pause + background: foreground resume etmez.**
- [ ] **[P0] Settings Back: PauseHome.**
- [ ] **[P0] Settings X: gameplay resume.**
- [ ] **[P0] PauseHome Back: gameplay resume.**
- [ ] **[P0] Scrim tap: resume ETMEZ.**
- [ ] **[P0] MainMenu Back: Quit confirm.**
- [ ] **[P0] MainMenu return: world reload olmaz.**
- [ ] **[P0] MainMenu return: save flush tamamlanır, gameplay camera saklanır.**
- [ ] **[P0] Main Menu: ilk klavye odağı LIFE, gameplay kontrolleri inert.**
- [ ] **[P1] LIFE anchor'ı safe-area içinde kalır.**
- [ ] **[P0] Quit: save flush → close.**
- [ ] **[P0] Loading slow task: animation frame pacing bozulmaz.**
- [ ] **[P0] Orientation transition: camera target yeniden çözülür, jump yok.**
- [ ] **[P1] 360 px Pause header'da beş aksiyonla X görünür ve dokunulabilir.**
- [ ] **[P1] God aksiyonu capability yokken görünmez.**
- [ ] **[P1] Hızlı boot loading yüzeyini flash etmez.**
- [ ] **[P0] Uygulama kapat-aç: dünya tick/RNG catch-up yapmaz.**
- [ ] **[P0] Samsung + Lenovo insan acceptance ayrı kapı.**

### Uygulama sırası

CORE dismiss semantics → CORE Sheet header accessory → CORE transparent Loading
→ CORE generic MainMenu → camera setState → LifeScreenStack →
LifeAppFlowController → Life MainMenu → WorldEntryCoordinator → real Pause →
Settings migration → Reset/quit/main-menu flows → device acceptance.
Physics research lane (Lane A) bundan bağımsız paralel devam eder.

## Her adımda

- Davranış test-first uygulanır; düzeltme regresyon testi bırakır.
- Adım gerçek tarayıcıda görüntüyle kapanır.
- Kabuğa, kamera veya sunuma dokunan adım iki Android cihazda doğrulanır.
- Mantık Phaser sahnesinde birikmez; `runtime/sim` Phaser import etmez.
- Ölçüm kaynak yorumuna değil DESIGN/TODO'ya yazılır.
- Oynanış ölçüleri `src/config/` altında kalır.
- Kapsam eşiği düşürülerek kapı geçilmez.
- Resize/yön değişimi dünya veya kamera durumunu sıfırlamaz.
- Qualified olmayan araştırma adayı production bundle'a girmez.

## Kapatılanlar

### 2026-09-18 — Viskoelastik Yumuşak Temas ve Homeostatik Ekolojik Vent Motoru

- [x] **[P0] Küme içi yapışma, kütle donması (lattice lock-in) ve sapan etkisi çözüldü.**
      `exclusionRadiusUnits = 9.0` (tam parçacık çapı, $2 \times radiusUnits$) ve
      `exclusionStrength = 1.2` ile parçacıklar birbirinin içine geçmeden viskoelastik
      sıvı gibi akar hale getirildi; genomdaki av-avcı/organizma kuralı $d > 9.0$
      aralığında %100 serbest bırakıldı. Aşırı sert ters-kare bariyeri (`contactStrength = 0`)
      kaldırılarak parçacıkların habitattan dışarı fırlaması (slingshot) önlendi.
- [x] **[P0] Ekolojik Vent Motoru ve Ritmik Tekil Doğuş ("Pıt... Pıt... Pıt...") kuruldu.**
      60 saniyede bir 50 parçacığın aynı anda ekrana boca edildiği ("patt") reseed
      mantığı kaldırıldı. Yerine rezervuardaki maddeyi her 1.0 saniyede bir (`ventCadenceTicks = 60`)
      tek tek doğuran, her doğumda `ParticleSpawnRenderer` (450 ms ripple) görsel
      dalgasıyla ekosisteme katan, 8-12 parçacıklık mikro-dalgalar ve 5 sn dinlenme
      (`ventCooldownTicks = 300`) ile çalışan homeostatik vent direktörü entegre edildi. 7. dakikadaki aktif canlı parçacık sayısı 33'ten 501'e yükseltildi ve ekolojik
      nüfus çöküşü (extinction) ortadan kaldırıldı. Samsung S21 FE ve Lenovo Tab M11'de
      cihaz üzerinde doğrulandı.

### 2026-09-16 — Zemin + Adım 1–3 kapanış turu

- [x] **[P0] Tautological LifeWorld test düzeltildi.** `LifeWorld.test.ts` →
      "600 tick boyunca aktif bayrak sayısı, activeCount ve madde muhasebesi
      tutar": her tick aktif bayrak sayısı `activeCount`a eşit, aktif madde +
      dış rezervuar = başlangıç; Void kaybının gerçekten oluştuğu ve en az bir
      aktif parçacığın yer değiştirdiği ayrıca sınanıyor (`62cdd5a`).
- [x] **[P0] Named deterministic RNG streams kuruldu.**
      `src/runtime/sim/RandomStreams.ts`: `worldSeed → habitat, fields,
matter-seeding, lifecycle, behavior, evolution`; FNV-1a + SplitMix32
      türetmesi altın tabloyla kilitli (`RandomStreams.test.ts`).
      `lightSourceCount` 5→6 parçacık başlangıcını, seeding parametresi ışık
      alanını ve habitat digest'ini değiştirmiyor (`LifeWorld.test.ts`).
- [x] **[P1] Parçacık slot yaşam döngüsü kanonik oldu.** Tek `activateSlot` /
      `deactivateSlot` yolu; pasif slot kanonik boşa iner, snapshot doğrulaması
      kanonik olmayan pasif slotu reddeder, farklı geçmişten aynı mantıksal
      duruma gelen iki depo aynı baytları üretir, 32 bit ID tükenmesi hata
      verir; yeniden kullanılan slot eski konumdan çizilmiyor
      (`ParticleStore.test.ts`, `ParticleRenderer.test.ts`).
- [x] **[K5] Snapshot kodeği v4'e çıktı.** Tek RNG durumu yerine akış tablosu,
      verilmiş ID sayacı ve kanonik pasif slot doğrulaması; gerçek v3 zarfı
      fixture'ı (`tests/app/fixtures/lifeWorldEnvelopeV3.json`, `8b385ad`
      kodeğiyle üretildi) i18n'li "uyumsuz kayıt" yoluna düşüyor
      (`LifeWorldPersistence.test.ts`).

- [x] **[P1] Void ölümü değişmez olay olarak teslim edildi.** Olay `kind`, tick,
      stable ID, konum, HIZ, tür ve normal taşır; `Object.freeze` ile
      dondurulur ve store'un float32 değerlerini tam taşır. İki kanal ayrıldı:
      `drainTransientPresentationEvents()` sunumu boşaltır, dünya tarihi
      enjekte edilen `WorldEventSink`e yazılır (üretimde no-op) ve sunum
      boşaltması onu tüketmez. Hayalet 250 ms sonra ilk olayın konumundan ve
      renginden çiziliyor; ölen slot kanonik boşalırken olay değişmiyor
      (`WorldEvents.test.ts`, `VoidSink.test.ts`, `VoidDeathRenderer.test.ts`).

- [x] **[P0] Masked field conservation testleri eklendi.** 64² ve 256² gerçek
      habitat maskesinde 20 tam difüzyon turundan sonra habitat toplamı
      korunuyor; tolerans float32 yuvarlamasından TÜRETİLDİ (kütle × 2^-24 × 8
      × tur), deneyerek büyütülmedi. Void hücreleri difüzyon, yenilenme ve ışık
      çiziminden sonra `LifeWorld` düzeyinde 600 tick boyunca tam 0; kıyı
      hücresine konan tekil kütle Void'e geçmiyor; depolama kenarına değen
      habitat hücreleri korunuyor; maskeli 2/4/8/16 bantlı tur tam difüzyonla
      bayt düzeyinde eşit; yenilenmenin kaynak terimi olduğu ayrıca sınandı
      (`fieldConservation.test.ts`, 11 test). Kaçak BULUNMADI: düzeltme
      gerekmedi, sözleşme testle kilitlendi.

- [x] **[P0] `WorldDomain` dünya birimi mesafe sözleşmesi kuruldu.** Tek API
      `sampleDistanceAndNormal(x, y, out?)`; `distance` + `normal` çifti
      kaldırıldı ve bütün tüketiciler (VoidSink, seeder, ParticleRenderer,
      HabitatRenderer, snapshot doğrulaması, morfoloji metrikleri) taşındı.
      Mesafe artık yaklaşım değil, kontura Newton izdüşümü. Ön-kayıtlı sınırlar
      (bantta ≤ 0,5 birim, ‖n‖ = 1 ± 1e-6, açı ≤ 2°) 200 seedlik korpusta
      tutuyor: 728.040 bant örneğinde maks hata 4,93e-5, ihlal 0; işaret ve bant
      üyeliği uyuşmazlığı 0; maks açı 0,0499°
      (`tests/long/habitatDistance.long.ts`, 239,6 sn). Birim kapısında dört
      seedlik alt küme koşar (`habitatDistanceContract.test.ts`).
      Kırmızı kanıt: polar yaklaşım bantta maks 0,914 birim şaşırıyordu.
      Ara sürümde bulunan gerçek hata (merkez çevresinde 63,3 birim) ölçümle
      saptanıp kapatıldı; başlangıç eşiği ve kaba kontur tablosu ölçümle seçildi.
      Bedeli DESIGN §11'de: kernel p50 1,21 → 3,00 ms, p95 1,44 → 4,90 ms.
      "Işın boyunca mesafe azalır" iddiası gerçek SDF'de geçerli olmadığı için
      (referans da 4,0 birim artıyor) testin sözleşmesi "her ışında işaret tam
      bir kez değişir" olarak düzeltildi.

- [x] **[P1] Habitat topoloji değişmezleri seed korpusunda testle kilitlendi.**
      Ön-kayıtlı sınırlar (tek bağlı habitat 4-komşulukla, iç delik yok 8-
      komşulukla, eğrilik yarıçapı ≥ 52, boğaz ≥ 192, güvenli iç bölge ≥ %50)
      1000 seedlik korpusta 256² ve 1024² maskeyle koşuyor
      (`tests/long/habitatTopology.long.ts`); birim kapısında dört seedlik alt
      küme var (`habitatTopology.test.ts`). 64 seedlik ön ölçümde en kötü
      değerler: eğrilik 186,0, boğaz 544,7, güvenli oran %59,18 — ihlal yok,
      üreteç düzeltmesi gerekmedi. Ölçümün ayırt ettiği, bilerek delik açılmış
      ve ikiye bölünmüş maskelerle sınandı. Config düzeyinde kanıtlanabilen
      koşul `validateSubstrateConfig`e girdi: muhafazakâr analitik alt sınır
      (varsayılan adayda 0,561 vs ölçülen 0,592) yama yarıçapı 90 birimi
      aştığında örneği reddediyor.

- [x] **[P0] HabitatRenderer kontur polyline yerine SDF mesafe rasterine
      geçti ve [P0] regresyon testi yazıldı.** Kontur noktalarını normal
      yönünde öteleyip `strokePoints` ile bağlayan yol TAMAMEN silindi;
      `rasterizeHabitatGlow` ışımayı doğrudan C6 mesafesinden çiziyor (Void'de
      üstel sönüm, |d|≈0'da Gauss kıyı vurgusu, içeride `interiorFadeUnits`'te
      tam sıfıra inen geçiş). Doku statiktir, nabız yalnız alfayı oynatır.
      Raster kurulumda koşmuyor: 512² tek seferde 723 ms ölçüldü ve DESIGN §18
      yüklemede ana iş parçacığını kilitlemeyi yasaklıyor, bu yüzden kare
      bütçesiyle (6 ms) satır satır doluyor; birleşen bantlar tek seferlik
      rasterle bayt bayt aynı. Kurulumda kilitlenen süre 1535,7 → 138,3 ms.
      Testler: keskin iç bükey yıldız domaininde geçiş bandı dışında alfa tam
      sıfır, kıyı vurgusu 720 noktada kesintisiz, Void'de alfa monoton azalıyor,
      aynı girdi aynı bayt, doku bir kez kurulup destroy'da siliniyor ve spy
      testi `strokePoints`/`lineStyle`ın hiç çağrılmadığını kanıtlıyor.
      E2E (Chromium, üç zoom): eşik her görüntüden Otsu ile türüyor (sahne
      tohumu rastgele olduğu için sabit eşik kayıyordu — ölçüldü), parlak maske
      kıyı bandı kadar aşındırılıyor ve iddia kirişin imzasına bağlı: ölçülen
      iç karanlık oran 0,00000, en uzun karanlık köşegen 0,0000. Lenovo
      TB350FU'da kurulup üç kare doğrudan incelendi: kiriş yok, kenar sürekli,
      fps 100–111, tepe kare 25–33 ms, ANR yok.

- [x] **[P1] `FieldSet.sample()` habitat maskesini hesaba katıyor.** K4 kuralı
      uygulandı: Void ağırlıkları düşülür ve kalan ağırlıklar yeniden normalize
      edilir; dört hücre de habitatsa sonuç maskesiz bilineerle BAYT düzeyinde
      aynıdır; dört hücre de Void ise 2×2 şablonu çevreleyen halkadaki en yakın
      habitat hücresi deterministik sırayla okunur, o da yoksa 0 döner; sonlu
      olmayan koordinat reddedilir. Sabit alanda habitatın her örneği (kıyı
      hücreleri dahil) tam olarak sabiti veriyor, örnek şablon aralığını
      aşmıyor, uzak Void noktası 0 dönüyor ve 2000 sorguda NaN üretilmiyor
      (`fieldMaskedSample.test.ts`, 6 test). Kural DESIGN §2'ye yazıldı.

- [x] **[P0] Benchmark scaling kapısı düzeltildi ve [P1] algoritmik/ürün
      benchmark'ı ayrıldı.** Eski 14 tavanı karmaşıklığı değil YOĞUNLUĞU
      ölçüyordu: benchmark üretim seeder'ını kullanıyor, sabit yama yarıçapı
      yüzünden 4× parçacık aynı yamalara gömülüyor ve azami hücre doluluğu
      105'ten 416'ya çıkıyordu. `scripts/benchmark/particleScaling.ts` iki seri
      raporluyor — algoritmik (habitat içinde tabakalı ızgara; doluluk 38 → 40,
      yani girdiden bağımsız) ve ürün (gerçek seeder) — ve her ikisi de aktif
      sayı, azami hücre doluluğu, parçacık başına aday çift, p50/p95 taşıyor.
      Kapı algoritmik seriye bağlandı: beş ayrı koşuda oranlar 4,654–4,827,
      medyan 4,752, tavan medyan × 1,10 = **5,23** (K7 sınırı 6; doğrusal ideal
      4,0). Ürün serisinin medyanı 9,744 raporlanıyor ama kapılanmıyor.
      `pnpm exec just scaling` art arda 5 kez yeşil; rapor şeması ve ayrımın
      kendisi `tests/benchmark/particleScaling.test.ts`te kilitli. DESIGN §11
      ve `quality.json` aynı tek sayıya indi.

### 2026-09-15 — DESIGN/TODO uzlaştırması

- [x] **Canlı dünya pause'u belgelerde tek anlamlı.** DESIGN §1/§13 ve TODO
      Adım 8 canlı 0× kullanıcı pause'unu ve replay'in 0×/0.5×/1×/2×/4×
      hızlarını aynı biçimde taşır.
- [x] **`SubstrateCandidate` profil ayrımı DESIGN'a işlendi.** Tek
      `PhysicsGenome` modeli, qualification ve promotion dili physics, seeding,
      Void ve senaryo ayrımına geçti; `VoidProfile` aranmaz.
- [x] **Fission sözleşmesi DESIGN §8'de;** Adım 4 maddesinin atfı düzeltildi.
- [x] **Glyph'ler adımlarına dağıtıldı.** Adım 2 yalnız serbest, velocity ve
      Void glyph'ini taşır; membrane/core 4, tail 6, hasar/enfeksiyon 9.
- [x] **Mimari sözleşmeler DESIGN'a geri eklendi:** SDF dünya birimi ve habitat
      topolojisi, kanonik slot yaşam döngüsü, değişmez Void ölüm olayı ve iki
      olay kanalı, biyokütle defteri, replay ve creation sürümleri, kapalı
      uygulamada donmuş dünya.
- [x] **Screen Loop belge boşlukları kapatıldı:** VOL.HELL kapsam sınırı,
      generic `MainMenu` ve modal dismiss sözleşmesi, boot hazırlığı, menüye
      dönüşte flush, LIFE odağı ve safe-area, beş aksiyonlu header, God
      görünürlüğü, QUIT platform politikası.
- [x] **[P1] DESIGN "384 test" cümlesi kanıt kaynağı taşır;** araştırma
      kütüphanesi DESIGN ve README'de iskelet olarak anılır.

### 2026-09-14 — Particle Substrate v2 ve Adım 3 araştırma kütüphanesi

- [x] **Particle Substrate v2 uygulanmıştır.** `SubstrateConfig`, `PhysicsGenome`,
      `DynamicsGenes`, `PairForceKernel` (generalized multi-band directional),
      512 kapasiteli `ParticleStore` (aktif/pasif slot), `ParticleSpatialHash`
      (yalnız aktif), organik `HabitatSDF`/`WorldDomain`, `VoidSink` (geri
      dönüşsüz deaktivasyon), `MatterReservoir`, `InitialMatterSeeder`
      (patch+cloud), v3 snapshot codec, çok bantlı field güncelleme,
      deterministic RNG, camera-domain handling, Void-death rendering.
- [x] **Adım 3 araştırma kütüphanesi uygulanmıştır** (`scripts/morphology/`):
      `GenomeSampler`, `MorphologyMetrics`, `ClusterTracker`, `PhaseClassifier`,
      `ResearchHarness` (broad→refinement→qualification), `PerturbationSystem`,
      `Shards` (deterministic work ID), `QualificationArtefact`, `PromotionFlow`,
      CLI. Headless — Phaser import etmez. _İskelettir; qualification düzeyinde
      değildir (Adım 3 araştırma sistemi düzeltmeleri)._
- [x] **Brute-force oracle testi uygulanmıştır.** Spatial-hash/kernel yolu
      doğrudan all-pairs referans implementation ile karşılaştırılır; aktif/pasif
      slot ve tür çifti davranışını floating-point tolerans içinde doğrular.
- [x] **V3 snapshot codec uygulanmıştır.** Habitat digest, active mask, stable
      ID, next ID, reservoir ve Void sayaçları; i18n'li uyumsuzluk yüzeyi.
- [x] **384 test geçer.** Coverage 96,93/93,13/93,51 (statement/branch/function).
      _2026-09-14 geliştirici koşusu; ürün kabulü değildir._
- [x] **512 parçacık benchmark:** p50 ≈ 0,98 ms, p95 ≈ 1,00 ms. 2048 parçacık:
      p50 ≈ 13,9 ms. 256² field ≈ 5,4 ms/tick. 512²/4-band ≈ 5,6 ms/tick.

### 2026-09-14 — VOL.LIFE sağlamlaştırma ve repo hijyeni

- [x] **Simülasyon temposundaki gizli 60 Hz varsayımı kaldırıldı.** Alan
      zamanlayıcısı `fixedStepMs`den türetilen taban Hz'i kullanır; 30 Hz dünya + 10 Hz alan üç tick'te bir güncellenir. Dünya ve parçacık config'inin
      sonluluk, aralık, tam sayı ve geometri önkoşulları kurulumdan önce
      doğrulanır.
- [x] **Snapshot geri yükleme atomik ve tek doğrulayıcılı oldu.** Disk
      persistence ile doğrudan `LifeWorld.restore` aynı alan/parçacık/zaman/RNG
      doğrulamasını kullanır; `FieldSet` ve `ParticleStore` da uzunluk ile
      sonluluğu yazmadan önce doğrular. Geçersiz son dizi canlı dünyayı kısmen
      değiştirmez.
- [x] **Config, fingerprint ve metadata sahipliği yalıtıldı.** Dünya ile
      persistence kurulumda çağıranın nesne ve TypedArray'lerini kopyalar;
      sonradan yapılan dış mutasyon çalışan fiziği veya fingerprint
      sözleşmesini değiştirmez. Fingerprint üretimi geçersiz config'i hash
      hesaplamadan önce reddeder.
- [x] **Kurulum ve kapanış yaşam döngüleri sertleştirildi.** Yarım kalan
      `LifeRuntime` o ana kadar aldığı GPU/giriş sahiplerini geri bırakır;
      `LifeScene` yeniden kurulumda Phaser lifecycle listener'larını
      biriktirmez; autosave gözlem kurulumu çökerse açtığı zamanlayıcıyı geri
      alır ve snapshot hatası zamanlayıcıdan kaçmaz; yok edilen çıkış onayı
      bekleyen kayıt bitince pencereyi kapatmaz.
- [x] **Fresh-world çakışması ve repo ignore sözleşmesi kapılandı.** Tekrarlanan
      entropy aynı oturumda daha önce üretilmiş seed'i yeniden kullanmaz. Tüm
      oyunların Apple üretim ağacı ve Android build çıktıları ignore edilir;
      Android kaynak manifesti izlenebilir kalır. 1000 satır kapısı yalnız
      çalıştırılabilir/stil/native kaynağı ölçer; Markdown, JSON ve diğer veri
      belgeleri büyüklükten bağımsız olarak kapının dışındadır.

### 2026-09-14 — Particle Substrate v2 tasarım reseti ve kalıntı temizliği

- [x] **DESIGN yeni dünya sözleşmesine geçirildi.** 512 başlangıç aktif
      maddesi, organik HabitatSDF, dar tidal fringe, geri dönüşsüz Void ölümü,
      dış matter reservoir, detritus, multi-band PhysicsGenome, dağıtık
      locomotion, beş tehdit ailesi ve kamera kabulü tek belgede kilitlendi.
- [x] **Başarısız v3 araştırma hattı ürün yüzeyinden kaldırıldı.** Qualified
      aday üretmeyen search/proof/density betikleri, metrik/config yüzeyi, ham
      JSON artefaktları ve generated candidate catalog güncel ağaçtan
      çıkarıldı; negatif sonuç commit `0ef88c9` geçmişindedir.
- [x] **Qualified olmayan candidate enjeksiyonu kapatıldı.** Eski
      `?morphologyCandidate=` / build-env yolu boot zincirinden çıkarıldı;
      regresyon testi eski query'nin fetch veya fizik override üretmediğini
      doğrular.
- [x] **Geçersiz proof gate kalıntıları temizlendi.** Kök script, justfile
      tarifi ve README/gate tablolarındaki yinelenen/eski Adım 4 satırları
      kaldırıldı. V2 protokolü yazılmadan yeni gate ilan edilmeyecek.

### 2026-09-13 — v1 sonlu dünya deneyi, responsive ayarlar ve autosave

- [x] **[P0] Toroidal topoloji sonlu fiziksel dünya deneyine taşındı.** Tek config
      `WorldBounds`; particle hash/mesafe/entegrasyon, field sample/diffusion,
      ışık kaynağı, kamera ve renderer aynı 1024×1024 sınırı tüketiyor. Recovery
      turunda broad contact zone kaldırılıp çarpışma anı çözen impulse modeliyle
      değiştirildi; opak duvar sunumu fizik insetinden ayrıdır. Bu yaklaşım v3
      sonuçlarından sonra ürün kabulü değil negatif baseline'dır.
- [x] **[P0] Fixed-step konumları her render karesinde interpolate ediliyor.**
      Önceki ve güncel SoA konumları tutuluyor, `getInterpolationAlpha()`
      renderer'a iletiliyor ve ara kareler pürüzsüz çiziliyor.
- [x] **[P0] V1 kamera finite world'ü `cover` ediyor ve momentum taşıyor.** Drag
      parmağa doğrudan bağlıdır; release velocity üstel sönümlenir, sınırda
      normal bileşen kesilir. Özellikler korunur; `cover`/sert navigation
      domain'i v2 kamera kabulünde yeniden açılmıştır.
- [x] **[P0] Settings form CORE responsive primitive'ine taşındı.** Kontrol
      sütunu intrinsic genişliktedir, switch sağdadır, segmented control
      taşmaz. 4 viewport'ta (360×800, 800×360, 800×1280, 1280×800) sıfır yatay
      taşma E2E testiyle kanıtlandı.
- [x] **[P1] Semantik haptics CORE primitive politikası oldu.** Button ve
      IconButton `tap`, seçim bileşenleri `select`; Confirm olumlu eylemi
      `success`, destructive eylemi `warning`; `haptic:false` override.
- [x] **[P1] Ayar kalıcılığı cihazda katman katman kanıtlandı.** İki fiziksel
      Android cihazda ayar seçimleri, dil, tema ve haptics tercihleri doğrulandı.
- [x] **[P1] Minimal dünya autosave/resume tamamlandı.** Sürümlü binary codec,
      `LifeWorldStore` portu ve bugünkü `SaveManager` backend'i kuruldu. CRC32,
      semantik doğrulama, periyodik/background save ve çıkışta beklenen flush
      test edildi.
- [x] **[P1] İlk tek-kare metrik ve tarama spike'ı kuruldu.** 12 matris + 8
      preset yalnız dar alt uzayı reddetti; geniş ve uzun-vade arama Recovery
      kapısında yeniden açıldı.

### 2026-09-13 — v1 acceptance düzeltmeleri ve parçacık çekirdeği

- [x] **Bantlı difüzyon aynı kaynak zamanını okuyor.** Kısmi bant ayrı
      `sourceEpoch` olmadan reddedilir; `LifeWorld` tam turun kaynağını ve
      snapshot durumunu korur. Tam/bantlı sonuç eşitliği regresyon testidir.
- [x] **Kamera giriş ve dünya sözleşmesi sertleştirildi.** Wheel
      pixel/line/page normalize ve olay başına sınırlıdır; zoom yumuşarken
      cursor anchor sabit kalır. Pinch gesture başlangıcına bağlıdır, pointer
      değişiminde yeniden kurulur. Kamera seam boyunca sarılmadan ilerler.
      _Seam cümlesi toroidal dünyaya aittir; v2 habitatında wrap yoktur._
- [x] **Kanonik overview ve alan ağırlığı düzeltildi.** En uzakta tek kare
      dünya ortalanır ve pan kilitlenir; yakın görünüm gerçek 3×3 alan
      kopyasıdır. Varsayılan alan luması yaşam katmanını bastırmayacak düzeye
      indi. _Yerini aldı: v2 kamera domain'i habitat + Void payıdır; 3×3 kopya
      toroidal dünyaya aittir._
- [x] **Sheet yerleşimi ölçülebilir sözleşmeye bağlandı.** X, dişli ve tam
      ekran aynı 40×40 `IconButton` geometrisidir; X dişliyle aynı safe-area
      kenarındadır. Label/control grid, switch sağ ankrajı ve yatay telefonda
      gereksiz scroll olmaması Chromium bounding-box E2E testidir. _Kısmen
      yerini aldı: dişli HUD'dan Pause Sheet header'ına taşınır (Screen Loop)._
- [x] **Native haptics kuruldu.** CORE platform sürücüsü native backend'i
      fallback'lerden önce seçer; Tauri resmi haptics eklentisi niyetleri
      impact/selection/notification'a eşler. Android `VIBRATE` ve capability
      izinleri drift testiyle korunur.
- [x] **Adım 2 parçacık çekirdeği:** sabit SoA `ParticleStore`, altı tür,
      ayrı dünya paleti, asimetrik 6×6 matris, counting-sort spatial hash,
      ortak yakın itme, orta menzil tür kuvveti, sürtünme, hız tavanı ve
      sonlu mesafe. Kuvvet birikimi entegrasyondan ayrıdır; alan kuvvetleri
      kapalıdır. SoA/hash korunur; triangular kuvvet ve rol varsayımı v2 ürün
      fiziği değildir.
- [x] **Determinizm ve render:** seed + snapshot/restore parçacık dizilerini
      bayt düzeyinde korur. Tek sabit Phaser Graphics adaptörü parçacığı sonlu
      dünya koordinatında ve dünya birimli yarıçapla çizer.
- [x] **Ölçüm:** sabit yoğunlukta 512→2048 çekirdek oranı 4,94;
      `quality.json` tavanı 5,5. Chromium WebGL 100/1.000/5.000 p50/p95
      ölçümleri DESIGN §11'de; 5.000 sonucu mevcut yolu yoğun ölçek için
      reddettiği için Adım 11 karşılaştırması açık bırakıldı. _V1 çekirdeğine
      aittir; v2 tavanı ve algoritmik/ürün ayrımı Adım 3 araştırma sistemi
      düzeltmelerinde açıktır._

### 2026-09-12 — Adım 1: dünya substratı ve zemin kalanları

- [x] **Saat:** `SimulationClock` `partialStep: 'defer'` ile kurulur;
      `LifeRuntime.test.ts` seçimi kilitler. `resolveMaxStepsForSpeed` yalnız
      tekrar kipine (Adım 8) ayrıldı.
- [x] **Tempo zamanlayıcısı:** `SimulationTempo` 60 taban tick'te 10 Hz'lik
      sistemi tam 10 kez koşar (`SimulationTempo.test.ts`); ilk tüketici
      difüzyon.
- [x] **`FieldSet`:** `flowX`/`flowY`, `nutrient`, `light`, `temperature`,
      `disturbance` — `Float32Array` paralel diziler, alan başına nesne yok.
- [x] **Difüzyon:** 256² tam güncelleme seçildi; bu makinede 512²/4 bant tam
      tur ~21,9 ms iken 256² tam tur ~5,4 ms/tick ölçüldü
      (`benchmark:fields`, 2026-09-12). Çözünürlük 2'nin kuvveti (WebGL1
      tekrarlı örnekleme, DESIGN §2).
- [x] **Çift doğrusal örnekleme:** `FieldSet.sample` hücre merkezleri arasında
      interpolasyon yapar; `FieldSet.test.ts` hücre ortası değerleri kilitler.
- [x] **Kaynak tohumlama ve yenilenme:** besin tohumdan tohumlanır ve `light`
      girdisiyle tavana yenilenir; `light` tohumdan türeyen, yavaşça kayan 5
      yumuşak kaynaktır (`LifeWorld`). Aynı tohum aynı alanları verir;
      kaynakların ürettiği zenginleşme/fakirleşme ekran görüntülerinde görüldü
      (masaüstü sürükleme, SM-G990B2 kaydırma).
- [x] **Sonlu alan sınırı:** no-flux/reflective örnekleme karşı kenarı komşu
      saymaz; köşe ve kenar difüzyonu testle kilitli.
- [x] **[P1] Dünya kamerası:** CORE `WorldCameraController` — sığdırma,
      sürükleme, tekerlek, çift parmak, sonlu sınır ve VOL.UI showcase'i
      kuruldu. Ürün acceptance'ında bulunan
      giriş/overview kusurları 2026-09-13 bölümünde ayrıca kapatıldı.
- [x] **Alan görüntüsü — varsayılan:** alanlar çok hafif çizilir, dünya
      `FieldRenderer` ile 256² canvas dokusuna taşındı. Varsayılan ağırlık,
      kanonik görünüm ve gerçek 3×3 kopya 2026-09-13 acceptance turunda
      düzeltildi. Katman görünümünün doğrulaması Adım 7'de açık kaldı. _3×3
      kopya toroidal dünyaya aittir; v2'de yoktur._
- [x] **Determinizm testi başladı:** aynı tohum + aynı tick bayt bayt aynı
      alan dizilerini verir; ara nokta snapshot'tan devam aynı sonuca varır;
      kademeli alan imleci snapshot/restore'da korunur (`LifeWorld.test.ts`).
- [x] **E2E:** `boot.spec.ts` üretim derlemesini gerçek WebGL Chromium'da
      açar: kanvas + Sheet, DPR 2 görüntü alanı, WebGL kapalı iken i18n'li
      fatal yüzey. `test:e2e` script'i ve `justfile e2e` tarifi paketi
      kapsıyor.
- [x] **[P1] Paket bütçesi yeniden tabanlandı.** Substratla birlikte app
      42,5 KB ölçüldü (`bundle-report`); tavan 40 → 52 KB'a çıkarıldı, gerekçe
      `quality.json` yorumlarında.
- [x] **[P1] Kabuğun gerçek tarayıcı/WebGL kanıtı:** yukarıdaki
      `boot.spec.ts` ile kapandı — kanvas görünür ve ölçülü, seçenekler
      düğmesi görünür, konsol hatası yok.
- [x] **[P2] Yön desteği çalışma anında tazeleniyor.** `OrientationPreference`
      `subscribeInteractive` + `vol:windowmodechange` (native
      `onMultiWindowModeChanged` köprüsü) ile panele taşır. SM-G990B2'de
      (Android 16): çalışma anında `isInMultiWindowMode=true` olunca yön
      kontrolü canlı pasifleşti; çıkışta yeniden etkinleşti ve Dikey/Yatay
      istekleri uygulandı (ROTATION_0/ROTATION_90 ölçüldü).
- [x] **[P2] `applySaved` çalışma anı kuralıyla aynı kontrolü paylaşıyor.**
      `OrientationPolicy.isSupported` ortak; iki yolun aynı kuralı kullandığı
      `OrientationPolicyTest` (JUnit) ile kilitli.
- [x] **[P3] Geç açılış hatası oyunu geri alıyor.** `bootstrap` catch'i
      `game.destroy(true)` çağırır; oyun kurulduktan sonra fırlatılan adım
      `bootstrap.test.ts`te sınandı.
- [x] **[P3] Tercih kaydı başarısızlığı görünür.** `LifePreferences` yazma
      hatasını `onSaveError` dinleyicilerine taşır; `LifeHud` danger toast
      gösterir (`life:options.saveFailed`, testle kilitli). Davranış DESIGN
      §7'ye yazıldı.

### 2026-09-11 — seçenekler çekmecesi, ekran yönü, görüntü kipi ve zemin

- [x] **[P1] Seçenekler çekmecesi (kullanıcı isteği).** Dişli düğmesi CORE
      `Sheet`ini açıyor: sağdan, en az yarım genişlik, içerik kendi içinde
      kayıyor; dikey telefonda tam genişlik. Ölçüldü:
      masaüstü tarayıcıda 1280 px'in 640'ı, yatay telefonda 832 px'in 420'si.
      Scrim, X, Escape ve Android geri tuşu kapatıyor; telefonda geri tuşu önce
      çekmeceyi kapatıyor, çıkış onayı açılmıyor. Linux masaüstünde Escape
      çekmeceyi kapatıp odağı dişliye döndürüyor. Eski `Popover` paneli kalktı.
      _Yerini aldı: Screen Loop Pause Sheet'i — scrim kapatmaz, ayarlar header
      aksiyonudur, Back bir seviye geri döner. Tarihsel uygulama kaydıdır._
- [x] **[P1] Dil seçeneği (kullanıcı isteği).** TR/EN, CORE `Select` ile;
      `SaveManager` üzerinden kalıcı. Telefonda İngilizce seçilince başlık ve
      etiketler değişti, yeniden açılışta dil korundu; tarayıcıda yeniden
      yüklemede korundu.
- [x] **[P1] Kare hızı seçeneği (kullanıcı isteği).** CORE `FpsMeter`,
      varsayılan kapalı, en fazla 250 ms'de bir yazıya çevrilir; tercih kalıcı.
      Telefonda "60 FPS" görüldü ve yeniden açılışta açık kaldı.
- [x] **[P1] Dokunsal geri bildirim seçeneği (kullanıcı isteği, vol-hell
      deseni).** Satır yalnız titreşim motoru olan cihazda görünür; varsayılan
      kapalı ve kalıcı. İlk tur yalnız görünürlük/kalıcılığı kanıtladı; native
      titreşimin eksik olduğu 2026-09-13 acceptance turunda saptanıp giderildi.
- [x] **[P1] Sağ üst düğme kümesi platforma göre kuruluyor.** `LifeScene`
      testi kümeyi üç platformda sınıyor. Tarayıcıda iki düğme (tam ekran ve
      seçenekler); telefonda dikey ve yatayda ve Linux masaüstünde yalnız
      seçenekler (ekran görüntüleri). _Yerini aldı: Screen Loop HUD'ında Pause
      düğmesi vardır, ayarlar Pause Sheet header'ındadır. Tarihsel kayıttır._
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
      organizmanın deposudur (§3); dış girdi `light` ve sonlu görüntü kuralı
      (§2); tüketimin sunumu, katman görünümü ve kabuk yerleşimi (§6); ekran
      yönü, varsayılan dikey ve `user*` ailesi (§9).

### 2026-09-10 — denetim düzeltmeleri (`6b82b2d`)

- [x] **[P2] RNG 0-durumu geri yükleme:** `setState(0)` artık fallback'e
      çevrilmiyor; sıfır durumundaki anlık görüntü birebir sürüyor. Kurucudaki
      0 takma adı Zemin'de yeniden açıldı.
- [x] **[P2] Sahne DESTROY yaşam döngüsü:** SHUTDOWN yanında DESTROY de
      kapsamı topluyor.
- [x] **[P2] Android geri hareketi:** `LifeExitPrompt` işaretçi türünden
      bağımsız kuruluyor. _Yerini aldı: Back sahipliği `LifeAppFlowController`da,
      çıkış onayı `LifeQuitPrompt`tadır (Screen Loop)._
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
