# VOL.TEST tasarımı

## Amaç ve sınır

VOL.TEST, CORE mekanizmaları ve native kabuğun gerçek oyun tüketicisidir.
Açık sürüş alanı tank fiziğini, nişanı, çevreyi ve platform servislerini
birlikte sınar. Kalıcı dünya engeli yoktur; seçilen senaryo araç veya hedef
ekler; senaryo kadrosu yuvaya göre dört aracı döndürür, böylece her araç görünüm, atış ve ses yoluyla sınanır. Oyun ana menüyle açılır; menü, garaj, ayarlar ve geliştirici ekranları ile HUD ve duraklatma katmanı vardır.

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
| `src/menu/`                            | Ana menü, garaj, ayarlar ve geliştirici ekranları       |
| `src/scenes/world/`                    | Girdi, kamera, çevre ve olayların bağlanması            |
| `src/config/`                          | Bütün oynanış ve sunum ölçülerinin tek kaynağı          |

Simülasyon olay kuyruğunu sahne her karede bir kez boşaltır. Görünüm model
kurallarını üretmez ve modele geri yazmaz. Listener, timer, ses ve native
abonelikler sahibinin kapanışında sökülür.

## Dünya ve sanat

Dünya 12288 × 12288 birimdir (384 m); bir metre 32 birime karşılık gelir.
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

Zemin izleri havuzludur ve kalabalıkta bozulmaz: palet izi parçası iki pabuç adımı taşır (12 birimde bir, doku tekrarlıdır), kapasite 2400'dür; ışınlanan araç (yeniden doğuş) `FX.marks.maxJump`tan uzağa atlarsa iz kesilir, eski noktadan yeniye köprü çizilmez; ekran dışındaki araç (görüş dikdörtgeni + `FX.cullMargin`) iz bırakmaz ve izi unutulur, böylece havuz görünmeyen tanklara harcanmaz. Örümcek yere her bastığında sivri pençe ucunun açtığı küçük, yuvarlak bir delik basar (`FootMarks`: koyu çekirdek ve ezilmiş toprağın ince halkası, yönsüz, bacak ucundan büyük görünmez; kısa ömürlü ve seyrek, boyuna ölçekli); alıcıyı `VehicleViews` yürüyücü görünümüne verir, vitrinde iz basılmaz.

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
Tam ekran filtre veya shader kullanılmaz. HUD mevsim ve hava yazısı taşımaz (hava dünyada görünür);
kök `data-season`/`data-weather` özniteliği testlere ve ölçüme kalır. Görünüm önizlemesi README'deki mevsim/hava sorgularıyla seçilir;
normal oturumun takvimi bu önizlemeden bağımsızdır.

### Göller

Dünyanın değişmez coğrafyası sekiz göldür (`src/config/lakes.ts`): dört yazılı göl ve dünyanın merkezine
göre nokta simetrik dört ikizi. Her göl dönük bir elips ile birkaç harmonikle dalgalanan kıyıdan oluşur.
Konumlar dünya oranıdır; hiçbir göl bir üsse, bölge çemberine ya da dünya kenarına değmez ve karşıt üsler
aynı coğrafyayı görür (testle kilitli: `tests/sim/world/LakeField.test.ts`).

Derinlik tek bir saf işlevdir: `LakeField.depthAt(x, y)`, kıyıda 0, merkezde 1. Simülasyon yavaşlamayı,
hasarı ve boğulmayı, bot kaçınmayı ve görünüm derinlik bantlarını aynı işlevden okur; çizilen kıyı ile
fizik kıyısı ayrışamaz. Göl verisi ağdan geçmez: sunucu odası ve istemci sahnesi dünyayı aynı yerden
(`createBattleWorld`) kurar, `World.lakes` her şasinin `step`inde okunur. Bu yüzden istemci öngörüsü
sunucuyla göl kıyısında da bit bit aynıdır (`tests/sim/wading.test.ts`).

Araçlar suya şöyle tepki verir (`WADING`):

- Tank ve yürüyücü yüzemez: derinlikle hız tavanı sürekli düşer (`wadingSpeed`, tabanda ~%22), diz boyu
  suyun (`hurtDepth`) ötesinde can kaybeder (`drowningRate`, derinlikle kareli büyür) ve can bitince
  boğulur. Hasar kaynaksız `drown` nedenidir; küçük parçalar birikir ve `hurtChunk` oranında tek olayla
  uygulanır (olay seli yoktur). Kıyıdan dönen araç sağ çıkar; derine inen ise zor çıkar.
- Süzülen araç yüzer: yavaşlamaz, hasar almaz; derinliği yalnız sunum için (dalga, iz) not edilir.
- Bot yüzemeyen araçta gölün önündeki mesafeleri tarar, suya bakan bileşeni sıyırır ve kıyı teğetine
  kayar; suyun içindeyse kıyıya çıkış yönüne gider (`BotBrain.lakePush`).

Sunum (`src/view/water/LakeView.ts`, `src/config/waterView.ts`) salt görsel katmandır; fiziği etkileyen hiçbir
sayı burada yoktur. Kıyı şeridi ve dokuz derinlik bandı, `LakeField`in derinlik eğrisinden göl başına
küçük bir canvas dokusuna bir kez basılır (her karede ekranı kaplayan çoklu üst üste çizim yerine tek
görüntü); renk (mevsim, gün ışığı) ya da donma değişince en sık 500 ms aralıkla yeniden basılır. Hareketli
katman yalnız çizgidir: dalga çizgileri, kıyıda yanıp sönen köpük ve kıyı çizgisi (yarım çözünürlüklü
kıyı çokgeniyle, parça başına tek yol). Yağmurda su yüzünde halkalar genişler (kalite çarpanıyla azalır).
Kışın göl kıyıdan merkeze doğru donar: buz kalınlığı sıcaklıktan türer (`iceThickness`, kar yağarken
biraz öne geçer), halka dokuya basılır, çatlaklar kıyıdan merkeze uzanır ve cephede ışıklı bir çizgi
titreşir. Buz salt sunumdur: tank ve yürüyücü buzu kırar ama yüzemez, yani donma kimin boğulacağını
değiştirmez ve sunucuya mevsim saati taşımak gerekmez.

Suda bırakılan izler (`src/view/water/WaterTrails.ts`) kısa ömürlü ve havuzludur, tek bir Graphics çizer:
yürüyen araç yol aralığıyla halka bırakır; buz örtülü kıyı şeridinde (`iceFront`) kırık bir delik
açar (koyu su, açık kenar) ve delik yavaş kapanır; süzülen araç açık suda V şeklinde dalga çeker, buzda
yalnız ince bir yarık bırakır (dalga hissi yoktur). Suya basan araç zemine palet ve ayak izi basmaz ve
iz sudan çıkınca eski noktadan köprü kurmadan kopar. Derin suda (`WATER_VIEW.sink.minDepth`) ölen araç
patlamaz: `WreckDirector` kararmış gövdeyi `VehicleView.sink` ile solar ve küçültür, yüzeyde halka ve
kabarcık bırakır, süre bitince sahneden kaldırır; yeniden doğunca gövde ve görünürlük geri gelir.
Geç katılımda derinde ölü görülen araç hiç çizilmez. Boğulma akışta `drowned` satırıdır
(`feedLine`, `cause: 'drown'`). Göller harita dokusuna da basılır (`src/hud/lakeMap.ts`): CORE
`MinimapPanel`in `backgroundImage` zemini olarak kıyı şeridi, su ve derin su, `LakeField.outline`
çokgenleriyle, yani harita kıyısı fizik kıyısıdır. Batış sesi henüz yoktur: yeni bir ses varlığı gerekir.

