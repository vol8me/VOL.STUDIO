# UI fazları — tek yetkili iş listesi

İşler henüz uygulanmadı. `[ ]` açıktır; `[x]` yalnız bütün kapanış kanıtıyla
`Kapatılanlar`a tek satır taşınır. Görev kimlikleri tekildir; UI-06 isim göçü eski
yolları yeni yola taşır, aşağıdaki sonraki fazlar yeni yolu kullanır. **Önerilen/yeni**
dosya mevcut sembol değildir; oluşturulacak sorumluluk yeridir. Modül adı uygulama
sırasında uyum gerekçesiyle değişebilir, CONTRACT ve test aynası birlikte güncellenir.
Hiçbir görev “diğerlerini de düzelt” şeklinde sınırsız yan yeniden düzenleme yetkisi
vermez.

Güncel üst sıra [kök F01–F10](../../TODO.md) ve kararlar
[monorepo denetimindedir](../monorepo-audit.md). Windows geliştirme/ilk native
referans önce alınır; UI-06'nın Linux/Deck fiziksel kabulü kök F08'de ayrı yürür.
UI-00–UI-13'ün 63 alt görevi korunur. Ses yayın kabulü F01'in mekanik QA/verify
sözleşmesidir; zorunlu insan dinleme bekleme durumu kurulmaz.

Teknik teslim ve gerçek release kabulünün ölçütleri
[VERIFICATION](VERIFICATION.md) içindedir. Sonraki bağımsız teknik iş,
yapılamayan cihaz/görsel/erişim/haptik kabulünü PASS saymadan ilerleyebilir.
Her görev kendi Kapanır ölçütleriyle açıktır; UI-13 tüm release kabulünü toplar.

## Açık

### UI-00 — Gerçek başlangıç ve kabul altyapısı

Hedef: yanlış başlangıç referansının
sonraki fazlarda başarı gibi kullanılmasını engellemek. Sahip: kalite/vitrin. Değişiklik
alanı: `scripts/quality/`, `devtools/vol-ui/tests/e2e/`, ilgili CORE testleri.

- [ ] **UI-00.1 — Yeniden üretilebilir yüzey kaydı.** UI toplu dışa aktarım yüzeyini
      TypeScript AST/tip denetleyicisi ile sınıf/runtime/type olarak ayır; aktif
      doğrudan, dolaylı ve katalog tüketimini kaydet. Önerilen
      devtools/vol-ui/src/catalog/registry.ts yalnız test örneği kimliği, sahibi ve
      durum uygulanabilirliği bilgisi taşır; CORE uygulama kodunu içe aktarmak yeni
      kural katmanı olmaz. Kapanır: başlangıç 89 sınıf ve yardımcılar tekil kapsanır;
      eklenen export kayıtsızsa ihlal test örneği kapıyı düşürür; doğrulayıcı isim geçen
      kaynak metnini gerçek test doğrulaması sanmaz.
- [ ] **UI-00.2 — Çift motor gerçek kapsamı.** Mevcut Playwright Chromium/ WebKit
      testMatch asimetrisini gider; etkileşim, yerleşim, geçici katman, azaltılmış
      hareket, oyun kolu ve i18n davranışı iki motorda çalışsın. Okunabilirlik iki
      tarafta; mevcut Chromium piksel temeli korunur. Kapanır: iki motorun
      keşfedilen/çalışan dosya listesi raporlanır, olmayan WebKit piksel temeli otomatik
      güncellemeyle saklanmaz.
- [ ] **UI-00.3 — Axe ve durum sınama düzeneği.** Önerilen
      devtools/vol-ui/tests/e2e/accessibility.spec.ts ve
      devtools/vol-ui/tests/e2e/stateMatrix.spec.ts; axe bağımlılığı yalnız geliştirme
      aracının devDependency alanına eklenir. Açık diyalog/OSK/açılır liste/form ve
      devre dışı/hata durumu örnekleri, 5 WCAG etiketi, eksik değerlendirme kayıtları ve
      tam kapsamı belirli istisna politikası. Kapanır: bilerek adsız giriş alanı veya
      örtülen odak örneği testi düşürür; N/A gerekçesi olmayan durum başarısız sayılır;
      mevcut bilinen hatalar sınırlı açık görevleriyle izlenir, genel muafiyet verilmez.
- [ ] **UI-00.4 — Ölçümün kör noktaları.** `devtools/vol-ui/tests/e2e/layout.spec.ts`
      saydam ama tıklanabilir yerel range girişini dışlamasın; katmanın kapalı ve test
      örneğinin açık olduğu durumlar ayrı değerlendirilir; gerçek tıklama alanı, örtüşme
      ve kaydırma kabı ölçülsün. Okunabilirlik sınaması CSS alt sınırını Valve glif
      yüksekliği kanıtından ayırsın. Önerilen
      devtools/vol-ui/tests/e2e/latency.spec.ts/devtools/vol-ui/tests/e2e/performance.spec.ts
      rapor şeması: UI JS/DOM/GPU, ekrana sunum ve desteklenmeyen ölçüler ayrı. Kapanır:
      A/A gürültü, temanın geometriyi kaydırması ve desteklenmeyen ölçü sahte PASS
      üretmez.
- [ ] **UI-00.5 — İlk referans.** 12 sekme/17 doğrudan tüketici/830 vitrin anahtarı
      başlangıcını yeniden say; varsayılan ekranlar, hareket kapalı/açık durumları,
      paket boyutu ve UI maliyetini git dışı özel kayıtlara kaydet. Kapanır: önceki
      kayıtla karşılaştırma yöntemi vardır; bağlı olmayan cihaz NOT-RUN; kök F08/F09 ve
      VOL.TEST kabul işleri açık kalır.
- [ ] **UI-00.6 — Çalışan ölçüm sondası ve profil uygulanabilirliği.** Vitrin
      kalite sahibi browser için aynı-frame UI JS/DOM atfı, input→visible
      zaman bağı, trace/frame ID ve A/A overhead kalibrasyonunu küçük fixture
      ile kurar; yalnız rapor şeması teslim etmez. Native platform sahibi her
      runtime için resmi trace/API/aracın gerçekten sağladığı scope'u ve
      presented-frame yöntemini belirler; mevcut Deck sondası/VOL.TEST
      örneğinde kullanılabilir yolu dener. Native SHOWCASE bağlama işleri
      UI-06.4/UI-11.4/UI-12.4'ün teknik teslimidir. Kapanır: UI-03 pilotu
      çalışan browser probuna bağımlıdır; ölçülemeyen native hücre için
      somut eksik araç/owner/bağlama görevi vardır. Desteksiz total CPU/GPU/
      sunum hücresi açık release engeli, sıfır veya tahmini PASS değildir.

