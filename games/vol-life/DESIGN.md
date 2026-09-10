# VOL.LIFE — tasarım notları

Bu belge, [README](README.md)'de yeri olmayan tasarım kararlarını taşır: ürünün
ne olduğu, dünyanın modeli, ölçeğin nereden geldiği ve hangi mimari sınırların
ölçülerek bulunduğu. README ne olduğunu ve nasıl çalıştırılacağını anlatır;
burası NEDEN böyle olduğunu.

Belge iki kaynaktan doğdu: bir vizyon turu ve **iptal edilmiş bir ilk deneme**.
İkincisi commit edilmeden atıldı; ondan kalan tek şey ölçümleri ve hatalarıdır.
Bu belgedeki her mimari kısıt bu turda kaynağından yeniden doğrulandı — devir
kaydına güvenilerek yazılmadı.

## 1. Ürün kararı

VOL.LIFE oynanan bir simülasyon oyunu değil, **izlenen bir dünyadır**.

Oyuncunun ana fiili bakmak, yaklaşmak, takip etmek ve merak etmektir; inşa
menüsü açıp birim yerleştirmek değil. Müdahale vardır ama **tanrı değil bozucu**
rolündedir: koşul değiştirilir, sonuç sistemden gelir. "Şu canlı oraya gitsin"
bir komut değildir; "burada kaynak var" bir komuttur ve sonucu garanti edilmez.

Bu karar her alt sistemi bağlar. Bir mekanik "oyuncu bunu ne zaman kullanır?"
sorusuna cevap veremiyorsa ama "oyuncu bunu görünce ne hisseder?" sorusuna
veriyorsa, VOL.LIFE'ta yeri vardır.

### Ölçek bir SONUÇTUR, girdi değil

İlk denemenin en pahalı yanlış çıkarımı buydu: **"devasa" çok parçacık demek
değildir.** 40.000 nokta dünyayı halı gibi kaplar ve birey algısını yok eder;
referans görüntülerin çoğu SİYAHTIR ve organizmalar adacıklardır. Yoğunluk
arttıkça "bir şeyler oluyor" hissi düşer, "renkli gürültü" hissi yükselir.

Bu yüzden nüfus bir hedef değil, bir bütçedir. Hedef şudur:

> Ekranda ayırt edilebilir, davranışı takip edilebilir, başına bir şey geldiğinde
> fark edilen varlıklar olmalı.

Nüfus bu koşulu bozmayacak en yüksek sayıdır. İlk sürüm **100 parçacık**
hedefler ve bu bir geçici basamak değil, ürünün ilk gerçek hâlidir.

**Üç ayrı bütçe vardır ve tek sayıya indirilemez:**

| Bütçe         | Ne sayar               | Maliyeti ne belirler   |
| ------------- | ---------------------- | ---------------------- |
| Parçacık      | Fiziksel madde         | Kuvvet ve ızgara       |
| Organizma     | Kimliği izlenen varlık | Küme eşleştirme, kayıt |
| Bilişsel ajan | Karar veren organizma  | Algı ve değerlendirme  |

"100.000 parçacık" ile "100.000 organizma" aynı şey değildir; ikincisi bir
büyüklük mertebesi daha pahalıdır. `100k parçacık / 500 organizma / 50 bilişsel
ajan` makul bir hedef sınıfıdır, `100k bilişsel ajan` değildir. Ölçek sorusu
bu üç sayı ayrı ayrı ölçülmeden cevaplanamaz.

### Üç ürün kipi

Ürünün kimliği "oynanış" değil, dünyayla kurulan üç ilişkidir:

- **Gözlem** — dünya kendi akar, oyuncu bakar.
- **Deney** — oyuncu koşulu değiştirir, sonucu bekler.
- **Tekrar** — dünyanın geçmişi yeniden oynatılır.

Üçü de aynı deterministik çekirdeğe dayanır (§7) ve bu yüzden üçü de bedavaya
gelmez ama ucuza gelir. Kipler ilk sürümde ayrı bir arayüz olarak açılmaz;
belge burada yalnız neyin mümkün kalması gerektiğini kilitler.

### Başarı ölçütü: zincir uzunluğu

Kaç özellik olduğu değil, **tek bir olaydan kaç anlamlı sonuç çıktığı** ölçülür.
Kaynak patlaması → nüfus akını → rekabet → avcı gelişi → tükenme → göç → sınır
çatışması zinciri, aynı sayıda özelliğin birbirinden bağımsız durduğu bir
sistemden ölçülebilir biçimde daha canlıdır.

## 2. Dünya modeli

Dünya bir harita değil, **işlenebilen bir maddedir**. Harita terrain verir;
dünya durum, akış, kaynak, tarih ve ilişki taşır.

Dünya sürekli alanlardan (field) oluşur. Gerçek Navier–Stokes akışkan
simülasyonu ilk sürümde YOKTUR ve gerekmez: akışkan HİSSİ, alanların birbirini
beslemesinden çıkar. Beş temel alan:

| Alan          | Ne taşır                                            |
| ------------- | --------------------------------------------------- |
| `flow`        | İki bileşenli sürükleme; dünyanın "sıvı" hissi      |
| `nutrient`    | Yaşam kaynağı; tüketilir ve yenilenir               |
| `energy`      | Isı/ışık benzeri dış girdi                          |
| `temperature` | Tür tercihlerini ve yaşanabilirliği belirler        |
| `disturbance` | Hareket, çatışma ve patlamanın dünyada bıraktığı iz |

`habitability` bu alanlardan TÜRETİLİR, ayrı bir alan olarak tutulmaz.

### Alan ile kaynak AYNI ŞEY DEĞİLDİR

İkisi de ızgarada yaşar ama davranışları farklıdır ve tek kavrama sıkıştırmak
ileride ikisini de bozar:

- **Alan** uzayın sürekli bir özelliğidir. Sıcaklık "tükenmez"; yayılır,
  dengelenir, taşınır.
- **Kaynak** tüketilebilir bir niceliktir. Üretilir, azalır, biriktirilebilir
  ve yeniden doğar.

`flow`, `temperature`, `disturbance` alandır. `nutrient` ve `energy` kaynak
davranışı taşır — tüketim/yenilenme döngüsü onlara aittir. İlk sürüm ikisini de
aynı ızgara altyapısında saklayabilir; ayrım VERİ YAPISINDA değil, üzerlerinde
çalışan kuralların ayrı olmasında yaşar.