## Araçlar

Oynanabilir her araç bir `VehicleSpec`tir (`src/config/vehicles.ts`): kimlik, can,
şasi sayıları, süspansiyon ve silahlanma. Kayıt sırası (`VEHICLE_IDS`) ağdaki `model`
indeksidir; araç eklenirse sona eklenir, yeniden sıralanmaz. `Vehicle` tanımdan şasi,
silah beklemesi ve can kurar; simülasyon, öngörü, ses ve görünüm araca değil tanıma bakar.

| Araç     | Rol                       | Can | Hız | Dönüş | Atış                                  |
| -------- | ------------------------- | --- | --- | ----- | ------------------------------------- |
| Striker  | Dengeli ana tank          | 130 | 230 | 3,0   | 36 hasar, 650 ms, kabuk               |
| Bulwark  | Ağır kuşatma tankı        | 175 | 158 | 1,9   | 62 hasar, 1250 ms, ağır mermi         |
| Dart     | Hafif, hızlı keşif tankı  | 90  | 330 | 4,4   | 22 hasar, 380 ms, uzun menzilli ray   |
| Arachnid | Bacaklı savaş canavarı    | 108 | 162 | 2,7   | 21 hasar, 470 ms, iki plazma topu     |
| Widow    | Bacaklı keskin nişancı    | 92  | 160 | 3,4   | 8 hasar, 230 ms, iki iğne atıcı       |
| Goliath  | Devasa kuşatma yürüyücüsü | 360 | 86  | 1,5   | 38 hasar, 760 ms, iki ağır havan      |
| Manta    | Süzülen avcı              | 120 | 240 | 5,2   | 9 hasar, 150 ms, mor yay tekrarlayıcı |

Tablo `src/config/vehicles.ts` değerlerinin özetidir; karakter farkı hızlanmadan, dönüşten,
frenden ve geri tepmeden gelir (`tests/sim/vehicleHandling.test.ts` bu sıralamaları kilitler).
Aracı oyuncu katılırken `model` seçeneğiyle seçer; sunucu tanımsız indeksi protokol ihlali sayıp
reddeder.

**Denge** anma sayılarla değil düellolarla ölçülür: her araç çifti açık alanda, usta (`skill 0,75`)
iki botla iki yönde birçok tohumla dövüşür (`tests/sim/balance.test.ts`, bot yapay zekâsı tankın
da örümceğin de menzilini ve hızını kullanır). Anma hasarı/s Widow'da düşüktür (isabet, menzil ve
hızla öder), Goliath'ta canla ve ağır mermiyle, Manta'da kısa menzille ve ince canla öder; bu yüzden anma
hasarı yalnız %80 aralıkla sınırlıdır. 40 tohumluk son ölçümde her aracın kataloğa karşı toplam galibiyet payı %41-61'dir
(Striker 44, Bulwark 61, Dart 41, Arachnid 47, Widow 43, Goliath 55, Manta 58); test bu payı %30-70 bandında
tutar. Karşıtlıklar bilinçlidir ve hiçbiri mutlak değildir: Widow menzilden Arachnid'i ve Goliath'ı yener,
Bulwark'ın ağır mermisine ve Dart'ın hızına yenilir; Goliath Striker'ı ve Bulwark'ı ezer, Dart ve Widow
onu çevikliğiyle oyalar; Bulwark Widow'u ve Dart'ı yener, Arachnid ona baskındır; Striker Dart'ı ezer. Manta çevikliği ve tempoyla
Dart'ı, Widow'u ve Arachnid'i yer ama Bulwark'ın ağır mermisine ve Goliath'ın gövdesine yenilir (can ve
menzil onun sınırıdır).
Bu ölçüm botlarla yapılır: insan beğenisi ve el becerisi yerine geçmez, ve sayıların insan
oyunuyla doğrulanması ayrı iştir.

Araçlar tek bakışta ve kulakla ayrışır; kimlik üç yerden gelir ve tek tabloda tanımlıdır.
Renk: her tankın gövde ve taret SVG'si kendi paletini taşır (Striker çelik mavisi ve bordo kabuk,
Bulwark koyu adaçayı zırh ve pas kabuğu, sarı uyarı şeritli, turuncu enerji; Dart buz mavisi hafif
gövde ve çivit kabuk, camgöbeği enerji; Arachnid sıcak bronz zırh ve kızıl kabuk, Widow obsidyen gövde ve zehir yeşili) ve `TANK_ART` çekirdek ışığını ile palet tonunu araca
bağlar; `tests/config/vehicleIdentity.test.ts` paletlerin çakışmamasını kilitler. Mermi: her
silah stilinin kendi iz rengi ve kalınlığı vardır (`SHOT_LOOK`: kehribar kabuk, turuncu ağır
mermi, ince ve uzun buz mavisi ray, kızıl plazma, zehir yeşili iğne, mor yay). Ses: motor perdesi ve gücü araca
(`AUDIO.vehicleVoice`), top sesinin perdesi ve gücü silah stiline (`AUDIO.weaponVoice`) göre
işlenir; teslimler aynıdır, yeni sentez gerekmez. Araca özgü gerçek motor ve top kayıtları ayrı iştir.

Silahlanma (`Armament`) bir silahın sayılarını, namlu yuvalarını ve atış gruplarını
(`salvo`) taşır. `pivot` yoksa 0. yuva nişan taretidir; öteki yuvalar nişan noktasına (0. yuvadan
`toeInRange` ileride) bakar. `pivot` verilirse nişan başlangıcı odur ve bütün yuvalar nişan
noktasına bakar (örümceklerin simetrik omuz topları). Her yuvanın yönü yalnız poza bağlıdır ve ağda
namlu açısı taşınmaz. Her tetik çekişi sıradaki grubu ateşler; sıra `Vehicle.salvo` ile döner ve
sunucu durumunda (`PlayerState.salvo`) öngörüyle uzlaştırılır. Mermi, ateşleyen silahın
profilini (`Projectiles.addProfile`: ömür, uçuş, stil) taşır; isabet hasarı ve itkisi
aynı silahın tanımından okunur.

### Kaos kadranı

