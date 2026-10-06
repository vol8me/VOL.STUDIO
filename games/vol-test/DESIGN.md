# VOL.TEST tasarımı

## Amaç ve sınır

VOL.TEST, CORE mekanizmaları ve native kabuğun gerçek oyun tüketicisidir.
Açık sürüş alanı tank fiziğini, nişanı, çevreyi ve platform servislerini
birlikte sınar. Kalıcı dünya engeli yoktur; seçilen senaryo araç veya hedef
ekler. Ana menü yoktur; HUD ile duraklatma, ayar ve senaryo panelleri vardır.

## Model ve sunum

Simülasyon `src/sim/` altında model/sunum ayrımıyla düzenlenir.
Saf headless import kabulü kök F06'da ayrıca doğrulanacaktır. CORE `SimulationClock`
60 Hz sabit adımla ilerler; tank kuvvetleri iki alt adımda çözülür. Poz,
taret ve süspansiyon önceki ve güncel durum arasında ara değerle çizilir.
Çizim hızı fizik saatini değiştirmez; duraklatma simülasyon adımı üretmez.

| Katman                                 | Sorumluluk                                                 |
| -------------------------------------- | ---------------------------------------------------------- |
| `src/app/`                             | Platform ömrü, kayıt, tercihler ve ölçüm kaynakları        |
| `src/sim/tank/`                        | Katı cisim, palet kuvvetleri, sürücü, süspansiyon ve silah |
| `src/sim/combat/`                      | Mermi uçuşu, isabet ve nişan önizlemesi                    |
| `src/sim/scenarios/`                   | Tohumlu araç düzenleri ve komutları                        |
| `src/sim/seasons/`, `src/sim/weather/` | Mevsim, hava ve kalıcı yüzey durumu                        |
| `src/view/`                            | Dünya ve tank sunumu, sınırlı efekt havuzları              |
| `src/hud/`                             | CORE bileşenleriyle metin, harita ve paneller              |
| `src/scenes/world/`                    | Girdi, kamera, çevre ve olayların bağlanması               |
| `src/config/`                          | Bütün oynanış ve sunum ölçülerinin tek kaynağı             |

Simülasyon olay kuyruğunu sahne her karede bir kez boşaltır. Görünüm model
kurallarını üretmez ve modele geri yazmaz. Listener, timer, ses ve native
abonelikler sahibinin kapanışında sökülür.

## Dünya ve sanat

Dünya 4096 × 4096 birimdir; bir metre 32 birime karşılık gelir.
İnce ızgara 128 birimde, ana çizgi her sekiz hücrededir. Dört duvar fiziksel
sınırdır; çarpılan kenar şiddete göre kısa süre parlar.

Oyun paleti `src/config/palette.ts`, mevsim sunumu `src/config/weatherView.ts`
içindedir. HUD yalnız CORE renk tokenlarını kullanır; oyun paleti UI temasını
değiştirmez. Metin bölgeleri okunurluk için UI yüzeyi üzerinde durur.

Tank, `src/assets/tank/` içindeki SVG parçalarından kurulur. Gövde, taret,
palet, çekirdek, duyarga ve namlu parlaması ayrı sunulur. CORE `PoseShadow`
aynı parçaları karartarak gölgeyi üretir. Palet bandı gerçek yüzey yolunu
izler; patinajda bant döner fakat tank ilerlemez. Palet izi temas yolunu,
kayma çizgisi ise kaymanın şiddetini izler. Kar sıkışması görsel izden ayrı,
modeldeki palet temasıyla hesaplanır.

Palet bandı `TreadTexture` ile aynı SVG'den bir kez üretilen ortak 32 karelik
dokuyu kullanır; faz aralığı 0,25 dünya birimidir. Her araç kendi pozunu
seçer, her karede canvas veya GPU dokusu üretmez. Çekirdek gövde içinde
taretin arkasında normal alfa ile çizilir. Namlu parlamaları `VehicleViews`
tarafından sahiplenilen tek additive katmandadır; gövde ve taretin dünya
pozunu izler. Boşalmış ve üretimi durmuş parçacık yayıcıları çizime girmez;
yaşayan son parçacıklar yaşam süresi bitene kadar kalır.

