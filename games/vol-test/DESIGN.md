# VOL.TEST tasarımı

## Amaç

VOL.TEST monorepo'nun deney ve test oyunudur:

1. CORE'un girdi, zaman, UI, titreşim ve platform yüzeylerini gerçek bir oyun
   döngüsünde, gerçek cihazlarda çalıştırır.
2. Yeni oyun iskeletine kaynak olur: kabuk, kimlik, kapı ve cihaz kurulumu
   burada kanıtlanır.

İçerik bilinçli olarak yoktur: dünya boş bir ızgaradır. Sınanan şey içerik
değil, his ve altyapıdır. Ana menü yoktur; HUD ve duraklatma vardır.

## Dünya

| Ölçü   | Değer                                                 |
| ------ | ----------------------------------------------------- |
| Boyut  | 4096 × 4096 birim (128 × 128 m; 1 m = 32 birim)       |
| Izgara | İnce çizgi 128 birimde (4 m), ana çizgi her 8 hücrede |
| Sınır  | Dört duvar; çarpmada o kenar parçası şiddetle parlar  |
| Engel  | Yok                                                   |

### Renk dili

Oyun ve UI iki ayrı renk dilidir ve birbirine karışmaz:

- **Oyun** (`src/config/palette.ts`): sıcak çöl kumu zemin, zemine yarı
  saydam siyahla işlenen ızgara, koyu toprak sınır, sıcak metal kıvılcımı,
  kum tozu, tankın biyolüminesans silah ışığı.
- **HUD**: yalnız CORE UI tokenları (`VOL_COLORS`, `--vol-ui-*`). Metin
  taşıyan HUD bölgeleri UI yüzey tokenıyla zeminlenir; oyun zemini ne olursa
  olsun okunur.

Tema değişince oyun, oyun paleti değişince HUD etkilenmez.

## Tank

VT-01, organik zırhlı hafif bir keşif tankıdır: metal şasi, kitin kaburgalı
kabuk, parlayan biyolojik çekirdek, merceği olan taret, arkada iki duyarga.

### Fizik modeli

Tank bir katı cisimdir (`src/sim/tank/Tank.ts`): kütle 1200 kg, eylemsizlik
momenti ayak izinden türer. Tank yalnız kuvvetle hareket eder; hız atanmaz.

| Kuvvet                 | Model                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palet çekişi           | Palet yüzey hızı ile zemin hızı farkı; Coulomb sürtünmesiyle sınırlı. Tutunan palet statik (μ = 1.35), kayan palet kinetik (μ = 1.0) katsayı görür; geçiş kayma hızıyla üsteldir (Stribeck)       |
| Direksiyon ünitesi     | Paletler arası itki farkı önceliklidir; ortak itki kalan sürtünme payına sığar. Tam gazda da dönülür                                                                                              |
| Motor gücü             | İki palet arasında paylaşılan tavan: düşük hızda sürtünme, yüksek hızda güç sınırlar. İç palet frenlerken dış palet daha çok güç alır                                                             |
| Aktarma                | Tork sınırlı: palet zeminin en çok 26 birim/s önüne ya da gerisine sürülür, tutunma tepesinde çeker. Gaz bırakılınca ortak hız motor freniyle (220 birim/s²) azalır; direksiyon farkı çevik kalır |
| Fren                   | Paletleri kilitler; tank kinetik sürtünmeyle kayarak durur, direksiyon devre dışıdır. Güçle sınırlı değil                                                                                         |
| Birleşik kayma         | Palet boylamsal ve yanal sürtünmeyi aynı temastan alır; kayma normalize elipsi aşınca kuvvet kayma yönüne izdüşer. Kilitli ya da kayan palet yanal tutuşunu yitirir                               |
| Dönüş (skid-steer)     | İki paletin kuvvet farkı torktur                                                                                                                                                                  |
| Yanal ve dönme direnci | Palet boyu üzerinde yayılmış sürtünme (statik μ = 0.95, kinetik 0.7). Dönme direnci hızla ve paletlerin kaymasıyla azalır: keskin dönüşte tank kayar (drift), kayma sürer ta ki tutunana dek      |
| Yuvarlanma direnci     | Yükün %5'i                                                                                                                                                                                        |
| Duvar                  | Gövde köşesinde itki ve sürtünme itkisi; sekme katsayısı 0.35. Açılı çarpma tankı döndürür                                                                                                        |
| Ateş                   | Mermi tankın hızını devralır; tanka ters yönde itki uygulanır                                                                                                                                     |