Geliştirici ekranındaki "Kaos tempo" kaydırıcısı (×0,5–×3, adım 0,25; `src/config/chaos.ts`, tercih `chaos`)
alıştırma dünyasının ana temposudur. Tek değer araçların hareketini (sürüş, dönüş, atılım, taret) ve
atış sıklığını aynı oranda yükseltir: `Simulation.pace` şasi adımını çarpan kadar zamanla ilerletir
(çarpan 1'in üstündeyse adım eşit alt adımlara bölünür, her alt adım en çok bir adım uzunluğundadır;
adımın en sert duvar teması korunur) ve silah beklemesini aynı çarpanla kısaltır. Mermi hızı, hasar ve
can değişmez, bu yüzden araçlar arası denge korunur. Yalnız çevrimdışı dünyadadır; sunucu dünyası
1'de kalır.

### Süzülen araç: Manta

Manta ne paletli ne bacaklıdır (`HoverSpec`, `src/sim/hover/Hover.ts`, sayılar `src/config/hover.ts`): iki yan
itici fanıyla zeminin üstünde kayar. Komut hedef hız vektörüdür (dünya ekseninde) ve araç ona dönmez:
gövde NİŞANA bakar (nişan yoksa harekete, o da yoksa olduğu gibi kalır), yani yana ve geriye ileri kadar
hızlı süzülür ve arkasına bakmadan kaçarken ateş eder. Yanal sürtünme yoktur; hızlanması dikkatlidir
(470 birim/s²) ama frenlemesi bilerek yumuşaktır (300 birim/s²): araç momentum taşır, köşede yana kayar,
bırakılınca ~0,8 sn süzülerek durur. Hız tavanı bilerek Striker'a yakındır (240): üstünlüğü hızı değil
yön özgürlüğü ve atılımdır; gövde nişana ağırlıklı döner (`maxTurnRate` 5,2, `turnAcceleration` 30). Zemin tutuşuna neredeyse duyarsızdır (`gripSensitivity` 0,2). Space
BASILI TUTULDUĞU sürece iticilere yüklenir (kilitli değildir, yürüyücünün av atılışından farkı budur):
tavan ×1,55 ve ivme 1500'e çıkar, depo ~0,47 sn'de boşalır ve bırakılınca dolar; hareketsizken atılım
gövdenin baktığı yöne fırlar. Yan yüzey alanları (`track*`, `tread*`, `ground*`, `surface*`) iki itici
kanalın yüzey hızıdır; kayma ve patinaj yoktur, bu yüzden palet izi ve kayma çizgisi bırakmaz (`tracked`
yanlıştır) ve palet gümbürtüsü yerine pervane uğultusu çalar.

Silahı kısa menzilli hızlı yaydır (`arc`): 150 ms'de bir 9 hasar, 520 birim menzil, 1100 birim/s mermi;
her atış zayıftır, tempo yüksektir. Can 120'dir. İki yan itici ince zırhın dışındadır ve parça sayılır
(`PARTS.hover`): yandan gelen kenar isabeti iticiyi koparır (tankın palet bitleriyle aynı iki bit,
`TRACK_LEFT`/`TRACK_RIGHT`). Kopan itici kapasiteyi (`podLoss`, `floor` taban) keser ve araç kırık yana
savrulur (`drift`), iki itici de kopunca yalnız taban itki kalır; taret ve ateş sürer.

Sanat elle çizilmiş SVG'dir ve ailenin dilini taşır (koyu kenar, sol-üstten aydınlanan degrade, sedef
levhalar, mor enerji): `src/assets/vehicles/manta/` altında gövde (kanat), yan itici, kaldırma pervanesi
ve taret (kupola ve çift bobin raylı) vardır. `HoverView` iticileri yerde, gövdeyi onların üstünde çizer;
gövde süzülürken nefes alır ve süspansiyonla kayar, iticiler bundan daha az kayar. Dönerken gövde dönüşün
tersine yatar (`HOVER_VIEW.bank`, yaylı ve sınırlı); taret yatıştan arındırılır, yani nişan görseli kaymaz.
İticilerin arkasında toz savrulur ve yerinde sönen mor enerji kıvılcımları bir iz çizer (hızla yoğunlaşır,
atılımda tavana varır; kırık itici izsizdir). Reaktör penceresinde Striker'ınkiyle aynı hesapla atan bir
çekirdek (`CorePulse`) ve kanat uçlarında yaylı, uçları ışıklı iki duyarga (`Feelers`) vardır; ikisi de
gövdeyle yatar ve nefes alır, duyargalar dönüşte geride sürüklenir. Gölge tanktan çok
daha yüksekten (26 birim) düşer ve gövdeden belirgin ayrılır, araç yerde yüzer görünür. Pervane hızla ve
atılımla hızlanır; kopan itici kısa koyu bir kütüğe döner, pervanesi durur. Ağız parlaması `sim/muzzle`
ucundadır. Bot, tank dışı araçlar gibi uzak hedefe atılımla kapanır.

### Bacaklı yürüyücüler: Arachnid, Widow ve Goliath