## Mevsim, hava ve yüzey

`src/config/seasons.ts` mevsim sırasının, sürelerin ve geçiş oranının tek
kaynağıdır. İlkbahar, yaz, sonbahar ve kış 15'er dakika sürer; döngü bir
saattir. Yeni oturum ilkbaharda başlar ve ilk 10 dakika aynı mevsimde kalır.
Son üç dakikada sıcaklık, gün ışığı ve zemin tonu sonraki mevsime geçer.

`SeasonCycle` mevsim takvimidir. Ayrı `WeatherSchedule`, mevsim ağırlıklarına
göre tohumlu hava olaylarını seçer; açık hava, toz, yağmur ve kar aynı şeyin
dört mevsimi değildir. Olaylar altı saniyede karışır. `WeatherSystem` yalnız
simülasyon saatiyle ilerler; duraklatma takvimi ve birikimi dondurur.

`SurfaceGrid` suyu, karın su kütlesini ve kar sıkışmasını sınırlı hücrelerde
tutar. Yağmur birikir, drenaj ve sıcaklıkla azalır. Kar soğukta birikir;
sıcakta eriyerek suya dönüşür. Mevsim değişimi birikimi sıfırlamaz. Palet
kuvvetleri yerel tutuş ve yuvarlanma direncini tüketir. Rüzgâr dünya birimi/s,
birikim derinliği metre cinsindedir.

`EnvironmentController` çevre modelini sahneye bağlar. Görünüm gerçek yüzey
değerlerini okur; komşu örnekler ve dünya koordinatına bağlı konturlar su
ve mevsim lekelerinin hücre biçiminde tekrarlanmasını önler. Kamera yalnız
görünen alanı keser, dünya desenini yeniden konumlandırmaz. Kar tonu gerçek
sıkışmayı, yansıma tankın gerçek gövde, taret ve palet dokularını kullanır.

Yağış, toz, dalga ve araç yansıması havuzlarının kapasitesi sabittir.
Düşük kalite sunum yoğunluğunu azaltır; birikim veya fizik değişmez.
Tam ekran filtre veya shader kullanılmaz. HUD mevsim ve havayı i18n metniyle
gösterir. Görünüm önizlemesi README'deki mevsim/hava sorgularıyla seçilir;
normal oturumun takvimi bu önizlemeden bağımsızdır.

## Sürüş ve süspansiyon

Tank bir katı cisimdir; kütle ve ayak izi `src/config/tank.ts` içindedir.
Hız doğrudan atanmaz: iki paletin kuvveti gövdeyi taşır, kuvvet farkı döndürür.
Palet yüzey hızıyla zemin hızı farkı çekiş üretir. Stribeck geçişi statik ve
kinetik sürtünmeyi birleştirir; boylamsal ve yanal kuvvet aynı sürtünme
bütçesini paylaşır. Kayan veya kilitli palet yanal tutuşunu yitirir.

Direksiyon farkı ortak itkiye göre önceliklidir; motorun güç sınırı iki
palet arasında paylaşılır. Fren paletleri kilitler ve kayarak durdurur.
Yuvarlanma ve dönme direnci, yerel yüzey koşulları ve duvar temas itkileri
aynı kuvvet çözümüne girer. Yerinde dönüş de palet temas yolu üretir.

Sürücü ekrana göre istenen yönü palet hızlarına çevirir. Önce döner, yön
hatası azaldıkça gaz açar. Dönüş tavanı hızla düşer; yüksek hızda viraj genişler.
Geri vites eşikleri histerezislidir. Bu yön kontrolü klavye, kol ve dokunmatik
kaynaklarında aynı komutu üretir.

Süspansiyonun yunuslama ve yalpası ayrı yay-sönüm sistemleridir. Kalkış,
fren, viraj, atış ve çarpma gövdeyi kuvvet yönüne göre iter. Deterministik yol
titreşimi palet yolundan türer. Paletler yerde kalır; üst parçalar gövdeyle
hareket eder. Görünüm ara değerle çizilir.

