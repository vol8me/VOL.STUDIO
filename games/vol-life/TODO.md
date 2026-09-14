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
- [ ] **[P2] Büyük dünya depolama backend'i ölçülsün.** `LifeWorldStore`
      portu korunur; 512 aktif madde + active mask + stable ID + reservoir
      snapshot boyutu ölçülür. Gerekirse native binary dosya ve web
      IndexedDB/OPFS; migration, last-known-good ve i18n'li uyumsuz kayıt
      yüzeyi birlikte uygulanır.

## Adım 1 — dünya substratı

- [ ] **Katman görünümü Adım 7'de açılır.** Nutrient, light, temperature,
      disturbance, ileride detritus/territory/infection katmanları normal
      görünümü kirletmeden ayrı seçilir. Tarayıcı ve telefonda ekran
      görüntüsü olmadan kapanmaz.

## Adım 2 — Particle Substrate v2

- [ ] **[P0] Eski production fiziği yalnız negatif baseline olarak izole
      edilsin.** Yeni substrate aynı anda devreye alınmadan çalışan uygulama
      sökülmez; fakat triangular kernel, rectangular collision wall ve
      100-particle config hiçbir yerde kabul edilmiş ürün diye adlandırılmaz.
      Kapanır: v2 default olur, eski kernel yalnız test/benchmark fixture'ında
      kalır veya tamamen silinir.
- [ ] **[P0] `WorldDomain` ve deterministic `HabitatSDF` kurulsun.** Rect
      storage içinde yumuşak oval/superellipse + düşük frekanslı noise;
      pozitif inside, sıfır edge, negatif Void sözleşmesi. Aynı seed aynı SDF,
      farklı seed farklı ama geçerli kontur üretir. Cep, kendini kesme ve aşırı
      girinti invariant'ları test edilir.
- [ ] **[P0] Field solver habitat maskesine taşınsın.** Void hücreleri kaynak
      üretmez; SDF yüzeyinde no-flux uygulanır; karşı kenar komşuluğu ve wrap
      yoktur. Dikdörtgen dış tampon fiziksel dünya sayılmaz.
- [ ] **[P0] `ParticleStore` capacity/active/stable-ID sözleşmesi kazansın.**
      Storage slotu kimlik değildir. Deactivation diziyi kaydırmaz; inactive
      slot hash, force, morphology ve render yollarına giremez. Slot yeniden
      kullanılırsa yeni world-scoped ID atanır.
- [ ] **[P0] `VoidSink` ve `MatterReservoir` ayrı sorumluluk olsun.**
      Güvenli alanda Void kuvveti sıfır; dar tidal fringe config ile sınırlı;
      SDF crossing aynı tick'te geri dönüşsüz deactivation ve rezervuar
      muhasebesi üretir. Bounce, clamp, restitution ve karşı kenardan dönüş
      regresyon testleriyle yasaklanır.
- [ ] **[P0] Generalized multi-band `PairForceKernel` yazılsın.** Hard-core,
      near/mid/far lobe, cutoff ve yönlü asimetri ayrı test edilir. 6×6
      strength + 3×3 role/range + az sayıda global profile parametresi config
      verisi olur; runtime içinde denge sayısı saklanmaz.
- [ ] **[P0] `InitialMatterSeeder` 512 aktif maddeyi lokal yamalara
      dağıtsın.** Uniform soup ve scripted organism yasaktır. Seed yalnız
      başlangıç koşulunu belirler; aynı PhysicsGenome bütün seed'lerde aynıdır.
- [ ] **[P0] Spatial hash ve integrator aktif maddeye taşınsın.** Brute-force
      oracle ile küçük fixture paritesi; pair kaçırmama, inactive dışlama,
      speed envelope ve fixed-step determinism test edilir.
- [ ] **[P0] Habitat/Void sunumu kare borderı tamamen kaldırsın.** Fizik SDF
      ile render aynı domain'i tüketir. Habitat edge organik fade, Void düşük
      frekanslı animasyon; fizik konturu görsel animasyonla hareket etmez.