Adım 60 Hz sabittir; kuvvetler sert olduğu için her adım iki alt adıma
bölünür (120 Hz).

### Sürücü

Oyuncu ekrana göre bir yön ister (Mindustry tarzı). Sürücü
(`src/sim/tank/Driver.ts`) bunu palet hızlarına çevirir:

- Önce döner, sonra gider: yön hatası ~50°'nin altına inene dek gaz açılmaz;
  hata azaldıkça gaz yumuşakça açılır.
- Hedef dönüş hızı yön hatasıyla orantılıdır. Tavanı hızla azalır: dururken
  3 rad/s, azami hızda bunun %55'i. Hızlıyken dönüş genişler.
- Ölçülen dönüş istenenden geride kaldıkça palet farkı büyür (geri besleme).
- Hedef yön 2.2 rad'dan fazla arkada kalınca geri vites; 1.5 rad altında
  ileri. Aradaki boşluk titremeyi önler.

Klasik tank kontrolü (ileri + yerinde dönüş tuşları) kolda ve dokunmatikte
hantal olduğu için seçilmedi.

### Süspansiyon

Gövde paletlerin üstünde yaylıdır (`src/sim/tank/Suspension.ts`). Yunuslama
ve yalpa ayrı yay-sönüm sistemleridir: doğal frekans 2.3 Hz, sönüm oranı 0.38.

- Kuvvet ağırlığı taşır: kalkışta gövde geriye, frende öne, virajda dışa kayar.
- Ateş gövdeyi atışın tersine vurur. Yandan ateş yalpa yapar.
- Duvar çarpması gövdeyi çarpma yönüne vurur.
- Hızla artan, palet yoluna bağlı deterministik yol titreşimi vardır.
- Paletler yerde kalır; gövde, çekirdek, duyargalar ve taret birlikte kayar.
  Gölge gövdenin yükselişiyle az kayar.

### Taret

Taret gövdeden bağımsız döner ve dünya ekseninde sabitlenir (stabilizatör):
gövde dönerken nişan korunur. Azami dönüş 5.5 rad/s'dir. Nişan bırakılınca
1.4 s bekler, sonra gövde yönüne döner.

## Ateş hissi

Tek atış dört katmanda hissedilir:

1. Fizik: tanka ters yönde itki; paletler onu birkaç birimde yakalar.
2. Süspansiyon: gövde atışın tersine yaylanır ve salınarak oturur.
3. Namlu: geri kayar ve yayla yerine döner; ağız parlaması ve duman.
4. Kamera ve titreşim: görüntü atışın tersine yaylı tepme yapar; kol ve
   telefon %70 şiddetle `tap` titreşimi verir.

## Kamera

Kamera arachnid modelidir (CORE `FollowCamera`, ayarı `src/config/camera.ts`): hedef ara
değerli gövde konumudur ve 90 ms zaman sabitli üstel takiple izlenir. İleri
bakış yoktur; görüntü dünya sınırında kalır. Zoom kademesizdir (0.55–1.9,
varsayılan 1.5). Üstüne iki öteleme biner: ateşte yaylı tepme, duvar
çarpmasında sönen sarsıntı. Takip kare hızından bağımsızdır.

## Mimari

```
girdi (CORE InputManager) ─► TankCommand ─► Simulation.step (60 Hz sabit)
                                                 │
                        SimEvent kuyruğu ◄───────┘
                              │
   TankView · EffectsView · ArenaView · FollowCamera · HUD · titreşim (sunum zamanı)
```