Faz testi: kalite ihlal örnekleri ve CORE yönetişim testleri, iki motordaki mevcut E2E
testleri, bundle; `pnpm exec just contract`, `pnpm exec just e2e`.

### UI-01 — Ortak görsel/hareket altyapısı

Ön koşul UI-00. Sahip CORE UI; yardımcı varlık üreticisi sahibi ayrı. Mevcut hedefler
`core/src/ui/colors.ts`, `core/src/ui/theme.css`, `core/src/constants.ts`,
`core/src/ui/animation.ts`, `core/scripts/gen-theme.mjs`,
`core/src/ui/layout/UIRoot.ts`. Önerilen modüller themes/, motion/, skin/; tek
dosyada toplanmaz.

- [ ] **UI-01.1 — Tipli anlamsal token ve tema kaynağı.** 60 mevcut renk tokenını ve
      public VOL_COLORS uyumunu koru; page/well/panel/plate,
      çerçeve/anlam/ışıma/nadirlik durum tokenları ve ember temasının sabit renk
      kaynağını ekle. Üreticinin ayrıştırma/doğrulaması deterministik ve yapısal olsun;
      mevcut font/boşluk bölümlerini silmesin. Kapanır: anahtar paritesi,
      desteklenmeyen/eksik token ve üretim sapması örnekleri; varsayılan stil farkı
      bilinçli, `gen:theme` idempotent; public tip yüzeyi kontrollü.
- [ ] **UI-01.2 — Tema ve yoğunluk sahibi.** Önerilen themes/ThemeController.ts ve
      layout/density.ts; cihaz kapsamında kalıcılık, bilinmeyen değerin varsayılana
      dönmesi, kapsamı belirli önizleme/body katmanı ve Canvas token okuyucusu. UIRoot
      referans sayımıyla paylaşılan parent için iki sağlayıcı kurulmasın. Kapanır: çoklu
      kök, kaynak temizliği, çalışma anında tema değişimi ve kaydırma/odak/seçim
      korunumu; kaba işaretçi/yoğunluk/zoom ayrı; Deck kol hedefleri fareye geçişte
      küçülmez.
- [ ] **UI-01.3 — Hareket politikası/hazır ayarlar ve bütçe.** Önerilen
      motion/presets.ts, motion/MotionController.ts; CONTRACT §4'teki tüm özel
      süreler/yumuşatma eğrileri tek kaynak. Mevcut animateValue iptal sözleşmesi
      uyumlu; azaltılmış hareket, gizlenme, askıya alma ve kesinti sonrası son durum
      tanımlı. Kapanır: 3 grup/64 UI parçacık/1 blur sınırı olay salkımı örneğinde
      korunur; sıfır sürede kaynak temizliği yapılır; işlevsel zamanlayıcı/basılı tutma
      süresi değiştirilmez.
- [ ] **UI-01.4 — Çerçeve, ikon, doku ve imleç üreticisi.** SVG 9-slice, tokenli plaka,
      16/24/32/48 özgün ikon/tema imleci; doku üreticisi sabit tohumla çalışır. Önerilen
      üretici core/scripts/ui-assets/; kaynak/gönderilen varlık ayrımı mevcut varlık
      doktrinine uygun. Kapanır: aynı tohumda çıktı özeti aynı, kaynak kaydı ve tüketici
      yolu var; şişkin raster/video bağımlılığı yok; glif/ikon adları ve piksel
      yoğunluğu net; azaltılmış hareket/bulanıklık yedeği görünür.
- [ ] **UI-01.5 — İlk planlanan kapılar.** Tema tokenı parite/kontrast, animasyon token
      kullanımı ve yaşam döngüsü ihlal örneklerini kalite şeması ve justfile'a bağla.
      Kapanır: yeni UI bileşenindeki ham süre testi düşürür; genel sayısal animateValue
      API ve işlevsel zaman aşımı hata sayılmaz; kontrast son alfa/arka plan üstünde
      ölçülür, sadece hex çifti değil.

Faz testi: `core/tests/ui/themes/*`, `motion/*` ve değişen modül adlı testler yeni;
mevcut colorSync/cssConstantSync/publicSurface; tema geometrisi E2E.

### UI-02 — Semantik UI ses/haptik ve kanonik varsayılan ses karakteri

Ön koşul UI-01. Sahip CORE genel geri bildirim + audio-synth üreticisi + uygulama
adaptörü. Oyun SFX varsayılanları ve simülasyon RNG'si korunur.

- [ ] **UI-02.1 — Tek niyet/tek olay.** `core/src/ui/primitives/buttonBehavior.ts`,
      `runButtonClick`, mevcut `valueInteraction` davranışları
      ve haptik adaptörü üzerinden tipli anlamsal olay/sonuç verisi tanımla. Önerilen
      core/src/ui/feedback/uiIntent.ts; UI ses sağlayıcısı primitif içinde kurulmaz.
      Kapanır: işaretçi+yerel tıklama+klavye+kol birleşiminde olay iki kez üretilmez;
      programatik ayar/iptal/devre dışı durumları sessiz; önizleme/kalıcı değişiklik
      farklı; ürün başarısını host bildirir, Promise çözülmesi otomatik başarı
      sesi değildir; mevcut primitive haptik yolu + merkezi provider aynı
      niyet için iki darbe üretmez; aynı UI kökünün paylaşılması dinleyici/ses
      sayısını çoğaltmaz.
- [ ] **UI-02.2 — UiSoundKit ve ayarlar.** Önerilen core/src/audio/ui/UiSoundKit.ts
      mevcut SoundBank'in destination/gain yolu ve SidechainDucker mekanizmasını
      tüketir; sırf UI için yeni genel mixer veya MusicEngine kurulmaz. Yeni
      @volstudio/core/audio/ui public girişinin package exports/barrel/public
      lock/test sahibi bu görevdir. SidechainDucker bugün yalnız CORE kökünde
      export edilir; kit içinden relatif import veya bilinçli subpath re-export
      kullanılır. Kapanışta SHOWCASE ve VOL.TEST import/bundle izi Phaser'sız
      public erişimi doğrular. UI
      toplam 4 ses, kritik olay önceliği, mikro olaylarda 120ms sıklık sınırı, 3
      varyantın sırayla seçilmesi ve ±%5 değişim, bağımsız RNG akışı.
      Ana/UI/SFX/müzik/konuşma seviyesi ve sessizleştirme/kullanıcı jesti cihaz ayarı.
      Kapanır: ses erişimini açma/ön yükleme hatası/bağlam yokluğu/sessizleştirme/arka
      plan/devam/iptal/kaynak temizliği testleri; beklemiş sesler dönüşte topluca
      oynatılmaz; genel 24 ses ve RNG varyant sözleşmesi zorla değişmez, müzik olmayan
      ürüne müzik eklenmez.
