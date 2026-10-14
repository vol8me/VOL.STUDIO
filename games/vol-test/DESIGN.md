# VOL.TEST tasarımı

## Amaç ve sınır

VOL.TEST, CORE mekanizmaları ve native kabuğun gerçek oyun tüketicisidir.
Açık sürüş alanı tank fiziğini, nişanı, çevreyi ve platform servislerini
birlikte sınar. Kalıcı dünya engeli yoktur; seçilen senaryo araç veya hedef
ekler. Oyun ana menüyle açılır; menü, garaj ve ayarlar ekranları ile HUD, duraklatma ve senaryo panelleri vardır.

## Model ve sunum

Simülasyon `src/sim/` altında model/sunum ayrımıyla düzenlenir.
Saf headless import kabulü ayrı Node testinde doğrulanır. CORE `SimulationClock`
60 Hz sabit adımla ilerler; tank kuvvetleri iki alt adımda çözülür. Poz,
taret ve süspansiyon önceki ve güncel durum arasında ara değerle çizilir.
Çizim hızı fizik saatini değiştirmez; duraklatma simülasyon adımı üretmez.

| Katman                                 | Sorumluluk                                              |
| -------------------------------------- | ------------------------------------------------------- |
| `src/app/`                             | Platform ömrü, kayıt, tercihler ve ölçüm kaynakları     |
| `src/sim/chassis/`                     | Şasi tabanı: poz, durum, süspansiyon, taret ve hızlanma |
| `src/sim/tank/`                        | Paletli şasi: sürücü ve palet–zemin kuvvetleri          |
| `src/sim/combat/`                      | Mermi uçuşu, isabet ve nişan önizlemesi                 |
| `src/sim/scenarios/`                   | Tohumlu araç düzenleri ve komutları                     |
| `src/sim/seasons/`, `src/sim/weather/` | Mevsim, hava ve kalıcı yüzey durumu                     |
| `src/view/`                            | Dünya ve tank sunumu, sınırlı efekt havuzları           |
| `src/hud/`                             | CORE bileşenleriyle metin, harita ve paneller           |
| `src/menu/`                            | Ana menü, garaj ve ayarlar ekranlarının DOM panelleri   |
| `src/scenes/world/`                    | Girdi, kamera, çevre ve olayların bağlanması            |
| `src/config/`                          | Bütün oynanış ve sunum ölçülerinin tek kaynağı          |

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

Her tank `src/assets/vehicles/` altında kendi klasöründeki SVG parçalarından
kurulur (gövde, taret, duyarga); palet pabucu, palet ucu, çekirdek ve namlu
parlaması `shared` klasöründe ortaktır. Parça ölçüleri, duyarga bağlantısı,
çekirdek ve parlama ölçeği ile geri tepme yayı `src/config/tankView.ts`
içindeki `TANK_ART` tablosundadır; palet geometrisi `treadView` ile aracın
fizik ayak izinden türer. Sahne araç türünü bilmez: `src/view/VehicleView.ts`
sözleşmesini `VehicleViews` kaydı tanımına uygun görünümle karşılar. Üç tank
aynı aileden çıkar (koyu mavi-gri plakalar, bordo kabuk, turkuaz damar, altıgen
taret kubbesi) ve siluetiyle ayrışır: Striker dengeli, Bulwark geniş ve ağır
(amber şevronlu), Dart dar ve uzun. CORE `PoseShadow` aynı parçaları
karartarak gölgeyi üretir. Palet bandı gerçek yüzey yolunu
izler; patinajda bant döner fakat tank ilerlemez. Palet izi temas yolunu,
kayma çizgisi ise kaymanın şiddetini izler. Kar sıkışması görsel izden ayrı,
modeldeki palet temasıyla hesaplanır.

Palet bandı `TreadTexture` ile aynı SVG'den araç başına bir kez üretilen
32 karelik dokuyu kullanır (bant boyu araca göre değişir); faz aralığı 0,25 dünya birimidir. Her araç kendi pozunu
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

## Araçlar

Oynanabilir her araç bir `VehicleSpec`tir (`src/config/vehicles.ts`): kimlik, can,
şasi sayıları, süspansiyon ve silahlanma. Kayıt sırası (`VEHICLE_IDS`) ağdaki `model`
indeksidir; araç eklenirse sona eklenir, yeniden sıralanmaz. `Vehicle` tanımdan şasi,
silah beklemesi ve can kurar; simülasyon, öngörü, ses ve görünüm araca değil tanıma bakar.