### Çift yönlü bağ zorunludur

Dünya organizmayı etkiler, organizma dünyayı değiştirir. Tek yönlü bir bağ
(dünya yalnız arka plan) ekolojiyi imkânsız kılar: tüketim olmadan kıtlık,
kıtlık olmadan rekabet, rekabet olmadan davranış baskısı olmaz.

Bir organizma geçtiğinde dünya çok hafif bir **iz** bırakır ve iz zamanla söner.
İz koku, titreşim, kimyasal veya ısı olarak yorumlanabilir; mekanik olarak
avcının hedefi görmeden "burada yakın zamanda bir şey geçti" diyebilmesidir.
Böylece dünya geçmişi kısa süreliğine HATIRLAR.

### Dünya çoğunlukla boştur

Görsel hedef %70–90 boş/az yoğun, %10–30 anlamlı etkinliktir. Kullanıcı kamerayı
gezdirdiğinde bir bölgede sakin bir ekosistem, başkasında çatışma, başkasında
yeni bir koloni bulmalıdır. "Devasa" hissi kaplama alanından değil, bu
çeşitlilikten gelir.

## 3. Yaşam modeli

Zincir tek yönde büyür ve her basamak bir öncekinin ORTAYA ÇIKMIŞ hâlidir:

```
parçacık → küme → çekirdek adayı → çekirdek → zar → organizma
         → grup → koloni → faksiyon
```

**Küme ile çekirdek arasındaki ara basamak zorunludur.** Her yoğunlaşma bir
canlı değildir: birkaç adımda oluşup dağılan bir küme yalnızca çarpışmadır. Bu
basamak olmadan "parçacıklar birbirine değdi" ile "bir canlı doğdu" aynı olaya
dönüşür ve doğum sayacı gürültü sayar. Çekirdek adayı bir SÜREKLİLİK eşiğidir:
küme belli bir yoğunluğu belli bir süre korursa çekirdek olur.

Organizma önceden çizilmez; parçacıklardan **oluşur**. Zar görsel bir kabuk
değil, madde/enerji geçişini yöneten işlevsel bir sınırdır. Çekirdek zamanla
organizmanın karar merkezine dönüşür.

### Parçacık aptal kalır, organizma akıllı olur

Bu ayrım ürünün belkemiğidir. Referans görüntülerdeki güzellik AKILLI OLMAYAN
parçacıklardan gelir: morfoloji basit ve tutarlı fizikten doğar. Parçacığa akıl
koymak hem o güzelliği bozar hem ölçeği öldürür.

> Zarı oluşturan lipit düşünmez; hücre düşünür.

Bu nedenle akıl, tespit edilmiş bir kümeye — organizmaya — aittir. Bunun bedeli
açıktır ve kabul edilir: **küme kimliği ve kareler arası eşleştirme yazılmadan
"bölünme, füzyon, doğum, ölüm" gözlemlenebilir olgular hâline gelmez.** İlk
denemede organizma KAVRAMI hiç yoktu; ekranda kümeler vardı ama hiçbiri bir şey
değildi.

### Çekirdek emir vermez, öncelik yayar

Çekirdek "sağa git" demez. `survival +0.8`, `food +0.7`, `danger north +0.9`
gibi bir öncelik alanı yayar; alt birimler bunu kendi yerel kurallarıyla
uygular. Aynı mekanizma ölçek değiştirerek koloni ve faksiyon seviyesinde
tekrarlanır — merkezî durum, ast birimler.

### Tür matrisi YAZILMAZ, ARANIR

İlk denemenin temel hatası tür etkileşim matrisini elle yazmaktı. Zar-çekirdek
morfolojisi 6 türlü bir sistemde 36 boyutlu uzayda dar bir bölgedir; elle isabet
ettirme ihtimali yok denecek kadar azdır. Matris bir arama probleminin
çıktısıdır: deterministik tohumlarla taranır, ortaya çıkan yapı ölçülür, ilginç
olan saklanır.

Bu, "ilginç matris" için bir metrik gerektirir ve o metriği seçerken sorulacak
soru bellidir (bkz. §14, ders 3).

## 4. Akıl modeli

Davranış bir script değil, bir sonuçtur:

```
ihtiyaçlar + algı + hafıza + dünya → istenen yön → kuvvet → hız
```

Karar utility tabanlıdır: açlık, korku, merak, üreme, dinlenme gibi eğilimler
puanlanır ve en yüksek puan kazanır. LLM YOKTUR ve planlanmamaktadır; bu ölçekte
doğru araç değildir.

**Hareket kusursuz olmamalıdır.** A'dan B'ye düz giden bir canlı yapay görünür;
tereddüt, aşım, düzeltme, kaçınma ve sürüklenme "akıllı" hissini üretir. Ama
gürültü tek başına zekâ değildir — hedef yönü, atalet, gürültü ve hafızanın
birlikte çalışması gerekir.

### Organizma dünyayı GÖRMEZ, çevresini örnekler

Global bilgi zekâyı öldürür. Bir organizma bütün kaynak alanını okuyabiliyorsa
en iyi noktayı her zaman bulur; kararı hesaplama olur, davranış olmaz. Aynı
dünyada iki organizmanın FARKLI karar vermesi ancak girdileri farklıysa mümkün.

Bu yüzden algı bütçelidir: görüş yarıçapı, iz duyarlılığı, alan örnekleme
yarıçapı. Organizma dünya durumunu değil YEREL GÖZLEMİNİ alır. Aynı kısıt
performansı da korur — ama gerekçe performans değil, davranıştır.

### Hafıza kusurludur ve bir KAYNAKTIR

Her hatıra doğru olmak zorunda değildir: bir organizma tesadüfen orada bulunan
bir avcı yüzünden kuzeyi tehlikeli sanabilir. Yanlış öğrenme sistemi daha gerçek
gösterir.

Daha güçlüsü: hafıza ölümle KAYBOLUR. Tehlikeli bölgeyi bilen bütün bireyler
ölürse tür aynı hatayı tekrar yapar. Böylece bilgi biriktirilebilir ve
kaybedilebilir bir varlık hâline gelir.

### Korku bulaşır

