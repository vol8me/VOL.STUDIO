# VOL.LIFE — tasarım notları

Bu belge [README](README.md)'de yeri olmayan ürün ve mimari kararlarını taşır.
README paketin ne olduğunu ve nasıl çalıştırılacağını, burası NEDEN böyle
olduğunu anlatır. Açık uygulama işleri [TODO.md](TODO.md)'dedir.

Belge 2026-09-14'te **Particle Substrate v2 / Morphology Discovery v2** kararıyla
yenilendi. Bu bir parametre ayarı değildir: 100 parçacıklı triangular fizik,
dikdörtgen çarpışma duvarı ve onu arayan v3 hattı negatif deney olarak
sonuçlanmıştır. Çalışan genel altyapı korunur; başarısız fizik ailesi yeni
tasarımın sözleşmesi değildir.

Bu belgede üç ayrı statü vardır ve birbirine karıştırılmaz:

- **Kilit karar:** uygulanacak ürün/mimari sözleşmesidir; değişirse belge ve
  TODO birlikte değişir.
- **Koşullu araştırma yolu:** ölçülecek alternatiftir; ölçülmeden üretim kararı
  sayılmaz.
- **Reddedilen yol:** neden terk edildiği korunur; sonraki tur aynı çıkmazı
  yeniden icat etmez.

| Konu                                  | Statü                | Sonuç                                                       |
| ------------------------------------- | -------------------- | ----------------------------------------------------------- |
| 512 başlangıç aktif maddesi           | Kilit karar          | Adım 2–3 araştırma rejimi; ebedî ölçek hedefi değil         |
| Organik `HabitatSDF` + Void           | Kilit karar          | Dikdörtgen fizik duvarının yerini alır                      |
| Multi-band yönlü pair profile         | Kilit karar          | V2'nin ilk üretim kernel ailesidir                          |
| Alternatif active-particle kernel     | Koşullu araştırma    | Ana aile faz çeşitliliği üretemezse aynı harness'te sınanır |
| 10–30 dakikadan uzun canary           | Koşullu araştırma    | Ancak ölçülen geç çöküş bunu gerektirirse açılır            |
| 100 parçacık, triangular wall physics | Reddedilen ürün yolu | Yalnız yeniden üretilebilir negatif kontrol olabilir        |
| Qualified olmayan catalog preview     | Reddedilen ürün yolu | Development audition açık provenance ister                  |
| 24 saatlik testi ilk kabul yapmak     | Reddedilen yol       | Ucuz filtre ve insan ön-elemesinden önce CPU tüketir        |

## 1. Ürün kararı

VOL.LIFE oynanan bir simülasyon oyunu değil, **izlenen bir dünyadır**.

Oyuncunun ana fiili bakmak, yaklaşmak, takip etmek ve merak etmektir. Müdahale
vardır ama oyuncu tanrı değil bozucudur: koşulu değiştirir, sonucu sistem
üretir. “Şu canlı oraya gitsin” komut değildir; “burada kaynak var” bir
müdahaledir ve sonucu garanti edilmez.

Ürün üç ilişkiyi korur:

- **Gözlem:** dünya kendi akar, oyuncu bakar.
- **Deney:** oyuncu koşulu değiştirir ve sonucu karşılaştırır.
- **Tekrar:** dünya geçmişi deterministik çekirdekten yeniden oynatılır.

Bunlar ileride üç ayrı kullanıcı kipine dönüşebilir ama bugünden ayrı UI
ekranı dayatmaz:

- `Observe`: sunum aklı ilginç olay önerir; kullanıcı öneriyi reddedebilir.
- `Follow`: kullanıcı bir organizmayı/koloniyi seçer, kamera onu izler.
- `Free`: kamera bütünüyle kullanıcıdadır.

Oyuncu hiçbir kipte kameraya zorla kilitlenmez. Kip, fiziği veya simülasyon
temposunu değiştiremez.

Canlı dünya gerçek hızında akar. Durdurma, yavaşlatma ve hızlandırma yalnız
Tekrar kipindedir. Uzun deneyler canlı dünya hızlandırılarak değil, aynı tohum
ve komutlarla ekransız çalıştırılıp tekrar olarak izlenerek yapılır.

### Başarı ölçütü zincir uzunluğudur

Özellik sayısı değil, tek olaydan çıkan anlamlı sonuç sayısı ölçülür:

> kaynak patlaması → nüfus akını → rekabet → avcı gelişi → tükenme → göç →
> sınır çatışması

Birbirine bağlı bu zincir, aynı sayıda bağımsız özellikten daha değerlidir.
Sistem her saniye kaos üretmez; sessizlik, küçük değişim, göç, çatışma ve
yeniden sakinlik ritmi hedeflenir.

### Başlangıç aktif madde bütçesi 512'dir

Eski 100 parçacık rejimi gerçek cihaz ve uzun ufuk deneylerinde lokal
etkileşimi sürdüremedi; beş sabit tohumun yalnız biri kabul eşiğini geçti.
Particle Substrate v2 bu nedenle **512 aktif parçacıkla** başlar.

512 sonsuza kadar kutsal bir ürün sayısı veya “ölçek tamamlandı” iddiası
değildir. Adım 2–3'ün ciddi başlangıç madde bütçesidir. Parçacık, organizma ve
bilişsel ajan bütçeleri ayrı ölçülür:

| Bütçe         | Ne sayar                    | Ana maliyet                           |
| ------------- | --------------------------- | ------------------------------------- |
| Parçacık      | Fiziksel madde              | Kuvvet, spatial hash ve render        |
| Organizma     | Kimliği izlenen yapı        | Küme sürekliliği ve kayıt             |
| Bilişsel ajan | Karar veren olgun organizma | Algı, hafıza ve utility değerlendirme |

Dünya büyüklüğü ile nüfus bağımsız sayı seçilmez. Etkileşim yarıçapı, yerel
yoğunluk ve dünya alanı birlikte ölçülür. Dünya yine %70–90 sakin/boş
kalabilir; 512 madde tüm alana uniform serpilmek yerine yerel başlangıç
yamalarda yoğunlaşır. Ölçeği 10k–250k aralığına açmak Adım 11'in işidir.

Yaklaşık yerel komşuluk `N × πR² / worldArea` ile izlenir. Dünya kenarı iki
katına çıkıp alan dört katına çıktığında aynı yoğunluk karakteri yaklaşık dört
kat madde isteyebilir; bu otomatik ölçekleme kuralı değil, benchmark hipotezidir.
Başarılı morphology ölçülmeden dünya ölçüsü `4096²` veya `8192²` gibi estetik
bir sayıya kilitlenmez. Habitat onlarca tipik-organizma uzunluğu taşıyacak
şekilde sonuçtan türetilir.

## 2. Dünya modeli

Dünya bir harita değil, **işlenebilen bir ortamdır**. Durum, akış, kaynak,
tarih ve ilişki taşır.

Temel sürekli alanlar:

| Alan          | Ne taşır                                         |
| ------------- | ------------------------------------------------ |
| `flow`        | İki bileşenli çevresel sürükleme                 |
| `light`       | Tükenmeyen dış girdi; besin yenilenmesini besler |
| `temperature` | Yaşanabilirlik ve tür tercihleri                 |
| `disturbance` | Hareket, çatışma ve ölümün geçici izi            |

`nutrient` bir alan gibi ızgarada saklansa da tüketilebilir **kaynaktır**.
`detritus` da Adım 5'te tüketilebilir/çözünen kaynak olarak eklenir.
`habitability` bu değerlerden türetilir; ayrı bir alan değildir. Enerji
dünyada alan değildir, organizmanın iç deposudur.

Void için ayrıca `darkness` field'ı tutulmaz. Karanlık, `WorldDomain` dışında
olmanın sunumudur; organizmanın ileride algılayacağı değer de global bir alan
değil SDF'den türeyen yerel kıyı riskidir.

Alan ve kaynak aynı depolama altyapısını paylaşabilir ama aynı kural değildir.
Sıcaklık tükenmez; nutrient tüketilir. Organizma dünyadan alır ve dünyaya iz,
atık ve madde bırakır. Tek yönlü “arka plan” bağı ekoloji üretmez.

`light` sabit bir bitmap değildir. Dünya seed'inden türeyen az sayıdaki yumuşak
kaynak yavaşça yer değiştirir; nutrient yenilenmesini sürükler ve aynı bölgenin
sonsuzca zengin kalmasını engeller. Organizma nutrient tüketir, hareketi
disturbance üretir, ölümü detritus bırakır, koloni uzun kullanımla territory
etkisi biriktirir. Alanların canlıyı etkileyip canlının alanı hiç değiştirmediği
tek yönlü model açıkça yasaktır.

Taşıma kapasitesi `maxOrganisms` gibi bir üst sınır değildir. Şunların ortak
sonucudur:

```
nutrient üretimi + habitat maddesi + enerji maliyeti
− avlanma − hastalık − Void kaybı
```

Bu nedenle 512 aktif madde 512 organizma anlamına gelmez; madde serbest bulut,
beden, detritus ve dış rezervuar arasında farklı zamanlarda farklı dağılır.

### Dünya dikdörtgen kutu değil, Void içindeki habitattır

Depolama, field grid ve spatial hash için dış kapsayıcı dikdörtgen kalabilir.
Oyuncunun ve fiziğin yaşanabilir dünyası ise onun içinde bulunan
`HabitatSDF`dir:

- Ana biçim yumuşak bir oval/superellipse'tir.
- Düşük frekanslı, deterministik gürültü konturu hafifçe düzensizleştirir.
- Aşırı girinti, küçük cep ve yıldız biçimi yasaktır; bunlar kamera ve
  morphology'yi kıyıya bağımlı hâle getirir.
- Biçim dünya seed'inden türetilir ve dünya yaratıldıktan sonra sabit kalır.
- Görsel “nefes” animasyonu fiziksel SDF'yi hareket ettiremez.

SDF işaret sözleşmesi tektir: pozitif habitat içi, sıfır kıyı, negatif Void.
Mesafe ve normal aynı `WorldDomain` sahibinden gelir; renderer, fizik, kamera
ve ilerideki algı sistemi ayrı geometri hesaplamaz.

Field solver habitat maskesini kullanır. Void hücreleri kaynak üretmez;
habitat–Void yüzeyinde difüzyon no-flux davranır. Karşı kenarlar komşu değildir
ve wrap yoktur.

### Duvar yoktur; üç Void bölgesi vardır

Dikdörtgen stroke, collision plane, clamp, bounce ve restitution kaldırılır.
Void bütün dünyayı çeken görünmez bir kuvvet de değildir.

| Bölge        | SDF ilişkisi                      | Fizik                           |
| ------------ | --------------------------------- | ------------------------------- |
| Güvenli alan | Kıyıdan fringe genişliğinden uzak | Void kuvveti kesinlikle sıfır   |
| Tidal fringe | Kıyının dar iç/dış komşuluğu      | Yerel outward/tidal stress      |
| Void         | Parçacık merkezi SDF'nin dışında  | Geri dönüşsüz aktif dünya ölümü |

Tidal fringe organizmayı kıyıya taşımak için değil, kıyıya fazla yaklaşmanın
fiziksel tehlikesini üretmek için vardır. Etkisi dar, sonlu ve config
verisidir. Merkezdeki morphology üzerinde ölçülebilir etkisi olamaz. Bir
finalist varlığını fringe'e dayanarak koruyorsa başarısızdır.

Parçacık merkezi dışarı geçtiği tick'te:

1. organizma üyeliğinden çıkar;
2. aktif simülasyondan düşer;
3. spatial hash'e girmez ve kuvvet uygulamaz;
4. enerji/madde muhasebesine bir Void kaybı yazar;
5. renderer'a salt sunum amaçlı bir ölüm olayı bırakır.

Fizik açısından geri dönüş yoktur. Ekrandaki yarım saniyelik sunum hayaleti
simülasyona katılmaz.

### Madde iki muhasebe düzeyinde korunur

Habitat artık kapalı kutu değildir:

```
aktif dünya maddesi → Void kaybı → dış madde rezervuarı
                                 → ekolojik matter vent → yeni serbest madde
```

Oyuncu ve organizma açısından Void'a düşen parçacık ölmüştür. Stable particle
ID'si geri gelmez. Engine düzeyinde madde dış rezervuarda muhasebeleştirilir.
Adım 5'te rezervuardan dönüş ancak yerel ve görünür bir çevresel süreçle olur;
“aktif sayı düştü, otomatik tamamla” hilesi yasaktır. Yeni madde yeni kimlik
alır.

Dünya tamamen tükenebilir. Bu bir hata değil, nadir bir extinction tarihidir;
ancak her seed'in kaçınılmaz biçimde tükenmesi de kabul edilmez.

### Başlangıç materyali uniform soup değildir

`InitialMatterSeeder`, 512 parçacığı birkaç yoğun origin patch, serbest matter
cloud ve seyrek bölgeye dağıtır. Bu bir organizma çizmez; yalnız lokal
etkileşimin başlayabileceği madde koşulunu kurar. Seeder parametreleri morphology
genomunda bulunabilir, fakat dünya seed'i fizik config'i değildir.

Başlangıç dağılımı fizik yasasından ayrı tutulur ama önemsiz sayılmaz. Aynı
genom yoğun origin patch, seyrek cloud ve farklı type oranlarında sınanır;
yalnız tek “şanslı” başlangıç deseninde yaşayan aday robust değildir. Seeder
hiçbir çekirdek, zar, kuyruk veya avcı şekli çizemez.

## 3. Yaşam ve fizik modeli

Yaşam zinciri:

```
parçacık → küme → çekirdek adayı → çekirdek → zar → organizma
         → grup → koloni → faksiyon
```

Küme ile çekirdek adayı ayrıdır. Anlık temas doğum değildir; yapı yoğunluk,
üyelik ve biçim sürekliliğini belli süre koruduğunda aday olur.

### Parçacık aptal kalır

Parçacık ihtiyaç, hedef, korku veya global dünya bilgisi taşımaz. Fiziksel
parçacık basit nokta/radius ve yerel ilişkilerdir. Akıl tespit edilmiş
organizmaya aittir.

Korunan `ParticleStore` SoA yaklaşımı v2'de genişler:

- `capacity` ile aktif sayı ayrılır;
- active/inactive maskesi bulunur;
- stable ID storage slotundan ayrılır;
- Void ölümü slotu pasifleştirir, diziyi kaydırmaz;
- yeni madde boş slotu kullanabilir ama yeni stable ID alır;
- snapshot active maskeyi, ID sayacını ve rezervuarı taşır.

Bu ayrım determinism, cache locality, save/load ve Adım 4 kimliği için
zorunludur.

### Triangular pair law üretim sözleşmesi değildir

Eski fizik tek profile sıkışıyordu:

```
ortak yakın itme → tek üçgen çekim/itme zarfı → sıfır
```

Bu aile 1.024 aday, 4 finalist ve çoklu seed çalıştırmasına rağmen qualified
aday üretmedi. Yeni `PairForceKernel`, mesafeye bağlı çok bantlı profildir:

```
çok yakın → sert itme
yakın      → denge veya zayıf çekim
orta      → güçlü çekim/itme
uzak      → zayıf çekim/itme
cutoff    → sıfır
```

Yönlü/asimetrik A→B ve B→A ilişkileri farklı olabilir. Arama uzayını
kontrolsüz 180 boyuta çıkarmamak için başlangıç genomu:

- 6×6 yönlü strength matrisi;
- 3×3 yönlü role/range matrisi;
- az sayıda global lobe radius/shape parametresi;
- damping, speed envelope ve başlangıç hareketi;
- yerel yoğunluk ve seeding parametreleri;
- dar Void fringe parametreleri

taşır. Rol eşlemesi bir morfolojiyi önceden ilan etmez; yalnız arama
parametrelerini paylaşmanın boyut indirgeme aracıdır. Kalıcı aday yalnız
matrisi değil **tam PhysicsGenome'u** üretime taşır.

World seed aday genomuna girmez. Aynı genom bütün seed korpusunda aynı fizik
yasasını kullanır.

### Madde korunur, enerji akar

Habitat içindeki organizma ölümü ile Void ölümü aynı değildir:

| Olay          | Madde                                                | Enerji/kaynak                      |
| ------------- | ---------------------------------------------------- | ---------------------------------- |
| Habitat ölümü | Üyelik çözülür, parçacıklar serbest aktif madde olur | Enerji dağılır; stok detritus olur |
| Void ölümü    | Aktif dünyadan dış rezervuara geçer                  | Habitatta besin bırakmaz           |

Enerji doğrudan nutrient'a çevrilmez. Organizmanın depoladığı biyokütle/besin
detritus olur; detritus yavaşça nutrient'a çözünür. Böylece ölüm yeni hayatı
besler fakat bedava enerji üretmez.

Büyüme yeni madde yaratmak değil, serbest parçacığı bünyeye katmaktır.
Bölünme önce fizikten aranır; çıkmazsa enerji eşiğine bağlı sınırlı müdahale
Adım 5'te ayrıca kanıtlanır.

Zar görsel kabuk değildir; madde ve nutrient geçişini yöneten işlevsel
sınırdır. Üyeler bulundukları çevreden yerel kuralla nutrient alır, kaynak
ızgarası aynı miktarda azalır ve organizma deposu artar. Ölüm yalnız identity
etiketini silmez: cohesion/üyelik çözülür ve ekranda gerçekten dağılma olur.
Avcının kopardığı particle için ayrı envanter veya “taşı” sistemi yoktur;
kopan madde fiziksel olarak yeni yapıya katılırsa zaten taşınmış olur.

## 4. Akıl, algı ve hareket

Davranış zinciri:

```
ihtiyaçlar + yerel algı + kusurlu hafıza + beden
→ öncelik/polarizasyon → dağıtık aktüatör kuvvetleri → hareket
```

Organizma global world width/height veya bütün kaynak haritasını görmez.
Görüş yarıçapı, alan örnekleme yarıçapı, iz duyarlılığı ve kıyı tahmin ufku
bütçelidir. Hafıza kusurludur ve ölümle kaybolur.

### Çekirdek koordinat emri vermez

Çekirdek `x=642` hedefi dağıtmaz. `survival`, `food`, `danger`,
`desiredHeading`, `locomotionIntensity` ve `locomotionPhase` gibi
öncelik/polarizasyon sinyalleri üretir. Üye parçacıkların yerel rolü bu sinyali
kuvvete dönüştürür. Beden rigid sprite gibi çevrilmez; hızlanırken uzar,
kıvrılır ve toparlanır.

Void korkusu Step 2'nin parçacık fiziği değildir. Adım 6'da organizma
`edgeDistance`, `edgeNormal` ve öngörülen kıyı geçişini yerel algı olarak
alır. Hunt, food ve survival utility'leriyle yarışır. Fenotip
`voidAversion`, `riskTolerance` ve `predictionHorizon` değerlerini
değiştirebilir.