- [ ] **UI-02.3 — Sıfırdan varsayılan set üretimi.** Mevcut `devtools/audio-synth`
      kanonik job/yayın/manifest sürecinden UI olay ailesi için kuru/oda-yedekli özgün
      set çıkar; tüketici hedefi şemasına uygun bilinçli hedef genişlemesi
      ve ihlal örneği ekle. Önerilen tüketici CORE'un gönderilen UI sesleridir; çalışma
      zamanında geliştirme aracı içe aktarılmaz. Kapanır: varyant/olay manifesti
      paritesi, PCM yeniden render, bas/gövde ayrı filtre, kodlama sonrası
      tepe/sonluluk/DC/süre, varlık kaynağı/üreticisi kaydı; hazırlanan sesler insan
      dinlenmiş sayılmaz.
- [ ] **UI-02.4 — Duck/haptik sözleşmesi.** Kritik olayda isteğe bağlı −6dB,
      120/80/450ms düşürme; örtüşme/iptal sonrası geri dönüş; mevcut haptik desenleri ve
      varsayılan kapalı durum, kapasite/sıfır şiddet/sıklık sınırı, tek sürücü. Kapanır:
      askıya alma/odak kaybı/cihaz çıkarma/kaynak temizliği sonrası sıfırlama testli;
      sürücü yokluğu normal sonuç; görsel bilgi her durumda var; haptik yokken veya ses
      erişimi kilitliyken E2E aynı eylemi yapar.
- [ ] **UI-02.5 — Ses laboratuvarı ve yayın kabulü.** Vitrine onaylı Ses sekmesi ekle:
      açık oynatma eylemi, olay/ses kanalı/sessizleştirme/ses sayısı/düşürme/yetenek,
      örnek dışa aktarımı ve kuru/efektli kıyas. Kapanır: anlamsal olay sondası her
      kabul edilmiş niyeti tek sayar; güncel kaynak/PCM/manifest ve kodek sonrası
      politika gerçek verify ile geçer; cihaz ses çıkışı teknik olarak doğrulanır.
      İsteğe bağlı dinleme paketi korunur; insan dinleme onayı üretim şartı değildir.

Faz testi: yeni kaynak ağacını yansıtan CORE/audio testleri, audio production-check,
asset verify ve ilgili audio surface lock; yayın kilometre taşı `pnpm signoff`.

### UI-03 — BUTON pilotu / M1

Ön koşul UI-01/UI-02 teknik teslimi ve UI-00.6 browser probu; sahip
primitives/buttons. Görsel dilin ilk uçtan uca örneği; diğer
ailelere kör mekanik CSS yayılımı yapılmaz.

- [ ] **UI-03.1 — Button/IconButton/ToolButton.** Varyant×boyut×yoğunluk,
      normal/hover/basılma/odak/devre dışı/yükleme/hata; basılma eğimi/ışıması,
      erişilebilir ad/başlık, asenkron ret/yeniden giriş ve Toolbar gezici tabindex
      davranışı. ToolButton bağımsız/çoklu seçim/dikey/tümü devre dışı örneği. Kapanır:
      aynı niyet mekanizması, yüklemenin erişilebilir meşgul durumu ve odak korunumu,
      asenkron işlem bitişi sırasında dışarıdan gelen disabled durumunun korunması,
      yerel button Enter/Space tek olay, hata sonrası tekrar kullanılır, açık/kapalı ses
      eşdeğer.
- [ ] **UI-03.2 — Hold/Charge/LongPress.** İşlevsel zaman eşiği politikasını koru;
      pointercancel/capture kaybı/ikinci işaretçi/görünürlük/devre dışı durum sırasında
      iptal. Kapanır: odak/kol eşdeğeri ve ilerleme durumu, azaltılmış harekette basılı
      tutma işlevi, erken bırakma/başarılı eşik/tekrar tekil.
- [ ] **UI-03.3 — Aktif oyun regresyonları.** VOL.TEST mevcut duraklatma/ayarlar
      tüketicisinde Button/IconButton/Hold gerçek yerleşim/geri/Slider adı ve hit-test
      sorunu; yeni menü yok. Slider erişilebilir adı/tıklama alanı geometrisi
      düzeltmesini UI-05'e bırakıp pilotu sahte temiz sayma. Kapanır: gerçek
      ayarlar/duraklatma test örneği Chromium+WebKit ve eldeki cihazda; eski duraklatma
      UI sesleri ile yeni sağlayıcı aynı sesi iki kez üretmez; oyun SFX/ambiyans
      değişmez.
- [ ] **UI-03.4 — Pilot teslim.** Varsayılan/ember önce-sonra karşılaştırması, 30%
      uzatılmış etiket, 6 hane, hareket videosu/iptal, kanonik ses örneği,
      fare/kol/dokunma. Kapanır: ölçülen ilk yanıt p95<100ms, CPU/ekrana sunum profili,
      başlangıç referansı farkları tek tek incelenir; görsel beğeni
      yapılmadıysa açık kabul kalır; ses teknik QA ile kabul edilir. Tasarım grameri kanıtı M1'in yayılan
      referansıdır.

Faz testi: primitives/Button/IconButton/Toolbar ve buttons modül adlı yeni testler,
interactionContract/valueInteractionContract, gerçek oyun E2E.

### UI-04 — KARTLAR / M2

Ön koşul UI-03. Sahip `core/src/ui/cards/`, ilgili HUD nadirlik tokenı tüketicisi.