| Araç     | Rol                      | Can | Hız | Dönüş | Atış                                |
| -------- | ------------------------ | --- | --- | ----- | ----------------------------------- |
| Striker  | Dengeli ana tank         | 100 | 230 | 3,0   | 34 hasar, 650 ms, kabuk             |
| Bulwark  | Ağır kuşatma tankı       | 170 | 158 | 1,9   | 62 hasar, 1250 ms, ağır mermi       |
| Dart     | Hafif, hızlı keşif tankı | 64  | 330 | 4,4   | 16 hasar, 360 ms, uzun menzilli ray |
| Arachnid | Bacaklı savaş canavarı   | 140 | 150 | 2,7   | 24 hasar, 470 ms, iki plazma topu   |

Tablo `src/config/vehicles.ts` değerlerinin özetidir; saniyelik hasar araçlar arasında %35'ten
az ayrışır ve karakter farkı hızlanmadan, dönüşten, frenden ve geri tepmeden gelir
(`tests/sim/vehicleHandling.test.ts` bu sıralamaları kilitler). Aracı oyuncu katılırken
`model` seçeneğiyle seçer; sunucu tanımsız indeksi protokol ihlali sayıp reddeder.

Araçlar tek bakışta ve kulakla ayrışır; kimlik üç yerden gelir ve tek tabloda tanımlıdır.
Renk: her tankın gövde ve taret SVG'si kendi paletini taşır (Striker çelik mavisi ve bordo kabuk,
Bulwark koyu adaçayı zırh ve pas kabuğu, sarı uyarı şeritli, turuncu enerji; Dart buz mavisi hafif
gövde ve çivit kabuk, camgöbeği enerji) ve `TANK_ART` çekirdek ışığını ile palet tonunu araca
bağlar; `tests/config/vehicleIdentity.test.ts` paletlerin çakışmamasını kilitler. Mermi: her
silah stilinin kendi iz rengi ve kalınlığı vardır (`SHOT_LOOK`: kehribar kabuk, turuncu ağır
mermi, ince ve uzun buz mavisi ray, turkuaz plazma). Ses: motor perdesi ve gücü araca
(`AUDIO.vehicleVoice`), top sesinin perdesi ve gücü silah stiline (`AUDIO.weaponVoice`) göre
işlenir; teslimler aynıdır, yeni sentez gerekmez. Araca özgü gerçek motor ve top kayıtları ayrı iştir.

Silahlanma (`Armament`) bir silahın sayılarını, namlu yuvalarını ve atış gruplarını
(`salvo`) taşır. `pivot` yoksa 0. yuva nişan taretidir; öteki yuvalar nişan noktasına (0. yuvadan
`toeInRange` ileride) bakar. `pivot` verilirse nişan başlangıcı odur ve bütün yuvalar nişan
noktasına bakar (Arachnid'in simetrik yan topları). Her yuvanın yönü yalnız poza bağlıdır ve ağda
namlu açısı taşınmaz. Her tetik çekişi sıradaki grubu ateşler; sıra `Vehicle.salvo` ile döner ve
sunucu durumunda (`PlayerState.salvo`) öngörüyle uzlaştırılır. Mermi, ateşleyen silahın
profilini (`Projectiles.addProfile`: ömür, uçuş, stil) taşır; isabet hasarı ve itkisi
aynı silahın tanımından okunur.

### Arachnid: bacaklı yürüyücü

Arachnid paletli değil bacaklıdır (`WalkerSpec`, `src/sim/walker/Walker.ts`): her yöne (yan, geri)
aynı çevikliğiyle yürür, gövdesi nişana bakar, hızlanması kısa bir atılımdır ve zemin tutuşundan
palet kadar etkilenmez. Hız tavanı 150 birim/s'dir ve bilerek düşüktür: bacak yürüyüşü sanat
uzayında ~475 px/s'nin üstünde ayakları gövdeye yetiştiremez (acil adım), sanat ölçeğiyle
(`WALKER_ART.scale`) birlikte bu tavanı `tests/config/walkerRig.test.ts` ve
`tests/view/walker/ArachnidLegs.test.ts` kilitler. Bacaklar yalnız sunumdur; ağ durumuna ek alan
girmez, `ChassisState` aynıdır. Çarpışan gövde çizilen kabuğun içindedir, bacak açıklığı değildir.

Silahı iki plazma topudur: gövdenin iki yan omzunda, kabuğun dışında durur ve gövde üstten
görünür kalır. İki top gövde eksenindeki odağa bakar ve sırayla ateşler; her top 940 ms'de bir atar,
birleşik tempo 470 ms'dir (ateş gücü tek toplu Striker'la aynı sınıftadır). Top resmi `entities.pen`
içindeki tek bir silahtan gelir ve iki yuvada kullanılır; boyu kabuğun yarısı kadardır
(`WALKER_ART.cannonScale`);
mermi, geri tepme ve ağız parlaması oyunun kendi efekt katmanındandır (resimden mermi alınmaz).
Yuvanın `reach` değeri top resminin ağız mesafesinin ölçeklenmişidir (`CANNON_MUZZLE_PX`).