### Algı yerel, hafıza kusurlu ve pahalıdır

Organizma bütün nutrient haritasını veya en yakın avın mutlak koordinatını
okuyamaz. Görüş, alan örnekleme, kimyasal/iz duyarlılığı ve gelecek-konum
tahmini ayrı bütçelerdir. Bu kısıt yalnız performans için değil, aynı dünyada
iki organizmanın farklı karar verebilmesi içindir.

Hafıza gerçeğin eksiksiz kopyası değildir. Eski bilgi solar, yanlış çağrışım
oluşabilir ve hafıza ölümle kaybolur. Tehlikeli kıyıyı bilen soyun tükenmesi,
aynı hatanın yeni kuşakta tekrarlanabilmesine izin verir. İleride kalıtılan
özellik ile bireyin yaşarken öğrendiği bilgi aynı veri değildir.

Yerel sinyal fear, danger ve defense eğilimlerini komşulara taşıyabilir. Bir
panik dalgası herkesi aynı yöne script etmez: kaçan, merkeze dönen, donan veya
yırtıcıya yaklaşan davranışlar fenotip ve utility farkından çıkar. Uzun süre
tehdit görülmeyen bölgede sinyal söner ve keşif yeniden yükselir.

### Kuyruk ve burst gerçek bedendir

Yırtıcı kuyruğu dekoratif sprite değil, üyelik taşıyan locomotor morphology
olabilir. Tail üyeleri faz kaymalı yanal kuvvetlerle salınır. Burst:

- kısa süreli yüksek locomotion intensity;
- yüksek enerji maliyeti;
- gövde ve zar gerilmesi;
- ardından recovery/yorgunluk

üretir. Kuyruk kaybı gerçekten hızı düşürür. Hız tek sabit stat değildir:

> morphology × enerji × locomotor anatomi × niyet × flow × hasar

Yüksek hızın hasarlı bedeni parçalayabilmesi meşru bir sonuçtur.

Hareket hiyerarşisi üçe ayrılır: utility neyin önemli olduğunu, steering
istenen yön/polarizasyonu, locomotion ise bedenin bunu nasıl ürettiğini
belirler. `AgentController` ortak bir kapasite sözleşmesidir; standart
organizma nucleus controller, parazit daha küçük tropism controller
kullanabilir. Aynı interface bütün canlıların aynı anatomiye sahip olmasını
gerektirmez.

## 5. Toplum, tehdit ve tarih

Territory sert poligon değildir; uzun süreli kullanım ve yerel sinyallerden
türeyen, zamanla solan etki alanıdır. Koloni aynı yerde duran liste değil;
ortak kaynak alanı, tolerans ve sinyal sürekliliği olan gruptur.

Tehdit spawn edilen boss değildir. Kıtlık, rekabet, mutasyon, enfeksiyon ve
seçilimden türeyen beş aile korunur:

| Tehdit              | Hedef ve saldırı                                 | Nasıl zarar görür                                  | Görsel dil                     |
| ------------------- | ------------------------------------------------ | -------------------------------------------------- | ------------------------------ |
| Parçacık avcısı     | Serbest maddeyi yakalar; yeni oluşumu azaltır    | Açlık, rakip, koloni savunması                     | Küçük ve hızlı                 |
| Çekirdek avcısı     | Zarı delip çekirdek sürekliliğini bozar          | Zar, savunucu, rakip yırtıcı                       | İnce/probe ön bölüm            |
| Parazit / virüs     | Zara tutunur, enerji sızdırır ve çoğalır         | Host tepkisi, dökülme, başka parazitler            | Uzakta gizli, yakında kapsid   |
| Koloni kırıcı       | Territory ve yerleşim düzenini dağıtır           | Kolektif savunma, açlık, rakip                     | Yavaş, ağır, geniş disturbance |
| Olgunlaşmış yırtıcı | Takip, burst, yakalama ve fiziksel koparma yapar | Savunucu/prey, rakip, virüs, açlık, Void, öz-hasar | Koherent beden ve kuyruk       |

Prey yalnız kaçmak zorunda değildir. Fenotipine göre savunabilir; koloni
yırtıcıyı kuşatabilir; iki yırtıcı kaynak için çatışabilir. Hiçbir yırtıcı
ölümsüz veya rigid değildir. Dayanıklılığı yüksek cohesion, kalın zar, güçlü
repair ve kompakt core'dan gelir; bunların enerji maliyeti vardır.

Her aile farklı geri besleme zinciri açar:

- Parçacık avcısı serbest maddeyi azaltınca yeni organizma doğumu zorlaşır;
  kendisi çoğalırsa kaynağını tüketip açlığa girer.
- Çekirdek avcısı zarı yalnız parçalamak için değil nucleus sürekliliğine
  ulaşmak için deler. Core ölümü kontrolü ve hafızayı bitirir; beden bir süre
  fiziksel olarak kalıp sonra dağılabilir veya avcıya katılabilir.
- Virüs uyumlu zara bağlanır, enerji/metabolizma dengesini bozar, çoğalır ve
  yayılır; bütün virüslerin nucleus taşıması gerekmez.
- Koloni kırıcı daha büyük bir yırtıcı değildir. Yüksek disturbance ve geniş
  bedenle yerleşimi dağıtır; nüfusu göçe, yeni territory'ye ve sonraki sınır
  çatışmalarına iter.
- Olgun yırtıcı stalking → burst → recovery ekonomisiyle avlanır. Güçlü beden
  daha yüksek enerji maliyetidir; kuyruk kaybı, enfeksiyon ve açlık onu gerçekten
  zayıflatır.

Koloni savunması `GuardUnit` spawn'ı değildir. Yerel danger/fear sinyali ve
fenotip farklılıkları bazı üyeleri kaçırırken bazılarını tehdide yaklaştırır;
savunucu rolü bu davranıştan doğar. Territory de sahiplik poligonu değil,
uzun süreli kullanım + tolerans + sinyalden doğan ve terk edilince solan
influence field'dır.

### Hasar tek HP değildir

Gerçek durum çok boyutludur:

- mechanical: üye parçacık kopması;
- membrane: açıklık ve geçirgenlik artışı;
- core: kimlik, hafıza ve kontrol bozulması;
- metabolic: enerji deposu kaybı;
- infection: sızıntı ve davranış bozulması;
- matter loss: beden küçülmesi.

UI gerekirse bunlardan bir sağlık özeti türetebilir; simülasyon gerçeği tek
sayılık HP değildir.

Virüs normal dünya zoom'unda fark edilmesi zor kalır. Organism/Micro zoom'da
kendi küçük particle morphology'si seçilir; infection layer izini açık eder.
Virüsün çekirdeği olmak zorunda değildir. Ortak sözleşme `AgentController`
olabilir; tam organizma nucleus controller, virüs daha basit tropism
controller kullanabilir.

### Dünya geçmişi fiziksel iz bırakır

| Olay          | Kalıntı                                |
| ------------- | -------------------------------------- |
| Normal geçiş  | Hafif disturbance                      |
| Büyük göç     | Uzun, ince ve solan iz                 |
| Habitat ölümü | Detritus + disturbance                 |
| Savaş         | Yüksek disturbance + tükenmiş nutrient |
| Salgın        | Infection residue                      |
| Eski koloni   | Solan territory memory                 |
| Void kaybı    | Kıyıda kısa ömürlü activity scar       |

Normal görünüm sakin kalır; ayrıntı katman görünümünde açılır.

Bu sistemlerin hedeflediği zincir scripted görev olmadan kurulabilir:

> Merkez nutrient'ı tükenir → koloni Void'e yakın zengin yamaya göçer → avcı
> sürüyü kıyıya sıkıştırır → riskli burst sırasında kuyruğundan madde kaybeder
> → savunucular yaklaşır → avcı yavaşlayıp çekilir → kıyı izi ve azalan aktif
> madde dünyanın tarihinde kalır.

Bu örnek zorunlu senaryo değildir; her okun gerçekleşmesini sağlayacak yerel
mekanizmaların aynı dünyada birbirine bağlanabildiğini sınayan ürün hedefidir.

## 6. Sunum

Normal durumda ekranın yaklaşık %90'ı dünyadır. UI olay güdümlüdür; sürekli
açık dashboard yerine kısa bildirim, seçim künyesi ve ayrı olay geçmişi vardır.

### Dünya aklı ile sunum aklı ayrıdır

Dünya aklı olayları üretir; sunum aklı oyuncuya hangisinin bakmaya değer
olabileceğini önerir. Sunum puanı yenilik, süre, etkilenen nüfus, nadirlik ve
coğrafi yayılımı ayrı bileşenler olarak taşır; tek skaler “ilginçlik” değeri
gerçeğin kendisi sayılmaz. İlk organizma, ilk bölünme, ilk avlanma ve ilk
koloni gibi ilkler ayrıca işaretlenir.

`Observe` kipinde kamera öneri sunabilir veya yumuşakça olaya gidebilir, fakat
kullanıcının ilk pan/zoom girdisi kontrolü anında geri alır. `Follow` seçilmiş
kimliği kaybolana ya da kullanıcı bırakana kadar izler. `Free` hiçbir otomatik
kamera kararı almaz. Sunum sistemi simülasyona kuvvet, hedef veya öncelik
yazamaz.

### Habitat ve Void görsel sözleşmesi