- [ ] **UI-04.1 — Kart yüzeyi ve CardTile sözleşmesi.** Rarity bağımsız nötr kart
      mevcut Panel/Text/Button bileşimi ve ortak CORE card skin'iyle gösterilir;
      CardTile aynı yüzey üstüne rarity katmanı ekler. Nötr örnek için zorunlu
      rarity alanı sessizce optional yapılmaz ve ikinci vitrin bileşeni kurulmaz.
      Mevcut CardTile rare/epic/legendary, SlotGrid common/rare/epic ayrı kalır.
      `disabled`/`setDisabled` mevcut primary-action anlamını korur; secondary
      eylem ve drag kendi durumlarıyla sınanır. Ek bir tüm-kart kilidi gerekirse
      additive ayrı API ve public lock ile tanımlanır, legacy disabled semantiği
      değişmez.
      Nadirlik×4 durum, kilitli/devre dışı/kompakt/salt sunum/birincil/ikincil/sürükleme
      matrisi. Kapanır: ikincil eylemin devre dışı bırakılma politikası açık ve
      regresyon testli; etiket/arka plaka/token çerçeve+plaka; nadirlik için renk
      dışında işaret; uzun başlık/açıklama/6 haneli fiyat hiçbir aksiyonu gizlemez.
- [ ] **UI-04.2 — Picker ailesi.** CardPicker/LevelUpPicker/ShopPicker: 40ms kademeli
      giriş/1.04 seçili ölçek, reroll/lock/insufficient/empty/error/loading; ürün kuralı
      opt-in tarifte, durum modelden gelir. Kapanır: son seçimin tek niyeti,
      modal/geri/odak geri yükleme; hızlı yeniden giriş/kaynak temizliği/ayrılma için
      zaman aşımı yedeği; fareyle hover, kol/dokunma seçimi eşdeğer.
- [ ] **UI-04.3 — SwipeableCardStack ve drag alternatifleri.** Eşik/alt düğmenin niyeti,
      iptal/lost capture, yön/RTL; klavye/kol/dokunma önce/sonra/seç eylemi. Kapanır:
      sürükleme tek yol değil, yerleşim kayması yok, azaltılmış harekette son seçim
      aynı; ARIA seçimi odaktan ayrı.
- [ ] **UI-04.4 — Kart kabulü.** Üç mevcut nadirlik ve iki tema; durum ekran görüntüsü
      örnekleri, ses/haptik niyet sondası, 30%/200%/6 hane. Kapanır: sadece kapalı
      seçici görüntüsü değil gerçek açık/boş/disabled/ayrılma durumları iki motorda
      sınanır; referans ve özgün fark incelenir.

### UI-05 — PANEL + FORM + AYARLAR

Ön koşul UI-04; tier-1 kısmi M3. Sahip primitives/layout/overlays; yeni oyun ayar paneli
icat edilmez, mevcut SettingsForm/Row güçlendirilir.

- [ ] **UI-05.1 — Adlandırılmış editör ve değer niyeti.** Input/TextArea/NumberStepper/
      Slider/RangeSlider etiket→denetim bağı, açıklama/hata kimliği ve yerel semantik,
      min/max/clamp/disabled/readOnly; klavye Home/End/yön tuşları kontrolün kendisinde.
      Kapanır: canlı önizleme/tek kalıcı değişiklik/iptalde geri alma/sessiz programatik
      ayar testleri, dikey range geometrisi/AT, saydam hit-test; IME bileşimi sırasında
      Enter formu göndermez; HTML sayı editöründe seçim API farkı güvenle ele alınır.
- [ ] **UI-05.2 — Seçim denetimleri.** Select açıkken devre dışı bırakma kapatır ve
      odağı geri yükler; aynı değer seçildiğinde sözleşmeye göre yinelenen kalıcı
      değişiklik olayı üretilmez; Checkbox gerçek checkbox/switch kararı,
      RadioGroup/SegmentedControl arrows+Tab, ColorPicker/CurveEditor klavye/tap
      karşılığı. Kapanır: popup/layer geri önceliği, boş/hata/devre dışı/i18n, işaretçi
      iptaliyle biten sürükleme sessizdir; üç durumlu checkbox ancak açık, geriye uyumlu
      ek ihtiyaç varsa.
- [ ] **UI-05.3 — Panel/yerleşim.** Panel/Tabs/Accordion/Tree/Wizard/Carousel, UIRoot;
      çerçeve/başlık/kaydırma dış panelde; gezici odak/odak/seçim ayrı, gizli içerik
      etkileşimsiz. Kapanır: çift kökün kaynak temizliği yinelenebilir, sekme
      değişiminde sahibin kaynakları temiz, 320px/ultra geniş/200%/RTL; uzun panelde
      odak sheet/modal altında görünür.
- [ ] **UI-05.4 — SettingsForm/SettingsRow.** Bölüm/satır/açıklama/reset/
      değişiklik/uygula/geri al/hata/meşgul desenini model ve isteğe bağlı tarif
      arasında ayır. Kapanır: Escape/geri sırasında kaydedilmemiş değişim kararı
      tüketicide, devre dışı/kaydediliyor tekrar commit yok; device/synced kapsamlı
      depolama ve atomik kalıcılık mevcut; görünür form etiketi/yardım metinleri
      çevrilir.
- [ ] **UI-05.5 — Form kabulü.** Bütün kontrol test örnekleri yalnız kol, yalnız klavye,
      dokunma, %30 ve 6 hane; mevcut kol-adım davranışıyla uyum sınanır. Kapanır: bileşik denetimin yön tuşu FocusNav tarafından alınmaz; durum
      matrisi + axe/eksik değerlendirme + modal örtüşme testi; sessiz setter değişimi
      tüketici uyum testiyle teslim edilir.

### UI-06 — Tek VOL.SHOWCASE ve Windows native temel / M4

Ön koşul UI-05. Sahip vitrin/kalite/platform; isim göçü tek atomik konu, Windows kabuğu ilk teknik referanstır. Oyun kaynaklarına bağımlılık kurulmaz.

- [ ] **UI-06.1 — Atomik paket göçü.** `devtools/vol-ui`→devtools/vol-showcase, paket
      adı, yaşam döngüsü yolu, kalite paketi/paket boyutu ve kilit dosyası importer
      kaydı, justfile build-ui/dev-ui filtreleri, katalog sabit yolu, kök/CORE
      belgeleri, test yolu beklentileri ve ekran görüntüsü dosyalarını aynı değişiklikte
      taşı. Kapanır: canlı eski yol/paket referansı sıfır; CSS `.vol-ui-root` ve public
      UI tokenları isim göçü bahanesiyle değiştirilmez; piksel temelleri yalnız taşınır;
      mevcut 150/1/24 KiB bütçesi bilinçsiz gevşetilmez.