- [ ] **[P0] Void ölüm sunumu simülasyondan ayrıştırılsın.** Crossing olayı
      stretch → color drain → shrink/smear → fade üretir; sunum hayaleti hash,
      force ve snapshot canlı listesine dönemez. Reduced-motion ve yoğun kayıp
      LOD'u test edilir.
- [ ] **[P1] Particle glyph role/state morphing kurulsun.** Serbest, membrane,
      core, velocity, tail, damage, infection ve Void-fringe biçimleri salt
      render verisidir; collision radius ve kuvveti değiştiremez.
- [ ] **[P0] Kamera yeni habitat/Controlled-Void domain'ine taşınsın.** Max
      zoom-out bütün habitatı ve anlamlı Void margin'ini gösterir; sonsuz
      karanlıkta kaybolma yoktur. Drag doğrudan, release momentum modality
      bazlı, zoom anchor sabit, resize/orientation state korumalıdır.
- [ ] **[P1] Kamera aday ölçüleri cihazda karşılaştırılsın.** Max zoom-out için
      habitat çevresinde %10–20 Void ve habitatın viewport'un yaklaşık
      %15'inden küçük olmaması yalnız başlangıç hipotezidir; config kararı
      mouse/touch ekran görüntüsü ve kullanıcı hissiyle verilir.
- [ ] **[P0] Kamera human acceptance yeniden açılsın.** Masaüstü mouse ve
      trackpad, Samsung S21 ve Lenovo tablette kullanıcı rahat bulmadan
      kapanmaz. Birim testleri ve özellik listesi insan kabulünün yerine
      geçmez.
- [ ] **[P0] Snapshot v2 domain state'ini taşısın.** Habitat parametre/digest,
      active mask, stable ID, next ID, reservoir ve Void sayaçları binary
      codec/fingerprint'e eklenir. Eski snapshot güvenli göçemiyorsa sessiz
      yorumlanmaz; i18n'li uyumsuzlukla yeni dünya açılır.
- [ ] **[P1] 512 bütçesi gerçek hedeflerde ölçülsün.** Headless kernel,
      Chromium WebGL, Samsung ve Lenovo için CPU/render p50/p95, bellek, açılış
      ve ısınma raporlanır. Ölçüm DESIGN §11'e girer; kalite düşebilir ama
      fizik değişemez.
- [ ] **[P0] Adım 2 kabulü.** Birkaç simüle dakikada determinism, güvenli alan
      sıfır Void etkisi, doğru crossing, bounded fringe, aktif hash ve cihaz
      akıcılığı geçer. Zar/organizma üretmek bu adımın kabulü değildir.

## Adım 3 — Morphology Discovery v2

- [ ] **[P0] Sürümlü `PhysicsGenome` şeması kurulsun.** Force profile,
      directed strength/range, damping, speed envelope, local density,
      seeding ve fringe parametrelerinin tamamını taşır. World seed genom
      değildir.
- [ ] **[P1] Kernel ailesi falsification noktası tanımlansın.** İlk aday
      generalized asymmetric multi-band'dir. Bu aile faz çeşitliliği
      üretemezse daha serbest multi-lobe ve active-particle alternatifleri aynı
      harness/seed/metriklerle denenir; üç production kernel birden taşınmaz.
- [ ] **[P1] V1 negatif kontrol yeniden üretilebilir küçük fixture olsun.** Ham
      50k satırlık artefakt runtime'da tutulmaz; triangular baseline'ın config,
      korpus ve özet sonucu sürümlü benchmark ile yeni adayın aynı ölçümde
      gerçekten daha iyi olduğunu kanıtlar.
- [ ] **[P0] Faz sınıflandırıcısı önce kurulsun.** Dead, gas/soup,
      crystal/frozen, single-collapse, Void-loss dominated, orbit dominated,
      speed-cap chaos ve dynamic-structured sonuçları ayrı reason code ile
      sınıflandırılır.
