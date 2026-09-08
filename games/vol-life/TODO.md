# VOL.LIFE — iş listesi

Sağlam bir başlangıç altyapısı için kapatılması gereken maddeler. Her madde
NEDEN gerektiğini ve NE ZAMAN kapandığını söyler; tahmin değil, bu turda
ölçülmüş/doğrulanmış bir eksikten türedi.

Ürün kararları, dünya modeli ve inşa sırası [DESIGN.md](DESIGN.md)'dedir. Bu
dosya yalnız iş kalemlerini tutar. Kök [TODO.md](../../TODO.md) repo geneli
borçları taşır; buradaki maddeler VOL.LIFE'a özgüdür.

Sıra [DESIGN.md](DESIGN.md) §13'ün adımlarını izler.

## Zemin — kapatılmamış kalemler

- [ ] **`SimulationClock` `partialStep: 'defer'` ile kurulmalı.** Varsayılan
      `'simulate'`tır ve artık dilimi değişken bir adım olarak koşar; bu
      determinizmi kare hızına bağlar. Bir test bu seçimi kilitlemeli — sessizce
      varsayılana dönmek tekrar oynatmayı bozar.

- [ ] **`scripts/device-benchmark.mjs` vol-life'ı tanımıyor.** `APPS` listesi
      elle tutulur ve yalnız `vol-arachnid` + `vol-hell` içerir; cihaz ölçümü
      VOL.LIFE'ı sessizce atlar. Kabuk artık kurulu
      (`com.volstudio.life`), eksik olan yalnız bu satır.

- [ ] **E2E yok.** `test:e2e` script'i yazılmadı, dolayısıyla `justfile`ın ELLE
      tutulan `e2e` tarifinde de görünmüyor. Bekçi
      (`justfileWiring.test.mjs`) yalnız ters yönü kapılar: script'i olup
      tarifte görünmeyen paketi reddeder. Çizilecek içerik geldiğinde ikisi
      birlikte eklenir.

- [ ] **Ölçekleme bütçesi henüz YOK.** Kapı artık geneldir: bütçe yazan paket
      ölçüm tarifini de yazar (`quality.json` → `scaling.<paket>.$measure`).
      Eksik olan VOL.LIFE'ın benchmark betiği; Adım 2'de yazılır ve parçacık
      simülasyonu için en anlamlı kapı odur.

## Adım 1 — dünya substratı

- [ ] **Alan yığını (`FieldSet`).** Beş alan: `flow` (iki bileşen), `nutrient`,
      `energy`, `temperature`, `disturbance`. `Float32Array` paralel diziler;
      alan başına ayrı nesne yok.
- [ ] **Difüzyon.** Çözünürlük ve tempo ölçümle seçilir. Devredilen ölçüm 512²
      kademeli güncellemenin 256² tam güncellemeden HEM daha ucuz HEM daha
      keskin olduğunu gösteriyordu (0,585 ms vs 0,892 ms; cephe bandı 56 vs 112
      dünya birimi). Bu sayı BAŞKA bir makinede ölçülmüştür; burada yeniden
      ölçülmeden bütçe yazılmaz.
- [ ] **Çift doğrusal örnekleme.** Organizma alan değerini kendi konumunda okur;
      hücre merkezine yuvarlamak gradyan takibini basamaklandırır.
- [ ] **Kaynak tohumlama.** Kaynak dünyanın VERİSİDİR ve açılışta tohumlanır.
      İptal edilen denemede hiçbir tür kaynak alanını yazmıyordu ama üç tür onu
      takip ediyordu; nüfusun yarısı sıfır gradyan izliyordu.
- [ ] **Toroidal sarma.** Dünya kenarı `worldConfig.sizeUnits`; sarma hem alan
      indeksinde hem mesafe hesabında tutarlı olmalı. En sık kaçan hata mesafe
      tarafıdır.

## Adım 2 — parçacık yaşamı

- [ ] **SoA depo (`AgentStore`).** Paralel `Float32Array`/`Uint8Array`; ajan
      başına JS nesnesi YOK. Kimlik `Uint32` handle: düşük bitler indeks, yüksek
      bitler kuşak; 0 geçersiz. CORE'un `SpatialIndex`i `Map<T, number>` ile
      nesne kimliğine bağlı olduğu için kullanılamaz.