| Katman              | Sorumluluk                                                                          | Phaser |
| ------------------- | ----------------------------------------------------------------------------------- | ------ |
| `src/sim/tank/`     | `Tank` (bileşim), `trackForces`, `Driver`, `Suspension`, `Turret`, `BoostReserve`   | hayır  |
| `src/sim/`          | `Simulation`, araç varlıkları, dünya, mermi, olaylar                                | hayır  |
| `src/view/`         | `ArenaView`, `TankView` + `TreadRig`, `EffectsView` (izler, parçacıklar, palet izi) | evet   |
| `src/hud/`          | `Hud` (bileşim) + durum, harita, ipuçları, dokunmatik, duraklatma, tam ekran        | hayır  |
| `src/input/`        | Eylem sözlüğü ve eşleme verisi                                                      | hayır  |
| `src/scenes/world/` | `PlayerControls`, `PauseController`, `CameraRig`, `routeSimEvents`, kare üretimi    | kısmen |
| `src/scenes/`       | `WorldScene`: yalnız yaşam döngüsü ve bağlama                                       | evet   |
| `src/config/`       | Bütün ayarlar; kod sayı gömmez                                                      | hayır  |

Her dosya tek sorumluluk taşır: bileşim sınıfları (`Tank`, `Hud`,
`EffectsView`, `WorldScene`) parçaları kurar ve sıralar, hesap yapmaz.
Hesap saf fonksiyonlardadır (`computeTrackForces`, `resolveWallContacts`,
`routeSimEvents`, `tankFrame`) ve tek başına testlidir.

**Sabit adım ve ara değer.** Simülasyon CORE `SimulationClock` ile `defer`
kipinde ilerler. Görüntü önceki ve güncel adım arasında ara değerle çizilir;
poz, taret ve süspansiyon ara değerlidir. 30, 60, 90 ve 144 Hz çizim aynı
adımda bit düzeyinde aynı durumu verir (testli).

**Olaylar.** Simülasyon atış, isabet ve duvar çarpmasını olay kuyruğuna yazar
(tavan 512). Sahne kuyruğu her karede bir kez boşaltır; görünüm simülasyona
geri yazmaz.

**Phaser sınırı.** `src/sim/` Phaser import etmez ve CORE'un dar alt
yollarını kullanır; ölçekleme betiği Node'da, simülasyon testleri tarayıcısız
koşar.

**Ayar.** Ayarlar `src/config/` altındadır: `tank.ts` (fizik, süspansiyon,
silah), `camera.ts`, `feel.ts` (olay → kamera/titreşim eşlemesi), `fx.ts`,
`palette.ts`, `world.ts`. Görünüm palet geometrisini fizikten türetir; ölçü
tek yerde değişir.

## Sanat

Tank yedi SVG parçadır (`src/assets/tank/`): gövde, taret, palet dokusu,
palet ucu, çekirdek parıltısı, duyarga, ağız parlaması. Gölge ayrı bir resim
değildir: CORE `PoseShadow` tankın kendi parçalarını karartıp kaydırır
(`poseSourceOf`). Parçalar dört
kat çözünürlükte rasterlenir ve sahnede tersiyle ölçeklenir.

- Palet, yüzey yoluyla kayan bir banttır. Uçlar paletin döndüğü yarım
  dairedir; uçtaki halkalar aynı yolla döner. Patinajda palet döner, tank
  ilerlemez.
- Palet izi zemindeki gerçek yoldan bırakılır; patinaj iz uzatmaz, toz kaldırır.
- Kayan palet (fren kilidi, drift) desen basmaz; temas noktası yerde kesintisiz
  bir kayma çizgisi bırakır. Çizgi temasın gerçek yolunu izler, koyuluğu kayma
  hızıyla artar, 20 s yerde kalıp söner.
- Çekirdek hıza ve hızlanmaya göre daha sık atar; duyargalar dönüşün tersine
  yayla savrulur.

## Girdi

Eylem sözlüğü `src/input/bindings.ts` içindedir: `fire`, `boost`, `brake`, `zoomIn`,
`zoomOut`, `grid`, `pause`. Hareket ve nişan CORE `InputState.move` ve `aim`
olarak gelir.

- Klavye, fare, kol ve dokunmatik aynı karede birleşir (CORE `InputManager`).
- Kol eşlemesi W3C `standard` dizinleridir; Steam Deck'te Steam Input'un
  sanal kolu aynı dizinleri verir.