- [ ] **UI-06.2 — Aracın native crate'i ve kapı kapsamı.** Yeni
      devtools/vol-showcase/src-tauri/ ortak `tauri-v2` kütüphanesini tüketir; kendi
      bağlamı/kimliği/ikonu/asgari yetenekleri. Yaşam döngüsü kaydına bulunmayan `kind`
      anahtarını ekleme; kök Cargo glob/tek lock kullan. AppIdentity, plugin üçlü kayıt
      ve productIcons aktif native uygulama keşfi ihlal örneği. Kapanır: native araç
      ikon/ID yinelenen/eksik kayıt örneği düşer; tauri bundle.category ve desktop
      Categories Game kopyası değildir.
- [ ] **UI-06.3 — Platform ayarı ve görünür kabuk.** Mevcut oturum/runtime/
      DisplayModeController/scopedStores/haptiks adaptörleri; gamescope etkisiz
      seçenekler capability'den, Android desktop UI yok. Kendi ölçeği/ikonu, teşhis
      yeteneği ve web yedeği. Kapanır: native kaynak taşıyan plugin yalnız gereken
      uygulamada; pnpm dev web bakışı; başlatma/kaynak temizliği/dil değişimi kök veya
      sağlayıcı sızıntısı oluşturmaz.
- [ ] **UI-06.4 — Windows temel ve ayrı Linux/Deck teslim.** İlk native Windows
      açılışı ve UI-00.6 WebView2 sondası teknik referanstır. AppImage/steamrt4 AppDir,
      launcher/desktop/binary identity; var olan `pnpm deck` workspace aracı
      deploy/run/shot/measure sözleşmesi kopyalanmadan kullanılır. Kapanır: laptopta
      görünür native pencere, Deck host+SLR4 açılış/OGG/UI sesi, yalnız kol kullanımı,
      ekran görüntüsü ve ısınmış performans ölçümü; compile/devkit stub gerçek platform
      PASS sayılmaz. Cihaz yoksa kabul açık kalır.
      UI-00.6 ölçüm sondasını gerçek Linux/Deck WebView oturumuna bağla; aynı-frame CPU
      atfı/presented-frame scope ve A/A gürültü kalibrasyonunu teknik teslimde göster. Desteksiz
      metrik açık kabul engelidir.

Faz testi: quality/appIdentity/productIcons/catalog/layers/ports/cargo/plugin fixtures,
contract/rust/build/bundle, iki motor web E2E, gerçek native sonda.

### UI-07 — i18n, font ve tema yayılımı / M5 + M6

Ön koşul UI-06. Sahip core i18n/UI/vitrin, mevcut motor yeniden yazılmaz.

- [ ] **UI-07.1 — Görünen metin sıfır açık.** 830 vitrin/63 CORE başlangıç anahtarını
      AST/fixture üzerinden yeniden tara; adlandırma/ölü anahtarlar, çalışma anındaki
      dinamik önek gerekçesi; XPBar Lv ve erişilebilirlik etiketi dahil. Kapanır: TR/EN
      parite/ölü/hardcoded kapıları; modül düzeyinde t() çağrısı yok; açık
      Modal/Popup/OSK dahil languageChanged temizliği, eksik anahtar örneği görünür
      başarısızlık üretir; mevcut motor/kalıcılık davranışı korunur.
- [ ] **UI-07.2 — Çoğul/biçim/RTL ve uzunluk.** i18next JSON `count`+Intl, metin
      rolü/tablo hizalı sayılar; deterministik 30% uzatılan yapay dil. `lang/dir`,
      logical CSS/arrow/picker/swipe; RTL temel sınaması gerçek çeviri iddiası taşımaz.
      Kapanır: 0/1/çok, tarih/birim/6 hane, Türkçe ı/İ; görüntüleme sıralaması
      manifest/replay sırasına sızmaz; 200%/320px eylem etiketleri kırpılmaz.
- [ ] **UI-07.3 — Font varlığı.** Mevcut download-fonts hattı ve subset manifest
      lisans/kaynak; gerçek glif sınırları, Türkçe kapsamı, yedek font tabanı/satır
      yüksekliği ve soğuk önbellek. Kapanır: font-ready ve yükleme hatası örneği; tema
      değişiminde asenkron font yüklemesi yerleşimi kaydırmaz; Deck glif yüksekliği
      gerçek ekran örneği; Android 200% doğrusal olmayan font ölçekleme ayrı native
      probe.
- [ ] **UI-07.4 — Tema laboratuvarı ve üst bar.** Onaylı Tema sekmesi + genel
      tema/dil/yoğunluk seçicisi; önizleme kapsamları/body portalları ve Canvas sabit
      renkleri CurveEditor/Minimap dahil. Kapanır: 2 tema×3 yoğunlukta kontrast/odak
      durumları; Chromium CLS ve bütün motorların geometrisi; tema geçişi anlık;
      durum/kaydırma/odak/seçim sabit; bilinmeyen kayıtlı tema varsayılana döner;
      varsayılan piksel temeli ember kabulünden ayrı.

### UI-08 — HUD ve erken tier-1 kapsam kontrolü

Ön koşul UI-07. Sahip feedback/hud/tarif; oyun durumunu sunum tutmaz.

- [ ] **UI-08.1 — Bar/XPBar/Counter/ResourceCounter/ResourceBar/TimerBar/
      RoundCounter/FloatingTextManager.** Boş/dolu/geçersiz eşik/çoklu kazanım/6 haneli
      düşüş/meşgul/hata, role/valuetext; opt-in applyXPGain ayrı kural. HUD 200/80/sayı
      hazır ayarı ve arka plaka. Kapanır: reduced-hareket sayı/son durum tam,
      havuzlama/kaynak temizliği temiz; TimerBar işlevsel zamanı hareket tokenı
      sayılmaz; XP label TR/EN formatter uyumu; ekran okuyucuya aşırı duyuru yok.
- [ ] **UI-08.2 — FpsMeter/MinimapPanel/SelectionInfoPanel/StatsPanel.** Mevcut VOL.TEST
      FpsMeter/Minimap gerçek test örneği; boyut değişimi/zoom/kapsamı belirli tema,
      işaretçi kontrastı/renk dışı işaret/ikon/okunabilirlik. Kapanır: HUD işaretçi
      geçişi/girdi katmanı örtüşmesi doğru; mini harita görünümü durum/tüketici modeli,
      oyun dünyası fiziği/performans ayarı bu göreve karıştırılmaz.