- [ ] **[P0] Metrikler v2 fiziğine göre yeniden yazılsın.** Eski wall-support
      metriği kaldırılır; Void dwell/loss/fringe dependency eklenir. Hareket,
      yoğunluk, cluster, compactness, anisotropy, radial yapı, composition,
      churn, lifespan, orbit, trajectory ve recovery tek skora ezilmez.
- [ ] **[P0] Cluster tracker uzun boşluktan sonra ölü yapıyı diriltemesin.**
      Ardışık örnek sözleşmesi ve maksimum gap test-first tanımlanır.
- [ ] **[P0] Ucuz broad tarama yalnız faz filtresi olsun.** Candidate bütçesi
      önce benchmark'la seçilir. Broad sonucu morphology başarısı veya
      production adayı diye sunulmaz.
- [ ] **[P1] Arama hunisi ölçülerek kilitlensin.** Başlangıç hipotezi broad
      30–60 saniye/4–8 seed, refinement birkaç dakika/16 seed, audition 3–8
      aday, qualification 10–30 dakika/32+ seed'dir. Bunlar ölçülmeden sabit
      acceptance değildir; ilk filtre olarak 2/6/24 saat koşulmaz.
- [ ] **[P0] Refinement sonrası az aday development audition'a açılsın.**
      Audition yüzeyi production bundle'a qualified olmayan catalog gömmez;
      açık dev/build girdisi ve provenance gösterir. URL/env ile sessiz
      production override yasaktır.
- [ ] **[P0] İnsan ön-elemesi long-horizon'dan önce yapılsın.** Core-like,
      membrane-like, mobile, recovering, fragile, chasing ve symbiotic
      ailelerinden anlamlı bir alt küme görülür. Renkli topak, jitter veya
      kalıcı orbit elenir.
- [ ] **[P0] Çoklu-seed long-horizon ve perturbation çalışsın.** Seed corpus
      sürümlüdür; kesin seed sayısı ve 10–30 dakika bütçesi benchmark sonrası
      kilitlenir. Stasis, soup, tek blob, speed-cap chaos, seed çoğunluğunda
      ölüm ve aşırı Void kaybı kesin FAIL'dir.
- [ ] **[P1] Zaman serisi geç çöküşü görünür kılsın.** Final snapshot yerine
      phase, yapı çeşitliliği, lifespan, churn, loss ve recovery eğrileri
      saklansın. 30 dakika sonrasında başlayan çöküş görülürse daha uzun release
      canary ayrıca gerekçelendirilsin.
- [ ] **[P1] Candidate/seed işleri deterministic shard edilsin.** Önce seri
      referans üretilir; work ID + genome + seed aynı sonucu vermeden worker
      havuzu açılmaz. Paralellik sonucu veya sıralamayı değiştiremez.
- [ ] **[P0] Qualification artefaktı clean source zorunluluğu taşısın.**
      Revision, config/diff digest, corpus, bütçe, tam genom, zaman serisi,
      reason code ve human-acceptance alanı eksiksizdir. Dirty koşu yalnız
      exploration'dır.
- [ ] **[P0] Production promotion bütün genomla yapılır.** Matrix-only kopya
      yasaktır. Promotion sonrası ayrı production canary aynı genomu
      perturbation olmadan çoklu seed'de ölçer.
- [ ] **[P0] Adım 3 kabulü üçlüdür.** Technical gate + long-horizon +
      browser/masaüstü/Samsung/Lenovo kullanıcı audition'ı birlikte geçer.
      Kullanıcı onayı olmadan `[x]` olmaz.
- [ ] **Alan ve ekoloji kuvvetleri morphology kanıtlanana kadar kapalı kalır.**

## Adım 4 — organizma kimliği

- [ ] **Kesin blokaj:** Adım 3 üçlü kabulü geçmeden identity kodu yazılmaz.
- [ ] **Identity tracker gözlemcidir.** ON/OFF aynı seed ve genomda particle
      state'i bit düzeyinde aynı üretir.
- [ ] **Stable organism ID üye örtüşmesiyle izlenir.** Split, merge, geçici
      fragmentation, save/load ve ID ölümü olay olarak sınanır.