Kıyı kare stroke ile çizilmez. Habitat içi çok hafif field dokusu ve aktivite,
kıyıya yaklaşırken organik biçimde kararır; dışı neredeyse mutlak siyah
Void'dur. Kontur belirgin bir güvenlik bilgisi verecek kadar okunur, dekoratif
neon çerçeve olacak kadar sert değildir.

Void animasyonu fizik SDF'sini değiştirmez. Düşük frekanslı luminance/akıntı
hareketi kıyıda içeri doğru akan karanlık hissi verebilir. Particle Void'a
yaklaşınca dış normal yönünde uzar; geçişten sonra rengi boşalır, küçülür/smear
olur ve yaklaşık yarım saniyede söner. Çok sayıda kayıpta efekt yoğunluğu LOD
ile azalır.

Habitat ölümü farklı görünür: core ritmi söner, zar düzeni çözülür, renk solar,
beden serbest madde bulutuna dağılır ve bölgede hafif detritus/disturbance
kalır. Oyuncu Void kaybı ile geri dönüşümü açıklama okumadan ayırabilmelidir.

### Particle glyph fizik değildir

Fizik parçacığı nokta/radius kalır. Renderer rol ve duruma göre glyph'i
değiştirebilir:

| Durum          | Sunum                                      |
| -------------- | ------------------------------------------ |
| Serbest madde  | Küçük yuvarlak                             |
| Zar üyesi      | Zara teğet hafif oval                      |
| Core üyesi     | Daha yoğun ve kompakt                      |
| Hızlı üye      | Velocity yönünde sınırlı uzama             |
| Tail aktüatörü | Salınımı okunur elongated biçim            |
| Hasarlı üye    | Soluk/dengesiz faz                         |
| Void fringe    | Void normaline doğru gerilme               |
| Enfekte üye    | Yakın/layer görünümünde renk-faz anomalisi |

Glyph, collision shape veya kuvvet menzilini değiştiremez.

### Renk enerjiyi anlatır

Dünya paleti UI paletinden ayrıdır. Renk type + energy + state + environment
katmanlarından çıkar. Enerji barı normal dünyaya konmaz. Düşük enerjide renk,
tail amplitude ve core pulse zayıflar; sayısal değer yalnız seçilen
organizmanın künyesinde bulunur.

Tüketim “lokma” efekti veya her canlı üstünde barla gösterilmez. Dünyada
nutrient yaması yerel olarak söner ve sonra yenilenir; canlıda renk/core pulse
enerji durumunu anlatır. Olay günlüğüne her emilim değil, besin bölgesi
tükenmesi, açlıktan ölüm ve bölünme gibi eşik olayları girer. Gizli kuralın
formülü UI'da açıklanmaz; kullanıcı `aggression = 0.73` gibi fenotip değeri
görebilir ama kıtlığın onu nasıl etkilediğini gözlemle keşfeder.

### Continuous zoom, semantic LOD

Kamera modu kesikli değildir; render detayı sürekli geçiş yapar:

| Ölçek     | Okunan bilgi                            |
| --------- | --------------------------------------- |
| World     | Habitat adası ve activity constellation |
| Ecosystem | Göç, koloni ve yırtıcı hareketi         |
| Organism  | Zar, core, beden ve hasar               |
| Micro     | Particle rolü, salınım ve deformasyon   |

Uzakta fizik değişmez. Tekil particle görünmez hâle geldiğinde aggregate
luminance/activity signature kullanılabilir; bu yalnız sunumdur.

### Kamera ergonomisi ayrı P0 kabulüdür

Mevcut controller özellikleri olmasına rağmen kullanıcı kabulü başarısızdır.
Yeni kamera şu hissi sağlamadan kapanmaz:

- aktif drag sırasında dünya parmak/mouse altında gecikmesiz kalır;
- bırakma hızı son kısa giriş penceresinden güvenilir biçimde çıkar;
- mouse coast kısa, touch coast kontrollü kinetiktir;
- trackpad wheel ve klasik mouse wheel ayrı normalize edilebilir;
- zoom anchor imleç/parmak altında sabit kalır;
- resize ve yön değişimi bakılan noktayı korur;
- sert clamp ve elastik bounce yoktur; release momentumu sınırda yumuşak söner.

Kamera navigation domain'i habitat bounding box + kontrollü Void margin'dir.
Maksimum zoom-out bütün habitatı ve çevresinde anlamlı karanlığı gösterir;
kullanıcı sonsuz Void'a kayamaz ve habitatı tamamen kaybedemez. Kesin margin,
momentum penceresi ve zoom limitleri config verisidir; mouse, Samsung ve Lenovo
insan kabulüyle ölçülmeden belgeye rastgele sayı olarak yazılmaz.

### Kabuk

Gameplay HUD sağ üst köşesinde yalnız `Pause` düğmesi vardır; ayarlar düğmesi
HUD'da değil, Pause Sheet header'ındaki bir aksiyondur. Web'de tam ekran
düğmesi Pause'un solundadır; Android ve masaüstünde yoktur. Pause ve X aynı
40×40 `IconButton` geometrisidir. FPS açıksa Sheet'in üst katmanında görünür
kalır. Dil, FPS, haptics, yön ve masaüstü görüntü kipi mevcut i18n/kalıcılık
sözleşmelerini korur.

Pause Sheet tek bir CORE `Sheet`'tir; içinde ayrı panel açılmaz, body route'u
değişir. Header'da `Settings` (ve ileride `Codex`, `World`, `God`) aksiyonları
için `Toolbar` accessory slot bulunur. X her görünümde Sheet'i kapatır ve
oyuna döner; Android Back bir seviye geri döner (Settings → PauseHome,
PauseHome → Resume). Scrim tıklayınca Sheet kapanmaz.

Alan, territory, infection ve tarih normal görünümü kirletmez; kullanıcı
seçtiği katmanı tam kontrastla açar. Dünya aklı ile sunum aklı ayrıdır:
organizmalar ne olacağını, sunum sistemi oyuncuya neyin önerileceğini belirler.
Oyuncu kamera kontrolünü her zaman geri alabilir.

VOL.LIFE yeni UI primitive icat etmez. Planlanan yüzeylerin sahibi baştan
bellidir:

| İhtiyaç                    | CORE yüzeyi                             |
| -------------------------- | --------------------------------------- |
| Organizma künyesi          | `SelectionInfoPanel`                    |
| Dünya/yaşam sayaçları      | `StatsPanel`                            |
| Dünya haritası ve viewport | `MinimapPanel`                          |
| Olay geçmişi               | `EventLog`                              |
| Tekrar hızı                | `SegmentedControl`                      |
| Müdahale arama yüzeyi      | `CommandPalette`                        |
| Kısa olay bildirimi        | `Toast`                                 |
| Seçenekler                 | `IconButton` + `Sheet` + `SettingsForm` |

Bu bileşenler yalnız durumu çizer ve niyeti callback ile bildirir; organism,
territory veya threat kuralı CORE'a sızmaz.

## 7. Kalıcılık ve kimlik

Kalıcılık iki seviyedir:

- Küçük tercih durumu CORE `SaveManager` ile saklanır.
- Dünya, VOL.LIFE'a ait sürümlü binary snapshot ve `LifeWorldStore` portuyla
  saklanır.

Dünya seed'i build config'i değildir. Yeni dünya cryptographic seed,
`worldId` ve oluşturma zamanı üretir; explicit seed yalnız test/replay
içindir. Metadata config fingerprint'ine girmez.

V2 snapshot şunları taşımak zorundadır:

- world metadata, tick ve RNG state;
- HabitatSDF'yi yeniden üreten sürümlü parametreler/digest;
- field ve resource dizileri;
- particle capacity, active mask, stable ID'ler ve next ID;
- konum, hız, tür ve üyelik dizileri;
- dış matter reservoir ve Void kayıp sayaçları;
- organizma/territory state'i ancak ilgili adımlar açıldığında.

Eski snapshot sessizce v2 fiziğinde oynatılmaz. Güvenli migration açıkça
kanıtlanamıyorsa kullanıcıya i18n'li uyumsuz kayıt sonucu verilir ve yeni dünya
başlatılır. Görsel config fingerprint'i değiştirmez; fizik ve habitat config'i
değiştirir.

Metadata JSON olabilir; yoğun sayısal gövde sıralı little-endian binary,
sürüm, uzunluk, config fingerprint, CRC32 ve finite-value doğrulaması taşır.
Doğrulama hem disk adaptöründe hem doğrudan dünya geri yüklemesinde aynı
fonksiyondur ve canlı state'e yazmadan önce bütünüyle tamamlanır. Geçersiz son
bir dizi tick, RNG, alan veya parçacıkların önceki kısmını yarım uygulayamaz.
Simülasyon ve persistence, kurulumda world/particle config'inin ve metadata'nın
kendi kopyasını alır; çağıranın sonradan değiştirdiği nesne veya TypedArray
fingerprint'i ve çalışan dünyayı değiştiremez. Alt `FieldSet` ve
`ParticleStore` restore sınırları da uzunluk ile sonluluğu tüm diziler için
önceden doğrular; atomiklik yalnız üst seviye codec'e bırakılmaz.
`LifeWorldStore` backend'i format sözleşmesinden ayrıdır. Küçük dünyada mevcut
SaveManager adaptörü kullanılabilir; ölçüm kota veya köprü maliyetini aşarsa
native binary dosya ile web IndexedDB/OPFS adayları last-known-good ve migration
yüzeyiyle birlikte değerlendirilir. Android'de onaylı çıkış son snapshot
başarılı olmadan pencereyi kapatmaz.