- [ ] **UI-08.3 — ActionBar/BuildMenu/SkillTree/SlotGrid.**
      Seçim/kilitli/kullanılamayan/bekleme süresi/boş ve yerel nadirlik;
      klavye/kol/dokunma. Kapanır: resolveSkillStates isteğe bağlı kural kalır;
      hover/Tooltip ve sürükleme/dokunma alternatifi; sunumda altın/yetenek durum
      defteri yok; anlamsal olay tekil, kısa etiket ve uzun 6 haneli fiyat.
- [ ] **UI-08.4 — Erken tier-1 kapsam kontrolü.** ScrollView için UI-05 referans
      klavye/odak/overscroll kanıtını tamamla; UI-10 ileri pan ayrı kalır. Kapanır:
      UI-03 / UI-04 / UI-05 / UI-08'in sahibi olduğu applicable durumlar assertions'a bağlı;
      Text/Icon/Joystick (UI-10), Modal (UI-09), Glyph/InputPresentationController
      (UI-12) kalan görev olarak görünür. Hazır ilan edilen alt kapsamda eksik
      durum gate'i düşürür; bütün tier-1/M3 kapanışı yalnız UI-13.1'de yapılır.

### UI-09 — Overlay, bildirim ve veri yüzeyleri

Ön koşul UI-08. Sahip overlays/data/layout; bütün ailelerin katalog karşılığı.

- [ ] **UI-09.1 — Modal/Sheet/Popup/Popover/ContextMenu/CommandPalette/
      RadialMenu/DialogueBox/showConfirm/showFatalStartupError.** Katmanın ilk
      odağı/odak sınırı/etkileşimsizlik/adı/odak geri yüklemesi/tek geri olayı; uzun
      içerik/portal/dışa tıklama/iç içe işaretçi. Kapanır: 3 katmanlı yığın doğru LIFO,
      diyalog giriş/çıkış ayarı ve iptalde kaynak temizliği, 200%/IME focus örtülmez;
      fatal klavye/AT bağımsız, destroy çağrısında body katmanı/dinleyici kalmaz.
- [ ] **UI-09.2 — Tooltip/RichTooltip ve ToastManager.** Kalıcı hover/odak, Esc, balona
      geçiş, dokunma/kol yardım alternatifi; 3 bildirimlik kuyruk, kritik
      öncelik/eylem/hover ve odakta durma/durum/geçmiş. Kapanır: 3s sonunda zorunlu
      gizleme yok; acil bildirimler sessizce düşürülmez; olay salkımı ve kaynak
      temizliği deterministik, oyun HUD'ı üstüne kontrol kapatılmaz, AT dinlenir.
- [ ] **UI-09.3 — DataTable/Kanban/EventLog/KeyBindingList.** Hizalama/alternatif satır
      rengi/sıralama/sayfalama/sanal öğe sayısı; sabit kimliğe göre fark; Kanban
      sürükleme+tıklayarak taşıma, klavye düzenleme/odak, tuş bağlama çakışması/boş
      durum/yeniden bağlanan glif. Kapanır: Tab/yön tuşu semantiği mantıksal, boyut
      değişimi/%30/%200/RTL, sanal öğe odağı kaybolmaz; model farkı ve pointercancel
      regresyonu; üretim iş kuralları yok.
- [ ] **UI-09.4 — Diyalog deseni/yönlendirici işaret/yasal metin.** Var olan
      Modal/Panel/ Button/Text bileşim tarifi ile yıkıcı işlem/çıkış/izin/ genel
      yerel/uzak kayıt çakışması, ilk kullanım yönlendirmesinde atla/geri/hedef kaybı,
      katkılar/yasal metin okuma. Yeni public bileşen yalnız tekrar kullanılabilir eksik
      kanıtlıysa, kaynak ağacını yansıtan test/vitrin/export aynı commit'te. Kapanır:
      taklit yerel/uzak çakışmada niyet/hata/bekleme/yeniden deneme/iptal açık; gerçek
      Steam AutoCloud entegrasyonu diye sunulmaz, kimlik doğrulama/izin motoru icat
      edilmez.

### UI-10 — Dokunma, yükleme, kaydırma ve çalışma alanı

Ön koşul UI-09. Sahip touch/camera/layout/text; kalan aktif ve katalog
bileşenlerinin yaşam döngüsü.

- [ ] **UI-10.1 — DirectionButton/DPad/Joystick/SquareJoystick/SwipeGestureZone/
      MultiTouchZone/PullToRefresh.** Birinci/ikinci işaretçi sahipliği, iptal/capture
      kaybı/görünürlük/kaydırma çakışması; joystick deadzone/smooth tüketici politikası
      mevcut, UI'de tank kuralı yok. Kapanır: VOL.TEST oyunu joystick/hold testi; yalnız
      dokunma ve klavye/kol eşdeğer anlam; gesture süresi/pinch işlevi reduced-hareket
      yüzünden bozulmaz.
- [ ] **UI-10.2 — DualAxisScrollPanel/ScrollView/VirtualList/KeyedVirtualList/
      SplitPane.** Etkileşimli alt öğe istisnası, sürükleme eşiği, birincil işaretçi,
      klavye/dokunmayla kaydırma, etkileşimsiz sanal öğeler, sabit anahtarlar ve yatay
      taşma davranışı, resize. Kapanır: pointerdown anında alt düğmenin niyeti alınmaz;
      iptal edilen sürükleme tıklama üretmez, capture kaybı sonrası kaynaklar temiz;
      sıralı odak/sanal kaydırma korunur; %200 dış panel kaydırması ve 24/44 kaydırma
      tutamağı politikası.
- [ ] **UI-10.3 — PauseResumeButton sunum/tarif ayrımı.** Mevcut constructor ve
      callback bildiren `setRunning` sözleşmesi tüketici taramasıyla korunur.
      Yeni additive sessiz state-sync metodu, ayrı kullanıcı intent yolu ve
      opt-in sayaç tarifi sunulur; eski `setRunning` callback davranışı geçiş
      notuyla korunur, accepted intent sesi üretmez. Eski counter seçeneği ince
      recipe delegasyonu ile uyumludur; breaking kaldırma ayrı API işidir.
      Kapanır: legacy setter/callback, sessiz sync, user toggle, initial running,
      counter completion, freeze, pointercancel ve destroy ayrı regresyonlar;
      disabled/focus/timeout sahipliği; public sınıf silinmez ve vitrin sayaç
      hatasını maskeyle gizlemez.