Görünüm (`src/view/WalkerView.ts`) dışa aktarılmış rig'i sürer: ayaklar dünyada sabitlenir ve
gövde ilerledikçe adım atar (`LegGait`), her bacağın açısı ayağın durduğu yerden ters kinematikle
çıkar (`ArachnidLegs`); kabuk hızdan ve ivmeden türeyen ikincil harekete uyar (`ArachnidMotion`:
yaslanma, çömelme, atılım gerilmesi, bakış). İvme, hızın değiştiği simülasyon adımları arasından
okunur. Her ayak basışı bir toz tutamı bırakır; palet ve kayma izi bırakmaz. Rig metadata'sı
`src/assets/rig/`, parça PNG'leri `public/assets/rig/` altındadır; `pnpm --filter @volstudio/vol-test rig:sync`
`devtools/pen.dev` export'undan kopyalar ve oyun build'i devtools olmadan geçer.

## Sürüş ve süspansiyon

Araç gövdesi bir katı cisimdir (`Chassis`: poz, durum, taret, hızlanma deposu, süspansiyon
ve duvar teması; tank `Chassis`'e palet kuvvetlerini ekler). Striker'ın kütlesi ve ayak izi
`src/config/tank.ts` içindedir, öteki araçlar aynı tablonun değerlerini değiştirir.
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
dolum tüketilmez. Atış aralığı silaha göredir (Striker 650 ms).

Mermi namlu ekseni boyunca çıkar ve aracın hızından yalnız eksen bileşenini
devralır: yan kayarken ateş eden aracın mermisi namlunun gösterdiği doğrultudan
sapmaz. Atış araca ters yönde itki uygular; çok namlulu araçta her namlunun geri
tepmesi, bütün mermiler doğduktan sonra ayrı ayrı uygulanır. Düşey uçuş, yatay hava direnci, rüzgâr, yer teması ve menzil sonu aynı
balistik çözümle hesaplanır. Yer ve menzil bitişi adımın içindeki kesin
zamanda çözülür. Nişan önizlemesi aynı uçuş hesabını, araçları ve dünya
sınırını kullanır; gelecekteki hava olayını tahmin etmez.

Namlu, lazer ve fare nişanı tek geometriden türer (`src/sim/muzzle.ts`): yuva mili
gövde merkezi artı yuvanın gövde eksenindeki konumu artı süspansiyon kaymasıdır, namlu
ucu milden yuva yönünde `MountSpec.reach` uzaklıktadır. Sim atışı, ağız parlaması ve nişan çizgisi
aynı işlevi okur; çizgi ekranda görünen ara değerli kareden (`tankFrame`)
türetilir ve mermi yolunu (rüzgâr ve direnç eğrisi dahil) namlu ucundan çizer.
Fare nişanı da son çizilen karedeki taret milinden hesaplanır; simülasyonun
bir sonraki adımdaki konumundan değil.

Nişan çizgisi (lazer) yalnız nişan alırken yanar ve `AimPresence` ile açılıp söner:
dokunmatikte nişan çubuğu tutulurken, kolda sağ çubuk sapmışken; farede imleç
hareket ederken, sol düğme basılıyken ve durduktan sonra `CONTROLS.aimHoldMs`
boyunca. Fare konumu her zaman bir yön verdiği için yön bakılsaydı lazer fareyle
sürekli yanardı. Açılış çabuk (90 ms), sönüş yavaştır (320 ms); çizgi namludan
uzanır ve sönerken namluya geri çekilir.

İsabet, adımın süpürdüğü doğru parçasının gövdenin yönlü ayak iziyle ilk
kesişimidir; uç noktaları örnekleyen test dönmüş gövdenin köşesini ve dar
kirişi kaçırırdı. Aynı adımda birden çok araç kesişirse en erken temas
kazanır, sahibi dışlanır. Olay, itki ve önizleme adımın bittiği yeri değil
temas noktasını görür; araç adımın sonundaki pozunda sabit sayılır.

Dünya duvarı aynı süpürülmüş segmenti ilk çıkış parametresinde keser;
çapraz atışta x/y ayrı ayrı kırpılmaz. Duvar arkasındaki araç isabet almaz.
Dışarıda doğan namlu ucu başlangıç sınırında sonlanır; önizleme ve runtime
aynı geometrik kuralı kullanır. Bu, eğri uçuşun tam sürekli çözümü değildir.

Atış gövde ve namluyu yaylandırır; parlama, kısa gaz jetleri, kıvılcım,
duman ve toz üretir. Kamera atışta sarsılmaz, küçük yaylı itme yapar.
Patlama ve çarpma sarsıntısı uzaklıkla azalır. Mermi izi yeni atışta tankın
içine uzanmaz. Efektler ayrı yaşam süreli sınırlı havuzlardır.

## Can, hasar ve yeniden doğma

Her `Vehicle` bir `Vitality` taşır; can, ölüm, doğal onarım, yeniden doğma
sayacı ve geçici hasar korumasının tek sahibi saf simülasyondur. Phaser saati,
tarayıcı zamanlayıcısı veya rastgele sayı kullanılmaz. Varsayılan savaş değerleri
`src/config/combat.ts` içindedir: 100 can, 34 mermi hasarı, son hasardan 6 sn
sonra saniyede 4 can onarım, ölümden 4 sn sonra yeniden doğma ve 1,2 sn koruma.
Duvar ve araç çarpışması eşik üstündeki normal temas hızına göre hasar verir.
Araç çiftinde dört temas çözümü geçse de bir simülasyon adımında aynı çiftten
bir kez hasar alınır.

`Simulation.applyDamage`, `healVehicle` ve `respawnVehicle`, yetkili
savaş komutlarının ve dünya sistemlerinin kullanacağı tek kapıdır. Hasar ve
iyileşme gerçek değişen miktarı döndürür; miktarlar sonlu, negatif olmayan
sayıdır. Ölüm canı sıfıra indirir; cansız araç hareket etmez, ateş etmez,
fiziksel araç teması çözmez ve mermi hedefi olmaz. Ölüyü yalnız yeniden doğma
canlandırır; araç kimliği değişmez. Doğumda ilk yerleştirme konumu kullanılır;
yetkili çağıran bu konumu açıkça geçebilir. Gövde fiziği ve atış beklemesi
sıfırlanır. Henüz yerleştirmeyi serbest bir doğum alanına kaydıran sunucu
kuralı bulunmaz.

İsteğe bağlı takım kimliği `Simulation.spawn` ile verilir. Her iki araç
aynı takımdaysa ve `friendlyFire` kapalıysa dost mermileri hedefi geçer;
nişan önizlemesi de aynı kuralı kullanır. Takımsız araçlar herkese
karşı hedef sayılır. `damaged`, `healed`, `died` ve `respawned`
olayları araç kimliği ve varsa kaynak kimliğiyle sunuma aktarılır. HUD,
CORE can çubuğuyla güncel canı ve ölüm/koruma süresini i18n anahtarıyla
gösterir; ölü araç görünümü soluklaşır. Sunucu tarafı savaş yetkilendirmesi,
kalıcı ölüm politikası ve spawn alanı seçimi bu simülasyon mekanizmasının
üzerindeki oyun kurallarıdır.

## Bot yapay zekâsı

`src/sim/ai/BotBrain.ts` bir aracın komutunu üreten saf benzetim kodudur: Phaser, ağ ve gerçek saat
bilmez, oyuncuyla aynı `TankCommand` sözleşmesiyle sürer (hile yok, ışınlanma yok) ve kendi tohumlu
rastgeleliğini kullanır; aynı tohum, beceri ve dünya bit bit aynı yolu izler. Dört paletli ve bacaklı
araç ailesini de sürer, çünkü yalnız `Vehicle` yüzeyini (poz, hız, silah menzili, depo) okur.

Karar iki katmandır. Algı `thinkIntervalMs` aralığıyla tazelenir: en yakın düşman (takımsız araç
herkese düşmandır; histerezis ve "belirgin yakın" kuralı hedef titreşimini önler), diğer araçlardan
ayrışma vektörü, nişan sapması ve yörünge yönü. Her adımda bu kararlar hareket, nişan ve tetiğe çevrilir:

| Kip       | Ne zaman                                            | Hareket                                                  |
| --------- | --------------------------------------------------- | -------------------------------------------------------- |
| `engage`  | hedef menzilin 1,25 katında ya da görev bağı içinde | standoff mesafesini tutar, hedefin çevresinde şerit atar |
| `advance` | görev noktasına varılmamış                          | göreve yürür, uzaksa atılım kullanır                     |
| `hold`    | görev noktasına varıldı ya da görev yok             | bölgede yavaş dolaşır, namlu çevreyi tarar               |
| `retreat` | can kişiliğin eşiğinin altında                      | geri çekilme noktasına koşar, iyileşince döner           |
| `unstick` | komut verildiği hâlde ilerlenemiyor                 | kısa süre geri ve yana kaçar                             |

Nişan hedefin hızını önden gider (`interceptTime`: sabit hızlı mermi ve sabit hızlı hedef için kapalı
çözüm, çözüm yoksa düz uçuşa düşer); ateş yalnız tepki süresi geçince, menzilin %92'sinde ve namlu
`aimTolerance`ın iki katı içinde açılır. Beceri (0 acemi, 1 usta) tepki süresini, nişan sapmasını, önden
gitme doğruluğunu ve geri çekilme eşiğini bir aralıkta kaydırır; tüm sayılar `src/config/bot.ts`'dedir.
Görev ve geri çekilme noktasını dışarıdaki yönetici verir (sunucuda savaş dünyası; bkz. Çok oyunculu).

## Savaş katmanı

`src/sim/war/` kalıcı savaşın saf kuralıdır; Phaser ve ağ bilmez, sunucu odası ve çevrimdışı alıştırma
aynı `War` nesnesini sürer. Sayıların tek sahibi `src/config/war.ts`'tir; konumlar dünya ölçüsünün
oranıdır, dünya büyüyünce düzen korunur.

| Parça            | Sorumluluk                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `Zones.ts`       | Yedi bölge: çemberdeki canlı araç farkı ilerletir, sahiplik tarafsızlaşarak el değiştirir |
| `Deployment.ts`  | Üs çevresindeki doğma adayları; tehditten en uzak olanı seçer, ardışık doğanları dağıtır  |
| `BotDirector.ts` | Cephe başına hedef nüfus, takma adlar, bölge görevlendirmesi (yakınlık, kalabalık, durum) |
| `War.ts`         | Katılım ve cephe dengesi, ölüm skoru, üsde yeniden doğma, hâkimiyet puanı ve zafer        |

Maç yoktur. İki cephe karşıt köşelerdeki üslerden doğar; bir bölgeyi tek araç `soloSeconds` içinde, üç
araç ve üstü üç kat hızlı alır, iki cepheden de araç varsa bölge tartışmalıdır ve ilerleme sayı farkıyla
gider. Sahip bölgeyi tutarken saniyede puan kazandırır, düşman aracı etkisiz kılmak da puan verir. Bir
cephe `dominance` puanına ulaşınca savaşı kazanır: puanlar ve bölgeler sıfırlanır, kazanma sayısı
artar ve savaş aynı dünyada sürer.

İnsan oyuncu `War.join` ile girer: istediği cephe insan dengesini bozmayacaksa verilir, yoksa insanı
az olana (eşitse puanı düşük olana) gidilir. Nüfus cephe başına `perFaction` araca tamamlanır; insan
girince bir bot çıkar (önce ölü, sonra oyunculardan en uzaktaki), insan gidince yenisi gelir. Botlar
her `reassignMs` içinde bölgeleri yeniden değerlendirir: tartışmalı bölge en çekici, sakin ve kendi
elindeki bölge en az çekicidir; yakınlık çekiciliği artırır, aynı bölgedeki kalabalık azaltır ve eski
görevden ancak belirgin biçimde daha iyi bir bölge için vazgeçilir. Bu kararların hepsi tohumludur:
aynı tohum aynı savaşı üretir (`tests/sim/war/War.test.ts`).

**Sunum.** Cephe hattının çizimi kural bilmez: `src/view/front.ts` bölge ve üs geometrisini sunucunun
kullandığı `ZoneField`/`baseCenter` hesabından türetir, sürücü (`WorldDriver.front`) durum alanlarını
yerinde günceller. `src/view/ZonesView.ts` bölge çemberlerini (sahibin renginde halka, ilerleme yayı,
tartışmada nabız) ve üsleri kameraya yakınsa çizer; `MapPanel` aynı kareyi alanlı işaret olarak
(CORE `MinimapMarker.worldRadius`) gösterir ve araç işaretlerini cephe rengine boyar. Renk ve ölçüler
`src/config/frontView.ts` içindedir. Çevrimdışı sandbox'ta cephe hattı yoktur.

Harita 384 m'lik dünyada tüm dünyayı gösterseydi araç kare başına piksel altı yürür ve harita
durmuş gibi görünürdü; bu yüzden açılış yakınlaştırması `WORLD.mapZoom` (4, çevredeki ~96 m) ve
tavanı `WORLD.mapMaxZoom`dur, zoom 1 bütün cephe hattını gösterir
(`tests/hud/MapPanel.test.ts` yavaş aracın her karede çizildiğini kilitler).

## Ekranlar

Açılış sırası Boot → Menu → (Garage | Settings | World). `BootScene` dokuları yükler ve
`firstScene` ile ilk ekranı seçer: oyuncu ana menüyü görür; ölçüm koşusu (Deck sondası) ve
`?start=world` geliştirme bağlantısı menüyü atlayıp alıştırma dünyasını açar.

| Ekran      | İçerik                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------ |
| `Menu`     | Savaşa katıl (garaj), alıştırma, ayarlar; çıkış yalnız native masaüstü ve Deck'te, onaylı  |
| `Garage`   | Dört araç kartı (ad, görev, üç ölçü), ad, cephe; savaşa katıl, alıştırmaya çık, geri       |
| `Settings` | Dil (otomatik/Türkçe/English), efekt kalitesi, ses, titreşim, ekran kipi, senaryo ve tohum |
| `World`    | Oyun; duraklatma menüsünde "Ana menü" (çevrimiçide "Savaştan ayrıl" da menüye döner)       |

Üç ekran aynı taksonomiden gelir: `ScreenFrame` başlık şeridi (geri `IconButton`, başlık, alt başlık),
kayan gövde (`ScrollView`) ve eylem şeridini kurar; ekranlar yalnız içeriklerini gövdeye, düğmelerini
şeride koyar. İki düzen vardır. `sheet` sol şerittir ve arkasında canlı araç vitrini görünür (ana menü,
dar ekranda alt levha); `full` ekranı kaplar (garaj, ayarlar), garaj sunum için ortada bir `stage`
bölgesi ayırır. Görünen her parça CORE bileşenidir: araç seçimi `CardTile` (`selected` + `addDetail`
ile ölçü çubukları), ölçüler `Bar`, form `SettingsForm`/`SettingsRow`, denetimler `Input`,
`SegmentedControl`, `Select`, `Checkbox`; `menu.css` yalnız yerleşim verir. Arkada oyunun gerçek araç
görünümleri (`TankView`, `WalkerView`) dönen tablada durur (`Showroom`); kamera `stage` bölgesine ya
da `sheet`in bıraktığı alana kurulur ve sığmazsa yakınlaştırma küçülür (`src/config/menu.ts`). Ekran
değişimi solarak yapılır (`prefers-reduced-motion`da anında); geçiş sürerken ikinci seçim yok sayılır.
Android geri tuşu garajdan ve ayarlardan menüye döner, menüde çıkış onayını açar ya da kapatır.

Garajdaki seçim (araç, cephe, ad) ve ayarlardaki dil `GameSettings`e yazılır ve oturumlar arasında
kalır; alıştırma ve savaş aynı araç tercihini kullanır. Savaşa katılma çevrimiçi parçayı ilk kullanımda
tembel yükler (`connectWar`); bağlanırken geri dönülür ya da ekran kapanırsa geç gelen oturum bırakılır,
odada hayalet kalmaz. Menü, garaj ve ayarlar çevrimiçi ağ kodunu yüklemez. Ekranlarda ses ve müzik
yoktur; menü sesi ve müziği ayrı iştir.

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

HUD görünür bileşenleri CORE'dan alır; oyun CSS'i yerleşim ve yüzeyi kurar. Yalnız oyuncunun
karar verdirdiği bilgi vardır: can, hızlanma deposu ve atış dolumu tek bir CORE `Panel` içinde üç
etiketli yatay `Bar`dır (masaüstünde sol altta, dokunmatikte sol üstte); iklim rozeti sol üstte,
yeniden doğma ve koruma bildirimi üst ortada, harita sağ üstte, kontrol ipuçları masaüstünde alt
ortadadır. Sürüş hızı, yön ve vites HUD'da yoktur (teşhise aittir, harita yön ve konumu verir);
oyun adı rozeti de yoktur. Dokunmatikte haritanın 44 px'lik yakınlaştırma düğmeleri haritayı
örteceğinden gizlenir (kamera zoom düğmeleri vardır); masaüstünde tekerlek ve düğmeler çalışır.
Harita (CORE `MinimapPanel`) çizilen her karede, ekrandaki ara değerli pozdan güncellenir:
adım konumu ya da seyreltilmiş güncelleme işareti sıçratır. İşaretler yerinde güncellenir
(çerçeve başına nesne üretilmez), pikselin 1/8'inden küçük değişim çizim istemez, özet yalnız
tür sayıları değişince yazılır. Düşük kalite profili haritayı 33 ms aralıkla seyreltir
(`EffectProfile.mapIntervalMs`).
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

Native Steam durumu ve glif bağlamı kol takma/çıkarma, pencereye odak dönüşü,
sayfa dönüşü, sistem uyanışı ve duraklatma geçişinde yenilenir. Yenilemeler
tek kuyrukta ilerler; yeni istek eski cevabı geçersiz kılar ve kapanmış
servise geç sonuç uygulanmaz. Yeniden bağlanan istemci ve yeni kol güncel
oyun/menü aksiyon setini alır. HUD karede yalnız bu güncel bağlamı okur;
kare başına native sorgu yapılmaz.

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

## Çok oyunculu

Çevrimiçi oyun opt-in'dir: ana menüdeki "Savaşa katıl" garaja götürür (alıştırma dünyasındaki duraklatma
menüsünde de "Savaşa katıl" katılım panelini açar); çevrimdışı açılış ağ kodunu yüklemez (`online-*.js` ayrı parçadır, bütçesi `quality.json`'dadır). Sunucu `server/`
altındadır (`build:server` çıktısı Node ile başlar) ve [network](../../network/README.md)
çalışma zamanının üstünde Colyseus odası koşar; sunucu adresi `?server=host:port`, derleme zamanı
`VITE_VOLTEST_SERVER` ya da geliştirme adresidir.

| Parça                                             | Sorumluluk                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `server/WorldRoom.ts`                             | Kalıcı savaş dünyası: 60 Hz adım, 20 Hz yama, `War` nesnesini sarar          |
| `server/index.ts`                                 | Oda kaydı ve birincil dünya (insan kalmasa da kapanmaz)                      |
| `server/InputPacer.ts`                            | Girdi titreşim tamponu; geç girdi sayılı boşta adım olur                     |
| `src/network/OnlineSession.ts`                    | Bağlanma, bağlantı durumu, ping/titreşim, olay dağıtımı                      |
| `src/network/PredictedPilot.ts`, `OnlineWorld.ts` | Kendi aracın öngörüsü, uzlaştırma, uzak araç ara değeri                      |
| `src/network/warView.ts`                          | Şemadan savaş görüntüsü (cepheler, bölgeler, tablo) ve bildirim akışı satırı |
| `src/scenes/world/`                               | `WorldDriver` sözleşmesi: çevrimdışı ve çevrimiçi sürücü, katılım            |
| `src/hud/LobbyPanel.ts`, `OnlinePanel.ts`         | CORE Modal/Input/DataTable/EventLog ile katılım paneli, puan, tablo, akış    |

Maç, özel oda ve oda kodu yoktur: tek tür oda vardır, kalıcı savaş dünyası. Sunucu açıldığında birincil
dünya kurulur (`createPrimaryWorld`); insan kalmasa da kapanmaz ve botlar savaşı sürdürür. Oyuncular
`joinOrCreate` ile bu dünyaya düşer; dünya `NETWORK.maxPlayers` insana ulaşınca Colyseus bir taşma
dünyası kurar, taşma dünyası son insan ayrılınca kapanır. Savaşın kuralı (bölgeler, cepheler, doğma, bot
nüfusu) saf `War` nesnesindedir; oda yalnız ağ yaşamını (katılım, girdi tamponu, durum yayını, olay
dağıtımı) taşır. Katılım seçenekleri `name`, `model` (`VEHICLE_IDS` indeksi) ve isteğe bağlı `faction`'dır;
tanımsız araç ya da aralık dışı cephe protokol ihlali olarak reddedilir, istenen cephe insan dengesini
bozacaksa sunucu kendi seçer. Botlar da oyuncu kaydında görünür (`bot` alanı: skor tablosu, harita).
Kurallar yalnız `src/config/network.ts` ve `src/config/war.ts` içindedir; testler dünya seçeneklerini
(`perFaction`, tohum) `createRooms`a verir, ağdan değiştirilemez.

Sunucu yalnız niyeti (`TankInput`) kabul eder; poz, hasar, skor, bölge ve ateş sonucu onundur. İstemci her
sabit adımda aynı `Simulation` adımıyla kendi aracını öngörür, Colyseus `Predict` sunucu durumunu
bit bit alıp bekleyen girdileri yeniden oynatır (sapma `data-drift-peak` ile ölçülür). Uzak araçlar
`interpolationDelayMs` geriden iki yama arasında ara değerlenir; olaylar aynı görüntü zamanına
ertelenir ki atış ve ölüm tankın göründüğü yerle örtüşsün. Aşağıdakiler sözleşmedir:

- Çizim pozu `tank.previous` içinde ara değerlidir; sahne çevrimiçi alfa 0 ile çizer.
- Kendi `fired` yankısı bastırılır (öngörü atışı zaten gösterdi); yerel mermi yerelde ilerler.
- Hava senkronlanmaz; çevrimiçi dünya `clear` açılır.
- Duraklatma dünyayı dondurmaz (saat sunucudadır): araç yalnız boş girdi yollar.
- Sahne başlarken ve yeniden başlarken (`restart`, ekran geçişleri, `toMenu`) veri her zaman bir nesnedir.
  Phaser boş veriyi yok sayıp önceki veriyi korur; "Ayrıl" sonrası eski çevrimiçi sürücü fabrikası ölü
  oturumla yeniden kurulurdu ve menüden açılan alıştırma çevrimiçi sürücüyle gelirdi.
- Bilerek ayrılma `leave(true)` ile hemen düşer; kopma 15 sn yeniden bağlanma ister ve çubukta
  uyarı verir; bağlantı kapanırsa oyuncu çevrimdışı dünyaya `online.lost` bildirimiyle döner.
- Oyuncu araçları da cepheye bağlıdır (`Vehicle.team`): aynı cepheden ateş hasar vermez, kendi
  kendine hasar da yoktur.
- Savaş kazanılınca (`warWon`) puanlar ve bölgeler sıfırlanır; oyuncular çıkarılmaz, dünya sürer.

Sunucu işletimi (ortam değişkenleri ve sınırların gerekçesi [network sunucu belgesindedir](../../network/docs/server.md)):
`server:dev` girişi `VOL_NET_*` değişkenlerinden bağlantı kapısını (adres başına hız ve soket sınırı, toplam soket,
köken izin listesi) kurar; `VOL_NET_OPS_PORT` verilirse loopback'te `/healthz`, `/metrics` ve `/logs` açılır.
`/metrics` her dünya odası için insan sayısı, adım süresi özeti (ortalama, p95, en büyük) ve trafik özeti
(istemci sayısı, kuyruktaki ve toplam gönderilen/alınan bayt, atılan yavaş tüketici) ile kapı sayaçlarını verir.
Yazma kuyruğu `NETWORK.slowConsumer.limitBytes` üstünde tolerans süresince kalan istemci `1013` koduyla atılır.
Kapıya takılan katılım istemcide `online.error.busy` ("sunucu yoğun") olarak görünür.

Oturum yaşam döngüsü (`tests/server/lifecycle.test.ts`, gerçek sunucu ve SDK istemcisi): oyuncu ölü yeniden
doğmayı beklerken, doğma korumasındayken, savaşı bitiren ölümle aynı anda ya da arka arkaya iki kez kopsa
aynı oturum, kayıt ve araca döner; ikinci `joined` olayı yayılmaz ve ölüm bir kez yazılır. Pencere
(`reconnectSeconds`) dolunca oyuncu kalkar ve eski belirteç reddedilir; sunucu kopuk oyuncuyla kapanırsa
işlenmemiş söz reddi sızmaz. Sessiz ölüm (uyuyan telefon, kopan Wi-Fi) `ImpairedLink.blackhole()` ile kurulur:
sunucu canlılık yoklamasıyla oyuncuyu kopuk işaretler (Colyseus varsayılanı ~9 sn; testte
`HostOptions.pingIntervalMs` ile hızlandırılır), ağ gelince aynı oturum döner. Ağ değişimi (Wi-Fi yerine LTE)
yeni soketle sürer: kimlik IP değil yeniden bağlanma belirtecidir. Arka plan süresi pencereyi (15 sn)
aşarsa oyuncu düşer ve yeni oyuncu olarak katılır; bu bilinçli bir ödündür.

Ölçüm ve sınırlar: sapma ölçümü SDK'da yalnız bir eşik verilince açılır (`NETWORK.divergenceTolerance`);
eşiksiz "sapma 0" hiçbir şey söylemez. E2E yetkili aracı kaydırıp sapmanın görünmesini ve istemcinin
yakınsamasını doğrular. Gerçek sunucuya karşı düz sürüş + fren denemesinde (yerel döngü) iki motorda
oturum boyunca en büyük sapma 0–0,05 birimdir (7 koşu; `data-drift-max`). Bu, manevra, çarpışma ve
ateşte cihazlar arası determinizm kanıtı değildir. Gecikme telafisi yoktur: isabet, sunucunun o adımdaki dünyasına göredir.
Tüm durum her yamada her istemciye gider (ilgi alanı süzmesi yoktur); 24 insan + bot nüfusunda bant
genişliği ölçülmemiştir ve kapasite iddiası yapılmaz. Paketli Windows/Android ağ kabulü ve insan sunum
beğenisi yapılmamıştır.

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
girdiyle açar; menü, garaj, ayarlar (dil kalıcılığı, dar ekran sığması), senaryolar, duraklatma,
hava görünümü ve temiz konsol sınanır. Menüyü ilgilendirmeyen spec'ler `?start=world` ile açılır. Çok oyunculu E2E gerçek Colyseus sunucusunu test işleminde kurar (iki sayfa, bir Node
gözlemcisi: ortak dünya, cephe seçimi, botlar, sürüş/uzlaştırma, ateş, ölüm/doğuş, ayrılma, ulaşılamayan sunucu); ölümü
sunucudaki yetkili `Simulation`a hasar vererek tetikler. Kapsam, bundle ve algoritmik ölçekleme eşikleri kök `quality.json`
içindedir. Gerçek cihaz performansı, görsel ve haptik kabulü otomatik testlerden
ayrı kalır; ses yayın kabulü teknik QA sözleşmesidir. Açık kabul işleri kök [TODO.md](../../TODO.md) içinde izlenir.