Üçü de paletli değil bacaklıdır (`WalkerSpec`, `src/sim/walker/Walker.ts`): her yöne (yan, geri)
aynı çevikliğiyle yürür; gövdesi WASD yönüne döner (nişan yalnız silah yuvalarını sürer, tank gibi
nişana bakmaz) ve yürüyüş tavanı gövdenin hedefe dönüklüğüyle ölçeklenir (`turnSpeedFloor`: ters
dönükken yarıya iner), bu yüzden önce döner sonra açılır. Shift hızlanması yoktur; Space kilitli bir
av atılışı başlatır: depo doluyken basılır, bırakılsa da ~0,55 sn boşalana dek sürer, geri alınamaz,
hareketsizken gövdenin baktığı yöne atar ve depo yeniden dolana dek bekler (depo `boost`/`boosting`
alanlarını kullanır, ağ durumuna ek alan girmez; HUD çubuğu "Atılım deposu"dur). Av atılışının
görünümü (`SpiderLegs`, `SpiderMotion`, CORE `GhostTrail`): öndeki bacaklar ileri fırlar, arkadakiler geride itiş
verir (`dashLungePx`), kalça çöker ve gövde ön bacaklara yüklenir (`dashLeanPx`, gövde ~8–14 birim ileri
uzanır), adımlar UZAR ama sıklaşmaz: bacak hızı atılışta ikiye katlanmaz, adım boyu 1,3 katın üstüne çıkar
(`dashTriggerCut` eksidir, `dashDurationCut` ≈ 0,1; adım sıklığı yürüyüşün 1,6 katını aşmaz, testi
`SpiderLegs.test.ts`; çekirdek `LegGait.setStepTuning` acil eşiği de canlı değiştirir), oyuncunun atılışında
kamera hareketin tersine bir kez itilip yayla oturur (`FEEL.dash.cameraKick`; yalnız yürüyücü ve süzülen,
yükselen kenarda), atılışın başında ayakların altından toz patlar ve gövdenin siluetinden soluk hayaletler
(CORE `GhostTrail`, `SpiderLook.ghost`: gövde ve bacakların o anki gerçek pozu, en çok `count` kopya) dünyada kalıp söner. Atılış hızında ayak kemik erişimini bir-iki
kare aşabilir; çizimde `solveLeg` onu erişime kelepçeler. Zemin tutuşundan palet kadar etkilenmez. Arachnid ağır kavgacıdır (162 birim/s, 108 can, zırhlı tarantula); Widow
hafif keskin nişancıdır (160 birim/s, 92 can, ince ve uzun bacaklı kara dul); Goliath devasa ve yavaştır
(86 birim/s, 360 can, Arachnid'in ~1,9 katı boyda): adımları ağır basar, gövdesi geç yaslanır, atılışı
kısadır ve bacakları ancak uzun ya da sürekli ateşle kopar. Hız tavanları
bilerek düşüktür: bacak yürüyüşü tavan hızda ayakları kemik erişiminde tutar ve bunu
`tests/view/spider/SpiderLegs.test.ts` ile `tests/config/spiders.test.ts` kilitler. Yürüyüş döngüsü
sunumdur (ayaklar yüzeye basıldığı yerde kalır); yalnız KIRIK bacaklar fizikte ve ağ durumundadır
(`ChassisState.parts`, bkz. "Parça hasarı"). Çarpışan gövde çizilen kabuğun içindedir, bacak açıklığı
değildir.

Sanat tamamen elle çizilmiş SVG'dir ve tanklarla aynı aileden gelir: parçalar tank parçalarıyla aynı
ölçekte (dünya birimi) çizilir, yani kenar kalınlığı, perçin ve mercek boyu ekranda tankla eşittir; aynı
koyu kenar, sol-üstten aydınlanan üç duraklı degrade, kabuk panelleri, mercek, ucu ışıklı duyargalar
(palpler) ve halkalı namlu ile oluklu ağız freni kullanılır. Silüet ve renk ise ayrıdır. Arachnid:
geniş zırhlı kabuk, kısa kalın dikenli bacaklar, sıcak bronz gövde ve kızıl kabuk, tek mercek, kabuğun
ön omuzlarında iki plazma topu. Widow: dar kabuk, iri yumurta karın ve kum saati, uzun ve yüksek
bacaklar, obsidyen gövde ve zehir yeşili, dört göz, ön omuzlarda iki iğne atıcı. Goliath: Arachnid'in
kabuk dilini büyütür (kurşun gri levha, kehribar damar ve mercek, omuzlarda ek zırh levhaları, iki ağır
plazma havanı). Parçalar Arachnid çiziminden `scale` grubuyla ölçeklenip yeniden boyanmıştır;
boyut ve eklem merkezleri `GOLIATH_LOOK` ile birebir aynıdır. Parçalar
`src/assets/vehicles/arachnid/`, `src/assets/vehicles/widow/` ve `src/assets/vehicles/goliath/` altındadır (femur, tibia, pençe, diz, temas karartısı,
göğüs, karın, iki gölge, top yuvası, namlu demeti); pen export kullanılmaz. Ölçüler ve eklem
merkezleri `SPIDER_LOOKS` (`src/config/spiders/`) içindedir ve `tests/assets/spiders.test.ts` SVG
kutularıyla birebir eşitliğini kilitler.

**Bacaklar gövdenin altındadır.** Çizim sırası sabittir: zemin gölgeleri, bacaklar, karın, göğüs,
toplar (`SpiderView`); hiçbir bacak parçası, ne kadar yüksekte olursa olsun, kabuğun üstüne çıkmaz
(`tests/view/SpiderView.test.ts`). Kalçalar kabuk hattının içindedir: femur kabuğun altından çıkar,
diz ve ayak dışarıdadır. Bacak yukarıdan düz bir şerit değil, kalça yüksekliğinden yere inen iki
kemiktir (`solveLeg`): havadaki ayak kalkarken diz yükselir ve büyür, basılı ayakta tibia dik iner.
Yükseklik üç şeye dönüşür: parçanın perspektifle büyümesi, konumun gövde merkezinden dışarı itilmesi
ve yere düşen gölgenin yükseklikle orantılı kayması. Bacak gölgesi bir çizgi değil kemik kalınlığında tek
kapalı çokgendir (`limbOutline`: kalça, diz ve ayak, uca doğru incelir, dirsekte köşe birleşir); eklemler
ZEMİN konumundan kendi yükseklikleriyle kayar, çünkü paralaks yalnız çizimi iter, gölgeyi itmez (aksi hâlde
gölge göğüs gölgesinden dışarı kayardı).

Görünüm (`src/view/SpiderView.ts`) üç araç için aynı sınıftır; fark `SpiderLook`tadır (kalça
yerleşimi, kemik boyu, yürüyüş, hareket, top, `sensors`). Göğüs lensinde Striker'la aynı hesapla atan bir
çekirdek ışığı (`CorePulse`) ve göğse bağlı, öne bakan iki yaylı duyarga (`Feelers`) durur; ikisi de göğüsle
birlikte yaslanır, döner ve perspektifle büyür, çekirdek hızla ve atılımla sıklaşıp parlar. Ayaklar dünyada sabitlenir ve gövde ilerledikçe
dönüşümlü dört-ayaklı adım atar (`LegGait`: bir yanın 1. ve 3., ötekinin 2. ve 4. bacağı birlikte
kalkar). Yerinde yavaş dönüşte grup üyelerinin eşik anları adım süresinden sık dizilir ve sıra el
değiştirmezdi; `turnWindow` sırayı kısıtlar ve karşı grup aç kalmaz. Kabuk hızdan ve ivmeden türeyen
ikincil harekete uyar (`SpiderMotion`: yaslanma, çömelme, atılım gerilmesi, adım sarsıntısı; karın
dönüşü geriden izler ve ivmeyle sıkışıp uzar). İvme, hızın değiştiği simülasyon adımları arasından
okunur (`LocomotionReader`). Her ayak basışı bir toz tutamı ve kısa bir gövde çökmesi bırakır.

Silahlar iki parçadır: yuva (gövde) ve namlu demeti. Demet yuvanın altından çıkar ve atışta geri
kayar, yuva sarsılır, ısınma ışığı yanıp söner ve ağız parlaması geri teperken kısalan namlunun
ucunda açılır (`SpiderCannon`). Plazma topu kalın ve halkalıdır, kızıl hortumlu, oluklu ağız frenli;
iğne atıcı ince ve uzun, zehir bobinli ve iğne uçludur. İki top gövde eksenindeki odağa bakar ve
sırayla ateşler: Arachnid'in her topu 940 ms'de bir atar (birleşik tempo 470 ms), Widow'un her atıcısı
460 ms'de bir (birleşik 230 ms), Goliath'ın her havanı 1520 ms'de bir (birleşik 760 ms). Yuvanın `reach` değeri çizimdeki ağız mesafesidir
(`SpiderLook.cannon.muzzleX`); mermi, geri tepme ve ağız parlaması oyunun efekt katmanındandır.

Bütün örümcek ve süzülen araç parçaları açılışta TEK doku atlasına çizilir (`vehicle-atlas`): bir karede
14'ten fazla ayrı doku GL toplu çiziminde parçaları kesiyordu (Manta'nın pervaneleri ayrı dokuyken yarım
ya da kara çiziliyordu) ve büyük SVG'ler GL'ye doğrudan yüklenince parça parça rasterleniyordu; tek atlas
ikisini de önler ve araçlar aynı dokuyu paylaşır.