- [ ] **UI-10.4 — LoadingScreen/Text/AnimatedLabel/Icon/Toolbar/PropertyField/
      CanvasViewportController/WorldCameraController/PinchZoomController.** Gerçek
      hazır/hata/yeniden deneme/iptal ve ilerleme yüzdesi; çalışma alanı
      kaydırma/büyütme/ özellik doğrulama/salt okunur/tuş ipuçları; metin sayıları/ikon
      ad alanı. Kapanır: asgari yükleme süresi 500ms isteğe bağlı, meşgul durumu ilk
      yanıtı <100ms, iptal/ömür zamanlayıcı güvenli; yüklemede sürekli ses varsayılan
      değil; bütün hareket/Canvas renkleri kapsamlı, parmakla büyütmeye alternatif
      düğme/tuş, destroy/çıktı gözlemcisi temiz.
- [ ] **UI-10.5 — Palette ve ileri katalog kanıtı.** Her aile durum örneği, public
      yardımcı sayıları, eylem gezinmesi/grid ARIA gerekçesi. Kapanır: registry katalogdaki
      başlangıç sınıflarının tamamı+yeni exportlar tam; çalışma alanı ve renk paletinde sınırlı renkle
      okunabilirlik; kullanılmayan API yalnız tüketicisiz diye ölü sayılmaz; tier-2
      beklerken erişilebilir kalır.

### UI-11 — Metin oturumu ve Android / M7 alt faz

Ön koşul UI-10; native sözleşme tasarımı UI-06'da okunmuş olmalıdır. Sahip CORE
textEntry/platform + Tauri adaptörü + vitrin Metin Girişi laboratuvarı.

- [ ] **UI-11.1 — Sahip/oturum/IME bileşimi.** Mevcut
      `core/src/ui/textEntry/textEntry.ts` sağlayıcı/kip sondası yeniden kullanımı;
      önerilen `TextEntrySession.ts` ve abort/selection gruplama. OSK Türkçe/İngilizce
      düzeni, dil değişimi, Unicode grafem/silme ve maxLength birimleri, multiline/
      password/readOnly/disabled; açık oturumun sahibi için public iptal/kaynak
      temizliği yolu. Kapanır: eski asenkron sonuç yeni veya yok edilmiş alana yazamaz
      ve yeniden odak veremez; sağlayıcı değişiminde eski sahibin temizliği yeni sahibi
      silmez; tek bekleyen istek/zaman aşımı/geri/Escape/iptalde seçim geri yükleme; IME
      bileşimi sırasında Enter göndermez; OSK diyalog adı/odak sınırı ve açık ekran
      görüntüsü örneği.
- [ ] **UI-11.2 — Native menü ve pano.** `core/src/ui/nativeMenus.ts` +
      `tauri-v2/src-tauri/src/native_menus.js` düzenlenebilir alan istisnası; ilgili
      mevcut test beklentilerini yeni sözleşmeyle değiştir. Önerilen CORE
      ClipboardAdapter + web/native adaptörü; resmî eklenti ancak uygulama tüketimi ve
      yetenek ihtiyacı kanıtıyla. Kapanır: yapıştırmayı kullanıcı başlatır; salt okunur
      alanda Kopyala/Tümünü Seç var, Kes/Yapıştır yok; parolada platform varsayılanı
      olarak Kopyala/Kes kapalı, Yapıştır açık; izin reddi/yetenek yokluğu/boş durumlar
      akışı bozmadan ele alınır; odak yoklaması ve pano içeriği günlüğü yok, hassas
      içerik bayrağı garantisi ancak Android köprüsü bayrağı gerçekten yazarsa; yaşam
      döngüsünde geç sonuçlanan Promise güvenli.
- [ ] **UI-11.3 — Android Activity/ActionMode/Insets.** Uygulamanın izlenen MainActivity
      sınıfı `onWebViewCreate` kancası; üretilmiş Tauri/WryActivity düzenlemesi yok.
      Önce standart WebView seçim menüsü; gerekiyorsa dar Kotlin Plugin load/onDestroy
      geri çağrısı ve native WindowInsets sağlayıcısı. CSS pikseline dönüşüm, native/web
      arasında tek iç boşluk sahibi ve klavyenin örtmesi ayrı. Kapanır: gerçek cihazda
      kes/kopyala/yapıştır/tümünü seç/seçim tutamaçları/uzun basış,
      bar/cutout/rotation/adjustResize/fullscreen/bölünmüş/yüzen IME; hayalet iç boşluk
      yok, imleç ve kalıcı değişiklik erişilebilir; işletim sistemi geri olayını
      ActionMode/IME tüketirse CORE'a ikinci geri olayı gitmez, predictive/hardware back
      ayrı sonda.
- [ ] **UI-11.4 — Metin Girişi sekmesi + APK.** Yetenek/taklit ve native ayrımı,
      sağlayıcı var/yok, hata/yarış/güvenli giriş/dil ve klavye örnekleri; uygulamanın
      Android yapılandırmasında asgari izin/yön politikası araca uygun. Kapanır:
      fiziksel Android son build APK açılır; OS/WebView/Tauri/Wry/ pencere bayrağı
      bilgisi, 200% sistem fontu ve %200 web ayrı; ekran görüntüsü/video kendi vitrin
      örneğinden; erişilmeyen Samsung NOT-RUN, başka Android'in sonucu Samsung PASS
      değildir.
      UI-00.6 sondasını gerçek Android WebView sürümüyle bağla ve kalibre et; JS/DOM/OS sunum
      scope farkı raporda görünür, browser emülasyonu native ölçüm diye sunulmaz.

Faz testi: kaynak ağacını yansıtan textEntry/Input/TextArea/nativeMenus/platform, Tauri
adaptörü testleri, Kotlin politikası ve gerçek WebView ölçüm araçları/sondası;
Chromium+WebKit taklit sağlayıcı E2E cihazın yerine geçmez.

### UI-12 — Deck metin/glif ve Windows / M7

Ön koşul UI-11 teknik teslimi; Linux/Android fiziksel kabulü ayrı açık kalır. Sahip
tauri-v2/platform ve native SHOWCASE.