Duvar sert sınırdır: araç teması bir gövdeyi duvara geri itebildiği için
araç çifti çözümünden sonra duvarlar yeniden çözülür. Döngü sınırlı (4 geçiş)
ve daima duvar geçişiyle biter; sıkışık kümede araçlar tam ayrılamasa da
adım sonunda hiçbir gövde köşesi dünya dışında kalmaz. Ölçülen en kötü kalan
araç örtüşmesi ≈0,05 birimdir (4 tohum, 48 000 araç çifti ve köşe yığını).

## Nişan ve ateş

Taret gövdeden bağımsız dünya yönünü korur; gövde dönünce veya nişan çubuğu
bırakılınca otomatik olarak gövdeye dönmez. Dönüş hızı ve hizalanma eşiği
silah yapılandırmasındadır. Taret hedefe oturmadığında ateş isteği bekler,
dolum tüketilmez. Atış aralığı 650 ms'dir.

Mermi tankın yatay hızını devralır; atış tanka ters yönde itki uygular.
Düşey uçuş, yatay hava direnci, rüzgâr, yer teması ve menzil sonu aynı
balistik çözümle hesaplanır. Yer ve menzil bitişi adımın içindeki kesin
zamanda çözülür. Nişan önizlemesi aynı uçuş hesabını, araçları ve dünya
sınırını kullanır; gelecekteki hava olayını tahmin etmez.

İsabet, adımın süpürdüğü doğru parçasının gövdenin yönlü ayak iziyle ilk
kesişimidir; uç noktaları örnekleyen test dönmüş gövdenin köşesini ve dar
kirişi kaçırırdı. Aynı adımda birden çok araç kesişirse en erken temas
kazanır, sahibi dışlanır. Olay, itki ve önizleme adımın bittiği yeri değil
temas noktasını görür; araç adımın sonundaki pozunda sabit sayılır.

Atış gövde ve namluyu yaylandırır; parlama, kısa gaz jetleri, kıvılcım,
duman ve toz üretir. Kamera atışta sarsılmaz, küçük yaylı itme yapar.
Patlama ve çarpma sarsıntısı uzaklıkla azalır. Mermi izi yeni atışta tankın
içine uzanmaz. Efektler ayrı yaşam süreli sınırlı havuzlardır.

## Girdi, kamera ve HUD