Bir birey tehlikeyi algıladığında yakınına sinyal yayar ve yerel bir panik
dalgası oluşur. Aynı mekanizma tersine de çalışır: uzun süre avcı görülmeyen bir
bölgede korku düşer, keşif artar. Duygu bireyde kalmaz, toplumsal davranış
üretir.

## 5. Toplum, çatışma, evrim

Sınırlar çizilmez, **etki alanından türer**. İki faksiyonun etki alanı
kesiştiğinde sert bir poligon değil, dalgalanan bir geçiş bölgesi oluşur. Aynı
geometrik fikir üç ölçekte tekrarlanır: organizmada zar, kolonide sınır,
faksiyonda territory.

Fiziksel sınırdan önce **tanınan sınır** vardır: bir grup bir bölgeyi uzun süre
kullanıyorsa, ortada çizgi olmasa bile diğerleri orayı onun sayar.

Savaş bir boolean değil, bir durumun sonucudur. Kaynak azlığı + nüfus baskısı +
düşman yakınlığı öncelikleri değiştirir; saldırı o önceliklerden çıkar. Ve savaş
dünyada **iz bırakır**: bölge, çatışma bittikten sonra öncesiyle aynı değildir.

### Tehdit türetilir, yerleştirilmez

Tehdit tek bir "boss" değil, bir ailedir. Her biri farklı bir sistemi hedefler
ve bu yüzden dünyada farklı bir zincir açar:

| Tehdit              | Hedefi                 | Açtığı zincir                           |
| ------------------- | ---------------------- | --------------------------------------- |
| Parçacık avcısı     | Serbest parçacıklar    | Organizma oluşumunu yavaşlatır          |
| Çekirdek avcısı     | Organizmanın çekirdeği | Tek vuruşta kimlik kaybı; hafıza gider  |
| Parazit / virüs     | Zar                    | Enerji sızıntısı, konaktan konağa geçiş |
| Koloni kırıcı       | Territory yapıları     | Yerleşimi dağıtır, göç baskısı üretir   |
| Olgunlaşmış yırtıcı | Nüfus                  | Popülasyon kontrolü, domino çöküş       |

Olgunlaşma bir seviye çubuğu DEĞİLDİR: yaş, beslenme, genetik özellik ve
deneyimden çıkar. Daha büyük çekirdek, kalın zar, farklı hareket ve farklı renk
bu sürecin görünür sonucudur.

**Virüs özellikle görünmez olmalıdır.** Oyuncu önce enerjinin düştüğünü,
sağlığın gerilediğini görür; sebebi görmez. Gözlem moduna geçtiğinde enfeksiyon
izini bulur. Aynı şey yırtıcı için de geçerlidir: oyuncu yırtıcıyı görmeden
nüfus çöküşünü görür ve "burada ne oldu?" diye sorar. Bu, boss dövüşünden
ölçülebilir biçimde daha uygun bir gizemdir.

Evrim kalıtım, mutasyon ve seçilimden ibarettir. Renk de evrimleşir: tür rengi
nesiller boyunca kayabilir, böylece kullanıcı "bu türün rengi değişmiş"
diyebilir. Düşman TÜRETİLİR, spawn edilmez — kaynak kıtlığı, rekabet ve mutasyon
avcı morfolojisi üretir. Dünyanın düşman ürettiği bir sistem, düşman
yerleştirilen bir sistemden ölçülebilir biçimde daha ilginçtir.

## 6. Sunum

Normal durumda ekranın %90'ı dünyadır. UI olay güdümlüdür: sürekli açık bir
gösterge paneli sistemi "simulation dashboard"a çevirir. Bir şey olduğunda kısa
bir bildirim çıkar ve kaybolur; geçmiş ayrı bir panelden incelenir.

Üç görsel katman, alttan üste: çevre (alanlar), territory (sınırlar, etki),
yaşam (parçacıklar, organizmalar).

### İki ayrı akıl

Bu ayrım ürünün en özgün yanıdır ve korunmalıdır:

- **Dünya aklı** — canlıların ne yaptığı.
- **Sunum aklı** — oyuncuya neyin gösterileceği.

Sistem eşzamanlı olayları ilginçlik açısından puanlar (yenilik, süre, nüfus
etkisi, nadirlik, coğrafi yayılım) ve kamerayı ilginç olana götürebilir.

**İlginçlik tek bir skalara indirilmez.** Bileşenler ayrı ölçülür, ağırlıkları
`config/` altında veri olarak durur. Tek sayıya indirmek, iptal edilen
denemedeki `maxCellOccupancy` hatasının aynısıdır (§14, ders 3): ölçtüğünü
sandığın şeyi ölçmeyen bir metrik, yanlış sonucu ikna edici biçimde üretir.
"İlk kez olan" olaylar (ilk organizma, ilk bölünme, ilk avlanma, ilk koloni)
ayrıca işaretlenir — nadirlik en güçlü ilginçlik bileşenidir. Üç mod
yeter: `Observe` (sistem önerir), `Follow` (oyuncu seçer), `Free` (oyuncu
gezer). Oyuncu kameraya asla zorla kilitlenmez.

### Renk durumu anlatır

Renk paleti UI paletinden AYRIDIR. `VOL_COLORS` bir ürün arayüzü paletidir
(`uiBg`, `brand`, `accent`, `success`…) ve dünya renklerine karıştırılmaz. Dünya
rengi dört katmandan çıkar: tür rengi, enerji modülasyonu, durum modülasyonu,
çevre etkileşimi. Aynı organizmada zar, çekirdek ve iç parçacıklar farklı rol ve
farklı renk taşır — okunabilirliği bu sağlar.

### CORE UI'dan ne alınır — bileşen eşlemesi

Hiçbir UI bileşeni sıfırdan yazılmaz. Envanter bu turda dosya dosya doğrulandı;
VOL.LIFE'ın ihtiyacı olan her yüzeyin karşılığı zaten CORE'da duruyor:

| İhtiyaç                          | CORE bileşeni                                          |
| -------------------------------- | ------------------------------------------------------ |
| Seçilen organizmanın künyesi     | `ui/hud/SelectionInfoPanel`                            |
| Dünya/yaşam/çatışma sayaçları    | `ui/hud/StatsPanel` (grup + girdi, kural taşımaz)      |
| Dünya haritası, işaretler        | `ui/hud/MinimapPanel` (world boyutu, marker, viewport) |
| Olay geçmişi                     | `ui/data/EventLog`                                     |
| Zaman hızı (0.5× / 1× / 2× / 4×) | `ui/primitives/SegmentedControl`                       |
| Müdahale menüsü                  | `ui/overlays/CommandPalette`                           |
| Anlık olay bildirimi             | `ui/overlays/Toast`                                    |
| Panel, sekme, kaydırma           | `ui/layout/Panel`, `Tabs`, `ScrollView`                |