- [ ] **UI-12.1 — Steam metin sağlayıcısı.** Mevcut
      `tauri-v2/src/platform/steamworks.ts` ve plugin `service.rs` parola
      isteği→Password modu, yüzen tek/çok satırlı giriş yönlendirmesi ve sahibin iptali.
      Kapanır: diyalog sonucu ile yüzen klavyenin işletim sistemi tuş olayı ayrı
      testler; submit/ iptal/timeout/katman kapalı/TR/CJK/emoji/parola maskesi/ikinci
      istek/ destroy/uyku/devam gerçek Steam runtime sondası; AppID 480 veya başarılı
      IPC gerçek ürün kabulü diye sunulmaz; mevcut OSK yedeği korunur.
- [ ] **UI-12.2 — Eylem glifi ve kol geçişi.** InputPresentationController/
      Glyph/GlyphFamilyContext ile etkin eylem kaynağı köprüsü; remap, hotplug/çoklu
      kol/Steam Input kapalı/trackpad/fare/klavye. Kapanır: gerçek bağlama glifi ile
      aile yedeği açık ayrılır; keyfi dosya sistemi izni yok; odak/kol işaretçisi için
      çift sahip yok; Deck ekran klavyesi/menüleri/diyalogları yalnız kolla bütün
      işlevlere erişir.
- [ ] **UI-12.3 — Haptik/native yaşam döngüsü.** Mevcut hidraw/evdev/Steam/ Android
      sürücülerini yeniden kullanma, açık Test düğmesi/durum; yanlış yetenek bildirimi
      ve yetenek yokluğu. Kapanır: sıfır/kapalı durum sessiz, tek sürücü; uyku/odak
      kaybı/cihaz çıkarma/çıkışta durma gerçek sonda; hissiyat kullanıcı beyanı ayrı,
      A20 zamanlayıcı mimarisi kullanıcı kapsamı dışında kalan yan yeniden düzenlemeye
      dönüşmez.
- [ ] **UI-12.4 — Windows yükleyicisi ve metin laboratuvarı.** NSIS gerçek Windows
      derleme/yükleme/kaldırma/açılış, WebView2 kullanılabilirliği, DPI 125/150/200%,
      font/input/clipboard/back. MSI istenirse ayrı gerçek build/test; Windows ortamı
      olmadan Linux çapraz derlemesi PASS değildir. Kapanır: asgari eklenti izinleri ve
      kendine özgü kimlik; ekran görüntüsü+build özeti; depolama yazıcısı var olan kök
      açık iş sınırıyla çapraz raporlanır.
      UI-00.6 sondasını gerçek Windows/WebView2 ortamına bağla; frame/CPU atfı ve sunum probu A/A
      ile kalibre edilir. Eksik trace desteği açık kabul engelidir.

### UI-13 — Tam kalite, çapraz kabul ve teslim

Ön koşul bütün önceki fazların kod/kapı kapanışı. Sahip bağımsız kalite incelemesi;
eksik cihaz/insan alt görevleri görülmeden sürüm tamamlandı sayılmaz.

- [ ] **UI-13.1 — Tam tier-1 / M3 ve katalog kapanışı.** CATALOG'daki 89 sınıfın tamamı ve runtime
      yardımcıları yeni dışa aktarımlarla yeniden çıkar; Tier-1 tam durumlar/Tier-2
      gerekçeli N/A, 15 sekme ve CONTRACT'taki uygulanabilir gereksinimler. Kapanır: ertelenmiş applicable durum
      ve açık uygulanabilir AA bulgusu sıfır; registry gerçek
      test doğrulaması bağlantısı tam; yeni API/public yüzey kilidi/belgeler/README/i18n
      uyumlu; kaldırılan yollar güncel olmayan referans bırakmaz; kullanılmayan
      bağımlılık/anahtar/varlık yok; modül döngüsü ve 1000 satır sınırı korunur.
- [ ] **UI-13.2 — Etkileşim stresleri.** İç içe modal→Select→OSK→IME geri akışı, istek
      beklerken tema/dil değişimi, hızlı tekrar/yükleme iptali, 200% boyut
      değişimi/RTL/multidokunma/kol/dokunma geçişi/hotplug, askıya alma/kaynak
      temizliği/devam ve sessizleştirme/ses erişimini açma; odak/video/ses olay zaman
      damgaları. Kapanır: kayıp odak/yinelenen kalıcı değişiklik/kalan kaynak/eski sonuç
      yok; iki motor/durum/axe/geometri/determinizm/UI niyeti testlerinin tamamı
      başarılı.
- [ ] **UI-13.3 — Gerçek cihaz/performans.** Linux dizüstü, Deck host/SLR4, Android
      profili ve Windows UI aynı test örneğiyle eşleştirilmiş A/B; VOL.TEST statik
      HUD/slalom/fizik/çoklu tank/yoğun hava farklı yükleri sabit tohum ve girdilerle.
      Kapanır: CPU %5 güven sınırı/gürültü ve ekrana sunum ayrı sınanır; UI ek maliyeti
      kök neden olarak toplam oyun FPS'inden ayrılır; mevcut Deck p95≤18ms işi veya
      Lenovo ağır yük işi açıkken bütün ürün geçti denmez; 10dk termal
      koşul/oturum/soğuk açılış ve uyku/devam kapsamı açık; bilinmeyen GPU NOT-RUN.
- [ ] **UI-13.4 — İnsan erişim/görsel/haptik.** Yalnız klavye/yalnız kol gerçek akış,
      seçilen masaüstü AT + Android TalkBack + Windows NVDA/Narrator; TR/EN/200%/yalnız
      renk/gri tonlama, gerçek glif yüksekliği, dokunma haptikleri. Kapanır:
      yapanın gerçek beyanı ve kullanılan profil kaydı; eksik donanım profili açık
      kabul, otomatik axe sonucu insan kabulü değildir; ses üretimi UI-02.5'in
      teknik kabulüdür, zorunlu dinleme beyanı bu göreve taşınmaz.
- [ ] **UI-13.5 — Sürüm adayı teslimi.** `pnpm signoff`, source/manifests/ public
      yüzey/paket boyutu/ölçekleme/yerel kapı bileşimi; değişen varsayılan piksel
      temelleri incelenmiş; bütün belgeler güncel, canlı eski yol referansları sıfır.
      Kapanır: high/signoff ve gerçek kabul ayrı PASS/FAIL/NOT-RUN raporu;
      açıklanmış git durumu; kalan her iş kök/paket TODO'da gerçek ölçütle açık.

## Kapatılanlar

Uygulama fazı henüz kapanmadı. Planın hazırlanmış olması yukarıdaki bir üretim görevini
kapatmaz.