Tuş ve kol eşlemesi `src/scenes/world/PlayerControls.ts`, hareket yumuşatma
ve dokunmatik ateş eşikleri `src/config/controls.ts` içindedir.
`ControlIntent` ham komutu işler; hareket 100 ms içinde hedefin yüzde 90'ına
yaklaşır, nişan yönü geciktirilmez. Sağ dokunmatik çubuğun iç bölgesi nişan,
dış bölgesi ateş üretir; giriş ve çıkış eşikleri titremeyi önler. Eşik kararını CORE `TouchStickState.aimStickGate` taşır; `PlayerControls`
kare girdisini `InputStepBuffer`'a verir. Kısa basış kenarı ve nişan yönü
ilk tüketilen tick'e korunarak gider; mekanizma sözleşmesi
[primitifler](../../core/docs/primitives.md#sabit-ticke-girdi-taşıma) içindedir. Zoom, ızgara ve duraklatma kenar tetiklidir.
Dokunmatik düğmeler CORE `VirtualActionSource` üzerinden tek karelik dokunuşu
da korur.

CORE `InputManager` son anlamlı kaynağın kipini seçer; HUD aynı kararı
`InputPresentationController` ile okur. Steam Input'un standart sanal kolu
W3C kol eşlemesini tüketir. İkinci bir HUD kol yoklaması kurulmaz.

CORE `FollowCamera` ara değerli gövdeyi takip eder; kare hızından bağımsız
üstel takip, kademesiz zoom ve dünya sınırı `src/config/camera.ts` içindedir.
Geri tepme ve sarsıntı ayrı ötelemelerdir. Olay → kamera/titreşim eşlemesi
`src/config/feel.ts` içinde tutulur.

HUD görünür bileşenleri CORE'dan alır; oyun CSS'i yerleşim ve yüzeyi kurar.
Duraklatma Esc, Menu, düğme veya Android geri hareketiyle kapanır; arka plana
dokunmak kapatmaz. Uygulama arka plana geçince ve sistem uyuyunca duraklar.
Uyanış kendiliğinden devam etmez. Tarayıcı tam ekranı CORE kontrolüyle,
native pencere kipi platform servisiyle yönetilir.

Native uyanış `GameServices.onResume` aboneliğinden Phaser'ın ortak ses
bağlamına gider. `GameAudio` CORE `resumeAudioAfterWake` yordamını kullanır;
aynı anda gelen çağrılar tek toparlanmayı paylaşır. Sökülmüş sahnenin sıradaki
çağrısı yürütülmez; kapanmış bağlama yeniden kaynak kurulmaz.

## Kalite, kayıt ve platform ömrü

`src/config/quality.ts` yüksek ve düşük efekt profillerini tanımlar.
Düşük profil parçacık ve iz havuzlarını azaltır, mermi halesini kapatır.
Başlangıç profili platform ve ölçülmüş cihaz kuralından gelir; kayıtlı
tercih bunun önüne geçer. Kalite seçimi kalıcıdır ve uygun görünüm kaynaklarına
uygulanır. Hale yerel yarı saydam geometriyle çizilir.

Gönderilen app/vendor/css bütçeleri kök quality.json sahibindedir;
ölçü güncel üretim build'iyle bundle kapısından alınır.

Saf simülasyon (`Simulation`, `ScenarioRunner`) CORE'a yalnız `random`,
`spatial`, `math` ve `physics` alt yüzeyleriyle bağlanır; Node'da DOM ve CSS
yükleyicisi olmadan seedli koşar. `pnpm --filter @volstudio/vol-test load`
araç, mermi ve hava yüküyle tek `Simulation.step` süresini başlangıç ve uzun
oturum pencereleri için ölçer. Yalnız CPU simülasyonudur; çizim ve cihaz
kare süresini kapsamaz. Ana makine saati bir koşu sırasında ani seviye
değiştirebildiğinden her pencere sabit bir referans işe oranlanır.

`RuntimeOverrides` yalnız `VOL_DECK_MEASURE=1` oturumunda senaryo, tohum,
hava, mevsim ve kalite seçimini uygular. Geçersiz değerler reddedilir;
ölçüm seçimleri kalıcı cihaz tercihine yazılmaz.

`GameMeasurements` kare aralıklarını gerçek kalite, senaryo, tohum, hava ve
mevsim bağlamıyla pencereler. Bağlam değişince eski pencere kapanır; geçiş
aralığı yeni koşulun karesi sayılmaz. Girdi, simülasyon, olay/ses, araç,
efekt, nişan, çevre/kamera ve HUD/tanı süreleri ayrı CPU ölçüleridir.
`updateMs` yalnız sahne güncellemesini ölçer; GPU çizimi veya panel sunumu
değildir. `RenderMeasurements` CORE `GpuTimer`'ı Phaser `prerender`/`postrender`
arasına sokar ve `renderSubmitMs` (CPU) ile `gpuTimeMs` (GPU) ayrı örneklerle
tutar; `presentTimeMs` yalnız gerçek bir sunum ölçümü varsa dolar, aksi hâlde
`null` kalır. Yavaş kare, `frameId` ile o kareden gelen CPU maliyeti
çiftidir. Rapor penceresi `runId` + `window` ile ayrılır; kayıp raporlar
`lostReports` ile sayılır ve `flush()` hataları gizlemez. Deck özeti aynı
bağlamı ve izin listeli aşama ölçülerini korur.

`GameServices` platform, oturum, ekran kipi, Steam glifi, metin girişi,
titreşim ve tanı kaynaklarının ömür sahibidir. `GameSettings`,
`PersistedObservableState` üzerinden cihaz tercihini korur; `GameProgress`
ilerlemeyi `AutosaveCoordinator` ile yazar. `ScopedSaveManager` cihaz ve
ilerleme kapsamlarını ayrı depolar. Uyku ve kapanış kayıt kuyruklarını
boşaltır; kaynaklar sahne kapanışında sökülür.

Açılış iki scope adapter'ını bir kez kurar ve eski kayıt göçünü state
yüklemeden bekler. `voltest.preferences` cihaz, `voltest.progress` ilerleme
uyumluluk eşlemesidir; geçmişte kapsamsız sürüm yayımlandığı iddiası değildir.
Geç ilerleme yüklemesi kapatılmış serviste autosave kurmaz. Flush bütün
kalıcılık sonuçlarını bekler; ölçüm hatası kayıt başarısı yerine geçirilmez.
Kapanış snapshot'ından önce oyun duraklatılır. Bir duraklatma dinleyicisinin
hatası tanıya gider; diğer dinleyicileri ve son kayıt boşaltmasını kesmez.

Android native geri hareketi CORE geri yığınına gider. gamescope ve Android
pencere kipi seçeneği sunmaz. Steamworks isteğe bağlıdır; varsayılan stub
Steam istemci kabulünün kanıtı değildir. Native ve Android kaynakları,
Linux paketleme ve Windows NSIS yapılandırması vardır. Gerçek cihaz,
dağıtım ve Steam Cloud kabulü ayrı doğrulama işleridir.

## Ses

33 teslim kuru mekanik programlardan kanonik yayın kapısıyla üretilir.
`audio-manifests` yeniden üretim kimliğini, `audio-banks` aile seçimini taşır.
Oyun yalnız bank JSON'unu ve `public/assets/audio` teslimlerini okur;
audio-synth çalışma zamanı bağımlılığı değildir. Pakete kanonik kayıt değil,
`scripts/vite/audioBankRuntime.mjs` ile indirgenmiş çalışma zamanı görünümü
girer (anahtar, rol, etiket, süre, varlık yolu): hash, manifest, ölçüm ve kalite
kaydı yalnız kanonik dosyada kalır ve `verifyFamily` onu okur.

Yedi döngü motorun üç devri, palet, kayma, servo ve hızlanmadır. Top,
patlama, isabet, çarpma ve fren aileleri olaydan seçilir; patlamanın yakın,
orta ve uzak teslimleri vardır. İki UI sesi duraklatma geçişini bildirir.
Kazanç, mesafe, perde ve ses bütçeleri `src/config/audio.ts` içindedir.

Konum oyuncuya göredir; stereo pan yatay farktan, seviye yakın yarıçap
sonrasında 1/r'den gelir. En yakın dört aracın döngüleri çalar. Phaser'ın
mevcut Web Audio bağlamı kullanılır; mobil kilit açmayı Phaser yönetir.
Duraklatma döngüleri keser, kaldırılan araç ve kapanan sahne sesleri söker.
Araç hareketsiz ve nişan sabitken canlı döngü kaynağı yoktur. Müzik, ambiyans
ve hava sesi yüklenmez. Yük ve kayma, palet yüzeyi ile **zemin hızı**
arasındaki farktan ölçülür (`Tank.surfaceLeft/surfaceRight`); paletlerin
katettiği yol (`groundLeft/groundRight`) işaretli bir integraldir ve hız
değildir. Ses yayın kabulü kaynak/PCM/manifest ve codec sonrası teknik QA ile
verilir; dinleme yapıldığı iddiası teknik sonuçtan türetilmez.

## Doğrulama

`tests/sim/feel.test.ts` sürüş, fren, kayma, dönüş, hızlanma, taret, geri
tepme ve sekme hissinin sayısal zarfını sınar. Bu zarfın değişmesi tasarım
kararıdır. Tohumlu değişmez testleri NaN, dünya sınırı ve fizik tavanlarını;
kare hızı testleri sabit adım sonucunu sınar. Hava testleri mevsim takvimini,
birikimi, erimeyi, sıkışmayı ve model/sunum ayrımını korur.

Native ölçüm ortamındaki senaryo, tohum ve kalite seçimi
oturum boyunca kalıcı tercihlerden önce gelir; ses veya titreşim ayarı bu
koşulları değiştirmez ve ölçüm seçimi kayda yazılmaz.

E2E gönderilen build'i Chromium ve WebKit'te klavye, sanal kol ve dokunmatik
girdiyle açar; ayarlar, senaryolar, duraklatma, hava görünümü ve temiz konsol
sınanır. Kapsam, bundle ve algoritmik ölçekleme eşikleri kök `quality.json`
içindedir. Gerçek cihaz performansı, görsel ve haptik kabulü otomatik testlerden
ayrı kalır; ses yayın kabulü teknik QA sözleşmesidir. Açık kabul işleri kök [TODO.md](../../TODO.md) içinde izlenir.