Kayıt anlık hâli, tekrar seed + komut günlüğü + tick sayısını saklar. Aynı
değildirler. Tarih ayrı dev bir state ağacı değildir; doğum, ölüm, Void kaybı,
bölünme, füzyon, göç, çatışma, salgın ve tükeniş olay günlüğünden türetilir.
Önemli organizmaların biyografisi ve tür soy ağacı bu günlükten üretilebilir;
her birey için sınırsız geçmiş kopyası tutulmaz.

## 8. Test ve araştırma doktrini

Dört kanıt sınıfı birbirinin yerine geçmez:

1. **Birim/matematik:** SDF, normal, force profile, active store, Void sink,
   determinism ve kamera formülü.
2. **Entegrasyon/E2E:** save/load, renderer, event→sunum ayrımı, ayarlar ve
   aday preview.
3. **Long-horizon simülasyon:** çoklu seed, zaman serisi, perturbation/recovery,
   Void kaybı ve faz kararlılığı.
4. **Fiziksel cihaz/insan kabulü:** browser/masaüstü fare, Samsung ve Lenovo;
   hareketin izlenebilirliği, kamera rahatlığı ve sunum.

Coverage, FPS veya tek final snapshot ürün kabulü değildir.

İstatistik iddiaları sürümlü seed korpusu kullanır. Her koşuda rastgele yeni
tohum üretip “çoğu geçti” denmez; fresh-world üreticisinin benzersizlik
sözleşmesi ile sabit X/Y fixture'ının determinism sözleşmesi ayrı test edilir.
Ölçüm de ikiye ayrılır: kernel benchmark kuvvet/hash/field maliyetini, ürün
benchmark tam world step + render sync + kamera + UI maliyetini ölçer.

### Adım 2 neyi kanıtlar

- Multi-band kuvvet profili ve asimetri matematiksel olarak doğrudur.
- Spatial hash aktif particle çiftlerini kaçırmaz, inactive olanı indekslemez.
- Aynı seed ve genom bit düzeyinde aynı sonucu verir.
- Güvenli habitatta Void kuvveti kesinlikle sıfırdır.
- Tidal fringe yalnız belirlenen dar bölgede etkilidir.
- SDF crossing aynı tick'te geri dönüşsüz deactivation üretir; wrap/bounce yoktur.
- 512 aktif particle birkaç simüle dakika kilitlenmeden çalışır.
- Samsung ve Lenovo'da fizik aynı, yalnız sunum kalitesi ölçeklenebilir.

Adım 2'nin zar veya organizma üretme zorunluluğu yoktur. Güvenilir substrate
üretir.

### Adım 3 tam genom keşfidir

İlk production adayı generalized asymmetric multi-band kernel'dir. Araştırma
harness'i kernel kimliğini genomda sürümler. Ana aile anlamlı faz sınırı
üretemezse iki koşullu karşılaştırma açılabilir: daha serbest multi-lobe profil
ve self-propulsion taşıyan active-particle modeli. Bunlar aynı anda üç production
çekirdeği taşımak için değil, yanlış fizik ailesine daha fazla CPU yakmayı
engelleyen falsification yollarıdır. Alternatif, aynı korpus ve metriklerle ana
adaydan daha iyi kanıt vermeden seçilemez.

Broad aşama önce adayları fazlara ayırır:

- dead/stasis;
- gas veya yapısız soup;
- crystal/frozen;
- tek dev yapıya collapse;
- Void-loss dominated;
- orbit dominated;
- speed-cap chaos;
- **dynamic structured**.

Yalnız dynamic-structured çevresi refinement'a girer. Kısa otomatik filtre,
ucuz başarısızları eler; morphology kararı vermez. İnsan gözüyle ilginç
bulunmayan aday uzun koşuya sokulmaz. İnsan ön-elemesinden geçen az sayıda
adayda çoklu seed ve 10–30 simüle dakikalık long-horizon kanıtı çalışır.

Başlangıç bütçe hunisi şudur; rakamlar benchmark sonrası config'e kilitlenir:

| Aşama                | Amaç                         | Başlangıç adayı                     |
| -------------------- | ---------------------------- | ----------------------------------- |
| Broad                | Faz haritası ve ucuz red     | 30–60 simüle saniye, 4–8 seed       |
| Refinement           | Dynamic-structured komşuluğu | Birkaç simüle dakika, 16 seed adayı |
| Development audition | İnsan gözüyle shortlist      | 3–8 tam-genom aday                  |
| Qualification        | Geç çöküş + recovery         | 10–30 simüle dakika, 32+ seed adayı |

Bu sayılar acceptance değildir; süre ve korpus ölçümle küçülebilir/büyüyebilir.
Önce 2/6/24 saat koşmak reddedilmiştir. Ancak zaman serisi 30 dakikadan sonra
başlayan bir çöküş gösterirse daha uzun release canary ayrıca gerekçelendirilir.

Finalist ölçümleri en az şunları zaman serisi olarak ayırır:

- hareket ve nearly-stalled payı;
- komşuluk ve lokal yoğunluk;
- cluster/compactness/anisotropy;
- role-agnostic radial yapı ve type composition;
- üyelik churn ve structure lifespan;
- fragmentation/collapse;
- orbit ve trajectory autocorrelation;
- perturbation sonrası üyelik, biçim ve kompozisyon recovery;
- Void dwell/loss ve fringe bağımlılığı;
- seed robustness.

“Ring çıktı” veya “hareket ediyor” başarı değildir. Kitlesel Void kaybı, kısa
sürede stasis, tek blob, kalıcı soup, sonsuz orbit, hız tavanında kaos, yapısız
random motion, değişmeyen frozen morphology ve seed çoğunluğunda ölüm kesin
başarısızlıktır.

İstenen ilk behavior family'leri core-like yoğunluk, membrane-like çeper,
koherent hareket, deformasyon sonrası recovery, doğal kırılganlık, asimetriden
doğan chase ve iki yapının kalıcı symbiosis ilişkisidir. Hepsini aynı genomun
üretmesi şart değildir; yalnız renkli topak üretmek hiçbir aileyi karşılamaz.

Arama candidate/seed işlerini deterministic work ID ile shard edebilir.
Paralel sonuç aynı seri referansla bit düzeyinde eşit olmadan worker yolu
güvenilir sayılmaz. Bütçe ölçülmeden aday sayısı büyütülmez.

Qualification artefaktı clean source revision, config digest, corpus, tam
PhysicsGenome, bütçe, zaman serisi, red nedenleri ve human-acceptance durumunu
taşır. Dirty ağaç exploration için kullanılabilir ama production qualification
üretemez. Qualified olmayan aday runtime URL/env ile production'a enjekte
edilemez.

Adım 3 ancak **technical gate + long-horizon + kullanıcı visual audition**
birlikte geçtiğinde kapanır. Bütün genom production'a taşınır; matrix tek
başına kopyalanmaz.

### Adım 4 gözlemci değişmezliği

Organizma identity tracker fizik çekirdeğinden bağımsız gözlemcidir.
Tracker OFF ve ON koşuları aynı seed/genomda particle state'i bit düzeyinde
aynı üretmelidir. Stable organism ID üye örtüşmesiyle sürer; split, merge ve
geçici fragmentation olaydır. Adım 3 kapanmadan Adım 4 başlamaz.

Anlık cluster doğum değildir. Yoğunluk, iç yapı ve üyelik sürekliliğini bir
süre koruyan yapı organism candidate olur. Kareler arası eşleme üye örtüşmesi,
merkez/ölçek yakınlığı ve kısa kayıp toleransını birlikte kullanır. Split'te
ana süreklilik eski ID'yi taşır, yeni dal yeni ID alır; merge ve geçici
fragmentation olay günlüğüne yazılır. Save/load identity sayacını ve açık
eşleme durumunu korur. Tracker'ın çıktısı Adım 5'e kadar hiçbir particle
kuvvetine geri beslenmez.

## 9. Android ve fiziksel kabul

VOL.LIFE masaüstü-önce geliştirilir; Android ilk gerçek dilimden itibaren smoke
hedefidir. Kabuğa, kamera veya sunuma dokunan tur Samsung ve Lenovo'da açılır.
`benchmark:device` referanstır, donanıma bağlı olduğu için local kalite kapısı
değildir.

Android'de kalite düşebilir, dünya kuralı düşemez. Particle LOD ve Void efekt
yoğunluğu azalabilir; SDF, kuvvet, ölüm, olay ve organizma aynı kalır.

`benchmark:device` bağlı cihazda cold start, FPS, bellek ve WebGL fallback
ölçer; geliştiricinin masasındaki donanıma bağlı olduğu için kalite kapısı
değil karşılaştırma kaydıdır. Android tek çekirdek başarımının masaüstünden
kaç kat düşük olduğu ölçülmeden plan girdisi yapılamaz.

Haptics resmi Tauri mobil eklentisi üzerinden uygulanır; native sürücü varsa
UA tahminine göre web fallback seçilmez. `VIBRATE`, capability ve kullanılan
impact/selection/notification yüzeyleri drift testinde korunur.

Yön seçimi native `userPortrait` / `userLandscape` ailesidir ve varsayılan
dikeydir. Tercih sayfa yüklenmeden uygulanır; multi-window veya platform
kısıtı isteği reddederse UI gerçek yöne döner. Yön değişimi dünyayı ve kamera
durumunu sıfırlamaz. Android'de DOM tam ekran düğmesi yoktur.