`StatsPanel` ve `SelectionInfoPanel` bilinçli olarak generic tutulmuştur: etiket
ve değer gruplarını çizerler, oyun kuralını çağırandan alırlar. VOL.LIFE'ın
domain'i CORE'a bu yüzden sızmaz.

### Gizli kalan kurallar

Oyuncuya bütün kurallar anlatılmaz. `aggression = 0.73` görünebilir; ama
"saldırganlık kaynak yoksunluğundan sonra yükselir" gösterilmez. Oyuncu bunu
gözlemleyerek keşfeder. Ürün bir yapılandırma aracı değil, bir gizem olmalıdır.

## 7. Kalıcılık: kayıt, anlık görüntü, tekrar

Sıfırdan başlanmaz ama tek bir sisteme de yığılmaz. **Kalıcılık iki seviyelidir
ve bu ayrım pazarlıksızdır.**

### Küçük durum → CORE `SaveManager`

Ayarlar, dil, kalite kademesi, son kamera konumu, tercih edilen görünüm modu.
`SaveManager` adaptör tabanlıdır (`IStorageAdapter`): web'de
`LocalStorageAdapter`, masaüstü/Android'de `tauri-v2`nin `TauriStoreAdapter`ı.
Bu katman için yazılacak yeni kod yoktur.

### Dünya → VOL.LIFE'ın kendi formatı

Dünya `SaveManager`a KONULMAZ; kendi `WorldSnapshot` sözleşmesini taşır.

**Ama format ilk turda BİNARY'ye kilitlenmez.** Yüz parçacıkta JSON fazlasıyla
yeterlidir ve okunabilir olması geliştirme sırasında ölçülemeyecek kadar
değerlidir: bozuk bir dünyayı gözle incelemek, hex dökümü okumaktan başka bir
iştir. Kilitlenecek olan format değil ARAYÜZDÜR — `WorldSnapshot` bir seri
hâle getirici arkasında durur; JSON bugünkü uygulamasıdır, binary ölçüm
gerektirdiğinde ikinci uygulama olur.

Ölçüm sırası nüfusla gelir: 100'de JSON, 5.000/50.000'de ÖLÇ, 100.000'de
binary'yi tartış. İlk kilometre taşında binary serializer yazmak, henüz var
olmayan bir problemi çözmektir.

Dünya anlık görüntüsü şunları taşır: tohum, tick sayısı, **RNG durumu**, tür
tanımları, parçacık dizileri (SoA), alan ızgaraları, organizma kayıtları,
territory durumu.

RNG durumunun kayda girmesi bir detay değil, bu tasarımın koşuludur: CORE'un
`createRandom`ı durumu closure'da tutar ve okutmaz. `runtime/sim/rng.ts` tam bu
yüzden vardır (§11).

### Kayıt ile tekrar AYNI ŞEY DEĞİLDİR

|            | Ne saklar                           | Neye cevap verir                 |
| ---------- | ----------------------------------- | -------------------------------- |
| **Kayıt**  | Anlık görüntü                       | "Bu dünyanın ŞU ANKİ hâlini aç." |
| **Tekrar** | Tohum + komut günlüğü + tick sayısı | "Bu dünya BU HÂLE nasıl geldi?"  |

Tekrarın anlık görüntüye ihtiyacı yoktur; deterministik çekirdek aynı tohum ve
aynı komut dizisinden aynı dünyayı yeniden üretir. Bu ayrım korunursa
"deney" kavramı bedavaya gelir: aynı dünya, farklı müdahale, karşılaştırılabilir
sonuç.

Ve bu, ürünün en özgün konumlandırmasını mümkün kılar — VOL.LIFE bir simülasyon
oyunundan çok bir **yapay yaşam laboratuvarıdır**: kullanıcı bir deneyi
kaydeder, müdahalesini değiştirir, tekrar koşar.

### Tarih ayrı bir yapı değildir

Dünyaya `history` alanı eklenmez. Doğum, ölüm, bölünme, füzyon, göç, çatışma,
yerleşim, mutasyon, tükeniş gibi olaylar bir günlüğe yazılır. Anlık görüntü +
olay günlüğü birlikte dünyanın geçmişini verir ve aynı günlük tekrar sisteminin
girdisidir. Önemli organizmalar için bu günlükten bir **biyografi** ve türler
için bir **soy ağacı** türetilebilir; her bireyin geçmişini tutmak gerekmez.

## 8. Test doktrini

Bu projede "fonksiyon X döndürür" testi yetmez. Sistem stokastiktir ve değeri
tam olarak öngörülemeyen davranışındadır; test edilecek şey bu yüzden **değer
değil sözleşmedir**.

### Dört test sınıfı

**1. Determinizm.** Aynı tohum + aynı komut dizisi + aynı tick sayısı → bit-bit
aynı SoA dizileri ve alanlar. `snapshot()`/`restore()` ile aradan devam da aynı
sonucu vermelidir. Bu sınıf kesin eşitlik iddia eder ve etmelidir.

**2. Geometrik değişmezler (morfoloji).** Bir organizma oluştuysa: çekirdek
vardır, zar çekirdeği ÇEVRELER, zar çekirdeğin içinden geçmez. Bölünmeden sonra
bir organizma yerine iki kararlı organizma vardır. Bunlar sayısal değil yapısal
iddialardır ve gözle görülen hatayı yakalayan tek test sınıfıdır.

**3. Davranış sözleşmesi.** "Kuzeyde kaynak, güneyde tehlike" kurulduğunda
organizma kuzeyi tercih etmelidir; tehlike kuzeye taşındığında rota
değişmelidir. Test yönü değil TERCİHİ ölçer.

**4. İstatistiksel zarf.** "Her zaman savaş çıkar" yanlış bir iddiadır. Doğru
olan: yüksek düşmanlık + kıt kaynak koşulunda çatışma olasılığı taban koşulun
ÜSTÜNDE olmalıdır. Aynı şekilde evrim testi "100. nesilde hız tam 1,7423 olur"
demez; seçilim baskısı altında özellik medyanının beklenen YÖNDE kaydığını
ölçer.