## Sürüş ve süspansiyon

### Parça hasarı

Mermi isabeti canın yanında bir PARÇAYI da aşındırır: tankta iki yan palet, süzülende iki yan itici,
yürüyücüde sekiz bacak.
`PartWear` (`src/sim/combat/PartWear.ts`) merminin TEMAS NOKTASINI gövde çerçevesine çevirir (mermi
temas noktasına çekilmiştir, adım sonuna değil) ve hasarı o bölgenin parçasına yazar: tankta gövde
yarı genişliğinin `sideStart` oranından dışa düşen darbe `(sol|sağ)` paleti, yürüyücüde en yakın bacağı
(istasyonlar `SpiderLook.hips` x'idir, iki bacak arasına düşen darbe ikisini de aşındırır; ön/arka yüz
daha az, yan tam) aşındırır; gövde kenarındaki isabet kritiktir (`criticalGain`). Parça dayanımı aracın
canının oranıdır (`PARTS`, `src/config/parts.ts`), bu yüzden zayıf araç parçasını çabuk, ağır zırhlı geç
kaybeder; `tests/sim/combat/PartWear.test.ts` kaç isabette kırıldığını araç araç kilitler ve parçanın
ölümden ÖNCE kırıldığını doğrular. Rastgelelik yoktur: aynı atış dizisi aynı parçayı kırar. Aşınma bir
süre dinlenen parçada söner; kırık parça, aracın hasar almadığı `repair.quietMs` boyunca sessizlik
sürerse birer birer yerine oturur (can yenilenmesiyle aynı sessizlik fikri) ve doğuş/sıfırlama hepsini
onarır.

Kırık parçanın sürüşe etkisi şasidedir ve `Chassis.parts` (bit maskesi) ile ağ durumuna girer: tamsayıdır,
`CHASSIS_STATE_SNAPPED` listesindedir ve uzak araçta ara değer ALMAZ (`RemoteTanks`); aşınmanın kendisi
ağa gitmez, yalnız sonuç. Kırık palet itki vermez, zeminle serbest döner (kayma üretmez) ve yerde
sürünerek yuvarlanma direncini `dragGain` katına çıkarır: tek palet kırıkken tank kırık yana sürüklenir ve
dönüşü bozulur, iki palet de kırıksa sürülemez ve yerde kalır (taret ve ateş sürer). Kırık itici
süzülenin tavanını ve ivmesini keser, kırık yana savurur (bkz. "Süzülen araç"). Kırık bacak
yürüyücünün tavan hızını ve ivmesini kaybedilen bacak başına `legLoss` kadar keser (`floor` taban),
bir yanın bacakları eksikse yürüyüşü o yana sürükler (`drift`) ve eksik yan, kendi yürüyüş döngüsünde
(katettiği yoldan türer, rastgele değil) çöker: hız kesilir ve gövde o yana savrulur (tökezleme,
`stumble`). Tek bacak kaybı bile hissedilir: ortalama hız ~%25 düşer ve her adımda ~%25'lik bir hız
çukuru açılır (`tests/sim/partsDrive.test.ts`); görünüm aynı fazdan (`limpCollapse`) kalçayı indirip
gövdeyi çöken yana yatırır ve göğsü büker (`SpiderView.stumble`, yalnız yürürken; duran yürüyücü
tökezlemez), yani "bir bacağım yok" topallaması hem hızda hem silüette okunur. Parça koptuğu anda gövde ayrıca `Chassis.jolt` ile kırılan yana sarsılır ve `broke` olayı
yayılır. Bot kırık araçla da çalışır: iki paleti kırık bot yerinde kalıp nişan almaya ve ateşe devam eder
(`tests/sim/ai/BotBrain.test.ts`).

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
gösterir. Sunucu tarafı savaş yetkilendirmesi, kalıcı ölüm politikası ve spawn
alanı seçimi bu simülasyon mekanizmasının üzerindeki oyun kurallarıdır.

### Ölüm ve enkaz

Ölen araç soluklaşıp hayalet olarak kalmaz: `WreckDirector` (`src/scenes/world/WreckDirector.ts`) her kare
canlılığı bir önceki kareyle karşılaştırır ve canlıdan ölüye geçişte tek bir patlama oynatır; araç görünümü
`VehicleView.setWrecked(true)` ile olduğu yerde kalır: gövde isli renge çekilir (`src/view/charring.ts`; ışık ve
ağız parlaması söner, örümcek hayaletleri silinir), poz donar ve gölgesi yerinde durur, yani araç birden yok
olmaz; yeniden doğunca `setWrecked(false)` her rengi eski hâline getirir. Karşılaştırma simülasyon olayına değil canlılık durumuna
dayandığı için çevrimdışı sandbox ve çevrimiçi istemci aynı yoldan geçer; ilk görülen ölü araç (geç katılım)
patlamadan gizlenir. Patlama `EffectsView.wreck`tir: parlama, şok halkası, yanık, kor/kıvılcım/toz parçacıkları
ve `src/config/debris.ts` ayarlarıyla 6-8 enkaz parçası. İlk iki parça aracın gerçek çizimidir (tankta taret ve
duyarga, örümcekte femur, tibia ve ayak), kalanı levha kıymığıdır (`debrisArt.ts`); büyük parçalar sırayla
seçilir, böylece aynı parça (örn. taret) iki kez savrulmaz. Parçalar `Debris`
havuzunda gerçek fizikle ilerler: yerde (x, y) ve havada yükseklik (z), yerçekimi, hava sürtünmesi, sekme
(hız kaybıyla), dünya duvarından sekme, durunca yuvarlanma sönümü; perspektifle büyür, gölgesi ışığın tersine
yükseklikle kayar, ilk anda kor gibi parlayıp soğur, 3,6-5,6 sn sonra söner ve havuza döner. Havuz tavanı
vardır (28, kalite profiliyle ölçeklenir) ve dolu havuzda en eski parça yeniden kullanılır; yani kalabalık
savaşta bile ekran dolmaz ve görüntü nesnesi yaratılmaz. Enkaz sunum zamanıyla ilerler (duraklatmada donar)
ve tohumlu rastgele kullanır (`FX.debrisSeed`): aynı olay aynı düzeni verir. Mermi isabetinde ara sıra
(`DEBRIS.hit.chance`) gövdeden küçük bir kıymık kopar; şans isabet noktası ve hedef kimliğinden türeyen bir
karmayla (`hash01`) belirlenir, `Math.random` yoktur.