- Zoom, ızgara ve duraklatma kenar tetiklidir.
- Dokunmatik düğmeler CORE `VirtualActionSource`a yazar; tek karelik dokunuş
  mandalla korunur.
- HUD kipi son anlamlı girdiyi izler (`InputPresentationController`).

## Titreşim

CORE `vibrate(desen, şiddet)` anlamsal desenleri kullanılır; şiddet telefonda
darbe süresini, kolda iki motorun gücünü ölçekler. Titreşim açılışta açıktır.

| Olay                 | Desen     |
| -------------------- | --------- |
| Atış                 | `tap`     |
| Hafif duvar çarpması | `tap`     |
| Sert duvar çarpması  | `warning` |
| Duraklatma           | iptal     |

Web'de Android Vibration API ve kol `vibrationActuator` çalışır. Steam Deck
(Linux native sürücüsü) ve Android native izni kabukla gelir.

## HUD

Görünen her parça CORE bileşenidir (testli): başlık ve telemetri `Text`,
hızlanma deposu dikey `Bar`, harita `MinimapPanel`, ipuçları `Glyph` ve
`Text`, `FpsMeter`, tam ekran `IconButton` ve `FullscreenController`,
dokunmatik `HoldButton` ve `IconButton`, duraklatma `Modal`, `Text` ve
`Button`. Oyunun CSS'i yalnız yerleşimi ve UI tokenıyla zemini verir.

Telemetri saniyede ~15, harita ~10 kez yenilenir. Duraklatma katmanı düğme,
Esc, kolun Menu düğmesi ya da Android geri hareketiyle kapanır; arka plana
dokunmak kapatmaz. Uygulama arka plana geçince oyun duraklar.

## Hissiyat zarfı

Sürüş hissi ölçülebilir karşılıklarıyla kilitlidir (`tests/sim/feel.test.ts`).
Zarfı değiştirmek bir tasarım kararıdır ve bu tabloyla birlikte yapılır.

| Ölçü                         | Zarf                                                     |
| ---------------------------- | -------------------------------------------------------- |
| Hizalı kalkış, %90 azami hız | 0.8–1.8 s                                                |
| Gaz bırakınca durma mesafesi | 40–140 birim                                             |
| Frenle durma mesafesi        | 55–110 birim, düz; gaz bırakmanın %80'inden kısa         |
| Hızlıyken keskin 90° dönüş   | kayma açısı 15–50°, dönüş hızı tavanın 1.2 katı altında  |
| Dönüşte fren                 | yanal kayma > 25 birim/s, gövde 5–45° dönmeyi sürdürür   |
| Dururken 90° dönüş           | 0.5–1.2 s, aşma 5° altında                               |
| Hızlıyken dönüş              | dururkenkinden yavaş                                     |
| Seyirden hızlanma            | depo tükenmeden yeni tavanın %90'ı                       |
| Durarak ateş                 | tank 0.5–12 birim geri teper, gövde ≥ 0.8 birim yaylanır |
| Duvar sekmesi                | 0 < sekme < çarpma × sekme katsayısı × 1.2               |

## Kapılar

| Kapı      | Ne ölçer                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Birim     | Fizik, sürücü, süspansiyon, kamera, görünüm eşlemesi, HUD, sahne akışı                                       |
| Değişmez  | Tohumlu rastgele komutla 18 bin adım: NaN yok, dünyadan çıkış yok, hız, dönüş, süspansiyon ve depo sınırları |
| Hissiyat  | Yukarıdaki zarf                                                                                              |
| Kare hızı | 30, 60, 90 ve 144 Hz aynı adımda aynı durum                                                                  |
| Kapsam    | Eşik `quality.json`da                                                                                        |
| Bundle    | app, vendor (Phaser), css gzip boyutu                                                                        |
| Ölçekleme | Mermi adımı 128 → 512'de süre oranı; doğrusal ~4, tavan 6                                                    |
| E2E       | Build, Chromium ve WebKit: klavye, sanal kol, dokunmatik çubuk, duraklatma, HUD kipi, temiz konsol           |

## Bilinen sınırlar

- Ses yoktur.
- Tauri kabuğu, Android, Steam Deck ve Windows paketleri henüz yoktur.