### Dört seviye ve nerede biterler

| Seviye      | Neyi sınar                     | Örnek                              |
| ----------- | ------------------------------ | ---------------------------------- |
| Birim       | Tek algoritma                  | Küme mesafesi hesabı               |
| Entegrasyon | Sistemlerin birlikte çalışması | Küme → organizma geçişi            |
| Senaryo     | Tohum + dünya + N tick         | 100 parçacık → organizma → bölünme |
| Gözlem      | Gerçek tarayıcı/cihaz          | Bölünme EKRANDA görünüyor          |

İlk üçü yeşilken dördüncüsü kırmızı olabilir; iptal edilen denemede tam olarak
bu oldu. Gözlem seviyesi otomatikleştirilemediği yerde elle yapılır ama
ATLANMAZ.

### İstatistik testleri tekrar üretilebilir olmalı

"1000 tohumla çatışma oranı" ölçmek doğrudur ama her koşuda 1000 tohum üretmek
pahalıdır ve sonucu koşudan koşuya oynatır. Tohumlar bir KORPUS olarak saklanır
(sürümlenmiş bir veri dosyası); test o korpusu okur. Böylece istatistiksel iddia
hem ucuzlar hem tekrarlanabilir olur, ve korpus büyüdüğünde bu bilinçli bir
karar hâline gelir.

### Yasak test biçimi

`different seed → kesinlikle farklı sonuç` yazılmaz. Bu determinizme aykırı
değil, ondan bağımsız bir iddiadır ve rastgele düşer.

### Ölçüm ikiye ayrılır

**Kernel benchmark** (izole): parçacık etkileşimi, ızgara, alan difüzyonu.
**Ürün benchmark** (bileşik): tam `World.step` + render senkronu + kamera + UI.

Bu ayrım iptal edilen denemenin en pahalı dersinden geliyor: izole kernel güzel
ölçülürken ürün davranışı görülmedi. İkisi arasındaki fark ölçüldüğünde büyüktü
ve bileşik ölçüm daima daha pahalıdır.

### Üçüncü eksen: emergence kalitesi

Doğruluk ve performans ölçülüyor; **ilginçlik ölçülmüyor.** Ölçülebilir
göstergeler var: organizma sayısı, doğum/ölüm/bölünme oranı, tür çeşitliliği,
çatışma oranı, göç oranı, kaynak kullanımı, popülasyon entropisi.

Bunlar "yüksek daha iyi" diye kullanılmaz. Amaç tek bir sıkıcı dengeye
çökülmediğini görmektir: `organismCount = 0` kötüdür, `organismCount = 100000`
otomatik olarak iyi değildir. Bu tarz sistemlerin en büyük riski başlangıçtaki
hareketin bir süre sonra tekdüze bir dengeye oturmasıdır ve bu ancak uzun koşulu
bir metrikle görülür.

**Metrik seçerken sorulacak soru sabittir:** _bu metrik gerçekten görmek
istediğim şeyi mi ölçüyor?_ İptal edilen denemede `maxCellOccupancy` yapının
varlığını ölçmüyordu ve ondan çıkarılan morfoloji sonucunu görüntü çürüttü
(§14, ders 3).

### Ölçekleme kapısı

Mutlak süre kapı olamaz — donanıma bağlıdır. Ama girdi dört katına çıktığında
sürenin kaç katına çıktığı makineden bağımsızdır ve `O(n²)` sızmasını yakalar.
Repo bu kapıya sahiptir (`scripts/quality/scalingBudget.mjs`) ve kapı geneldir:
bütçe yazan paket ölçüm tarifini `quality.json` → `scaling.<paket>.$measure`
altına yazar. VOL.LIFE'ın bütçesi benchmark betiğiyle birlikte gelir (§17).

## 9. Android

Android sona bırakılmaz ama şimdi de kurulmaz.

Şikâyet yerindedir: cihaz genellikle bağlıdır ve atlanır. Kural bu yüzden
açıktır: **VOL.LIFE masaüstü-önce geliştirilir, ama Android bir smoke hedefi
olarak ilk gerçek dilimden itibaren listede kalır.**

Bilinen ve doğrulanmış olan: `pnpm benchmark:device`
(`scripts/device-benchmark.mjs`) bağlı cihazda soğuk açılış, fps, bellek ve
WebGL geri düşüşünü ölçer. Betiğin kendi sözleşmesi bunu açıkça söylüyor:
**kapı DEĞİLDİR ve olamaz** — bir kapının koşulu geliştiricinin masasındaki
donanım olamaz. Çıktısı bir referanstır; bir sonraki ölçüm onunla kıyaslanır.
Betik uygulama listesini elle tutar; `deviceApps` bekçisi listeyi her oyunun
`tauri.conf.json` kimliğiyle karşılaştırır ve VOL.LIFE listededir.

`games/vol-arachnid` Tauri Android hattının emsalidir. VOL.LIFE'ın kabuğu da
kuruludur (`src-tauri`, `com.volstudio.life`) ve Android drift testi taşır.

**Kalite düşer, kural düşmez.** Android'de görsel ayrıntı, parçacık LOD'u ve
efekt yoğunluğu azalabilir; ama dünya kuralları, olaylar ve organizmalar aynı
kalır. Bu, "kamera fiziği değiştirmemeli" kuralının (§14, ders 2) cihaz
düzlemindeki karşılığıdır.

Ölçülmemiş ve ölçülene kadar varsayım olarak kalacak olan: Android tek çekirdek
başarımının masaüstünden ~3–5× düşük olduğu. Bu sayı bir tahmindir ve plan
üzerine kurulmaz.

## 10. FpsMeter — CORE'a eklendi, tek koşulla

Soruya cevap: **evet, eklendi.** Ama `Diagnostics`in içine değil.

`Diagnostics` zaten FPS hesaplıyor (`SAMPLE_WINDOW = 60`) ve yanında kare
min/max/ortalama, render/update süreleri, sayaçlar ve renderer bilgisini
taşıyor. İstenen bu değil: ekranda duran, yalnız FPS gösteren, ürünün kendi
tipografisini kullanan küçük bir HUD göstergesi.

Sözleşme küçüktür ve küçük kalmalıdır:

- Konum dört köşeden biri; **tek instance** varsayımıyla tasarlanır. Dört köşeye
  dört metre koymak teşvik edilmez.
- Yalnız FPS yazar. `render: 2.31ms`, `entities: 1200` yazmaz — o `Diagnostics`.
- `Jura` + tabular rakamlar. Sayı zıplamadan güncellenir.
- Renk eşiği semantik paletten gelir (normal / uyarı / tehlike), neon değil.
- Konumlandırma `--vol-safe-*` token'larını kullanır; çentikli ekranda köşeye
  yapışmaz.

**Tek pazarlıksız koşul:** ölçümü `Diagnostics` ile PAYLAŞMALIDIR. İki ayrı FPS
algoritması aynı anda 58 ve 60 gösterir ve hangisinin doğru olduğu sorusu
cevapsız kalır. Çözüm ortak bir kare örnekleyicisidir (`time/FrameRateSampler`,
yüzeye çıkmaz); `Diagnostics` ona bağlandı ve kendi kayan-pencere kopyasından
58 satır silindi.

**Ölçülen iki tuzak:**

- Gösterge sağa sabitlidir ve kutusu her okumada yeniden boyutlanırsa karşı
  kenarı oynar; gözle "gösterge yer değiştirdi" diye okunur. `tabular-nums` tek
  başına yetmedi — VOL fontları tabular rakam varyantı taşımaz ve aynı basamak
  sayısındaki iki değer bile farklı genişlik üretiyordu (1214/1211/1208 px).
  Genişlik `9ch`te sabitlendi: 1'den 999'a kadar her okuma 63 px.
- Sıfır bir ölçüm DEĞİLDİR. Görsel regresyon koşusu saati dondurur ve bütün
  kare aralıkları sıfır olur; gösterge orada kırmızı "0 FPS" yazsaydı showcase
  temeli kalıcı olarak bozuk görünürdü. Ölçüm gelmeden gösterge tire yazar ve
  nötr kalır.

Bileşen `devtools/vol-ui` HUD sekmesinde canlı ölçümle sergilenir. CORE'un
public yüzey sayısı 223 → 224 oldu (`FpsMeter`; örnekleyici içeride kaldı).

## 11. Ölçülmüş mimari sınırlar

Bu bölümdeki her satır bu turda kurulu kaynaktan doğrulandı.

### Phaser 4.2.1 — GPU compute YOKTUR

`WebGLRenderer.js:709` yalnız `canvas.getContext('webgl', …)` ve
`'experimental-webgl'` dener; **`'webgl2'` hiç denenmez.** Instancing bir
uzantıdan gelir: `WebGLRenderer.js:904` `drawArraysInstancedANGLE`'ı bağlar.
Repo genelinde `webgpu` / `WGSL` / `GPUDevice` / `navigator.gpu` için **sıfır**
eşleşme vardır.

**Sonuç: simülasyon CPU'da koşar.** WebGPU compute içeren bir plan yazmak, var
olmayan bir yetenek üzerine bina kurmaktır.

### Tek geçerli yoğun render yolu: `SpriteGPULayer`

`src/gameobjects/spritegpulayer/` altında yaşar ve tek instanced draw call ile
çizer. `getDataByteSize()` üye adımını (`instanceBufferLayout.layout.stride`)
verir; doğrudan tampon yazımı DESTEKLENEN bir kullanımdır.

Alternatifler (`Blitter`, `ParticleEmitter`, `Mesh`, `Rope`) `BatchHandlerQuad`
üzerinden batch başına 16384 quad ve kare başına obje başına JS döngüsü demektir;
bu ölçekte değerlendirmeye değmez.

Ham yazımda kullanılacak ease **kurulumda bir kez** açılmalıdır
(`setAnimationEnabled('Linear', true)`) — o çağrı shader'ı yeniden derler.
`EasingEncoding.Linear` **1**'dir, sıfır değil.

### Repoda paralellik altyapısı YOKTUR

`new Worker`, `OffscreenCanvas`, `SharedArrayBuffer` için repo genelinde sıfır
eşleşme vardır. İlk denemede Web Worker seçeneği hiç masaya konmadı ve bu bir
eksikliktir: SoA veri paylaşılabilir bellekte durur, ızgara zaten bölgelere
ayrıktır, kuvvet hesabı paralelleştirilebilir. **Worker havuzu değerlendirilmemiş
bir yoldur** ve ölçek sorusu ona bakılmadan kapatılmamalıdır.

### Paralellikten ÖNCE: güncelleme frekansı bütçesi

Her sistemin 60 Hz koşması bir varsayımdır, gereklilik değil. Organizma hareketi
60 Hz ister; besin difüzyonu istemez, territory hiç istemez, evrim saniyede bir
bile fazladır.

| Sistem                | Makul tempo |
| --------------------- | ----------- |
| Hareket / entegrasyon | 60 Hz       |
| Kuvvetler             | 30 Hz       |
| Algı ve karar         | 15 Hz       |
| Alan difüzyonu        | 10 Hz       |
| Territory / grup      | 5 Hz        |
| Evrim                 | 1 Hz        |
| Tarih                 | olay bazlı  |

**Bu, yasaklanan kamera-LOD'u DEĞİLDİR** (§14, ders 2) ve karıştırılmamalıdır.
Orada yasak olan şey kuralın bakış açısına göre değişmesiydi: yakındaki ajan
başka fizik, uzaktaki başka fizik. Burada kural her yerde AYNIDIR; değişen tek
şey aynı kuralın ne sıklıkla yeniden değerlendirildiğidir ve bu dünyanın her
noktasında eşittir.

Bu bütçeleme Web Worker'dan önce denenir: tempo ayarlamak paralellik eklemekten
hem ucuz hem geri alınabilirdir. İptal edilen denemede bütün alanlar aynı
kademeli döngüye bağlıydı ve bu açık borç olarak kayda geçmişti.

### CORE — ne alınır

`math/interpolation` (`damp` kare hızından bağımsızdır), `math/numeric`,
`math/geometry`'nin skaler yarısı, `collections/MinHeap`, `grid/FlowField`
(`Float64Array`/`Int32Array` üzerinde çalışır), `time/SimulationClock`,
`benchmark/harness`, `quality/GraphicsQuality`, `ui/*`, `systems/SaveManager`,
`fonts`, `debug/Diagnostics`.