## Adım 5–10 — kararlaştırılmış sonraki sözleşmeler

Bu bölüm hemen uygulanacak iş değildir; Adım 3/4 kapıları geçilmeden kodlanmaz.
Ama yüksek seviye önerilerin kaybolmaması için bağımlılık ve kabul yüzeyleri
şimdiden açık tutulur.

### Adım 5 — enerji, madde ve yaşam döngüsü

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
      dönüşmesin.
- [ ] Sunum aklı yenilik, süre, nüfus etkisi, nadirlik ve coğrafi yayılımı ayrı
      ölçsün; ilk olayları işaretlesin, simülasyona geri yazamasın.
- [ ] Observe/Follow/Free kamera ilişkisi kurulsun; kullanıcının ilk girdisi
      otomatik kamera önerisini anında bıraksın.
- [ ] `SelectionInfoPanel`, `StatsPanel`, `MinimapPanel`, `EventLog`, `Toast`,
      `CommandPalette` ve `Sheet` CORE'dan tüketilsin; oyun UI primitive'i
      icat edilmesin.
- [ ] Reduced-motion, renk-kontrastı ve yoğun olay LOD'u aynı olay anlamını
      korusun; tarayıcı + Samsung + Lenovo görsel kanıtı alınsın.

### Adım 8 — kayıt, tekrar ve tarih

- [ ] Snapshot ile replay formatı ayrışsın: snapshot anlık state; replay seed +
      komut günlüğü + tick sayısı olsun.
- [ ] Pause ve 0.5×/2×/4× yalnız replay'de açılsın; canlı dünya gerçek hızda
      kalsın.
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

### Adım 10 — kalıtım, mutasyon ve seçilim

- [ ] Kalıtılabilir fenotip ile global PhysicsGenome ayrışsın; birey mutasyonu
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

### 2026-09-14 — VOL.LIFE sağlamlaştırma ve repo hijyeni

- [x] **Simülasyon temposundaki gizli 60 Hz varsayımı kaldırıldı.** Alan
      zamanlayıcısı `fixedStepMs`den türetilen taban Hz'i kullanır; 30 Hz dünya + 10 Hz alan üç tick'te bir güncellenir. Dünya ve parçacık config'inin
      sonluluk, aralık, tam sayı ve geometri önkoşulları kurulumdan önce
      doğrulanır.
- [x] **Snapshot geri yükleme atomik ve tek doğrulayıcılı oldu.** Disk
      persistence ile doğrudan `LifeWorld.restore` aynı alan/parçacık/zaman/RNG
      doğrulamasını kullanır; geçersiz son dizi canlı dünyayı kısmen değiştirmez.
- [x] **Kurulum ve kapanış yaşam döngüleri sertleştirildi.** Yarım kalan
      `LifeRuntime` o ana kadar aldığı GPU/giriş sahiplerini geri bırakır;
      `LifeScene` yeniden kurulumda Phaser lifecycle listener'larını
      biriktirmez; autosave snapshot hatası zamanlayıcıdan kaçmaz; yok edilen
      çıkış onayı bekleyen kayıt bitince pencereyi kapatmaz.
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
- [x] **Kanonik overview ve alan ağırlığı düzeltildi.** En uzakta tek kare
      dünya ortalanır ve pan kilitlenir; yakın görünüm gerçek 3×3 alan
      kopyasıdır. Varsayılan alan luması yaşam katmanını bastırmayacak düzeye
      indi.
- [x] **Sheet yerleşimi ölçülebilir sözleşmeye bağlandı.** X, dişli ve tam
      ekran aynı 40×40 `IconButton` geometrisidir; X dişliyle aynı safe-area
      kenarındadır. Label/control grid, switch sağ ankrajı ve yatay telefonda
      gereksiz scroll olmaması Chromium bounding-box E2E testidir.
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
      reddettiği için Adım 11 karşılaştırması açık bırakıldı.

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
      düzeltildi. Katman görünümünün doğrulaması Adım 7'de açık kaldı.
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