Parça kopması aynı yönetmendedir: `WreckDirector` canlılığın yanında `Chassis.parts` maskesini de
karşılaştırır. Yeni açılan her bit bir parça koptu demektir: `EffectsView.shed` parçayı bağlantı
noktasından (`partAnchor`: tankta yan paletin ortası, yürüyücüde bacağın kalçası) gövdenin kırılan
yanına doğru savurur (tankta palet çarkı ve levha kıymıkları, örümcekte bacağın tibiası ve pençesi), kıvılcım ve
kısa bir parlama verir; görünüm `VehicleView.setParts` ile kırık hâle geçer: kırık palet kararır,
yerinden oynar ve arka çarkını düşürür (`TreadRig.setBroken`), kırık bacak femurun kısa bir kütüğü
kalır, tibia, pençe ve temas karartısı kalkar, ayak yere basmaz ve gövde kırık yana çöker
(`SpiderLegs.setBroken`, `SpiderView` çökmesi). Maske sunucudan olduğu gibi geldiği için aynı yol
çevrimiçi uzak araçlarda da çalışır; onarım (bit kapanması) efektsiz görünüme işlenir.

## Bot yapay zekâsı

`src/sim/ai/BotBrain.ts` bir aracın komutunu üreten saf benzetim kodudur: Phaser, ağ ve gerçek saat
bilmez, oyuncuyla aynı `TankCommand` sözleşmesiyle sürer (hile yok, ışınlanma yok) ve kendi tohumlu
rastgeleliğini kullanır; aynı tohum, beceri ve dünya bit bit aynı yolu izler. Dört paletli ve bacaklı
araç ailesini de sürer, çünkü yalnız `Vehicle` yüzeyini (poz, hız, silah menzili, depo) okur.

Karar iki katmandır. Algı `thinkIntervalMs` aralığıyla tazelenir: en yakın düşman (takımsız araç
herkese düşmandır; histerezis ve "belirgin yakın" kuralı hedef titreşimini önler), diğer araçlardan
ayrışma vektörü, nişan sapması ve yörünge yönü. Her adımda bu kararlar hareket, nişan ve tetiğe çevrilir:

| Kip       | Ne zaman                                                | Hareket                                                   |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `engage`  | hedef menzilin 1,25 katında ya da görev bağı içinde     | standoff mesafesini tutar, hedefin çevresinde şerit atar  |
| `advance` | görev noktasına varılmamış                              | göreve yürür, uzaksa atılım kullanır                      |
| `hold`    | görev noktasına varıldı ya da görev yok                 | bölgede yavaş dolaşır, namlu çevreyi tarar                |
| `retreat` | can kişiliğin eşiğinin altında                          | geri çekilme noktasına koşar, iyileşince döner            |
| `regroup` | düşman, çevredeki müttefikten (kendisi dahil) iki fazla | müttefik kümesine ya da üsse çekilir, namlu hedefte kalır |
| `unstick` | komut verildiği hâlde ilerlenemiyor                     | kısa süre geri ve yana kaçar                              |

Nişan hedefin hızını önden gider (`interceptTime`: sabit hızlı mermi ve sabit hızlı hedef için kapalı
çözüm, çözüm yoksa düz uçuşa düşer); ateş yalnız tepki süresi geçince, menzilin %92'sinde ve namlu
`aimTolerance`ın iki katı içinde açılır. Beceri (0 acemi, 1 usta) tepki süresini, nişan sapmasını, önden
gitme doğruluğunu ve geri çekilme eşiğini bir aralıkta kaydırır; tüm sayılar `src/config/bot.ts`'dedir.

**Taktik katman.** Beceri `BOT.tactics.minSkill` ve üstündeyse bot dört şey daha yapar; hepsi tohumlu ve
saftır. (1) Hedef mesafeden değil puandan seçilir: canı azalmış düşman beceriyle orantılı daha yakın
sayılır (usta bitirir), doğma korumalı düşman vurulamayacağı için üç kat uzak sayılır; tek düşman
korumalıysa yine de ona dönülür. (2) İki silahın menzili kıyaslanır: kendi menzili belirgin uzunsa düşman
menzilinin hemen dışında durup vurulur, belirgin kısaysa düşmanın içine girilir (Dart, Bulwark'a menzil
dışından; Bulwark, Dart'a içeriden oynar). (3) `packRadius` içindeki düşman, müttefikten (kendisi dahil)
iki fazlaysa `regroup`: bot yakındaki müttefik kümesinin ağırlık merkezine (yoksa üsse) çekilir, yan sapma
ve atılımla koşar, namlu hedefte kalır ve ateşi sürer; fark sıfıra inince bırakılır (giriş ve çıkış
eşikleri farklıdır). (4) Beceriyle ölçeklenen kaçınma: algı adımında düşman mermilerinin en yakın geçişi
kısa sürede ve araç yarıçapı içinde kalıyorsa mermi yolunun dikine, geçeceği yerin ters yanına sapılır.
Acemi bot bunların hiçbirini yapmaz; yalnız en yakına ateş eder.
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
(CORE `MinimapMarker.worldRadius`) gösterir ve araç işaretlerini cephe rengine boyar. Her bölgenin yanına
yerelleştirilmiş kısa adı (`voltest:war.zoneShort.*`, bir-iki harf) CORE `MinimapMarker.label` ile yazılır;
hangi çemberin hangi bölge olduğu renge bakmadan okunur ve dil değişince etiketler yeni dille yazılır. Ölçek
çubuğunun birimi de çeviri anahtarıdır (`voltest:hud.metre`). Renk ve ölçüler
`src/config/frontView.ts` içindedir. Çevrimdışı sandbox'ta cephe hattı yoktur.

**Bot rozeti.** Haritada ve dünyada hangi aracın insan, hangisinin bot olduğu aynı küçük sarı nokta
ile söylenir (`ONLINE_VIEW.colors.bot`). Harita araç işaretinin ortasına CORE `MinimapMarker.badge`
ile nokta düşer; dünyada `NameTags` adın soluna aynı noktayı çizer. Kaynak sürücüdür
(`WorldDriver.isBot`): çevrimiçi sunucu kaydındaki `bot` bayrağı, çevrimdışı sandbox'ta oyuncudan başka
her araç. Çevrimdışı botların adı yoktur; yalnız sağlık çubuğu ve rozet çizilir. Kendi aracınız hiçbir
koşulda bot sayılmaz.

**İsabet geri bildirimi.** Çok oyunculu ateşte kimin kime ne kadar vurduğu üç şeyle okunur. Her `damaged`
olayı isabetin noktasında hasar sayısı (`src/view/effects/DamageNumbers.ts`) doğurur: verilen hasar sarı,
alınan kırmızı ve büyük, başkalarının isabeti soluk ve küçüktür (`FX.damageNumbers`). Yön
`src/scenes/world/SimEventRouter.ts` içinde oyuncunun kimliğine göre seçilir; boğulma sayı üretmez, çünkü
canı sürekli eritir. Sayılar sabit bir yazı havuzundan gelir; yoğun ateşte nesne üretilmez. `NameTags` can
çubuğu isabette kısa süre beyaza parlar ve kaybedilen can soluk bir iz olarak kalıp erir
(`ONLINE_VIEW.tag.trail*`); iyileşme ve yeniden doğuş izi sıfırlar. Hasarın kendisi sunucuda uygulanır; bu
katman yalnız görünürlüktür.

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
şeride koyar. İki düzen vardır. `sheet` sol şerittir ve arkasında canlı araç vitrini ya da oyun görünür (ana menü,
ayarlar ve duraklatma; dar ekranda alt levha); `full` yalnız garajdır ve sunum için ortada bir `stage`
bölgesi ayırır. Duraklatma (`PauseOverlay`) aynı `ScreenFrame` `sheet`ini CORE `Modal` içinde taşır: modal yalnız
odak tuzağı, Escape ve Android geri sözleşmesini verir. Katman ayar satırı taşımaz: yalnız düğmeler vardır
(Devam et, Ayarlar, Geliştirici, sürücü eylemleri). "Ayarlar" ana menüdeki `SettingsScreen`i (dil, kalite, ses,
titreşim, ekran kipi), "Geliştirici" `DevScreen`i (senaryo ve tohum) şeridin içinde açar; geri düğmesi menüye
döner. Oyuncu ayarı ile geliştirici ayarı böylece tek yerde ve ayrı durur. Geniş denetimli satırlar
(dil, ekran kipi, senaryo) `stackOnNarrow` ile dar ekranda etiketin altına iner.
**Telefonda garaj.** Dikeyde sunum üstte ve esnektir, araç kartları tek satırlık yatay `scroll-snap` şeridinde
kayar (ölçü çubukları ve seçim düğmesi kalır), katılım formu altta durur; hepsi gövdeye
kaymadan sığar. Alçak yatayda başlık şeridi ile eylem şeridi tek alt çubukta birleşir, kartlar sütunda dikey
yaslanarak kayar. İkisi de `tests/e2e/menu.spec.ts` ile 390×844 ve 844×390'da kilitlidir. Görünen her parça CORE bileşenidir: araç seçimi `CardTile` (`selected` + `addDetail`
ile ölçü çubukları), ölçüler `Bar`, form `SettingsForm`/`SettingsRow`, denetimler `Input`,
`SegmentedControl`, `Select`, `Checkbox`; `menu.css` yalnız yerleşim verir. Arkada oyunun gerçek araç
görünümleri (`TankView`, `SpiderView`) dönen tablada durur (`Showroom`; bacaklı yürüyücü dönmez, çünkü ayaklar dünya uzayında basılır ve dönen gövde onları dolaşık bir poza sürükler, taretleri salınır); kamera `stage` bölgesinin kaydırma gövdesinde
görünen kısmına (alçak yatay ekranda sahne görünümden uzun olabilir) ya da `sheet`in bıraktığı alana kurulur ve sığmazsa yakınlaştırma küçülür (`src/config/menu.ts`). Ekran
değişimi vitrin zemininin kum rengine solarak yapılır (koyu renge solmak parlak zemine dönüşte göz alıyordu;
`prefers-reduced-motion`da anında); geçiş sürerken ikinci seçim yok sayılır.
Android geri tuşu garajdan ve ayarlardan menüye döner, menüde çıkış onayını açar ya da kapatır.