`SimulationClock` kullanılırken `partialStep: 'defer'` AÇIKÇA verilmelidir.
Varsayılan `'simulate'`tir ve artık dilimi değişken bir adım olarak koşar; bu
determinizmi kare hızına bağlar.

### CORE — ne alınmaz ve neden

| Primitif       | Neden uyumsuz                                                                |
| -------------- | ---------------------------------------------------------------------------- |
| `SpatialIndex` | Doğrudan sayısal handle API'si yoktur; SoA için nesne/getter wrapper gerekir |
| `random.ts`    | Durum closure'da; `getState`/`setState` yok                                  |
| `StateMachine` | Hook'lar context almaz → ajan başına closure                                 |
| `ObjectPool`   | acquire/release başına hash işlemi                                           |
| `entities/`    | Varlık başına Phaser nesnesi; ECS yok                                        |
| `collections/` | SoA/TypedArray koleksiyon yok                                                |

Bunlar CORE'un kusuru değildir: hepsi birkaç yüz varlıklı, nesne tabanlı bir
oyun için doğru tasarlanmıştır. VOL.LIFE'ın veri modeli farklıdır, o kadar.

`random.ts` yerine `runtime/sim/rng.ts` yazıldı: **aynı mulberry32 dizisi**,
durumu okunabilir bir yüzeyle. Dizinin CORE'unkiyle aynı kaldığı testle
kilitlenir — ayrışırlarsa aynı tohum iki farklı dünya verirdi.

### CORE export'unda eksik alt yol

`core/package.json` şu alt yolları açar: `./math/interpolation`, `./pool`,
`./rig/metadata`, `./ui`, `./ui/styles.css`, `./lifecycle`, `./i18n`, `./fonts`,
`./audio/music`, `./benchmark`, `./random`, `./spatial`, `./quality`, `./stats`.

`./time` bu turda AÇILDI: kök barrel Phaser'a bağlı modülleri yeniden ihraç
ettiği için, headless bir çekirdeğin `SimulationClock`u oradan alması
Phaser'sızlık sözleşmesini transitif olarak kırıyordu. `time/index.ts`in Phaser
taşımadığı `core/tests/governance/toolSubpaths.test.ts` ile kapılıdır.

## 12. Klasörleme

Repo konvansiyonu `app` / `config` / `runtime` / `i18n`'dir (bkz. `vol-hell`,
`vol-arachnid`). VOL.LIFE bunu izler; ayrı bir hiyerarşi icat etmez.

```
games/vol-life/
├── src/
│   ├── app/          bootstrap
│   ├── config/       dünya ve grafik ölçüleri — VERİ (AGENTS Kural 5)
│   ├── i18n/         tr.json + en.json
│   └── runtime/
│       ├── sim/      simülasyon — Phaser'ı İMPORT ETMEZ
│       ├── render/   Phaser bağlama (henüz yok)
│       ├── scene/    LifeScene — yalnız bağlama
│       └── ui/       HUD (henüz yok)
└── tests/            src ağacını AYNALAR
```

`render/` ve `ui/` **bilinçli olarak açılmadı**: bir klasör ancak gerçekten
anlamlı bir dosya ailesi geldiğinde açılır. Boş dizin bırakmak ölü yapıdır.

Tek kural pazarlıksızdır: **`runtime/sim/` Phaser'ı import etmez.** Mantık
sahnede biriktiğinde headless ölçüm ve kapsam ikisi birden imkânsız hâle gelir.
İlk denemede kapsam eşiği mantığı sahneden iki kez çıkmaya zorladı ve her
ikisinde de sonuç daha iyi mimari oldu.

## 13. İnşa sırası

Sıra bir tercih değil, iptal edilen denemenin doğrudan tersidir: orada üç faz
altyapı kuruldu ve ekranda hâlâ içerik yoktu. Kural şudur — **önce anlam, sonra
ölçek** ve **her adımın sonunda gerçek tarayıcıda görüntü.**

| #   | Adım                                                                 | Bittiğinde ekranda ne var         |
| --- | -------------------------------------------------------------------- | --------------------------------- |
| 0   | **Zemin** — paket, kapılar, config, deterministik RNG                | Boş tuval; kablolar kanıtlı       |
| 1   | **Dünya substratı** — alanlar, difüzyon, örnekleme, kaynak tohumlama | Yavaşça değişen alan görüntüsü    |
| 2   | **Parçacık yaşamı** — SoA depo, uzamsal hash, çift yönlü kuvvet      | 100 parçacık, kümelenme           |
| 3   | **Matris araması** — ilginç etkileşim matrislerini ARA, elle yazma   | Zar-çekirdek benzeri kararlı yapı |
| 4   | **Organizma kimliği** — küme tespiti, kareler arası eşleştirme       | Takip edilebilen BİR organizma    |
| 5   | **Yaşam döngüsü** — enerji, tüketim, büyüme, bölünme, ölüm           | Doğum ve bölünme İZLENEBİLİR      |
| 6   | **Akıl** — algı, ihtiyaç, utility karar, hafıza                      | "Bu niye oraya gitti?" sorusu     |
| 7   | **Sunum** — seçim paneli, olay bildirimi, gözlem modları             | Oyuncu keşfedebiliyor             |
| 8   | **Kalıcılık** — anlık görüntü, olay günlüğü, tekrar                  | Deney tekrarlanabiliyor           |
| 9   | **Toplum ve tehdit** — grup, territory, yırtıcı, çatışma             | Dünyada hikâye çıkıyor            |
| 10  | **Evrim** — kalıtım, mutasyon, seçilim                               | Tür zamanla değişiyor             |
| 11  | **Ölçek** — nüfusu §1'in izin verdiği tavana kadar aç                | Aynı dünya, daha kalabalık        |

Adım 0 tamamlandı (§16). **Adım 3 bir karar noktasıdır:** matris araması bir
tarama altyapısı ve "ilginç"in bir metriği demektir; §8'deki metrik sorusu orada
cevaplanmalıdır.

Ölçek EN SONA bırakılır. Nüfusu erken açmak, iptal edilen denemede ekranı halıya
çevirip birey algısını yok etti; ölçek bir sonuçtur (§1).

## 14. Önceki denemenin dersleri

İptal edilen deneme üç faz altyapı kurdu ve ekranda hâlâ içerik yoktu. En pahalı
dersler:

1. **Çalışan uygulamaya bakılmadı.** Ölçülebilen her şey cilalandı, yalnız
   BAKILARAK anlaşılan şey ihmal edildi. Parçacıkların 32 kat büyük çizildiği
   hata on saniyede görülebilirdi. **Her fazın sonunda gerçek tarayıcıda
   görüntü.**
2. **Fizik bakış açısına bağlanmamalı.** "Kameraya yakın ajanlar çift-yönlü
   kuvvet, uzaktakiler alan gradyanı" tasarımı dünyanın kuralını kameraya
   bağladı ve ekranda sert bir dikdörtgen olarak göründü. Kamera DETAY
   SEVİYESİNİ belirleyebilir, FİZİĞİ belirleyemez.
3. **Metrik gerçekten görmek isteneni ölçmeli.** `maxCellOccupancy` yapının
   varlığını ölçmüyordu; ondan çıkarılan "kazanç 64+ yapıyı yok eder" sonucunu
   görüntü çürüttü. Skaler bir metrikten morfoloji sonucu çıkarmak hataydı.
4. **Tür matrisi elle yazıldı** (bkz. §3).
5. **Kaynak alanını hiçbir tür yazmıyordu** ama üç tür onu takip ediyordu;
   nüfusun yarısı sıfır gradyan izliyordu. Kaynak dünyanın VERİSİDİR ve açılışta
   tohumlanmalıdır.
6. **Alan kuvvetleri morfolojiyi bozabilir.** Referans morfolojiler saf
   çift-yönlü kuvvetten gelir; büyük ölçekli sürükleme zar gibi hassas yapıları
   dağıtır. Ekoloji, morfoloji oturduktan SONRA açılmalıdır.
7. **Yoğunluk hedefe ters çalıştı** (bkz. §1).
8. **`maxStepsPerFrame` ölüm sarmalı üretir.** 5'te kare bütçesi aşıldıkça saat
   daha çok telafi adımı istiyor, o da kareyi uzatıyordu. `config/world.ts`
   bunu 2'de tutar ve bir test sayıyı kilitler.
9. **CSS import edilmemişti.** CORE teması yüklenmediği için tüm `--vol-*`
   token'ları tanımsızdı; bileşenler stilsiz düz elemanlara düşüyordu. Fontlar
   `createVolGame` tarafından yükleniyor ama token olmadığı için
   uygulanmıyordu. `src/styles.css` bu içe aktarımı gerekçesiyle taşır.
10. **Port çakışması `pnpm high`'ı düşürür.** 5181 `devtools/vol-ui`'nin e2e
    varsayılanıdır. VOL.LIFE önizlemesi 5182'dedir. Portlar elle tutulur ve
    tekillikleri hiçbir kapıda sınanmaz.

Bu turda 9 ve 10 kuruluşta uygulandı; 1–8 tasarım kararı olarak yukarıya
işlendi.

## 15. Açıkça kapsam DIŞI

- **Çalışma zamanı müzik/ses sentezi.** `devtools/audio-synth` bir devtool'dur;
  `node:fs` ve FFmpeg kullanır, WebAudio kullanmaz ve tarayıcıda koşmaz. AGENTS
  Kural 4 zaten bir oyunun çalışma zamanının devtool import etmesini yasaklar.
  `core/docs/music-engine.md` kararı açıkça yazar: **"Runtime'da sentez
  YAPILMAZ."** Motor yalnız önceden üretilmiş stem'leri çalar. Dünyanın kendi
  müziğini ürettiği bir tasarım bu repoda mümkün değildir ve planlanmaz.
- **WebGPU / compute shader.** Phaser 4.2.1 WebGL 1 kullanır (§11).
- **LLM ajanlar.** Bu ölçekte doğru araç değil.
- **Ekonomi, yönetim, dil, din, teknoloji ağacı.** Toplum katmanı grup,
  territory, yerleşim ve çatışma seviyesinde tutulur.
- **Gerçek akışkan dinamiği, hücre kimyası, insan seviyesi medeniyet.**

## 16. Bugünkü durum

Bu turda kurulan şey bir simülasyon değil, **kapılardan geçen bir zemindir**:

- `pnpm quick` yeşil; `workspace-contract` 10 paketi görüyor ve katman sınırları
  temiz.
- 21 test geçiyor. Kapsam 100/100/100/100 ölçüldü, eşikler ratchet gereği
  98/98/98/98'e kilitlendi.
- `build` geçiyor; ölçülen gzip **app 18,4 KB / vendor 345,1 KB / css 16,8 KB**,
  bütçe 40/360/24.
- Dünya ölçüleri `config/world.ts` içinde VERİ olarak durur.
- Deterministik ve durumu okunabilir RNG (`runtime/sim/rng.ts`) yazıldı ve CORE
  dizisiyle parite testine bağlandı.

Kabuk bu turda genişledi: marka şeridi, tam ekran (F11 + düğme), Android geri
tuşu + çıkış onayı, kare hızı göstergesi ve Tauri/Android kabuğu
(`com.volstudio.life`). Cihazda doğrulandı (SM-G990B2): tam ekran açılıyor,
konsol hatası yok.

Simülasyonun kendisi — alanlar, kuvvetler, ızgara, organizma tespiti —
KASITLI OLARAK yazılmadı. §3'teki "matris aranır" ve §1'deki yoğunluk kararı
onaylanmadan yazılan her satır, ilk denemenin hatasını tekrarlama riski taşır.

## 17. Açık borçlar

- Ölçekleme bütçesi yoktur: kapı genelleştirildi ama VOL.LIFE'ın benchmark
  betiği henüz yazılmadı (Adım 2).
- E2E yoktur. `justfile`daki `e2e` tarifi paket listesini ELLE tutar; VOL.LIFE
  `test:e2e` tanımlarsa tarife de eklenmelidir.
- Android tek çekirdek başarımının masaüstünden ~3–5× düşük olduğu varsayımı
  ÖLÇÜLMEMİŞTİR.
- Gerçek GPU'da fps hiç ölçülmedi. Headless Chromium yazılım rasterizer
  kullanır; oradaki sayı donanım hakkında hiçbir şey söylemez.
- Gerçek GPU'da uzun süreli fps profili çıkarılmadı; ölçülen tek şey boş
  sahnenin kare aralığıdır (masaüstü 143,88 Hz ekranda 7,07 ms ortalama,
  5,5–13,9 ms uç değerler).