## 10. FpsMeter

`FpsMeter` yalnız FPS gösteren CORE HUD bileşenidir. Diagnostics ile aynı
`FrameRateSampler`ı paylaşır; ikinci ölçüm algoritması açılmaz. En fazla
250 ms'de bir yazıya çevrilir, simülasyon temposuna bağlanmaz, safe-area
token'larını kullanır ve seçenek açıksa Sheet üstünde görünür.

FPS yalnız performans ölçümüdür. Yaşam, morphology veya kamera ergonomisi
kanıtı değildir.

## 11. Mimari sınırlar ve dış araştırma

Phaser 4.2.1 WebGL1 kullanır; repo WebGPU compute yüzeyi taşımaz. Simülasyon
CPU'dadır. Yoğun render yolu ölçülmeden `SpriteGPULayer`a kilitlenmez; mevcut
Graphics adaptörü 100 particle için yeterli, 5.000 için yetersiz ölçülmüştür.
512 v2 kabulünde gerçek Chromium ve iki Android cihaz yeniden ölçülür.

Eski Chromium ölçümü 100/1.000/5.000 particle için render CPU p50/p95'i
sırasıyla yaklaşık 0,0/0,1; 0,1/0,2; 0,5/0,6 ms, toplam kare p50/p95'i
16,66/16,67; 16,67/19,99; 73,32/91,67 ms verdi. Bu v2 sonucu değildir;
yalnız mevcut Graphics yolunun yoğun ölçekte ölçeklenmediğini gösteren tabandır.
`SpriteGPULayer` tek draw-call avantajı sunsa da her tick konum/renk tamponu
güncelleyen LIFE yükünde otomatik kazanan değildir. Adım 11 CPU yazımı, GPU
upload, frame p50/p95 ve görsel pariteyle en az bir alternatifle kıyaslar.

**V2 ölçümleri** (2026-09-14, Particle Substrate v2, 512 kapasite):

| Ölçüm                     | p50       | p95       |
| ------------------------- | --------- | --------- |
| 512 parçacık kernel/tick  | ≈ 0,98 ms | ≈ 1,00 ms |
| 2048 parçacık kernel/tick | ≈ 13,9 ms | ≈ 14,1 ms |
| 256² field tam tazeleme   | ≈ 5,4 ms  | —         |
| 512²/4-band field/tick    | ≈ 5,6 ms  | —         |
| 512²/4-band tam tazeleme  | ≈ 22,4 ms | —         |

512→2048 ölçekleme oranı ≈ 14,2×; 5,5 tavanı bu ölçümlü O(n²) sızmasını reddeder.
Bu ölçümler production qualification DEĞİLDİR; yalnızca substrate'in hedef
cihaz bütçesinde çalışabilirliğinin tabanıdır. Android cihaz ölçümleri ayrı
gerektirir.

Sistemler farklı sabit tempolarda koşabilir; kamera uzaklığı fizik temposunu
değiştiremez:

| Sistem              | Başlangıç bütçesi |
| ------------------- | ----------------- |
| Hareket/entegrasyon | 60 Hz             |
| Pair force          | 30–60 Hz ölçülür  |
| Algı/karar          | 15 Hz adayı       |
| Field difüzyonu     | 10 Hz             |
| Territory/grup      | 5 Hz adayı        |
| Evrim               | 1 Hz adayı        |
| Tarih               | Olay bazlı        |

Taban tempo sabit bir `60` varsayımı değildir; `fixedStepMs` değerinden tam
sayı Hz olarak türetilir. Alt sistem temposu tabanı tam bölmelidir. Dünya ve
parçacık config'i dizi ayırmadan veya GPU kaynağı kurmadan önce sonluluk,
aralık, tam sayı ve geometri sözleşmelerinden geçer.

Headless `runtime/sim` Phaser import etmez. CORE'dan
`SimulationClock`, matematik, lifecycle, UI ve save mekanizması alınır;
oyuna özgü SoA, stateful RNG, SDF ve fizik VOL.LIFE'ta kalır.

`SimulationClock` deterministik çekirdekte `partialStep: 'defer'` kullanır;
değişken artık adım kare hızını fiziğe sokamaz. CORE'un nesne tabanlı
`SpatialIndex`, `ObjectPool`, `StateMachine` ve entity katmanı SoA hot path'e
wrapper/closure/hash maliyeti taşıdığı için zorla kullanılmaz. Benzer biçimde
closure içinde kalan genel RNG yerine snapshot edilebilir LIFE RNG'si kullanılır
ve sayı dizisinin CORE mulberry32 referansıyla paritesi testte korunur.

Repoda production Worker/SharedArrayBuffer altyapısı bugün yoktur. Önce sistem
tempoları ölçülür; yetmezse worker değerlendirilir. Araştırma candidate'larını
paralel shard etmek ile production fiziğini worker'a taşımak ayrı kararlardır.

Yeni tasarım dış sistemlerin denklemini kopyalamaz; doğrulanmış ilkelerini
referans alır:

- [Ventrella — Clusters](https://www.ventrella.com/Clusters/intro.html):
  mesafeye bağlı, yönlü/asimetrik force-field profillerinin zengin yapı
  üretebilmesi.
- [Reynolds — Steering Behaviors for Autonomous Characters](https://www.red3d.com/cwr/papers/1999/gdc99steer.pdf):
  hedef seçimi, steering ve locomotion katmanlarının ayrılması; containment'ın
  çarpışma sonrası sekmeden farklı olması.
- [Flow-Lenia](https://arxiv.org/abs/2212.07906): madde korunumu ve yerel
  parametrelerin aynı dünyada çoklu yapı üretimi için tasarım aracı olması.
- [Primordial Particle Systems](https://www.nature.com/articles/srep37969):
  basit yerel kurallar, yoğunluk ve hareketin büyüyen/iyileşen/çoğalan
  yaşam-benzeri yapıların faz davranışıyla birlikte incelenmesi.

Bu kaynaklar VOL.LIFE'ın Void, çekirdek, koloni veya tehdit kararlarını
kanıtlamaz; yalnız fizik ve davranış ayrımlarına emsal oluşturur.

## 12. Klasörleme

Repo konvansiyonu korunur; ayrı `life-lab` veya yeni top-level hiyerarşi
kurulmaz:

```
games/vol-life/
├── src/
│   ├── app/          bootstrap, kalıcılık ve platform bağları
│   ├── config/       habitat, fizik, grafik ve tempo verisi
│   ├── i18n/         tr.json + en.json
│   └── runtime/
│       ├── sim/      SDF, store, hash, fizik, Void — Phaser YOK
│       ├── render/   habitat, Void, particle ve ölüm sunumu
│       ├── scene/    yalnız bağlama
│       └── ui/       HUD ve çekmece
├── scripts/          headless araştırma/benchmark
├── src-tauri/        masaüstü ve Android kabuğu
└── tests/            src ve script sözleşmelerini aynalar
```

Sorumluluklar küçük dosyalara ayrılır. `WorldDomain` SDF'nin, `VoidSink`
deactivation ve rezervuar yazımının, `PairForceKernel` force profile'ın,
`InitialMatterSeeder` başlangıç dağılımının sahibidir. Renderer fizik kuralı
taşımaz.

## 13. İnşa sırası

| #   | Adım                                        | Bittiğinde ekranda ne var        |
| --- | ------------------------------------------- | -------------------------------- |
| 0   | Zemin — paket, config, RNG, kabuk           | Kanıtlı boş dünya                |
| 1   | Dünya substratı — alanlar ve kalıcılık      | Değişen çevre                    |
| 2   | **Particle Substrate v2**                   | 512 madde, habitat ve Void       |
| 3   | **Morphology Discovery v2**                 | Hareketli, toparlanan yapı       |
| 4   | Organizma kimliği                           | Takip edilebilen bir canlı       |
| 5   | Enerji, nutrient, detritus ve yaşam döngüsü | Doğum/ölüm geri dönüşümü         |
| 6   | Algı, utility, nucleus ve locomotion        | Anlamlı yönelim ve Void korkusu  |
| 7   | Sunum, katmanlar ve olay aklı               | Keşfedilebilir dünya             |
| 8   | Olay günlüğü ve tekrar                      | Karşılaştırılabilir deney        |
| 9   | Tehdit, koloni, territory ve çatışma        | Ekolojik hikâye                  |
| 10  | Kalıtım, mutasyon ve seçilim                | Zamanla değişen türler           |
| 11  | Ölçek ve worker/render yolu                 | Aynı kurallarla daha büyük dünya |

### Adım 5 — yaşam döngüsü sözleşmesi

Enerji, nutrient, detritus ve external reservoir ilk kez burada kapalı bir
ekolojik zincire bağlanır. Zar geçişi, maintenance bedeli, büyüme için serbest
madde alımı, açlık, habitat içi dağılma ve decomposition ayrı olaylardır.
Bölünme önce başarılı Adım 3 morphology'sinin doğal kararlılık kırılması olarak
aranır; çıkmıyorsa enerji/madde eşiğine bağlı en küçük müdahale ayrı deneyle
kanıtlanır. Eklenen hiçbir kaynak kuvveti Adım 3 morphology korpusunu bozmaz.

Matter vent habitatın yerel, görünür ve sınırlı sürecidir. Reservoir hesabını
okur ama aktif population hedefi okuyamaz. Vent kapanırsa dünya tükenebilir;
açıkken de sonsuz ve bedelsiz madde kaynağı olamaz.

### Adım 6 — akıl ve beden sözleşmesi

İhtiyaçlar `survival`, `food`, `rest`, `reproduction`, `curiosity`, `hunt` gibi
ayrı utility girdileridir; tek davranış enum'u değildir. Algı yalnız yakındaki
alan, iz, canlı ve SDF örneklerini verir. Kusurlu hafıza bu örnekleri özetler;
nucleus öncelik/polarizasyon üretir; dağıtık aktüatörler bedeni hareket ettirir.

Void avoidance, pursuit, evasion, separation/cohesion ve yerel defense aynı
steering katmanında yarışabilir. Tail wave, burst, fatigue ve hasar gerçek
particle üyeliğine/enerjiye bağlıdır. Hareket testleri hedefe en kısa yol kadar
tereddüt, aşım, düzeltme ve akışla sürüklenmenin okunabilirliğini de değerlendirir.

### Adım 7 — keşfedilebilir sunum sözleşmesi

SelectionInfoPanel, olay toast'ları, EventLog, katman görünümü, semantic LOD ve
Observe/Follow/Free kamera ilişkisi açılır. Normal dünya sessiz ve karanlık
kalır; nutrient, light, temperature, disturbance, detritus, territory,
infection ve history aynı anda üst üste bindirilmez. Minimap bütün habitatı
özetler ama ayrı bir fizik veya gizli global organizma bilgisi üretmez.

Sunum aklı olayları önerir, yönetmez. Kullanıcı ilk girdide kamerayı geri alır.
Habitat ölümü, Void kaybı, beslenme, enfeksiyon ve burst açıklama okumadan
ayırt edilebilir; erişilebilirlik/reduced-motion aynı olay anlamını korur.

### Adım 8 — deney, kayıt ve tarih sözleşmesi

Snapshot “şimdi”, replay “buraya nasıl geldik” sorusuna cevap verir. Canlı
dünya hızlandırılmaz. Canlı dünyada kullanıcı arayüzü pause'u gerçek bir 0×
dondurmadır — simülasyon tick, fizik, alan, enerji, AI, RNG ve Void olayları
tamamen durur; resume pause süresini catch-up etmez. 0.5×/2×/4× zaman
ölçeklemesi yalnız deterministik replay'de bulunur.
Kullanıcı aynı seed ve komut dizisini çatallayıp tek müdahaleyi değiştirerek
deney karşılaştırabilir. Event log ilkler, doğum/ölüm, split/merge, göç,
çatışma, salgın ve extinction'dan biyografi ile soy ağacı türetebilir.

### Adım 9 — toplum, tehdit ve coğrafya sözleşmesi

Grup yakınlık listesi, koloni ise süreklilik + ortak kaynak + yerel tolerans ve
sinyaldir. Territory influence zamanla oluşur ve solar. Beş tehdit ailesi aynı
madde, enerji, hasar, Void ve identity yasalarına tabidir; boss spawn, uzaktan
soyut HP silme veya görünmez özel koruma yoktur. Avlanma temas, breach, koparma,
yakalama ve madde katılımıyla görünür olur.

Koloni savunması, rakip yırtıcı, parazit ve koloni kırıcı uzun zincir üretmeli;
her saniye her yerde çatışma üretmemelidir. Savaş sonrası nutrient depletion,
detritus, disturbance, infection ve territory memory coğrafyada kalır.

### Adım 10 — evrim sözleşmesi

Genom fizik yasasının kendisini birey başına değiştirmez; kalıtılabilir fenotip
parametreleri morphology'nin izin verdiği güvenli aralıkta yaşar. Kalıtım,
mutasyon ve seçilim; enerji maliyeti, çevre, avlanma, hastalık ve Void riskiyle
birlikte çalışır. Renk, cohesion, membrane, algı, risk toleransı, locomotor
anatomi ve metabolizma zamanla kayabilir. “Predator” veya “defender” etiketi
spawn edilmez; gözlenen özelliklerden türetilir.

Evrim ağacı event log ve identity sürekliliğinden çıkar. Mutasyon canlıyı tek
tick'te başka sınıfa çevirmez; nesiller boyunca okunabilir değişim hedeflenir.

### Adım 11 — ölçek sözleşmesi

Başarılı fizik ve yaşam zinciri değişmeden nüfus açılır. Sabit yoğunluk
benchmark'ı O(n²) sızıntısını, ürün benchmark'ı render/upload/UI maliyetini,
cihaz ölçümü termal ve bellek davranışını ayırır. Tempo bütçesi, render backend
ve worker yolu sırayla değerlendirilir; kamera uzaklığı hiçbirini seçmez.

Her adım tarayıcı görüntüsüyle kapanır. Kamera ayrı P0 kabulüdür ve Adım 2
sunumuyla birlikte geçmelidir. Adım 3 geçmeden identity, enerji, nucleus,
predator veya virüs kodlanmaz; gelecekteki kararlar erken script edilmez.

## 14. Negatif deneylerden çıkarılan dersler

1. Görüntüye bakmadan coverage ve FPS ile ürün kabulü yapılamaz.
2. Fizik kamera/LOD'a bağlanamaz.
3. Tek skaler metrik morphology'yi temsil edemez.
4. Elle yazılmış matrix ürün adayı değildir.
5. Seed robustness ortalamayla gizlenemez.
6. Kısa hareket uzun ömürlü canlılık değildir.
7. Dikdörtgen duvar morphology için sistemik attractor/destek üretti.
8. 100 parçacık lokal etkileşimi seed'ler arasında sürdüremedi.
9. Triangular tek-lobe kuvvet ailesi tam-config aramada qualified aday üretmedi.
10. Qualified olmayan Pareto adayı production preview değildir.
11. Dirty-source artefakt exploration olabilir, qualification olamaz.
12. Otomatik metrik insanın “uyuz gibi hareket ediyor” kararını geçersiz kılamaz.
13. Başarısız araştırma aracına daha çok CPU vermek fizik uzayını düzeltmez.
14. Field/ekoloji kuvvetleri saf morphology kanıtlanmadan açılmaz.

Eski commit ve artefaktlar git geçmişinde negatif kanıttır; güncel runtime
sözleşmesi veya gönderilen candidate catalog'u değildir.

## 15. Açıkça kapsam dışı

- Runtime müzik/ses sentezi; shipped sesler önceden üretilir. Runtime ses
  oynatımı ve spatial audio (§18) kapsam dışı değildir.
- WebGPU/compute shader; mevcut Phaser yüzeyi WebGL1'dir.
- LLM ajanlar.
- Kameraya göre değişen fizik.
- Görünmez global inward/outward border kuvveti.
- Rigid sprite yırtıcı, boss spawn'ı ve tek sayılık gerçek HP.
- Otomatik population tamamlama.
- Gerçek Navier–Stokes, ayrıntılı hücre kimyası ve insan seviyesi medeniyet.

## 16. Bugünkü durum

2026-09-14 itibarıyla:

- Paket kabuğu, i18n, Sheet, FPS, haptics, orientation ve persistence çalışır.
- FieldSet, fixed-step, stateful RNG, world metadata, SoA store, interpolation
  ve counting-sort spatial hash korunacak temeldir.
- Alan temposu `fixedStepMs`den türetilir; config ve snapshot doğrulaması tek
  girişte tamamlanır; config/metadata sahipliği kopyayla yalıtılır ve restore
  her katmanda atomiktir. Yarım runtime kurulumu ile sahne, autosave ve çıkış
  yaşam döngüleri kaynaklarını idempotent toplar.
- **Particle Substrate v2 uygulanmıştır**: `SubstrateConfig`, `PhysicsGenome`,
  `DynamicsGenes`, `PairForceKernel` (generalized multi-band directional),
  capacity-managed `ParticleStore` (512 aktif/kapasite), `ParticleSpatialHash`
  (yalnız aktif slot), organik `HabitatSDF`/`WorldDomain`, `VoidSink`
  (geri dönüşsüz deaktivasyon + `MatterReservoir`), `InitialMatterSeeder`
  (patch+cloud dağılımı), v3 snapshot codec ve persistence, çok bantlı field
  güncelleme, deterministic RNG, camera-domain handling, Void-death rendering.
- Eski 100 parçacıklı triangular fizik ve dikdörtgen impulse sınırı artık
  production'da DEĞİLDİR; yalnız negatif baseline olarak benchmark fixture'ında
  korunur.
- **Adım 3 araştırma kütüphanesi uygulanmıştır** (`scripts/morphology/`):
  `GenomeSampler`, `MorphologyMetrics`, `ClusterTracker`, `PhaseClassifier`
  (dead/stasis/gas/crystal/blob/void-loss/orbit/speed-chaos/dynamic-structured),
  `ResearchHarness` (broad→refinement→qualification), `PerturbationSystem`,
  `Shards` (deterministic work ID), `QualificationArtefact`, `PromotionFlow`,
  CLI. Headless — Phaser import etmez, `runtime/sim` çekirdeğini kullanır.
- **Brute-force oracle testi uygulanmıştır**: spatial-hash/kernel yolu doğrudan
  all-pairs referans implementation ile karşılaştırılır; aktif/pasif slot ve
  tür çifti davranışını floating-point tolerans içinde doğrular.
- 384 test geçer; coverage 96,93/93,13/93,51 (statement/branch/function).
- 512 parçacıkta p50 ≈ 0,98 ms, p95 ≈ 0,998 ms; 2048 parçacıkta p50 ≈ 13,9 ms.
- 256² field ≈ 5,4 ms/tick; 512²/4-band ≈ 5,6 ms/tick (tam tazeleme ≈ 22,4 ms).
- Qualified aday henüz çıkmamıştır; araştırma kütüphanesi production'a aday
  taşımamıştır. Bu beklenen durumdur — Adım 3 ancak technical gate +
  long-horizon + kullanıcı visual audition birlikte geçtiğinde kapanır.
- Kamera özellikleri arttı fakat kullanıcı ergonomi kabulü hâlâ FAIL'dir.
- Adım 4+ (identity, energy, nucleus, predators, viruses) hâlâ blokelidir.

## 17. Ölçülmemiş varsayımlar

Aşağıdakiler ölçülmeden karar veya tamamlanmış iş sayılmaz:

- 512 particle'ın hedef cihazlardaki gerçek CPU/render bütçesi.
- Habitat şekli, fringe genişliği ve tidal stress'in morphology'yi bozmayan
  aralığı.
- Kamera Void margin'i, zoom limitleri ve modality bazlı momentum değerleri.
- Multi-band genomun boyutu ile arama bütçesi arasındaki denge.
- Deterministik worker shard'larının seri referansla maliyet kazancı.
- Matter reservoir dönüş hızının extinction ve taşıma kapasitesine etkisi.
- Particle glyph/semantic LOD'un okunabilirlik ve GPU maliyeti.

## 18. Screen loop ve oturum yaşam döngüsü

VOL.LIFE bir simülasyon test harness değil, bir üründür. Uygulama açılışı
kaotik bir dünyaya doğrudan dalmak yerine, donmuş bir dünya gözlemi ile başlar.

### Main Menu donmuş dünyanın en uzak gözlem ölçeğidir

Main Menu oyundan önceki ayrı bir ekran değildir; aynı yaşayan dünyanın
frozen presentation state'idir. Dünya RAM'de kalır, simulation frozen'dır,
renderer alive'dır. LIFE'a tekrar basınca reload, parser veya reconstruction
yoktur — seamless resume.

Main Menu'de dünya tamamen durur: particle hareket etmez, fields ilerlemez,
AI ilerlemez, energy azalmaz, organism ölmez, RNG ilerlemez, Void olayları
oluşmaz. Yalnız presentation-only dekoratif efektler (habitat glow/breathing)
yaşayabilir.

Görünür tek aksiyon `LIFE` / `YAŞAM` düğmesidir. Settings, Continue, New
World, Quit görünürde yoktur. Kayıt varsa LIFE = devam et, kayıt yoksa LIFE =
yeni hayatı başlat. New World / Reset World Pause → Settings/World içinden
yapılır. Android Back: Quit Confirm açar.

Main Menu kamerası bütün habitat overview'ındadır (`contain`). Gameplay
kamerası ecosystem ölçeğindedir. Menu overview gameplay camera state'ini
overwrite etmez — oyuncunun son gameplay camera (x, y, zoom) ayrı saklanır.

### LIFE düğmesi menüden çıkış değil, dünyayı uyandırma eylemidir

LIFE tıklandığında üç aşamalı transition: (1) Activation ~120-180ms — letter
spacing hafif sıkışır, haptic, input kilitlenir, AudioContext resume(). (2)
Awakening ~300-450ms — scrim çözülür, LIFE yazısı küçük loading/life pulse'a
dönüşür, world kontrastına gelir. (3) Entry ~700-1100ms — camera WORLD
overview → ECOSYSTEM dalış, fresh world: simulation ilk hareketleri başlar,
saved world: restore tamamlanana kadar hareket başlamaz. Reduced motion:
kısa fade + cut to target camera.

### Entry loading sahte progress taşımaz

`WorldEntryCoordinator` gerçek task registry kullanır. Sistemler task kaydeder
(snapshot validation, world/session activation, renderer preparation, audio
context/banks/music stems, creation pre-roll, camera target; ileride organism
registry, lifecycle, AI, colony systems). LoadingScreen gerçekten tamamlanan
task'ları progress'e dönüştürür — fake 0→100 timer yok. Task gerçek progress
bilmiyorsa percentage gösterme, yalnız phase text (WORLD FORMING, LIFE
AWAKENING, READY). Yükleme 1.2 saniyeyi geçerse küçük phase text çıkar.

Loading sırasında main thread kilitlemek yasaktır. WorldEntry task'ları
async, gerekiyorsa chunked, büyük işlemlerde workerized. Transition sırasında
hiçbir synchronous task frame spike üretmemeli.

### Creation Phase gameplay history değildir

Fresh world creation: habitat → matter seed → substrate physics pre-roll →
initial structure detection → future organism identity bootstrap → future
energy initialize → future controller initialize → WORLD BORN → simulation
tick 0. Creation Phase world history değildir — organism "8 saniyedir aç"
diye başlamaz, world age gameplay başında 0.

Fresh entry hedef 2.5-4 saniye, hard upper ~8 saniye. Sabit 10 saniye
bekletme yok — ilk kaba transient 3-4 saniye içinde yatışmıyorsa
seeding/physics başarısız. Loading'i uzatarak kurtarmayız. Physics'i yavaşça
açmak için artificial force ramp eklenmez — simulation tick 0'dan gerçek
physics. Patlama kabul edilemezse InitialMatterSeeder/profile düzeltilsin.

Saved world'de pre-roll kesinlikle yok. Saved Main Menu: exact snapshot
frozen. LIFE: snapshot restore/validate → audio warmup → render warmup →
camera transition → resume exact tick. Saved world'ü loading sırasında
gizlice AI çalıştırmayız — oyuncu menu'de gördüğü organism LIFE'a basınca
ölmüş bulabilir.

### Pause gerçek simülasyon dondurmasıdır

`LifePauseController` reason/token modeli kullanır: `user`, `background`,
`transition`, `system`. Simulation ancak bütün reason'lar kalktığında devam
eder. Android lifecycle için kritik: kullanıcı pause etti, app background'a
gitti, foreground oldu — background handler yanlışlıkla resume etmez.

Pause ne durdurur: particle physics, fields, energy, metabolism, organism
age, AI, memory timer, colony signal, predator, virus, RNG, Void death,
world tick. Pause'ta çalışır: UI, menu/sheet animations, camera presentation
(gerektiğinde), autosave. Resume: pause süresini catch-up etmez.

Creation Phase ayrı bir session modudur — `FROZEN`, `CREATION`, `LIVE`
semantics. Fresh LIFE entry'de substrate ilerler ama Step 5'te energy/ageing/
metabolism başlamaz. Yalnız `paused: boolean` ile çözülmez.

### Screen state-machine explicit'tir

`LifeAppFlowController` şu state'leri yönetir: BOOTING, MENU,
ENTERING_FRESH_WORLD, ENTERING_SAVED_WORLD, PLAYING, PAUSED,
RETURNING_TO_MENU. Scattered boolean değil. Controller simulation fiziği
bilmez — `ParticleStore` import edilirse reddedilir.

`LifeScreenStack` tek lifecycle owner'dır: MainMenu, LoadingScreen, LifeHud,
PauseSheet, Toast/etc kurar, destroy'da güvenli temizler. State kararları
FlowController'da.

`LifeRuntime` simulation/presentation clock ayrımı taşır:
`advanceSimulation(delta)` + `updatePresentation(delta)`. Presentation her
render frame çalışabilir, simulation yalnız flow izin verirse. Death
animation: world time. Camera transition, menu scrim, habitat decorative
pulse: real time.

### Back navigation hiyerarşisi

Playing → Pause. Pause Settings → PauseHome. PauseHome → Resume. MainMenu →
Quit Confirm. Back navigation tek `LifeAppFlowController` sahibine gider;
`LifeExitPrompt` global back handler kaydetmez.

### Reset World autosave race'den korunur

`saveManager.delete() + location.reload()` yasaktır. Mevcut autosave
kapanırken son snapshot enqueue edebilir — delete sonrası pending save eski
world'ü diriltebilir. Flow: Confirm Reset → block autosave → cancel/drain
pending writes → delete world snapshot → create fresh metadata + new seed →
Loading/incubation → LifeScene. Preferences silinmez.

### Audio lifecycle

Main Menu: ayrı sakin menu cue, frozen world'den individual organism SFX
çalma. LIFE'a basınca: WebAudio unlock, SoundBank decode/warm, gameplay
stems preload, menu cue → gameplay ambience crossfade. İlk cold boot'ta
WebAudio autoplay güvenilir değil — ilk launch menu sessiz olabilir. Pause:
world SFX 100-200ms fade duck/pause, music pause mix'e crossfade olabilir.

### Spatial audio tasarım hedefi

Runtime ses sentezi kapsam dışıdır (§15), fakat runtime audio oynatımı
değildir. Tasarım hedefi: near organism → individual detail, mid distance →
phenotype signature, far → ecosystem aggregate ambience. Bu sözleşme
yazılmazsa gelecekte agent "§15 audio out-of-scope" diye tüm playback işini
erteleyebilir.

### Camera transition matematatiği

Zoom log-space interpolate edilir: `zoom(t) = exp(lerp(log(startZoom),
log(endZoom), easedT))` — 0.4→0.8 ile 4→8 aynı algısal hızda. Easing:
smootherstep / ease-in-out-quint (C² smooth). Süre zoom ratio'ya göre
adaptif: yakın ~700-800ms, overview→ecosystem ~900-1100ms, maksimum ~1200ms.
Reduced motion: 100-150ms fade/cut.