Garajdaki seçim (araç, cephe, ad) ve ayarlardaki dil `GameSettings`e yazılır ve oturumlar arasında
kalır; alıştırma ve savaş aynı araç tercihini kullanır. Savaşa katılma çevrimiçi parçayı ilk kullanımda
tembel yükler (`connectWar`); bağlanırken geri dönülür ya da ekran kapanırsa geç gelen oturum bırakılır,
odada hayalet kalmaz. Menü, garaj, ayarlar ve geliştirici çevrimiçi ağ kodunu yüklemez. Ekranlarda oyun içiyle aynı CORE UI sesleri
çalar (`ScreenScene.attachAudio`: düğme, seçim, kaydırıcı, odak; ses düzeyi ayardan, kaydırıcıyla canlı); yalnız UI
kiti yüklenir, oyun SFX'i yüklenmez. Müzik yoktur.

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
yatay `Bar`dır; çubuklar yazı taşımaz (dolum çubuğun kendisidir, değer yalnız erişilebilir ad ve değer metnindedir) (masaüstünde sol altta, dokunmatikte sol üstte);
yeniden doğma ve koruma bildirimi üst ortada, harita sağ üstte, kontrol ipuçları masaüstünde alt
ortadadır. Sürüş hızı, yön ve vites HUD'da yoktur (teşhise aittir, harita yön ve konumu verir);
oyun adı rozeti de yoktur. Dokunmatikte haritanın 44 px'lik yakınlaştırma düğmeleri haritayı
örteceğinden gizlenir (kamera zoom düğmeleri vardır); masaüstünde tekerlek ve düğmeler çalışır.
Harita (CORE `MinimapPanel`) çizilen her karede, ekrandaki ara değerli pozdan güncellenir:
adım konumu ya da seyreltilmiş güncelleme işareti sıçratır. İşaretler yerinde güncellenir
(çerçeve başına nesne üretilmez), pikselin 1/8'inden küçük değişim çizim istemez, özet yalnız
tür sayıları değişince yazılır. Düşük kalite profili haritayı 33 ms aralıkla seyreltir
(`EffectProfile.mapIntervalMs`).
Kontrol ipuçları dünyaya her girişte `HUD.hintsShowMs` (10 sn) görünür, sonra solar ve geri gelmez;
sayaç HUD'un ilk güncellemesinde başlar (sahne saati sahneyle başlamaz), dokunmatikte hiç görünmez.
Çevrimiçi dünya sunucuda aktığı için duraklatılamaz: sürücü `live` bildirir, Esc ve düğme "Menü" açar
(başlık "Menü", not "Dünya sunucuda akmaya devam eder", ana eylem "Savaşa dön", ipucu ve dokunmatik düğme
"Menü"). Sahne çizimi, kamera ve ses sürer, araca yalnız boş girdi gider. Çevrimdışı sandbox gerçekten durur.
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

Çizim çözünürlüğü CORE `ViewportManager`ın iki sınırıyla kısılır: `maxDpr` (2) yoğunluğu, `maxPixels` (`GAME.maxPixels`,
3,5 milyon) backing store alanını sınırlar. Tavan olmadan 2560×1440 tam ekran DPR 2'de 14,7 milyon piksel çizilir; tavanla 1440p neredeyse tam, 4K 2494×1403
çözünürlükte çizilir (dünya ve ekran boyutu değişmez, tam ekrana geçişte yeniden okunur). Tavan korumadır: 1080p
DPR 1 ekranı (~2 milyon piksel) değiştirmez, kare hızı kazancı cihazda ölçülür. Renderer ayrık GPU ister (`powerPreference`).
Gerçek GPU kare süresi bu makinede ölçülmedi; kabul cihazdadır.

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

41 teslim kuru mekanik programlardan kanonik yayın kapısıyla üretilir.
`audio-manifests` yeniden üretim kimliğini, `audio-banks` aile seçimini taşır.
Oyun yalnız bank JSON'unu ve `public/assets/audio` teslimlerini okur;
audio-synth çalışma zamanı bağımlılığı değildir. Pakete kanonik kayıt değil,
`scripts/vite/audioBankRuntime.mjs` ile indirgenmiş çalışma zamanı görünümü
girer (anahtar, rol, etiket, süre, varlık yolu): hash, manifest, ölçüm ve kalite
kaydı yalnız kanonik dosyada kalır ve `verifyFamily` onu okur.