- [ ] **Uzamsal hash.** Counting sort, `Map` yok, sıcak yolda tahsis yok.
- [ ] **Kuvvet birikimi ve entegrasyon AYRI.** Kuvvet kaynakları yalnız
      biriktirir; entegrasyon tek yerde yapılır. İkisi de kendi entegrasyonunu
      yaparsa hız bir adımda iki kez güncellenir.
- [ ] **Tick sırası sözleşmesi.** `komutlar → ızgara → kuvvetler → entegrasyon →
difüzyon`. Sıra determinizmin parçasıdır ve bir testle kilitlenir.
- [ ] **Render yolu: `SpriteGPULayer`.** Tek instanced draw call. Doğrudan
      tampon yazımı desteklenir (`getDataByteSize()`). `scaleX/scaleY` bir
      ÇARPANDIR — dünya birimini doğrudan yazmak parçacığı doku kenarı katı
      büyütür; dönüşüm `scale = worldUnits / textureSizePx`. Alternatifler
      (`Blitter`, `ParticleEmitter`, `Mesh`) `BatchHandlerQuad`a düşer.
- [ ] **Silme yerine `alpha = 0`.** `removeMembers` splice yapar: tüm tampon
      kirlenir ve indeksler kayar.
- [ ] **Ölü ajanın üyesi görünür kalmamalı.** İptal edilen denemede yay
      toplayıcısı ölüleri atladığı için üye hiç yeniden yazılmıyor ve sonsuza
      kadar ekranda kalıyordu. Görünürlük ayrıca izlenmeli.

## Adım 3 — matris araması (karar noktası)

- [ ] **"İlginç"in metriği tanımlanmalı.** Matris elle yazılmaz, aranır; ama
      arama bir hedef fonksiyon ister. `maxCellOccupancy` bu iş için YETERSİZ
      çıktı: yapının varlığını ölçmüyordu ve ondan çıkarılan sonucu görüntü
      çürüttü. Metrik seçilirken sorulacak soru sabittir: _bu metrik gerçekten
      görmek istediğim şeyi mi ölçüyor?_
- [ ] **Tarama altyapısı.** Deterministik tohumlarla matris uzayı taranır,
      sonuç ölçülür, ilginç olan saklanır. Çıktı `src/config/` altında VERİ
      olarak yaşar.
- [ ] **Alan kuvvetleri morfoloji oturana kadar KAPALI.** Referans morfolojiler
      saf çift yönlü kuvvetten gelir; büyük ölçekli sürükleme zar gibi hassas
      yapıları dağıtır. Ekoloji sonra açılır.

## Adım 4+ — sonraki adımlar

Bu adımların kalemleri, kendilerinden önceki adım bittiğinde ve ekranda
doğrulandığında yazılır. Şimdiden liste açmak, iptal edilen denemenin
"üç faz altyapı, ekranda içerik yok" hatasını tekrarlar.

Kilometre taşları [DESIGN.md](DESIGN.md) §13'te.

## Her adımda geçerli kurallar

- **Adım sonunda gerçek tarayıcıda görüntü.** Sayılar yeşilken ürün bozuk
  olabilir; iptal edilen denemede bu üç kez oldu.
- **Phaser API'si varsayılmaz, kaynaktan doğrulanır.** Üç ayrı hata böyle
  yakalandı: ölçek çarpanı, yoyo/loop kodlaması, kamera clamp.
  `camera.setBounds(x, y, w, h, centerOn)` — beşinci argüman verilmezse
  dünya pencereden darken sol üst köşeye yapışır.
- **Mantık Phaser sahnesinde birikmez.** Kapsam eşiği iptal edilen denemede
  mantığı sahneden iki kez çıkmaya zorladı; her ikisinde de sonuç daha iyi
  mimari oldu.
- **Ölçmeden optimize edilmez, ölçüm koda yazılmaz.** Çıkan sayı bu dosyaya ya
  da [DESIGN.md](DESIGN.md)'ye geçer, kaynak yorumuna değil.
- **Kapsam eşiği düşürülerek kapı geçilmez.** Eşikler ratchet'tir; şu an
  98/98/98/98.