Dokuz döngü motorun üç devri, palet, bacak adımı, pervane, kayma, servo ve hızlanmadır. Yürüyücü palet yerine
`legs` (sivri uç tıkırtısı ve eklem sürtmesi), süzülen araç `fans` (kanat geçişi uğultusu) çalar; tempo ve güç
araca göre (`AUDIO.vehicleVoice.tracks`). Tek atımlık araç sesleri `dash` (yürüyücü ve süzülenin atılımı
başlarken) ve `snap`tir (`broke` olayında parça kopması; `AUDIO.eventAsset`).
Ray, plazma, iğne ve yay silahının kendi atış teslimi (`shot-rail/plasma/needle/arc`, `AUDIO.shotAsset`) vardır;
kabuk ve ağır mermi top ailesini perdeyle çalar. Top,
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

| Parça                                             | Sorumluluk                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `server/WorldRoom.ts`                             | Kalıcı savaş dünyası: 60 Hz adım, 20 Hz yama, `War` nesnesini sarar                           |
| `server/index.ts`                                 | Oda kaydı ve birincil dünya (insan kalmasa da kapanmaz)                                       |
| `server/InputPacer.ts`                            | Girdi titreşim tamponu; geç girdi sayılı boşta adım olur                                      |
| `src/network/OnlineSession.ts`                    | Bağlanma, bağlantı durumu, ping/titreşim, olay dağıtımı                                       |
| `src/network/PredictedPilot.ts`, `OnlineWorld.ts` | Kendi aracın öngörüsü, uzlaştırma, uzak araç ara değeri                                       |
| `src/network/warView.ts`                          | Şemadan savaş görüntüsü (cepheler, bölgeler, tablo) ve bildirim akışı satırı                  |
| `src/scenes/world/`                               | `WorldDriver` sözleşmesi: çevrimdışı ve çevrimiçi sürücü, katılım                             |
| `src/hud/LobbyPanel.ts`, `OnlinePanel.ts`         | CORE Modal/Input ile katılım paneli; VersusBar/RankList/ActivityFeed ile puan, sıralama, akış |

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
- Duraklatma dünyayı dondurmaz (saat sunucudadır): menü canlı "Menü"dür (`WorldDriver.live`), sahne çizimi
  ve ses sürer, araç yalnız boş girdi yollar; menüdeyken araç savunmasızdır ve arayüz bunu söyler.
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
Bozuk ağ: `tests/e2e/impairedNetwork.spec.ts` sayfayı gerçek sunucunun önündeki TCP vekilinden
(`tests/support/impairedProxy.ts`) bağlar. Vekil her yöne sabit gecikme ve titreşim ekler; WebSocket TCP
üstünde olduğundan kayıp, yüzdesi `stallPct` olan parçaların `stallMs` beklemesi ve arkasındakileri de tutması
olarak modellenir (gerçek paket kaybı değildir). Profiller ve bütçeler (en büyük düzeltme, en büyük gidiş-dönüş,
ani sıçrama sayısı) `quality.json` → `networkImpairment` içindedir; sürüş konum eşiğine bağlıdır, sabit bekleme
yoktur ve durunca sayfa yetkiyle 0,5 m içinde aynı yere oturur. Ölçülen: Chromium/WebKit'te kayıpsız, 40 ms ±15 ve
60 ms ±30 + %3×250 ms bekleme profillerinde en büyük sapma 2,9–29,8 birim, snap 0 (ölçüm yazılım çizimli tek makinededir;
bütçe tepenin 2,5–3 katıdır). Bu gerçek ağ, paketli uygulama ya da cihaz ölçümü değildir.
Tüm durum her yamada her istemciye gider (ilgi alanı süzmesi yoktur); 24 insan + bot nüfusunda bant
genişliği ölçülmemiştir ve kapasite iddiası yapılmaz. Paketli Windows/Android ağ kabulü ve insan sunum
beğenisi yapılmamıştır.

### Ajan laboratuvarı

Bir ajan (insan ya da model) çalışan oyunu okuyup sürebilsin diye `?lab=1` ile açılan `window.volLab`
yüzeyi vardır (`src/app/AgentLab.ts`; sayılar `src/config/lab.ts`). Bayrak yoksa hiçbir şey kurulmaz ve
sayfa farkı yoktur. Girdi geçersiz kılma oyuncunun kendi komut yolundan (`PlayerControls.step`) geçer;
simülasyon saati, RNG ve kurallar aynıdır, yani laboratuvarla sürülen oturum insan oturumuyla aynı
dünyadır. Telemetri sınırlı halkadadır (600 durum örneği, 400 olay), uzun oturumda bellek büyümez.
Kullanım: `volLab.run('state')`, `volLab.run('input', { moveX: 1, fire: true })`. Komutlar ve belge
tablosu `tests/app/AgentLab.test.ts` ile birebir eşitlenir:

| Komut              | Ne yapar                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `volLab.help`      | Komut adlarını ve açıklamalarını döner.                                                                |
| `volLab.state`     | Dünyanın o anki özeti: oyuncu, araç sayısı, senaryo, tohum.                                            |
| `volLab.telemetry` | Son durum örnekleri (`count`, en çok 600), eskiden yeniye.                                             |
| `volLab.events`    | Son oyun olayları ve işaretler (`count`, en çok 600), eskiden yeniye.                                  |
| `volLab.input`     | Oyuncu girdisini geçersiz kılar: `moveX`, `moveY`, `aimX`, `aimY` ([-1, 1]), `fire`, `boost`, `brake`. |
| `volLab.teleport`  | Oyuncu aracını (`x`, `y`) noktasına koyar; isteğe bağlı `hull` (rad). Çevrimiçi oturumda fırlatır.     |
| `volLab.release`   | Girdi geçersiz kılmayı bırakır.                                                                        |
| `volLab.mark`      | Olay halkasına etiketli bir işaret yazar (`label`).                                                    |
| `volLab.jsonl`     | Telemetri ve olay halkasını zamana göre sıralı, satır başına bir JSON verir.                           |

Sunucu tarafı `games/vol-test/scripts/drive.ts` ile ölçülür: `--profile lan --ops <url>` özeti `quality.json` →
`fleetBudget` profiline karşı yargılar (`@volstudio/network/drive` `judgeFleet`) ve geçmezse süreç 1 ile
çıkar; `/metrics` verilmezse sunucu maddeleri atlanır ve hüküm tamamlanmış sayılmaz. 14 Ekim ölçümü
(8 istemci, 30 sn, yerel sunucu): katılım p99 34-49 ms, yama aralığı p99 65 ms, bot başına 16,1 yama/s,
sunucu adım p95 1,2-1,3 ms; bu LAN ölçümüdür, kapasite ya da soak kabulü değildir (F13.5).

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
