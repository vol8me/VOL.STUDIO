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

| Konu                                        | Statü                     | Sonuç                                                                                                          |
| ------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 512 başlangıç aktif maddesi                 | Adım 2 baseline'ı         | Tamamlandı; Adım 3 kanonik rejimi 1024'tür — 512 yalnız ucuz katastrofik ön-filtre ve regresyon referansı (§8) |
| 1024 madde + 1536² kanonik araştırma rejimi | Kilit karar (2026-09-19)  | Adım 3'ün yeni tabanı; 512'nin yerini alır, Adım 11 değildir (§8)                                              |
| Organik `HabitatSDF` + Void                 | Kilit karar               | Dikdörtgen fizik duvarının yerini alır; morfoloji için feda edilmez                                            |
| Multi-band yönlü pair profile               | Çürütülmüş aile           | F3 kural (a) ile çürüdü; qualified halef gelene dek geçici runtime baseline'ı                                  |
| `SubstrateCandidate` profil ayrımı          | Kilit karar               | Fizik, seeding, Void ve deney koşulu ayrı profildir; Void aranmaz                                              |
| Kernel ailesi kaydı / ifade edilebilirlik   | Kilit karar (2026-09-19)  | `kernelId` tek aileye kilitli; aile kaydı + sürümlü profil ayrımı gerekir (§8)                                 |
| Fiziksel yarıçap ≠ glyph yarıçapı           | Kilit karar (2026-09-19)  | `physicalRadiusUnits` simülasyon, `particleGlyphRadiusUnits` sunum sözleşmesi                                  |
| Kalıcı `VentSite` coğrafyası                | Kilit karar (2026-09-19)  | Burst başına random origin kalkar; world-seeded sitelar, aktivite geçici (§3)                                  |
| Tip-korunumlu rezervuar                     | Kilit karar (2026-09-19)  | `external` tip başına ayrılır; Void dönüşü tipi korur, transmutation ayrı yasa                                 |
| Canlı dünyada 0× kullanıcı pause'u          | Kilit karar               | Yavaşlatma ve hızlandırma yalnız replay'dedir                                                                  |
| Uygulama kapalıyken donmuş dünya            | Kilit karar               | v1'de açılışta wall-clock catch-up yoktur                                                                      |
| Fizik ailesi sırası                         | Ön-kayıtlı araştırma yolu | `multi-lobe-v1` → `active-particle-v1` → `oriented-torque-v1` (§8)                                             |
| 10–30 dakikadan uzun canary                 | Koşullu araştırma         | Ancak ölçülen geç çöküş bunu gerektirirse açılır                                                               |
| Offline/kaba dünya simülasyonu              | Koşullu araştırma         | Ayrı ölçülen gelecekteki özellik                                                                               |
| 100 parçacık, triangular wall physics       | Reddedilen ürün yolu      | Yalnız yeniden üretilebilir negatif kontrol olabilir                                                           |
| Qualified olmayan catalog preview           | Reddedilen ürün yolu      | Development audition açık provenance ister                                                                     |
| 24 saatlik testi ilk kabul yapmak           | Reddedilen yol            | Ucuz filtre ve insan ön-elemesinden önce CPU tüketir                                                           |
| VOL.HELL ekran akışını kopyalamak           | Reddedilen yol            | VOL.HELL referanstır; bu işte migrate edilmez                                                                  |
| Flow-Lenia/sürekli substrate pivot'u        | Reddedilen yol (şimdilik) | Üç parçacık ailesi de çürümeden değerlendirilmez (§8)                                                          |

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

Canlı dünya gerçek hızında akar; yavaşlatılmaz ve hızlandırılmaz. Kullanıcının
pause'u gerçek bir 0× dondurmadır ve resume geçen süreyi telafi etmez (§18).
0×/0.5×/1×/2×/4× zaman ölçeklemesi yalnız Tekrar kipindedir. Uzun deneyler canlı
dünya hızlandırılarak değil, aynı tohum ve komutlarla ekransız çalıştırılıp
tekrar olarak izlenerek yapılır.

### Başarı ölçütü zincir uzunluğudur

Özellik sayısı değil, tek olaydan çıkan anlamlı sonuç sayısı ölçülür:

> kaynak patlaması → nüfus akını → rekabet → avcı gelişi → tükenme → göç →
> sınır çatışması

Birbirine bağlı bu zincir, aynı sayıda bağımsız özellikten daha değerlidir.
Sistem her saniye kaos üretmez; sessizlik, küçük değişim, göç, çatışma ve
yeniden sakinlik ritmi hedeflenir.

### Madde bütçesi: Adım 2 baseline'ı 512, Adım 3 kanonik rejimi 1024

Eski 100 parçacık rejimi gerçek cihaz ve uzun ufuk deneylerinde lokal
etkileşimi sürdüremedi; beş sabit tohumun yalnız biri kabul eşiğini geçti.
Particle Substrate v2 bu nedenle **512 aktif parçacıkla** başladı — bu artık
Adım 2'nin tamamlanmış baseline'ıdır, Adım 3'ün kanonik tabanı değildir (v2
revizyonu aşağıda).

512 sonsuza kadar kutsal bir ürün sayısı veya “ölçek tamamlandı” iddiası
hiç olmadı; Adım 3'ün kanonik araştırma rejimi 1024'tür ve ürün varsayılan
ölçeği henüz cihazda doğrulanmadı. Parçacık, organizma ve
bilişsel ajan bütçeleri ayrı ölçülür:

| Bütçe         | Ne sayar                    | Ana maliyet                           |
| ------------- | --------------------------- | ------------------------------------- |
| Parçacık      | Fiziksel madde              | Kuvvet, spatial hash ve render        |
| Organizma     | Kimliği izlenen yapı        | Küme sürekliliği ve kayıt             |
| Bilişsel ajan | Karar veren olgun organizma | Algı, hafıza ve utility değerlendirme |

Dünya büyüklüğü ile nüfus bağımsız sayı seçilmez. Etkileşim yarıçapı, yerel
yoğunluk ve dünya alanı birlikte ölçülür. Dünya yine %70–90 sakin/boş
kalabilir; başlangıç maddesi tüm alana uniform serpilmek yerine yerel
başlangıç yamalarda yoğunlaşır. Ölçeği 10k–250k aralığına açmak Adım 11'in
işidir.

Yaklaşık yerel komşuluk `N × πR² / worldArea` ile izlenir. Dünya kenarı iki
katına çıkıp alan dört katına çıktığında aynı yoğunluk karakteri yaklaşık dört
kat madde isteyebilir; bu otomatik ölçekleme kuralı değil, benchmark hipotezidir.
Başarılı morphology ölçülmeden dünya ölçüsü `4096²` veya `8192²` gibi estetik
bir sayıya kilitlenmez. Habitat onlarca tipik-organizma uzunluğu taşıyacak
şekilde sonuçtan türetilir.

**2026-09-19 revizyonu — kanonik araştırma rejimi v2.** 512 madde / 1024²
depolama rejimi Adım 3'ün nihai tabanı değildir: K3 koşusunda yapılar temas
mesafesinde jammed paket çıktı (`meanNeighborCount = 80,76`, çap 9 birim) ve
dört başlangıç yaması tek dev konfeti topa erken çökmeyi kolaylaştırıyor. Yeni
kanonik taban **1024 aktif madde + 1536×1536 depolama + 8 origin yaması**dır;
ayrıntı ve hesap §8'de. 512 rejimi hızlı broad-search ve regression ölçeği
olarak korunur; bu değişiklik Adım 11 ölçek işi değil, morphology'nin düşük
yapısal çözünürlük tarafından sınırlanmasını önleyen araştırma tabanı
kararıdır.

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

Bu nedenle aktif madde bütçesi eşit sayıda organizma anlamına gelmez; madde
serbest bulut, beden, detritus ve dış rezervuar arasında farklı zamanlarda
farklı dağılır.

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

Mesafe artık yaklaşık değil, gerçek izdüşüm mesafesidir: `sampleDistanceAndNormal`
sorgu noktasından kontura Newton izdüşümü yapar. Uzak noktalarda arama,
kurulumda bir kez hesaplanan 256 noktalı kaba kontur tablosundan başlar — sorgu
açısından başlayan Newton merkez çevresinde başka bir durağan noktaya kaçıyordu
(ölçüldü: iç bölgede 63,3 birime kadar hata). Ölçülen sonuç: depolama
dikdörtgeninin tamamında (6 seed, 24.576 örnek) en büyük hata 4,3e-5 birim,
1 birimi aşan örnek yok; 200 seedlik korpus `test:long`da koşar.

Gerçek işaretli mesafe ışın boyunca MONOTON DEĞİLDİR: merkez çevresinde en yakın
kontur noktası değiştikçe mesafe artabilir (bağımsız referansta 4,0 birime kadar).
Geometri sözleşmesi bu yüzden monotonluk değil, her ışında işaretin tam bir kez
değişmesidir — cep, delik ve kendini kesen kontur böyle dışlanır.

İşaret tek başına yetmez; fringe genişliği, `edgeDistance`, render fade ve
ileride algı mesafenin büyüklüğüne dayanır. Bu yüzden:

- mesafe dünya birimidir; gerçek işaretli mesafe değilse hata sınırı açıkça
  belirtilmiş ve testle kilitlenmiş bir yaklaşıktır;
- normal sonludur ve tanımlı olduğu her yerde birim uzunluktadır;
- mesafe ve normal tek örneklemede birlikte alınır
  (`sampleDistanceAndNormal(x, y)`);
- hiçbir tüketici örtük şekil fonksiyonunun ham ölçeğine dayanamaz.

Habitat üreteci topoloji değişmezlerini sağlar ve seed korpusunda testle
kanıtlar: tek bağlı habitat, iç delik yok, asgari boğaz genişliği, sınırlı
eğrilik ve asgari güvenli iç bölge. İnce boğaz, kapalı cep veya delik üreten bir
seed ekolojiyi üretim artefaktına bağımlı hâle getirir.

Ön-kayıtlı sınırlar ve 1000 seedlik korpusta ölçülen en kötü değerler: habitat
4-komşulukla tek bileşen, Void 8-komşulukla taranır ve kenara değmeyen bileşen
(iç delik) bulunmaz; eğrilik yarıçapı ≥ 2 × fringe + 4 birim; boğaz ≥ 2 × kernel
cutoff, tanımı konturda en az çeyrek çevre ayrık iki nokta arasındaki en küçük
mesafedir; güvenli iç bölge (d ≥ fringe + yama yarıçapı) habitat alanının en az
%50'si. Güvenli iç bölge koşulunun config düzeyinde kanıtlanabilen muhafazakâr
alt sınırı `validateSubstrateConfig`tedir: iki yarıçap ayrı ayrı küçültülür,
analitik oran varsayılan adayda 0,561 iken gerçek maskede 0,592 ölçülmüştür.
Seeding araması yama yarıçapını 90 birimin üstüne çıkardığında örnek bu kapıda
geçersiz sayılır.

Field solver habitat maskesini kullanır. Void hücreleri kaynak üretmez;
habitat–Void yüzeyinde difüzyon no-flux davranır. Karşı kenarlar komşu değildir
ve wrap yoktur.

Örnekleme de maske farkındadır: `FieldSet.sample` çift doğrusal ağırlıklardan
Void hücrelerini düşer ve kalan ağırlıkları yeniden normalize eder. Dört hücre
de habitatsa sonuç maskesiz bilineer yolla bayt düzeyinde aynıdır; dört hücre de
Void ise 2×2 şablonu çevreleyen tek hücrelik halkadaki en yakın habitat hücresi
deterministik sırayla okunur, o da yoksa 0 döner. Aksi hâlde kıyıdaki her örnek
Void'in sıfırını ağırlığa katar ve kaynak yapay olarak düşerdi.

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

`InitialMatterSeeder`, yapılandırılmış aktif madde bütçesini birkaç yoğun
origin patch, serbest matter cloud ve seyrek bölgeye dağıtır. Bu bir
organizma çizmez; yalnız lokal etkileşimin başlayabileceği madde koşulunu
kurar. Seeder parametreleri fizik yasasından ayrı `SeedingProfile`dır (§3);
dünya seed'i ne fizik ne de seeding config'idir.

Başlangıç dağılımı fizik yasasından ayrı tutulur ama önemsiz sayılmaz. Aynı
`SubstratePhysicsProfile` yoğun origin patch, seyrek cloud ve farklı type
oranlarında sınanır; yalnız tek “şanslı” başlangıç deseninde yaşayan aday robust
değildir. Seeder hiçbir çekirdek, zar, kuyruk veya avcı şekli çizemez.

Başlangıç bir launch envelope içinde kalır: ilk saniyelerde maddeyi Void'a
fırlatan, hız tavanında patlayan veya seed çoğunluğunda felaket kayıp üreten
fizik/seeding çifti başarısızdır. Kötü başlangıç reroll ile ya da seed seçerek
gizlenmez; ölçüsü başlangıç sağkalımı metrikleridir (§8).

### v2 seeding revizyonları (2026-09-19 devam analizi)

Başlangıç ekimi ile devam eden ekolojik dönüş **iki ayrı sistemdir**:
`InitialMatterSeeder` dünya doğumunun parçasıdır ve Step 3'te çalışır;
`ecologicalVent` yolu ürün ekolojisidir ve intrinsic ölçümde kapalıdır.
Seeder iskeleti korunur (patch + cloud + sparse uniform soup'u reddeder ve
morfolojinin başlayabileceği birkaç reaksiyon bölgesi kurar) ama v2 rejiminde
üç kusuru kapanır:

- **Origin'ler bağımsız rastgele değil, ayrık olur.** Bugün `patchCount` kadar
  merkez birbirinden bağımsız `placeInside` ile seçiliyor — iki merkez
  neredeyse üst üste doğabilir; 4 yamada mümkün olan bu risk 8 yamada
  büyür. v2'de origin merkezleri minimum ayrım mesafesiyle seçilir
  (blue-noise / Poisson-disc mantığı): rastgele görünür ama iki başlangıç
  bölgesi birbirinin üstüne doğmaz. Yapay ızgara da istenmez.
- **Parçacık doğumları üst üste gelemez.** `placeNear`/`placeInside` yalnız
  "habitat içinde miyim?" sorusunu sorar; iki parçacık aynı noktada doğabilir
  ve ilk saniyeleri sert kuvvetlerle ayrışmaya harcar. v2'de doğum konumu
  geometrik olarak mevcut parçacıkların içine düşmez — mükemmel dizilim
  değil, yalnız penetrasyonsuz başlangıç. Bu, §8'in non-penetrating packing
  kararının doğum anına uzatılmasıdır.
- **Her origin temel tip çeşitliliğine sahip olur.** Bugün altı tip parçacık
  başına `typeWeights` ile global-random seçiliyor; bir yama gerekli tip
  kombinasyonunu şans eseri alamayabilir ve aday başarısızlığı "fizik mi,
  şans mı?" sorusunu cevapsız bırakır. v2'de her origin altı tipin hepsini
  temsil eder, kalan parçacıklar random dağıtılır — steril %100 eşitlik
  değil, adil deney koşulu. Bu bir organizma çizmek değildir.
- **Kontrollü geçiş:** patch/cloud/sparse oranı (0,55/0,30/0,15), yama
  yarıçapı ve başlangıç hızı ilk turda DEĞİŞMEZ. Aynı anda her şeyi
  değiştirmek v2 sonucunun nedenini okunamaz kılar.

Seeding'in deterministik başarısızlık sözleşmesi (2026-09-19 consistency
pass): yerleştirme **bounded attempt** kullanır — origin ayrımı ya da
penetrasyonsuz doğum için config geometrik olarak mümkün değilse
**deterministik validation FAIL** olur; minimum ayrım sessizce
gevşetilmez ve world seed reroll edilmez (kötü başlangıç reroll ile
gizlenemez — §8'in aynı kuralı). Minimum doğum mesafesi glyph yarıçapına
değil FİZİKSEL çapa (9 birim) bağlanır — penetrasyon fizik olayıdır,
sunumdan bağımsızdır. Seeding RNG'leri named akışlara ayrılır:
`seeding.origins`, `seeding.positions`, `seeding.types`, `seeding.velocity` —
tip çeşitliliği kuralı değiştiğinde origin geometrisi kımıldamaz (mevcut
named-RNG felsefesinin devamı).

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

"Aptal" **özelliksiz nokta** demek değildir (2026-09-19 analizi). Parçacığın
açı, açısal hız, yönlü etkileşim portu veya tork gibi FİZİKSEL serbestlik
dereceleri taşıması bu kuralı bozmaz; koloni, besin veya düşman hakkında semantik
karar vermesi bozar. İzotropik nokta varsayımı morphology araştırmasının
kendisini sınırlıyor (§8): yalnız mesafeye tepki veren bir parçacık kol, zincir
veya yönlü bağ üretemez; simetri kırılması tamamen noise'a kalır. "Dumb
particles, smart organism" sözleşmesi korunur — yeni fizik aileleri parçacığa
biliş değil, mekanik ekler.

Korunan `ParticleStore` SoA yaklaşımı v2'de genişler:

- `capacity` ile aktif sayı ayrılır;
- active/inactive maskesi bulunur;
- stable ID storage slotundan ayrılır;
- Void ölümü slotu pasifleştirir, diziyi kaydırmaz;
- yeni madde boş slotu kullanabilir ama yeni stable ID alır;
- snapshot active maskeyi, ID sayacını ve rezervuarı taşır.

Slot yaşam döngüsünün tek kanonik giriş ve çıkışı vardır (`activateSlot` /
`deactivateSlot`). Etkinleştirme önceki konum, hız, kuvvet, interpolasyon ve
render geçicilerini sıfırlar; pasifleşen slot kanonik boş temsile iner, böylece
aynı mantıksal durum aynı snapshot baytlarını üretir. Stable particle ID
genişliği açıktır (32 bit) ve tükendiğinde sessizce sarmaz, hata verir. Adım 5'in
matter vent'i slot yeniden kullanımını yoğunlaştıracağı için bu sözleşme ondan
önce testle kilitlenir.

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

Yönlü/asimetrik A→B ve B→A ilişkileri farklı olabilir. Fizik yasası, başlangıç
maddesi, kıyı fiziği ve deney koşulu tek nesnede yaşamaz; araştırma
semantikleri ayrıdır:

```
SubstrateCandidate
├── SubstratePhysicsProfile   pair yasası — aranır
├── SeedingProfile            başlangıç maddesi — launch envelope içinde aranır
├── VoidProfile               kıyı fiziği — Adım 2'de sabit, aranmaz
└── provenance                artefakt, korpus, revision, digest
```

- `SubstratePhysicsProfile`: 6×6 yönlü strength matrisi, 3×3 yönlü role/range
  matrisi, az sayıda global lobe radius/shape parametresi, damping, speed
  envelope ve force scale. Arama uzayını kontrolsüz 180 boyuta çıkarmamak için
  bu kadardır; kernel kimliği bu profilde sürümlenir.
- `SeedingProfile`: patch sayısı, yarıçapı ve doluluğu, cloud payı, yerel
  yoğunluk, tür dağılımı ve başlangıç hızı.
- `VoidProfile`: fringe genişliği ve tidal stres. Adım 2'de sabitlenir;
  morphology araması onu optimize edemez. Void ayrı stress senaryosunda
  değerlendirilir; “en güzel yapı fringe desteğiyle oluşuyor” çözümü bu yüzden
  aranabilir değildir.
- `ExperimentScenario`: domain/matter seed korpusu, perturbation ve süre.
  Production config'ine girmez.

Rol eşlemesi bir morfolojiyi önceden ilan etmez; yalnız arama parametrelerini
paylaşmanın boyut indirgeme aracıdır. Kalıcı aday matris olarak değil **tam
`SubstrateCandidate` paketi** olarak üretime taşınır; paketteki profillerin
araştırma semantiği yine ayrı kalır. Adım 10'un kalıtılabilir organizma genomu
bu paketle aynı şey değildir.

World seed adaya girmez. Aynı aday bütün seed korpusunda aynı fizik yasasını
kullanır.

### Çürütülen ailenin yapısal tavanı ve `SubstrateInteractionModel`

2026-09-19 analizinin kök bulgusu: `generalized-asymmetric-multi-band`'in
başarısızlığı parametre değil İFADE GÜCÜ sorunudur. Üç mekanik sınır
belgededir:

1. **Loblar aynı çift fikrini paylaşır.** `bandScales = [0,35, 1, 0,45]` global
   ölçeklerdir; üç lobe aynı pair strength'in işaretini üç mesafede
   şiddetlendirir. Aile "10 birimde it, 25'te çek, 50'de it, 75'te çek" gibi
   çift başına bağımsız işaretli loblar ifade edemez; çoklu denge mesafesi
   (shell/nested ring/satellite) üretemez.
2. **Parçacık durumu tamamen izotropiktir.** `x, y, vx, vy, type` vardır; açı,
   açısal hız, oryantasyon, bağ portu veya heading yoktur. Doğal çıktılar
   topak, halka, kristal, bulut, kovalayan çift ve orbit'tir — kol, zincir ve
   yönlü bağ bu durum uzayında ifade edilemez.
3. **`PairForceKernel` arayüzünün kendisi skaler/radyaldir.**
   `magnitude(distance, ownType, otherType)` imzası tork, hizalanma ve aktif
   ilerleme taşıyamaz; aktif/yönlü etkileşim araştırması arayüzün kendisini
   aşar.

Araştırma tarafı bu yüzden kernel yerine daha geniş bir soyutlama üzerinde
çalışır: **Substrate Interaction Model** — `ParticleStore` (temel SoA: konum,
hız, tür, stable ID, aktif maskesi korunur) üstünde aile başına seçilebilir
etkileşim modeli ve gerekiyorsa aileye özgü ek SoA sütunları (`angle[]`,
`angularVelocity[]` gibi — yalnız o aile kullanır, bütün parçacıklara
zorlanmaz). Production yine TEK model taşır; araştırma üç modeli aynı
gameplay'de koşturmak zorunda kalmaz. Aile seçimi `if kernelId === ...`
zincirine değil, sürümlü ve ayrıştırılabilir profil ayrımına (discriminated
profile) dayanır; `SubstratePhysicsProfile.kernelId`'nin tek aileye kilitli
tipi bu değişimin ilk adımıdır (TODO Adım 3).

Dış mekanik emsaller (§11): Atomic Clusters merkez-dışı yük noktalarıyla tork
ve moleküler geometri üretir; PPS basit self-propelled parçacıklarla biliş
olmadan protocell-benzeri yapıya ulaşır; Ventrella karmaşıklığın binlerce
parçacıkta belirgin zenginleştiğini gösterir. Ders: directionality'nin bir
kısmı Adım 6'nın AI'ını beklemeden fiziğin kendisinden çıkabilir — kuyruk/
aktüatör davranışı böyle bir substrate üzerinde çok daha doğal kurulur.

### Madde korunur, enerji akar

Habitat içindeki organizma ölümü ile Void ölümü aynı değildir:

| Olay          | Madde                                                | Enerji/kaynak                      |
| ------------- | ---------------------------------------------------- | ---------------------------------- |
| Habitat ölümü | Üyelik çözülür, parçacıklar serbest aktif madde olur | Enerji dağılır; stok detritus olur |
| Void ölümü    | Aktif dünyadan dış rezervuara geçer                  | Habitatta besin bırakmaz           |

Enerji doğrudan nutrient'a çevrilmez. Organizmanın depoladığı biyokütle/besin
detritus olur; detritus yavaşça nutrient'a çözünür. Böylece ölüm yeni hayatı
besler fakat bedava enerji üretmez.

Bu zincirin defteri Adım 5 kodundan önce kapanır: bugünkü sözleşmede nutrient
alımı yalnız enerji deposuna yazılır ve “depolanmış biyokütle” ayrı bir state
olarak tanımlı değildir. Değişmez kilitlidir: ışık kaynaklı yenilenme dışında
hiçbir yol nutrient, biyokütle veya detritus yaratamaz; enerji harcaması madde
üretmez. Mekanizma iki adaydan biri olarak seçilir ve korunum testiyle
kanıtlanır:

- nutrient alımı enerji ile ayrı bir organik rezerve bölünür; ölümde yalnız
  harcanmamış rezerv detritus olur, enerji dağılır;
- detritus alınan besinden bağımsız, açıkça tanımlı başka bir fiziksel
  kaynaktan türetilir.

Büyüme yeni madde yaratmak değil, serbest parçacığı bünyeye katmaktır.
Bölünme önce fizikten aranır; çıkmazsa enerji eşiğine bağlı sınırlı müdahale
Adım 5'te ayrıca kanıtlanır.

Zar görsel kabuk değildir; madde ve nutrient geçişini yöneten işlevsel
sınırdır. Üyeler bulundukları çevreden yerel kuralla nutrient alır, kaynak
ızgarası aynı miktarda azalır ve organizma deposu artar. Ölüm yalnız identity
etiketini silmez: cohesion/üyelik çözülür ve ekranda gerçekten dağılma olur.
Avcının kopardığı particle için ayrı envanter veya “taşı” sistemi yoktur;
kopan madde fiziksel olarak yeni yapıya katılırsa zaten taşınmış olur.

### Viskoelastik temas ve homeostatik vent direktörü

2026-09-18'de küme içi yapışma, kristal donması ve nüfus çöküşü analiz edilerek
şu fizik ve ekoloji sözleşmesi kilitlenmiştir:

1. **Viskoelastik Temas Hacmi (`exclusionRadiusUnits = 9.0`, `exclusionStrength = 1.2`):**

   - Dışlama yarıçapı parçacığın geometrik çapına ($2 \times radiusUnits = 9.0$) eşittir.
   - $d > 9.0$ mesafesinde yapay dışlama kesinlikle sıfırdır; genomdaki çekim ve
     kovalama dinamikleri (amip, protozoa, hücre uzuvları) %100 serbest çalışır.
     Yarıçapın çapı aşması ($d = 18$ gibi) çekimi bastırarak inorganik tuz kristali
     donmasına (lattice freezing) yol açtığı için yasaklanmıştır.
   - $d < 9.0$ mesafesinde kuadratik yumuşak yay gradyanı devreye girer. Parçacıklar
     birbirinin içine %50'den fazla nüfuz edemez (çamurlaşma biter), fakat sert bilardo
     topu gibi çarpışmak yerine viskoelastik bir sıvı gibi birbirinin üzerinden kayar.
     Eski doğrusal temas bariyeri `contactStrength = 0`'a indirilmiştir (alan config'te
     durur ama etkisizdir). Tekillikli/sapan bariyer rolünü K3'te kernel'in ıraksak sert
     çekirdeği devraldı: `hardCoreRadiusUnits = 11`, `hardCoreStrength = 0,42`,
     $-s \cdot ((r/d)^2 - 1)$ — $d \to 0$'da ıraksayan bir terimdir ve genom
     doğrulaması yarıçapın çaptan BÜYÜK olmasını şart koşar. İki temas katmanı
     (yumuşak dışlama $d<9$, kernel sert çekirdeği $d<11$) bugün birlikte aktiftir.
   - Hız uzama tavanı (`particleVelocityStretchMax = 1.25`) ile parçacıklar yön hissi
     verirken komşu hücrelerin üstüne taşmaz.

2. **Homeostatik Ekolojik Vent Direktörü (`LifeWorld.ts`):**
   - 60 saniyede bir 50 parçacığı tek karede boca eden ("patt") toplu reseed kaldırılmıştır.
   - Rezervuardaki madde, güvenli iç bölgede seçilen bir gayzer/baca noktasından
     tam 1.0 saniye (`ventCadenceTicks = 60`) aralıkla tek tek ("pıt... pıt... pıt...")
     ekosisteme doğar.
   - Her doğum `ParticleSpawnRenderer` ile 450 ms'lik genişleyen bir su dalgası (ripple ring)
     ve merkez ışıltısıyla görselleştirilir; bir sonraki parçacık ilki açılana kadar beklemede kalır.
   - Mikro-grup (8-12 parçacık) tamamlandığında 5 saniyelik (`ventCooldownTicks = 300`)
     ekolojik dinlenme başlar. Ölçülen debi ~10 parçacık/~14 sn ≈ 40–45/dk'dır —
     "~50–70/dk kaybı dengeler" iddiasının biraz altındadır ve bu hata değildir:
     bütün dış madde geri dönmek zorunda değildir, dünya zamanla biraz küçülebilir
     ve bu ekoloji için doğaldır. Nüfus yine de çölleşmez (7. dakikada 500+ aktif
     madde) ve ekoloji dinamik homeostaziste kalır.
   - **Vent state'i snapshot dışındadır (2026-09-18 tescilli açık).**
     `ventRemainingInBurst`, `ventCooldownRemaining`, `ventNextSpawnTick` ve vent
     orijini `LifeWorldSnapshot`'a girmez. Aynı örnek üzerinde restore (long-run ve
     perturbation yolları ikisi de böyle çalışır) açığı MASKELER: vent sayaçları
     snapshot anındaki değerlerine dönmez, koşu sonundaki değerleriyle kalır; rezervuar
     boşaldıktan sonra vent üretim yapmadığı için bayt eşitliği yine de tutar.
     Persistence yüklemesi ise yeni `LifeWorld` örneğine restore eder — vent takvimi
     60 saniyelik başlangıç cooldown'una sıfırlanır ve yarım kalan burst kaybolur.
     Bu bir determinizm açığıdır: ya snapshot'a vent state'i girer (codec v5) ya da
     "yüklenen dünya vent takvimini sıfırlar" açık ürün kuralı olur ve replay
     determinizmi iddiası buna göre daraltılır. Karar ve iş TODO'dadır.
   - **Vent ekolojik nüfus bakımıdır, morfoloji kanıtı değildir.** Rezervuarı güvenli
     iç bölgeye geri basmak kaybolan maddeyi telafi eder ama yapı kurmaz; vent'in
     eklediği taze serbest madde ölçümü dalgalandırır (B3 testere-dişi analizi, §8).
     Bu yüzden vent'li koşularda "koruma" ekolojik sağkalımı ölçer, intrinsic
     morfolojiyi değil — ayrım §8 ölçüm katmanı açıklarında detaylıdır.
   - **Vent takılabilir bir madde-iade politikasıdır (MatterReturnPolicy).**
     Araştırma senaryosu `none` (saf substrate: dünya kendiliğinden
     tükenebilmeli), ürün senaryosu `ecologicalVent` koşar; gizli if/else yerine
     açık subsystem policy seçilir. Bu sayede intrinsic morphology ölçümü vent
     kontaminasyonu olmadan koşulur ve vent'li ürün kanaryası ayrı senaryo olarak
     kalır.
   - **`LifeWorld` orkestratördür, sahip değil.** Vent yaşam döngüsü ve spawn
     takvimi `MatterVentDirector` benzeri ayrı bir alt sisteme taşınır; `LifeWorld`
     alan, parçacık fiziği, Void, rezervuar ve vent'i sırayla çağırır ama vent'in
     iç durumunu kendi private alanlarına gömmez. Bu hem snapshot açığının hem
     Adım 5'te eklenecek energy/nutrient/detritus büyümesinin ön temizliğidir.
   - **Vent hiçbir zaman nüfus hedefi okuyamaz.** "aktif < N → spawn" kuralı
     yasaktır (Adım 5 sözleşmesi de aynısını söyler); vent rezervuar ve kadans
     okur, sayaç okumaz. Dünya extinction'a gidebilir — bu hata değil nadir bir
     tarihtir.
   - **Bugünkü `updateEcologicalVent` prototip madde-iade direktörüdür, final
     ekoloji değildir (2026-09-19 devam analizi).** Korunan kararlar:
     rezervuar üzerinden geri dönüş, nüfus hedefi okumama, tek karede toplu
     reseed yapmama, parçacıkları zaman içinde tek tek çıkarma, spawn'ın ayrı
     sunum olayı olması, `lifecycle` için ayrı deterministik RNG akışı ve yeni
     parçacığa yeni stable ID vermesi. Dört kusur ayrı maddelerdedir.
   - **Kusur — burst başında toplu rezervasyon madde kaybıdır.**
     `reseed(toReseed)` burst'ün tamamını rezervuardan hemen düşer;
     parçacıklar saniyelerce "bekleyen kuyrukta" kalır — ne aktif dünyada ne
     rezervuarda. `ventRemainingInBurst` snapshot dışında olduğu için burst
     ortasında alınan kayıt yüklendiğinde bekleyen madde TAMAMEN kaybolur: bu
     yalnız determinizm açığı değil, **madde muhasebesi açığıdır**. Final
     modelde rezervuardan madde burst başında değil her gerçek emisyon
     anında 1 adet çekilir — hayalet madde kalmaz, save/load trivial kalır.
   - **Kusur — her burst yeni random origin seçer; coğrafya yoktur.** Bugünkü
     sistem "görünmez director teleport noktası"dır; organizmalar
     öğrenebilecekleri bir coğrafyaya sahip olamaz ve koloni/territory/
     av-bekleme emergence'ı üretilemez. Final modelde vent **kalıcı
     `VentSite` coğrafyasıdır**: dünya yaratılırken world seed'den birkaç
     sabit site kurulur; yerler dünyaya aittir, save/load'da aynı kalır.
     Site'lar sürekli aktif olmaz — Yellowstone gayzeri gibi yer kalıcı,
     aktivite geçicidir; site başına aktivite/dormancy ritmi dünyanın
     "coğrafi karakteri" olur. Site konumu nüfus okumaz (sol tarafta canlı
     az → oraya vent koymak gizli director'dür, yasaktır); site'lar
     birbirinden ve kıyıdan ayrılır — yalnız merkez değil emisyon diski +
     Void fringe + güvenlik payı hesaba katılır. Site sayısı şimdiden
     kilitlenmez: 1536² dünya çıktıktan sonra ölçülür; "her yerde vent var"
     hissi değil ekolojik hotspot hedeflenir. Site'ların versioning
     sözleşmesi: world-seeded türetme placement algoritması değiştiğinde aynı
     seed'in farklı coğrafya üretmesine izin verir — bu yüzden site
     koordinatları dünya yaratımında kalıcı world state'e YAZILIR VE
     `ventSiteGeneratorVersion` ruleset provenance'ında tutulur (ikisi
     birden). Her site'ın RNG ritmi site kimliğinden türetilen bağımsız
     substream'dir: yeni site eklemek diğer ventlerin emisyon takvimini
     kaydıramaz.
   - **Kusur — doğum konumu fringe içine düşebilir.** Origin 28 birimde
     (`safeEdgeMargin + 4`) doğrulanır ama parçacık 0–12 birim drift ile
     doğar: outward yönde 16 birime iner ve tidal fringe (24) içinde
     doğabilir — "doğar doğmaz Void stresi". Final modelde doğrulanan şey
     origin değil GERÇEK doğum konumudur; her parçacık spawn pozisyonunda
     güvenli iç bölgede olmalıdır.
   - **Kusur — rezervuar tip-korunumsuzdur.** `external` tek sayaçtır; cyan
     Void'a girip orange çıkabilir — madde sayısı korunur ama kimyasal
     kompozisyon korunmaz ve doğal seçilim/kıtlık sinyalini engine sessizce
     geri düzeltir. Karar: **tip global madde kimliğinin parçasıdır ve Void
     dönüşünde varsayılan olarak korunur** — `external` tip başına ayrılır,
     vent'ten giren tip çıkar. İleride "Void maddeyi dönüştürür" istenirse bu
     sessiz random retyping değil açık bir ekoloji mekaniğidir. Test
     sözleşmesine işlenen invariant: açık bir transmutation mekaniği
     gelene kadar her tip için `activeMatter[t] + externalReservoir[t] =
initialMatter[t]`; Void crossing, vent emisyonu, snapshot/load ve
     slot reuse olmak üzere dört durumda sınanır. Tip-başına rezervuar
     snapshot şemasını değiştirir — codec/migration işi TODO'dadır.
   - **Vent ritmi mekanik değil nefeslidir.** Bugünkü tam 1,000 sn kadans + sabit
     5 sn cooldown "sistem çalışıyor" hissi verir. Final modelde deterministik
     jitter'lı kadans (aynı ortalama debi, metronom değil) ve site başına
     aktivite/dormancy ritmi kullanılır; RNG deterministik olduğu için
     replay/save etkilenmez. Ritim hiçbir zaman nüfus sayısına bağlanmaz.
     Bugünkü `ventCadenceTicks = 60`, burst 8–12, cooldown 300 parametreleri
     (≈40–45 parçacık/dk) **legacy kalibre edilmiş baseline**dır — 512/1024²/
     K3 dünyasına aittir; yeni 1024/1536² rejimde Void kayıp hızı değişir ve
     debi VentSite'a geçişte yeniden ölçülür — eski dünyanın nüfus bakım
     debisi yeni ekolojinin doğal yasası sanılmaz.
   - **Organizma vent'in üstüne oturabilir — bu emergence'dır.** Site'lar dünya
     doğumunda kurulur; sonradan organizma kaynak bölgesini kolonize edebilir
     ve engine bunu engellemez. Yasak olan tersidir: engine'in yaşayan
     organizmanın İÇİNE sonradan vent teleport etmesi director müdahalesidir.
   - **Vent'in morfolojiye müdahalesi kontrol altındadır.** Random-origin vent
     mevcut yapının içine doğabilir ve yapıyı suni besler — "kendini güzel
     sürdürüyor" etiketi sahte kanıt olur. Bu, intrinsic ölçümde vent'in
     kapalı kalma kararını bir kez daha doğrular; spawn'ın dört ayarı
     (nerede, ne yoğunlukta, hangi tip, hangi hız/yön, ne sıklıkta) morfolojiyi
     doğrudan değiştirir ve cognition öncesi en güçlü dış kuvvettir.

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

### Kamera ölçekleri ve açılış odağı — GERİ ALINDI (2026-09-17)

Bu turda D1 (girdi/kadans ayrımı, modalite profilleri, asimptotik sınır
direnci) ve D2 (ECOSYSTEM açılış ölçeği + yoğunluk ağırlıklı açılış odağı)
uygulanmış, sonra **kullanıcı kararıyla tamamı geri alınmıştır**: cihazda
denendiğinde kamera kötü hissettirmiş ve yakın açılış zoom'u istenmemiştir.

Kod 8b385ad öncesindeki davranışa döndü: `WorldCameraController` olayları
doğrudan uygular, modalite profili ve `setState` yoktur; açılış `fit:'contain'`
ve zoom 1 ile bütün habitatı gösterir. Ölçek tablosu, açılış odağı çözücüsü ve
kamera aday ölçüleri (D5) kaldırıldı.

Kamera yeniden ele alınacaksa ölçüyle değil, ÖNCE kullanıcının elinde denenerek
tasarlanmalıdır: bu turda ölçülen "kare başına tek uygulama" ve "sınırda geri
sekme yok" iddiaları doğruydu ama kullanıcı kabulünü vermedi. Kamera maddeleri
TODO'da yeniden açık.

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

Kıyı ve ışıması doğrudan SDF mesafesinden rasterize edilir. Kontur noktalarını
normal yönünde öteleyip çizgiyle bağlamak reddedilmiştir: yüksek eğrilikte
ötelenen noktalar çaprazlanır ve düz kiriş Void'den habitatın içine geçen çizgi
olarak görünür. Mesafe rasterı kendiliğinden kapalıdır ve fizikle aynı mesafe
kaynağını kullanır.

Raster KURULUMDA koşmaz. 512² doku tek seferde 723 ms ölçüldü (2026-09-16) ve
§18 yükleme sırasında ana iş parçacığını kilitlemeyi yasaklar; doku bu yüzden
kare bütçesiyle (`habitatGlowRasterBudgetMs`, 6 ms ≈ 4 satır/kare) satır satır
dolar ve ~128 karede tamamlanır. Bant yazımı bandın dışındaki baytlara dokunmaz:
bütün bantlar koştuğunda sonuç tek seferlik rasterle bayt bayt aynıdır. Dünya
kurulumunda kilitlenen toplam süre bu değişiklikle 1535,7 ms'den 138,3 ms'ye
indi (kalanı: domain 2, 256² maske 19,1, 256² gölge 117,2 ms).

Void ölümü sunuma değişmez bir olay olarak teslim edilir: stable ID, tick,
konum, hız, görsel tür ve normal kopyasını taşır. Renderer ölüm animasyonu
boyunca `ParticleStore` slotuna geri bakamaz; aksi hâlde aynı pencerede yeniden
kullanılan slot yeni parçacığın verisini ölüm efektine sızdırır. Olaylar iki
ayrı kanaldan akar: `TransientPresentationEvent` (smear, flash gibi yalnız
sunum) ve `WorldEvent` (“organizma #42 Void'da öldü” gibi dünya tarihi, Adım 8
olay günlüğü). Sunum olayı tarihe yazılmaz; tarih olayı efekt ömrüne bağlı
değildir.

Habitat ölümü farklı görünür: core ritmi söner, zar düzeni çözülür, renk solar,
beden serbest madde bulutuna dağılır ve bölgede hafif detritus/disturbance
kalır. Oyuncu Void kaybı ile geri dönüşümü açıklama okumadan ayırabilmelidir.

### Vent sunumu kaynağı gösterir, doğumu bağırmaz (2026-09-19)

Bugünkü `ParticleSpawnRenderer` (450 ms genişleyen halka + beyaz merkez, tip
rengi) gerçek bir simülasyon olayını görünür kıldığı için doğru yöndedir —
parçacık hiçbir yerden sessizce "pop" olmaz ve vent'in baca/pore hissi ürün
kimliğine katkıdır. Ama parçacık başına tekrarlanan halka kısa sürede
"loot düştü" / arcade sistem efekti okur; prototype olarak kalır.

Final sunum yönü: **görünen şey parçacık doğuşu değil vent kaynağının
aktifliğidir.** Burst boyunca site'da hafif lokal distorsiyon/glow ("dünya
burada nefes alıyor"); her parçacık için dev halka gerekmez, doğumda en fazla
çok küçük flash. Vent ekran ikonu veya glowing RPG kaynak düğümü OLMAZ —
habitat glow'unun lokal bozulması, küçük field ripple ve hafif particulate
emission gibi dünyaya ait dil kullanılır; oyuncu vent'i birkaç saat içinde
kendi gözüyle öğrenir, UI bağırmaz. Fresh world açılışında 1024 parçacığa
spawn efekti KESİNLİKLE yoktur (bugünkü kod zaten initial seeding'de
`particle-spawn` olayı üretmiyor — bu karar korunur); ilk madde Creation
Phase'in parçası olarak sessizce mevcuttur. Sunum önceliği: okunabilir
parçacıklar → morfoloji → vent sunum cilası; vent efektini cilalayıp hâlâ
büyük üst üste binen glyph çizmek görüntüyü düzeltmez.

### Particle glyph fizik değildir

Fizik parçacığı nokta/radius kalır. Renderer rol ve duruma göre glyph'i
değiştirebilir; ama bir glyph ancak temsil ettiği durum simülasyonda gerçekten
var olduğunda açılır:

| Durum          | Sunum                                      | Açıldığı adım              |
| -------------- | ------------------------------------------ | -------------------------- |
| Serbest madde  | Küçük yuvarlak                             | 2                          |
| Hızlı üye      | Velocity yönünde sınırlı uzama             | 2                          |
| Void fringe    | Void normaline doğru gerilme               | 2                          |
| Zar üyesi      | Zara teğet hafif oval                      | 4 — yapı kimliğiyle        |
| Core üyesi     | Daha yoğun ve kompakt                      | 4 — yapı kimliğiyle        |
| Tail aktüatörü | Salınımı okunur elongated biçim            | 6 — locomotion; sunum 7    |
| Hasarlı üye    | Soluk/dengesiz faz                         | 9 — hasar state'i; sunum 7 |
| Enfekte üye    | Yakın/layer görünümünde renk-faz anomalisi | 9 — enfeksiyon; sunum 7    |

Glyph, collision shape veya kuvvet menzilini değiştiremez. Adım 2 membrane,
core, tail, hasar veya enfeksiyon rolü uydurmaz; henüz var olmayan bir durum
için sahte rol enum'u yazılmaz. Adım 3 audition'ı rol glyph'i olmadan yapılır.

### Fiziksel yarıçap ile glyph yarıçapı ayrı sözleşmedir (2026-09-19)

Bugün renderer fiziksel yarıçapı (`radiusUnits = 4,5`, çap 9 birim) birebir
opak dolu daire olarak çizer; `alpha = 1`. Sonuç: merkezleri 7 birime kadar
yaklaşabilen iki parçacık ekranda gerçekten üst üste biner; hız/fringe uzaması
(`particleVelocityStretchMax = 1,25`, `particleFringeStretchMax = 1,9`) görsel
ayak izini fizik çapının da üstüne çıkarabilir. Üst üste binme, büyük opak
glyph ve altı doygun rengin uzaysal karışması birlikte "konfeti hamuru"
üretir — katman, merkez, boşluk ve yön okunamaz.

Ayrım kararı: `ParticleConfig.physicalRadiusUnits` simülasyon sözleşmesi,
`LifeGraphicsConfig.particleGlyphRadiusUnits` (eklenecek) sunum sözleşmesidir.
Aynı parçacık konumlarıyla daha küçük glyph, gözün parçacıklar arasındaki
negatif boşluğu görmesini sağlar ve okunabilirliği fizik değişmeden büyütür;
aday aralığı cihazda A/B ile seçilir (analiz önerisi 2,5–3,5, karar cihazda
verilir). Bu ayrım "render fiziği değiştiremez" kuralının doğal uzantısıdır:
renderer fizik yarıçapını doğrudan kullanmak zorunda değildir; fiziksel
parçacığı nasıl temsil edeceğinin sahibidir.

Reddedilen sunum kestirmeleri:

- **Ana çözüm olarak alfa düşürme:** renkler çamurlaşır ve fiziksel
  penetrasyonu gizler — kozmetik değil ölçüm kaybı olur.
- **Renderer'da sahte zar/katman/boşluk çizmek:** fizikte olmayan anatomiyi
  sunum uyduramaz; fake ile abstract ayrımı §8'de.
- **Binlerce parçacık için outline:** yakın zoom'da tekil parçacığı ayırabilir
  ama çizim maliyeti iki katına çıkar ve referansın temiz point-cloud
  estetiği için gerekli değildir; ileride çok ince (≤1 px) olarak
  değerlendirilebilir.
- **İzin verilen sunum zenginliği:** hız izleri ve birkaç karelik düşük-alfa
  kalıntı gerçek hareketi gösterdiği için meşrudur; anatomi uydurmadığı
  sürece Adım 7'de değerlendirilebilir.

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

### 1536² rejiminin kamera sonuçları (2026-09-19 analizi)

Dünya 1024² → 1536² büyüyünce ekran kompozisyonu **değişmez**: açılış
`fit: 'contain'` olduğu için kamera bütün habitatı yine sığdırır; habitatın
ekranda kapladığı oran yaklaşık aynı kalır. `cameraVoidMarginRatio = 0,15`
sabit piksel değil habitat oranıdır — Void payı habitatla birlikte büyür ve
contain tekrar sığdırır; portrait'teki uzun üst/alt siyah bantlar margin'den
değil kare dünyanın uzun ekrana sığmasından gelir (geometri, ayar değil).
Büyümenin kazancı ekranda değil simülasyonun içindedir: parçacıklar
overview'da ~%33 daha küçük görünür ve dünya daha ince taneli dokuya geçer.

Bir GERÇEK gerileme vardır: `cameraMaxZoomFactor = 3` dünya fit'ine
bağlıdır (maksimum yakın zoom = minZoom × 3). Dünya büyüyünce minZoom düşer
ve aynı 3× çarpan eski close-up kapasitesinin ~%33 altında kalır. Kural:
maksimum uzak zoom dünyaya bağlıdır (contain), maksimum yakın zoom dünya
boyutuna bağlı olamaz — görsel inceleme ölçeğine (birim/ekran-pikseli veya
semantic zoom seviyesi) bağlanır. Geçici karşılık 1536 için yaklaşık 4,5×'tir;
sihirli sayı yerine inceleme ölçeği sözleşmesi tercih edilir.

Modalite ayrımları (hepsi cihaz insan kabulüyle ölçülür):

- **Aktif drag sınırında yumuşak direnç:** sert clamp yerine parmak
  ilerledikçe azalan dünya yer değiştirmesi (10 px → 6 px → 2 px); iOS
  elastik bounce kesinlikle yok. Release momentumunun sınırda yumuşaması
  zaten var — aynı his aktif sürüklemeye de taşınır.
- **Modalite başına momentum:** touch kontrollü kinetik, mouse neredeyse
  sıfır coast, trackpad kendi doğal davranışına yakın. Bugünkü tek
  `panMomentumMs = 140` hepsine aynı uygulanıyor.
- **Trackpad/wheel ayrımı:** laptop'ta iki parmak scroll çoğu zaman wheel
  event'i olarak gelir ve bugün zoom'a çevrilir — kullanıcı "kaydırıyorum"
  sanarken kamera zoom yapar. Hedef: wheel → zoom, trackpad scroll → pan,
  trackpad pinch (çoğu zaman `ctrlKey + wheel` sinyali) → zoom; cihaz ayrımı
  heuristikle çözülür ve Samsung + Lenovo + masaüstü el testi şarttır.
- **Jitter ikinci denemesi:** ilk çözüm (event'leri biriktirip render
  karesinde uygulama) kullanıcı tarafından geri alındı. İkinci yaklaşım:
  aktif sürükleme yine neredeyse birebir kalır; `getCoalescedEvents()`
  verisi bugün yalnız release hızını besliyor — sürükleme konumu için de
  kullanılır; filtreleme ağırlıklı olarak release velocity üstünde yapılır.
- **Orientation görsel ölçeği:** bugünkü geçiş `zoom / minZoom` oranını
  korur; hedef ekrandaki FİZİKSEL büyüklüğü korumaktır — yön değişiminde
  bakılan organizma aynı görsel ölçekte kalmalı, yalnız viewport imkânsız
  kılıyorsa clamp edilmelidir.
- **Tap-vs-pan tahkimi:** Adım 4/7'de organizma seçimi geldiğinde tek parmak
  sürükleme ile dokunma çatışır; küçük hareket tap, eşiği aşan hareket pan
  sayılır. Kamera mimarisi bugünden jest tahkimine izin vermelidir; eşik
  cihazda ayarlanır.
- **Void margin A/B:** `cameraVoidMarginRatio` için 0,15 / 0,12 / 0,10
  görüntüleri karşılaştırılır ve kullanıcı seçer; başlangıç zoom'unu
  zorlamak (`initialZoomFactor > 1`) önceki geri alınan karar nedeniyle
  araç değildir.

### Kabuk

Gameplay HUD sağ üst köşesinde yalnız `Pause` düğmesi vardır; ayarlar düğmesi
HUD'da değil, Pause Sheet header'ındaki bir aksiyondur. Web'de tam ekran
düğmesi Pause'un solundadır; Android ve masaüstünde yoktur. Pause ve X aynı
40×40 `IconButton` geometrisidir; kendi çalışma/durma durumunu tutan
`PauseResumeButton` kullanılmaz, çünkü pause durumunun tek sahibi akış
denetleyicisidir. FPS açıksa Sheet'in üst katmanında görünür kalır. Dil, FPS,
haptics, yön ve masaüstü görüntü kipi mevcut i18n/kalıcılık sözleşmelerini
korur.

Pause Sheet tek bir CORE `Sheet`'tir; içinde ayrı panel açılmaz, body route'u
değişir. Header'da `Settings` (ve ileride `Codex`, `World`, `God`) aksiyonları
için `Toolbar` accessory slot bulunur. X her görünümde Sheet'i kapatır ve
oyuna döner; Android Back bir seviye geri döner (Settings → PauseHome,
PauseHome → Resume). Scrim tıklayınca Sheet kapanmaz.

Header beş aksiyona kadar 360 px telefonda da kullanılabilir kalır: başlık
`min-width: 0` ile daralır, accessory rail yatay ve satır kırmadan gerekirse
kayar, X `flex-shrink: 0` taşır ve hiçbir genişlikte kaybolmaz. `God` aksiyonu
normal kullanıcıya her zaman görünmez; yalnız geliştirme, deney veya yaratıcı
kip yeteneği varken görünür.

Modal kapatma iki ayrı yoldur. Programatik `close()` her zaman kapatır.
Kullanıcı kaynaklı kapatma girişleri (Escape, Android Back, scrim) önce
`onDismissRequest(reason)` ile tüketiciye sorulur; kapatmaya ya da girişi
tüketmeye tüketici karar verir. Pause Sheet'in “scrim resume etmez” ve “Back
bir seviye geri” kuralları bu yolla kurulur; Sheet'e oyuna özel dal eklenmez.

Alan, territory, infection ve tarih normal görünümü kirletmez; kullanıcı
seçtiği katmanı tam kontrastla açar. Dünya aklı ile sunum aklı ayrıdır:
organizmalar ne olacağını, sunum sistemi oyuncuya neyin önerileceğini belirler.
Oyuncu kamera kontrolünü her zaman geri alabilir.

VOL.LIFE yeni UI primitive icat etmez. Planlanan yüzeylerin sahibi baştan
bellidir:

| İhtiyaç                        | CORE yüzeyi                             |
| ------------------------------ | --------------------------------------- |
| Tam ekran uygulama/menü yüzeyi | `MainMenu`                              |
| Pause araçları                 | `Sheet` + `Toolbar`                     |
| Dünya girişi geçişi            | `LoadingScreen` (transparent arka plan) |
| Organizma künyesi              | `SelectionInfoPanel`                    |
| Dünya/yaşam sayaçları          | `StatsPanel`                            |
| Dünya haritası ve viewport     | `MinimapPanel`                          |
| Olay geçmişi                   | `EventLog`                              |
| Tekrar hızı                    | `SegmentedControl`                      |
| Müdahale arama yüzeyi          | `CommandPalette`                        |
| Kısa olay bildirimi            | `ToastManager`                          |
| Seçenekler                     | `IconButton` + `Sheet` + `SettingsForm` |

Bu bileşenler yalnız durumu çizer ve niyeti callback ile bildirir; organism,
territory veya threat kuralı CORE'a sızmaz.

CORE `MainMenu` VOL.LIFE ekranı değil, genel bir tam ekran yüzeydir. Slotları
underlay (isteğe bağlı), scrim, brand, content ve footer'dır (isteğe bağlı).
Yalnız tam ekran geometrisini, safe-area'yı, inert/show/hide durumunu, focus
girişini, scrim katmanını ve responsive yerleşimi yönetir; sahne değiştirmez,
kayıt, ses veya kamera bilmez. LIFE'a özgü organik scrim, logo ve LIFE düğmesi
oyunun kompozisyonudur (§18).

## 7. Kalıcılık ve kimlik

Kalıcılık iki seviyedir:

- Küçük tercih durumu CORE `SaveManager` ile saklanır.
- Dünya, VOL.LIFE'a ait sürümlü binary snapshot ve `LifeWorldStore` portuyla
  saklanır.

**Depolama bütçesi ÖLÇÜLDÜ (Z2, 2026-09-17).** Daha önce "hesaplandı,
ölçülmedi" notuyla ~1,85 MB yazıyordu; gerçek ölçüm:

| Ölçü                        | Değer                       |
| --------------------------- | --------------------------- |
| Ham binary snapshot         | 1.846.401 bayt (1,761 MB)   |
| Taşınan yük (gzip + base64) | 500.868 karakter (0,478 MB) |
| Kodlama süresi (Node 22)    | 113,5 ms                    |

**Tarayıcı ölçümü (Chromium, dev sunucusu, uygulama içi `performance.mark`).**
Ham boyut Node hesabıyla BİREBİR aynı çıktı (1.846.401 bayt) — kodek düzeni
platformdan bağımsız. Taşınan yük 509.456–509.532 karakter (≈0,486 MB; Node'un
`zlib` gzip'i birkaç yüz bayt daha iyi sıkıştırıyor). Kodlama süresi 96,2–221,9
ms, medyan 159,7 ms — bu koşu MAKİNE YÜKLÜYKEN alındı (F3 sekiz çekirdeği
dolduruyordu), yani üst sınır. Ölçüm kodu üretim derlemesinde YOKTUR; yokluk
build testiyle kanıtlanır.

**Mobil cihaz ölçümleri (canlı Android cihazlar, dev kancası `window.__volLifeStorage.measure()`).**
Dev sunucusuna `adb reverse` ile bağlı canlı cihazlarda Chrome DevTools Protocol üzerinden ölçüldü:

| Platform / Cihaz               | Ham bayt  | Taşınan yük (gzip+base64) | Kodlama süresi    |
| ------------------------------ | --------- | ------------------------- | ----------------- |
| Node 22                        | 1.846.401 | 500.868 kar. (~0,478 MB)  | 113,5 ms          |
| Chromium (masaüstü dev)        | 1.846.401 | ~509.470 kar. (~0,486 MB) | 159,7 ms (medyan) |
| Lenovo TB350FU (Android 14)    | 1.846.401 | 498.148 kar. (~0,475 MB)  | 158,0 ms          |
| Samsung SM-G990B2 (Android 16) | 1.846.401 | 496.308 kar. (~0,473 MB)  | 234,7 ms          |

Ham boyut (1.846.401 bayt) tüm platformlarda ve cihazlarda bayt düzeyinde
birebir aynıdır.

`localStorage` tipik kotası kaynak başına ~5 MB'tır: 0,49 MB'lık tek kayıt
kotanın onda birini kullanır, yani web tarafında bugünkü backend yeterlidir.
Native tarafta `TauriStoreAdapter` dosyaya yazar ve kota sorunu yoktur.

Boyutun baskın terimi ALANLARDIR, parçacıklar değil: 256² × 7 alan dizisi,
512 parçacığın tuttuğu yerin on katından fazlasını kaplar. Çözünürlük iki
katına çıkarsa boyut dört katına yaklaşır; bütçe parçacık sayısıyla değil alan
çözünürlüğüyle büyür. Bu ilişki `tests/app/snapshotSize.test.ts` ile kodek
düzeninden kilitlidir — sabitler kodekten türetilir, ikinci bir kopya tutulmaz.

Dünya seed'i build config'i değildir. Yeni dünya cryptographic seed,
`worldId` ve oluşturma zamanı üretir; explicit seed yalnız test/replay
içindir. Metadata config fingerprint'ine girmez.

Rastgelelik tek bir akış değildir. Dünya tohumundan alt sistem başına ayrı
akışlar türetilir ve liste dondurulmuştur: `habitat`, `fields`,
`matter-seeding`, `lifecycle`, `behavior`, `evolution`. Türetme akış adının
FNV-1a'sını SplitMix32 ile karıştırır; SplitMix32 uint32 üzerinde birebir
olduğu için aynı dünyada iki akış aynı tohumu alamaz ve türetme altın değer
testiyle kilitlidir. Her alt sistem YALNIZ kendi akışını görür: ışık kaynağı
sayısını değiştirmek parçacık başlangıcını, seeding parametresini değiştirmek
ışık alanını ve habitat konturunu kaydıramaz. Akış tablosunun tamamı
snapshot'a girer, çünkü kurulumdan sonra ilerleyen bir akışın durumu
kaydedilmezse kayıttan devam eden dünya başka bir diziye geçer.

V2 snapshot şunları taşımak zorundadır:

- world metadata, tick ve adlandırılmış RNG akışlarının durumu;
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
değildirler. Seed ve komutlar tek başına tekrarı tanımlamaz: değişmiş bir
kernel aynı günlükten başka bir dünya üretir. Replay formatı bu yüzden kuralları
da sürümler:

- `simulationRulesetVersion`;
- `SubstratePhysicsProfile` digest'i ve config digest'i;
- `domainGeneratorVersion` (habitat üreteci);
- `creationProtocolVersion` ve creation pre-roll tick/config'i (§18).

Uyuşmayan sürümlü tekrar sessizce oynatılmaz; eski snapshot kuralındaki gibi
i18n'li uyumsuzluk sonucu verir.

Tarih ayrı dev bir state ağacı değildir; doğum, ölüm, Void kaybı, bölünme,
füzyon, göç, çatışma, salgın ve tükeniş olay günlüğünden türetilir. Önemli
organizmaların biyografisi ve tür soy ağacı bu günlükten üretilebilir; her birey
için sınırsız geçmiş kopyası tutulmaz.

Uygulama süreci kapalıyken dünya donar. v1 ürün kuralı: açılışta geçen gerçek
süre kadar dünya ilerletilmez, wall-clock catch-up yapılmaz; kayıt kapanıştaki
snapshot olarak açılır. Offline veya kaba simülasyon ileride ayrı ölçülen bir
özellik olarak değerlendirilir. Bu kural pause'un catch-up yapmamasıyla (§18)
ve replay determinizmiyle aynı güvenli başlangıçtır.

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
- Aynı seed ve substrate config'i bit düzeyinde aynı sonucu verir.
- Güvenli habitatta Void kuvveti kesinlikle sıfırdır.
- Tidal fringe yalnız belirlenen dar bölgede etkilidir.
- SDF crossing aynı tick'te geri dönüşsüz deactivation üretir; wrap/bounce yoktur.
- 512 aktif particle birkaç simüle dakika kilitlenmeden çalışır.
- Samsung ve Lenovo'da fizik aynı, yalnız sunum kalitesi ölçeklenebilir.

Adım 2'nin zar veya organizma üretme zorunluluğu yoktur. Güvenilir substrate
üretir.

### Adım 3 tam aday keşfidir

İlk production kernel ailesi generalized asymmetric multi-band'dir. Araştırma
harness'i kernel kimliğini `SubstratePhysicsProfile`da sürümler. Ana aile anlamlı
faz sınırı üretemezse iki koşullu karşılaştırma açılabilir: daha serbest
multi-lobe profil
ve self-propulsion taşıyan active-particle modeli. Bunlar aynı anda üç production
çekirdeği taşımak için değil, yanlış fizik ailesine daha fazla CPU yakmayı
engelleyen falsification yollarıdır. Alternatif, aynı korpus ve metriklerle ana
adaydan daha iyi kanıt vermeden seçilemez.

**Çürütme noktası SAYIDIR** (`scripts/morphology/falsification.ts`, ön-kayıtlı):
bir aile şu üçünden biri doğruysa çürütülmüş sayılır — (a) broad adayların
%1'inden azı hem launch envelope'u seed'lerin ≥ %75'inde geçiyor hem
DYNAMIC_STRUCTURED oluyor; (b) refinement'ta bütün sert kuralları geçen aday
yok; (c) kullanıcı ön-elemede kısa listenin tamamını reddediyor. Ölçülmemiş bir
koşul "geçti" sayılmaz, eksik dayanak olarak ayrı listelenir. Sıra ön-kayıtlıdır
(2026-09-19 analiziyle genişletildi):

1. `generalized-asymmetric-multi-band` — F3/F7 ile ÇÜRÜTÜLDÜ;
2. `multi-lobe-v1` ("Multi-Lobe") — çift başına bağımsız işaretli loblar;
   §3'teki `bandScales` tavanını aşan ilk ifade gücü adımı;
3. `active-particle-v1` ("Active Particle") — self-propulsion; izotropi
   tavanını aşan adım;
4. `oriented-torque-v1` ("Oriented / Torque") — yönlü etkileşim, hizalanma
   veya tork; `PairForceKernel` arayüzünün skaler/radyal tavanını aşar ve bu
   yüzden en pahalı parçacık-ailesi adımıdır — ancak multi-lobe ve
   active-particle görsel olarak da yetersiz kalırsa açılır.

Aile adlandırması standardı: her ailenin bir insan adı ve bir kanonik makine
kimliği vardır (`display: "Oriented / Torque"`, `familyId: oriented-torque-v1`).
Belgelerde ve artefaktlarda `familyId` kullanılır; `oriented/torque`,
`oriented-anisotropic` gibi eşanlamlı yazımlar kullanılmaz — aynı aileye
işaret eden üç yazım provenance'i böler.

Her aile aynı korpus, aynı metrikler ve aynı insan kalite vektörüyle sınanır;
aynı anda iki yeni fizik mekanizması tek deneyde BİRLEŞTİRİLMEZ (hangi
mekanizmanın ne ürettiği ayrışamaz). Dört aile de çürürse rapor "parçacık
substrate'ı bu ifade uzayında tükendi" der; ancak o noktada daha büyük
substrate pivotu (sürekli kütle-korunumlu alan, hibrit parçacık/alan, yapay
kimya) masaya konur — pivot, parçacık aileleri tükenmeden gündeme gelmez.
Tüm aileler çürürse araştırma durur; rapor "Adım 4'e başlanamaz" der ve bütün
kanıtı taşır.

### Kanonik araştırma rejimi v2 (2026-09-19)

Adım 3'ün yeni tabanı `512 / 1024²` değil **`1024 aktif madde / 1536×1536
depolama / 8 origin yaması`**dır. Kararın üç kanıtı:

- **Jammed paket kanıtı:** K3 koşusunda `meanNeighborCount = 80,76` (48 birim
  komşuluk yarıçapında); ortalama komşu uzaklığı ≈ 9,5 birim, yani parçacık
  çapına (9) inmiş — yapılar gözenekli değil temas mesafesinde sıkışmış. Aynı
  parçacık sayısıyla daha geniş dünya, yapısal çözünürlük için madde başına
  daha çok alan açar.
- **Tek dev konfeti topa erken çöküş:** 4 yama × 70 birim × %55 pay, toplam
  512 maddenin çoğunu dar bir başlangıç hacminde yoğunlaştırıyor; yamalar
  birbirine yakın doğarsa tek merkezli kütle kaybı başlıyor. 8 ayrık yama
  (yarıçap ilk turda 70 kalır — yamalar daha küçük değil, daha ÇOK ve daha
  AYRIK), başlangıç kompozisyonunu parçalar ve çoklu-bağımsız-yapı kanıtı
  üretir (tek topologu değil dağılımı ölçeriz).
- **Dış emsal dersi:** Ventrella çizgisinde yapısal zenginlik ancak binlerce
  parçacıkta belirginleşiyor. 512 → 1024 iki kat yapısal çözünürlük demektir;
  bu, "ölçek tamamlandı" iddiası değil araştırma tabanıdır ve Adım 11'in
  işi olan 10k–250k ölçeğiyle karışmaz.

Spec'in parçaları:

| Alan                    | v1 (mevcut)        | v2 (kanonik araştırma)                                                                 |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Aktif madde             | 512                | 1024                                                                                   |
| Depolama                | 1024 × 1024        | 1536 × 1536                                                                            |
| Origin yaması           | 4 × r=70, pay 0,55 | 8 yama — ilk tur r=70, pay 0,55 sabit; final değerler sonraki benchmark'tan kilitlenir |
| Parçacık yarıçapı       | 4,5 (çap 9)        | 4,5 (çap 9) — değişmez                                                                 |
| Habitat oranı           | 0,82 × 0,74        | değişmez (oran dünya ölçüsüne uyar)                                                    |
| `cameraVoidMarginRatio` | 0,15               | değişmez (oran, piksel değil)                                                          |
| Field çözünürlüğü       | 256                | benchmark'tan kilitlenir                                                               |

Kararın matematiği: nüfus ×2, dünya alanı ×2,25 → global nominal yoğunluk
yalnız ~%11 azalır (dünya uçurum gibi seyrekleşmez, yalnız nefes alır). Yama
başına başlangıç yükü neredeyse aynı kalır: eski `512 × 0,55 / 4 ≈ 70,4`
parçacık/yama, yeni `1024 × 0,55 / 8 ≈ 70,4` parçacık/yama — 8 origin
seçimi yamaya iki kat madde basmak değil, aynı lokal reaksiyon yoğunluğunu
koruyup bağımsız başlangıç bölgesi sayısını ikiye katlamaktır.

Nedensellik sınırı: v2'de madde, alan ve yama sayısı AYNI ANDA değişir —
sonuç yalnızca "v2 rejim paketi v1'den iyi/kötü" diye okunur; "iyileşmeyi
dünya büyümesi yaptı" ya da "8 yama blob'u çözdü" iddiası paket deneyinden
çıkarılamaz. Neden öğrenilmek istenirse ucuz ablation (v1 / yalnız nüfus↑ /
yalnız alan↑ / tam v2) ayrı koşudur; ana pipeline için şart değildir.

- **512/1024² rejimi çöpe atılmaz ama rolü daralır:** 512 yalnız
  katastrofik ucuz ön-filtredir — NaN, patlama, speed-cap, anında Void
  katliamı, ağır stasis, performans regresyonu ve determinism smoke için
  mükemmeldir; "bu aday morfoloji üretmiyor" kararının tek kaynağı
  OLAMAZ — 1024 çözünürlüğünde okunabilir yapı kurabilecek bir aile 512'de
  yanlış negatifle elenip kanonik rejime hiç ulaşamaz. Morfoloji broad'u,
  refinement, audition ve qualification 1024 rejiminde koşar (aşağıdaki huni
  tablosu). İki rejim aynı ailede koşulup metrikler karşılaştırılır. "Daha
  büyük rejim daha iyi" varsayımı değil, ölçülen ayrımdır.
- **Her koşu rejimini etiketler:** artefakt `regimeId` taşır (`v1-512-1024`
  / `v2-1024-1536`); karşılaştırma yalnız aynı rejim içinde yapılır. Eski
  sonuçlar v1 etiketiyle arşivde kalır, karıştırılmaz.
- **Kamera sonucu ayrı konudur:** 1536²'nin kamera/okunabilirlik etkileri
  §6'da; buradaki karar simülasyon tabanıdır, sunum parametreleri onu izler.
- **Void/habitat mimarisi ve sabit adım değişmez:** yalnız depolama ölçüsü,
  madde bütçesi ve başlangıç yama geometrisi revize edilir.

Broad aşama önce adayları fazlara ayırır:

- dead/stasis;
- gas veya yapısız soup;
- crystal/frozen;
- tek dev yapıya collapse;
- Void-loss dominated;
- orbit dominated;
- speed-cap chaos;
- **dynamic structured**.

Bu ayrım SABİT GEREKÇE KODLARIYLA yapılır (E11) ve liste dondurulmuştur:
`DEAD`, `STARTUP_MASSACRE`, `VOID_LOSS_DOMINATED`, `SPEED_CAP_CHAOS`, `STASIS`,
`CRYSTAL_FROZEN`, `SINGLE_COLLAPSE`, `GAS`, `MICRO_ORBIT_PERSISTENT`,
`FRINGE_DEPENDENT`, `DYNAMIC_STRUCTURED`. Bir seed birden fazla gerekçe
taşıyabilir; birincil olan, yukarıdaki sırayla en temel olandır — ölü ya da
doğumda katledilmiş bir dünyanın yapısı tartışılmaz.

Kabul üç ayrı taksonomi katmanıdır; faz taksonomisi donmuş kalır ve yeni
morfoloji başarısızlıkları ona EKLENMEZ (2026-09-19 consistency pass):

- **`PhaseClassification`** (donmuş 11 kod, yukarıda): "bu dünya dinamik
  olarak yaşayabilir mi?" sorusunun kaba dinamik fazıdır. `DYNAMIC_STRUCTURED`
  burada ESKİ kaba anlamını korur — "madde korunuyor, kompakt ve hareketli";
  packing/morfoloji kanıtı anlamına GELMEZ. Eski artefaktlardaki
  `DYNAMIC_STRUCTURED` etiketiyle yeni artefaktlardaki aynı etiket aynı deney
  sonucunu anlatmaya devam eder; sessiz semantik kayması yasaktır.
- **`MorphologyGateFailure`** (yeni taksonomi): packing collapse, düşük
  topolojik çeşitlilik, aşırı oklüzyon gibi "dinamik ama okunabilir yapı
  değil" başarısızlıkları bu katmanın kodudur — `PhaseReasonCode`'a
  eklenmezler çünkü dinamik faz değil morfoloji yeterlilik başarısızlığıdır.
- **`HumanAcceptance`** (insan katmanı): `acceptedTraits`/`rejectedTraits`/
  `failureReason` kayıtları; teknik katmanların ikisini de geçen adayı
  reddedebilir.

Akış böylece şudur: faz sınıflandırması (`DYNAMIC_STRUCTURED`?) → packing
kapısı → yapısal morfoloji kapısı (`clusterQualified` + dünya seviyesi
`worldMorphologyQualified`) → insan audition'ı → `QUALIFIED_MORPHOLOGY`.
`DYNAMIC_STRUCTURED` bu zincirin giriş biletidir, çıkış kararı değildir;
provenance için alternatif `phaseClassifierVersion` idi ama anlam
değiştirmek yerine ayrı kapı katmanı seçildi.

Süre kuralları SANİYE ile tanımlıdır ve örnek sayısına tempoyla çevrilir. Seri
pencereden kısaysa kural ATEŞLEMEZ: gözlemlenmemiş bir süre iddia edilmez.
Eski kod tick sayısını örnek sayısıyla karşılaştırıyordu ve örnek aralığı kadar
yanılıyordu.

İki eşik §8.4'e geri çekildi. `STASIS` mutlak bir hız değil TAVANIN %2'sidir
(2,4 × 0,02 = 0,048); eski mutlak 0,02 belgeden sapıyordu. `SPEED_CAP_CHAOS`
ortalama hızı değil TAVANDAKİ PARÇACIK PAYINI ölçer; ortalama hızla ölçmek
tavana kimsenin değmediği hızlı bir dünyayı da kaos sayardı.

Aday kararı ÇOĞUNLUKLA verilir, plurality ile değil: bir gerekçe seed'lerin
≥ %50'sinde görülmedikçe aday o gerekçeyle damgalanmaz ve `DYNAMIC_STRUCTURED`
için seed'lerin ≥ %75'i gerekir. Eski `dominantPhase` en çok görülen fazı
seçiyordu; seed'lerin %42'sinde GAS, %33'ünde STASIS, %25'inde yapı varsa aday
"GAS" ilan ediliyordu, oysa hiçbir gerekçe çoğunlukta değil.

Ölçülen bir kısıt: bu substratta 5 dakika boyunca maddeyi KORUYAN bir gaz
zorunlu olarak yavaştır, yani aynı zamanda `STASIS`tir. Habitatta duvar yoktur;
hareket eden parçacık er geç kıyıya varır. Bağlı hareket denendi ve olmadı —
çekim varsa parçacıklar kümeleniyor, zayıf çekimde maddenin %60'ı kıyıyı
geçiyor. `GAS` gerçek fizikte üretilebiliyor ama tek başına değil.

Yalnız dynamic-structured çevresi refinement'a girer. Kısa otomatik filtre,
ucuz başarısızları eler; morphology kararı vermez. İnsan gözüyle ilginç
bulunmayan aday uzun koşuya sokulmaz. İnsan ön-elemesinden geçen az sayıda
adayda çoklu seed ve 10–30 simüle dakikalık long-horizon kanıtı çalışır.

Başlangıç bütçe hunisi şudur; rakamlar benchmark sonrası config'e kilitlenir.
Her aşama hangi rejimde koştuğunu da taşır — morfoloji içeren kararlar 512'de
verilmez:

| Aşama                  | Rejim | Amaç                                                             | Başlangıç adayı                     |
| ---------------------- | ----- | ---------------------------------------------------------------- | ----------------------------------- |
| Catastrophic prefilter | 512   | NaN/patlama/speed-cap/Void katliamı/ağır stasis/perf/determinism | 10–30 simüle saniye, 4–8 seed       |
| Broad                  | 1024  | Faz haritası + morfoloji genişliği                               | 30–60 simüle saniye, 4–8 seed       |
| Refinement             | 1024  | Dynamic-structured komşuluğu                                     | Birkaç simüle dakika, 16 seed adayı |
| Development audition   | 1024  | İnsan gözüyle shortlist                                          | 3–8 tam aday                        |
| Qualification          | 1024  | Geç çöküş + recovery                                             | 10–30 simüle dakika, 32+ seed adayı |

1024 broad'un maliyeti 512'den yüksektir; istenirse daha az seed veya daha
kısa ufukla dengelenir ama "morfoloji üretmiyor" elemesi 512 rejiminde
yapılmaz — yapısal çözünürlüğü kanıtlayan aileyi düşük çözünürlükte elemek
huninin kendi kararını sabote eder.

Bu sayılar acceptance değildir; süre ve korpus ölçümle küçülebilir/büyüyebilir.
Önce 2/6/24 saat koşmak reddedilmiştir. Ancak zaman serisi 30 dakikadan sonra
başlayan bir çöküş gösterirse daha uzun release canary ayrıca gerekçelendirilir.

Finalist ölçümleri en az şunları zaman serisi olarak ayırır:

- başlangıç sağkalımı: 5/10/30 sn madde koruma, erken Void kaybı, erken
  patlama tepesi ve yapısal rejime geçiş süresi;
- hareket ve nearly-stalled payı;
- komşuluk ve lokal yoğunluk;
- küme başına compactness/anisotropy (global bulut tek yapı sayılmaz);
- role-agnostic radial yapı ve type composition;
- üyelik churn ve structure lifespan;
- fragmentation/collapse;
- gerçek trajectory autocorrelation ve lokal micro-orbit: az üyeli, kapalı
  yörüngeli ve üye değiştirmeyen döngü patolojiktir; deforme olan, üye
  değiştiren ve yer değiştiren büyük yapının dönüşü değildir;
- perturbation sonrası üyelik, biçim ve kompozisyon recovery;

Perturbation protokolü dört şartla bağlıdır (E15). Her perturbation ÖN-KAYITLI
bir anda uygulanır ve aynı yakınsamış snapshot'a geri yüklenmiş bağımsız bir
koşuda çalışır: spec sırası sonucu değiştiremez. Hedef seçimi ve itme yönleri
`(seed, spec, tick)` üçlüsünden tohumlanır — sabit bir çekirdek kullanmak farklı
seed'lerde aynı bozulmayı üretirdi. Madde çıkarma muhasebeli yoldan geçer:
aktif + dış rezervuar = başlangıç değişmezi perturbation'dan sonra da korunur.

Toparlanma sabit bir eşikle değil, perturbation ÖNCESİ taban penceresinin
değişkenliğiyle ölçülür: normalize metrikler taban bandına (±2σ) 60 saniye
içinde dönmelidir (§8.4). Sabit eşik yanıltıcıydı — maddenin %10'unu kaybetmiş
bir dünya, sayım farkı eşiğin altında kaldığı için ilk kontrolde "toparlandı"
sayılıyordu. Kusursuz sabit bir taban penceresinde σ sıfıra çökeceği için bant
ortalamanın %1'iyle tabanlanır; bu sayı §8.4'te yoktur ve kayan noktalı fizikte
bandın kapanmaması içindir.

- Void dwell/loss ve fringe bağımlılığı;
- seed robustness.

Başlangıç sağkalımı eşikleri §8.4'ün ön-kayıt kuralı gereği burada, herhangi
bir aday değerlendirmesinden ÖNCE sabitlenir ve
`scripts/morphology/startupSurvival.ts` içindeki `defaultStartupGate` ile
birebir aynıdır:

| Kural               | Ön-kayıtlı eşik                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlangıç sağkalımı | 10 sn madde koruma medyanı ≥ 0,95, en kötü ondalık dilim ≥ 0,90; 30 sn medyanı ≥ 0,90                                                                   |
| Erken patlama       | İlk 10 sn'nin hiçbir örneğinde hız tavanındaki parçacık payı > 0,10 değil                                                                               |
| Transient yatışması | Ortalama hız 20–60 sn medyanının 1,2 katının altına iner ve orada KALIR; seed'lerin ≥ %90'ında. Ön-kayıtlı "4 sn" sabiti emekli edildi; gerekçe aşağıda |

Belgenin karşılığını vermediği üç tanım kararı:

- `startupVoidLoss` ilk 10 saniyede Void'e giden maddenin başlangıç maddesine
  oranıdır.
- `timeToStructuralRegime` KALICI yatışmadır: banda ilk değmek yetmez, seri
  sonuna kadar altında kalınmalıdır. Bant serinin kendi kuyruk medyanından
  türediği için "ilk değme" ölçütü her koşuyu saniyeler içinde yatışmış
  gösterirdi; kalıcılık şartı satırı sertleştirir, gevşetmez.
- Seed'ler arası toplama §8.4'ün "Aday toplama" satırıdır: bir sert gerekçe
  seed'lerin ≥ %50'sinde ise korpus düşer. "En kötü ondalık dilim"
  nearest-rank yüzdeliktir ve 10'dan az seed'li korpusta anlam taşımaz.

Taban ölçümü (12 seed × 60 simüle saniye, uzun testle aynı ölçüm hattı):

| Yapılandırma                       | 10 sn medyan | En kötü ondalık | 30 sn medyan | Erken patlama        | Yatışan seed | Sonuç                |
| ---------------------------------- | ------------ | --------------- | ------------ | -------------------- | ------------ | -------------------- |
| Bugünkü varsayılan aday            | 0,828        | 0,488           | 0,609        | seed'lerin %100'ünde | %67          | ÜÇ SATIRDAN DA DÜŞER |
| Zayıf kuvvet, yüksek sönüm, v₀ = 0 | 1,000        | 1,000           | 0,998        | %0                   | %100         | GEÇER                |

Ön-kayıtlı "4 saniye" sabiti ÖLÇÜLMÜŞ İMKÂNSIZLIK gerekçesiyle emekli edildi;
§8.4 bu değişikliğe yalnız bu şartla ve yazılı gerekçeyle izin verir. Sabit,
hızın yüksek başlayıp söndüğü varsayımıyla yazılmıştı. Ölçülen şekil bunun
tersidir: hız tohumlanan düşük değerden (≈ 0,126) başlar, tepeye çıkar ve ancak
saniyeler sonra kararlı banda iner. Ölçülen tepe anları 2,0–45,9 sn, ölçülen
yatışma süreleri 5,3–52,1 sn. Hiçbir yapılandırma 4 saniyede yatışmaz;
dolayısıyla o sabit hiçbir şeyi ayırt edemiyordu. Bant (1,2×) ve seed payı
(≥ %90) ön-kayıtlı hâlleriyle KORUNDU, yalnız süre sabiti gözlem penceresine
(60 sn) çekildi.

Değişiklik bir adayı GEÇİRMEK için yapılmadı: yeni hâliyle bugünkü varsayılan
aday bu satırdan da düşüyor (seed'lerin %67'si yatışıyor, eşik %90) ve üç
satırın üçünden birden kalıyor. Satırın gerçekten ayırt ettiğinin kanıtı budur.

`transientOvershoot` (tepe / kararlı medyan) başlangıç şiddetinin büyüklüğünü
taşır: varsayılan adayda 1,1–11,3×, karşı uçta 1,1–2,2×. En büyük aşımı yaşayan
seed'ler, bir dakikanın sonunda hâlâ rejime girmemiş olanlardır.

UYARI — kapıyı geçen karşı uç yapılandırma bir aday ÖNERİSİ DEĞİLDİR. Kararlı
rejimdeki ortalama hızı 0,020–0,053'tür; §8.4'ün STASIS eşiği hız tavanının
%2'si, yani 0,048'dir ve 12 seed'in 11'i bunun altındadır. Bu kesin bir STASIS
hükmü değil güçlü bir işarettir: kuralın ≥ 60 sn süre şartı, 40 sn'lik ölçüm
penceresiyle doğrulanamaz. O dünya sağkalımı
hiçbir şey olmadığı için geçer. Başlangıç sağkalımı kapısı tek başına kabul
sinyali değildir; DEAD/STASIS satırlarıyla birlikte okunur.

Morphology iki senaryoda ayrı ölçülür. Intrinsic senaryo güvenli iç bölgede
yapının kendini koruyup korumadığını, hareketini, deformasyonunu ve
recovery'sini ölçer. Void-stress senaryosu fringe yakınında tidal deformasyonu,
crossing'i ve fringe desteğine bağımlılığı ölçer. Uzun koşuda Void'a sürüklenen
iyi bir yapı intrinsic kanıtla reddedilmez; kıyıdan kaçınma Adım 6 algısının
işidir.

Kapsamın sınırı uydurulmaz. Intrinsic senaryoda morfoloji yalnız GÜVENLİ
ALANDAKİ maddeyle ölçülür ve güvenli alanın tanımı §2'nin fiziğidir: kıyı
mesafesi fringe genişliğinden büyük olan yerde tidal kuvvet KESİNLİKLE sıfırdır.
Kapsam dışında kalan madde yok sayılmaz, ayrı sayılır (`scopedOutCount`);
kayıplar morfolojiye karışmaz ama görünmez de olmaz. Yapılı madde payı da
kapsamlıdır: fringe'deki bir küme intrinsic ölçümde yapı sayılmaz. Küme
BOYUTLARI tracker'ın bildirdiği gibi kalır — kümenin tek bir tanımı vardır.

Void-stress senaryosunda kapsam daraltılmaz ve yapı kıyıya KATI olarak taşınır:
taşıma vektörü merkezin normalinden çıkar ve bütün üyelere aynı uygulanır, aksi
hâlde yapıyı ölçümden önce biz deforme eder, sonra "tidal deforme etti" diye
okurduk. Sabit Void profili ile `tidalStrength = 0` kontrolü arasında üç fark
ölçülür: deformasyon (en büyük kümenin solidity ortalaması), crossing (kıyıyı
geçen madde) ve yapı sürekliliği (yapılı madde payı ortalaması).

`FRINGE_DEPENDENT` iki kapıdan geçer. Yapılı maddenin > %50'si örneklerin
çoğunda fiziksel fringe bandındaysa, ya da `tidalStrength = 0` kontrolünde yapı
kayboluyorsa aday fringe'e bağımlıdır. "Yapı kayboluyor" için ayrı bir sayı
uydurulmadı: §8.4'ün GAS satırı kümedeki madde payı < %20'yi zaten yapısızlık
sayar.

Sızıntı deneyi ve kalibrasyon ölçümü (2026-09-18): Eski varsayılan `tidalStrength = 0.03`
değeri parçacıkları kıyıdan agresif biçimde süpürerek tüm adayları VOID_LOSS_DOMINATED
ile öldürüyordu. Üretim değeri olarak `tidalStrength = 0` seçilirse kontrol koşuluyla
çakışacağı ve `FRINGE_DEPENDENT` kuralı ölçülemez kalacağı için küçük pozitif değer
olarak `tidalStrength = 0.01` seçildi. Ölçümle kanıt: `tidal = 0` kontrolünde madde tutma
medyanı %82,0 iken `tidal = 0.01` üretiminde %53,5 çıkmakta, kontrol koşulu 28,5 puanlık
farkla ayırt ediciliğini tam olarak korumaktadır. Ayrıca K3 politikasıyla doğrusal sert
çekirdek yerine ıraksak ters-kare çekirdek (`PairForceKernel` `hardCore*`) ve homeostatik
vent direktörü kilitlenmiştir (§3): rezervuar maddesi 1 saniyelik kadansla tekil doğar,
8-12'lik mikro-grup sonrası 5 saniye dinlenir. `ParticleConfig.reseedIntervalSeconds`
yalnız başlangıç cooldown'udur; `reseedFraction` artık hiçbir kod yolunda okunmuyor —
ölü config olarak temizlik listesindedir (TODO Adım 3).

Testere dişi analizi (B3 ölçümü): 10 simüle dakikalık zaman serisinde yeniden ekim
anlarında taze serbest parçacıklar iç alana girince yapılı madde payı anlık olarak
~%73'e gevşer; ancak ekimler arasında bu serbest maddeler mevcut kümelere katılarak
yapılı madde oranı %96–%99 bandına yükselir. Ekimler arası aralıklarda düşüş sayısı 0,
yükseliş/stabilite sayısı 100'dür. Yani testere dişi çöküşü yoktur; yapı enjeksiyonla
yapay ayakta tutulmamakta, ekilen maddeyi bünyesine katarak morfolojik bütünlüğünü
kendi kendine sürdürmektedir.

“Ring çıktı” veya “hareket ediyor” başarı değildir. Kitlesel Void kaybı, kısa
sürede stasis, tek blob, kalıcı soup, sonsuz orbit, hız tavanında kaos, yapısız
random motion, değişmeyen frozen morphology ve seed çoğunluğunda ölüm kesin
başarısızlıktır.

İstenen ilk behavior family'leri core-like yoğunluk, membrane-like çeper,
koherent hareket, deformasyon sonrası recovery, doğal kırılganlık, asimetriden
doğan chase ve iki yapının kalıcı symbiosis ilişkisidir. Hepsini aynı adayın
üretmesi şart değildir; yalnız renkli topak üretmek hiçbir aileyi karşılamaz.

### Pozitif morfoloji tanımı ve görsel kalite vektörü (2026-09-19)

Adım 3'ün kabulü bugüne kadar yalnız negatif denetimlerden (çökme yok, stasis
yok, Void kaybı yok) ve nötr metriklerden oluşuyordu — paketlenmiş bir topak
bunların hiçbirini tetiklemeden geçer. Kabul artık **iki katmandır** ve bu
ayrım huninin her aşamasında geçerlidir:

- **Katman A — teknik ön-kapı:** mevcut negatif denetimler + aşağıdaki
  packing/morfoloji metriklerinin sayısal eşikleri. Bu katman amaç değil
  FİLTREDİR; pahalı ve gürültülü insan değerlendirmesini yalnızca kapıyı
  geçen adaylar alır.
- **Katman B — insan görsel kabul:** nihai hakem insan gözüdür; morphology
  biyolojik doğruluk değil GÖRSEL ANLAŞILIRLIK ürünüdür. Teknik kapıyı geçen
  ama göze "renkli topak" görünen aday REDDEDİLİR. Kısa katılımcı turları
  (~2 dk/aday) yapılandırılmış notla yürür; toplu canlı oturum gerekmez,
  snapshot üstünden açıklamalı not meşrudur; sonuç artefakta
  `humanAcceptance` altında boyut bazında işlenir — tek "güzel mi" skoruna
  indirgenmez. İnsan bias'ını azaltan guardrails: aday kimliği/aile adı
  mümkünse gizli kalır (Candidate A / Candidate B), gösterim sırası
  randomize edilir, aynı standart kamera görünümleri kullanılır ve
  karşılaştırma aynı kısa seed alt-kümesi üzerinden yapılır — değerlendirici
  "bu oriented model, kesin daha iyi olmalı" bilgisiyle bakmaz. Değerlendirme
  yalnız screenshot değildir: overview klip + close-up klip +
  perturbation/recovery segmenti içerir — morfoloji zaman davranışıdır,
  tek kareyle karar verilmez.

İnsan kabulünün okuduğu **görsel kalite vektörü** (her boyut ayrı sorulur;
"kompakt ve hareketli" tek başına geçemez):

- **Bireysel parçacık okunabilirliği:** hareket hâlindeyken de tekil
  parçacıklar ve aralarındaki negatif boşluk seçilebiliyor mu, yoksa birleşik
  renk hamuru mu?
- **Küme içi organizasyon:** merkez-çevre yoğunluk gradyanı, loblar, kollar,
  kuyruklar, halka/kabuk, içe kapalı stabil boşluklar, iç/dış roller,
  katmanlanma görülüyor mu — yoksa homojen dolu topak mı?
- **Topoloji/konfigürasyon çeşitliliği:** aynı aday farklı koşullarda farklı
  ama tanınabilir morfolojiler üretebiliyor mu; tek topologu (küre) bütün
  varyasyonu kapsıyor mu?
- **Çeşitlilik ≠ kaos:** konfeti kompozisyonu — 4–6 doygun rengin küçük
  mesafelerde iç içe karışması — katmanlık değil uzaysal karışmadır; "çok tür
  var" ile "okunabilir yapı var" ayrı şeylerdir.
- **Hareketin anlamı:** sallanma/locomotion/dönme ile jitter/tremor
  ayrışıyor mu; jitter ayakta kalan ama yaşamayan görünüm üretir.
- **Deformasyon ve iyileşme:** yapı darbe alınca bükülüp kendine dönebiliyor
  mu, yoksa ilk rastgele koşuda dağılıyor mu?
- **Şekil + hareket + stres birlikte:** tek kare değil zaman içinde
  okunabilirlik; "küme var ve hareket ediyor" tek başına yetersiz — soru
  "AI/steering OLMADAN koherent yönlü hareket okunuyor mu?"dur. Adım 3
  niyeti GÖRMEK ister, niyet KODLAMAZ — bu cümle gizli steering eklemeye
  yetki değildir.
- **Maddesellik:** kaplanmış dolu yüzey gibi duran yapı, aynı türde
  parçacıkların simetrik lattice'inden daha "yaşayan" okunur.

Ayrı konu — **oklüzyon okunabilirliği:** parçacıklar üst üste bittiğinde
renkler karışır ve küme içindeki öndeki/arkadaki parçacık seçilemez. Yoğunluk
yüksek kaldıkça renk çeşitliliği tek başına organizasyon üretmez.

**Teknik kapıya eklenen packing/morfoloji metrikleri** (hepsi zaman serisi,
global değil per-cluster):

- `overlapFraction` / `severeOverlapFraction`: merkez uzaklığı çapın altına
  inen parçacık çiftlerinin payı; normalize en-yakın-komşu uzaklığıyla birlikte
  okunur (`r/çap < 0,7` ağır penetrasyon, `0,7–1,0` temas/overlap bandı).
- Lokal sıkışma dağılımı ve **`physicalPackingFraction`**: FİZİKSEL yarıçap
  üzerinden parçacık projeksiyon alanının küme sınırı içindeki payı —
  jammed paket ile gözenekli gövdeyi ayıran ana metrik. Simülasyon kapısı
  sunum ayarından etkilenmez: glyph yarıçapı (2,5–3,5 adayı) değiştiğinde
  teknik morfoloji skoru kımıldamaz. Renderer/glyph üzerinden okunan
  `visualOcclusion`/okunabilirlik ayrı bir kavramdır ve insan audition
  tarafına aittir — teknik kapıyı değiştirmez.
- `holeRatio` ve porosity sınıflandırması: içe kapalı stabil boşlukların
  varlığı POZİTİF kanıt eksenidir, evrensel zorunluluk değildir — filament,
  chain, asimetrik amoeboid mover veya two-lobed body `holeRatio ≈ 0` ile de
  mükemmel morfoloji üretebilir. `holeRatio > X` bütün adayların geçmesi
  gereken kapı yapılmaz; ring/shell ailesi adayı hole ile puan kazanır,
  filament/lobe/deformability adayı kendi eksenleriyle kanıt verir — tek
  morfoloji estetiği bütün aramaya zorlanmaz. Tamamen dolu topak negatif
  kanıttır.
- **İki seviyeli yapı kararı — `clusterQualified` ve
  `worldMorphologyQualified`:** per-cluster kayıtlar (solidity, holeRatio,
  normalizedGyration, churn, yaş) önce her küme için ayrı yapı kanıtı üretir
  (`clusterQualified`); dünya kararı tek güzel adanın bütün çorabı
  kurtaramayacağı prensibiyle DÜNYA seviyesinde verilir — yapılı madde payı,
  qualified küme sayısı ve süreklilik penceresi gibi dünya-özet koşulları
  (`worldMorphologyQualified`). Sayılar şimdiden kilitlenmez; prensip kilitli:
  "1 şahane ring + 900 parçacık soup" PASS olamaz. Faz katmanındaki
  `DYNAMIC_STRUCTURED` kaba anlamını korur (yukarıdaki taksonomi); bu iki
  seviye MorphologyQualification kapısının parçasıdır, faz değildir.
- **`PACKING_COLLAPSE` `MorphologyGateFailure` taksonomisindedir** (donmuş
  `PhaseReasonCode`'a EKLENMEZ — dinamik faz değil, morfoloji yeterlilik
  başarısızlığıdır): madde korunmuş, kompakt ve hareketli olsa bile
  normalize en-yakın-komşu uzaklığı kalıcı olarak temas bandının
  altındaysa koşu "structured" değil "jammed" sayılır. Aynı taksonominin
  diğer kodları `LOW_TOPOLOGICAL_DIVERSITY`, `EXCESSIVE_OCCLUSION` gibi
  morfoloji başarısızlıklarıdır.
- **Morfoloji ailesi etiketleri:** audition kayıtları `shell`, `ring`,
  `lobe`, `chain`, `satellite`, `appendage-like`, `nested`, `porous`,
  `type-segregated` gibi pozitif sınıflar ve `amorphous-blobs`,
  `low-topological-diversity`, `confetti-composition` gibi negatif sınıflar
  taşır. Araştırma etiketi morfolojiyi TANIMLAR, biyolojik rol ATAMAZ —
  `tail` Adım 6'nın locomotor aktüatörüdür; Step 3 henüz "kuyruk" bilemez,
  bu yüzden `appendage-like`/`filament-appendage` yazılır; aynı şekilde
  `core-like` yerine `core-like-density`. İnsan notları makine-okunur
  alanlara işlenir: `acceptedTraits`, `rejectedTraits`, `failureReason` —
  provenance zincirinin (family label, kernel kimliği/sürümü, korpus,
  seed'ler, config digest) parçasıdır.
- **Multi-seed kararlılığı:** aynı aday seed'ler arasında TEKRARLAYAN
  morfoloji grameri/aile özellikleri göstermelidir — "her seed aynı sınıfı
  (ring) üretmeli" değil. Aday bir seed'de ring, başkasında nested shell,
  üçüncüsünde lobe üretebilir; hepsinde layering + negatif boşluk +
  deformability gibi aynı fiziksel gramer okunabilmelidir. Tek şanslı seed
  kanıt değildir; aynı şekilde tek-topologu zorlaması da çeşitliliği
  öldürür.

**Yasaklı kısayollar** (her biri ayrı kayıt altında):

- Ölçüm katmanındaki açıklar (yukarıdaki §8 alt bölümü) kapanmadan pahalı yeni
  aile araması başlamaz — aksi hâlde yeni aile aynı kör metriklerle ölçülür.
- Çürütülmüş multi-band matrisini ince ayarlamak ana plan değildir; aile
  değişimi önce ifade gücünü genişletir.
- Yeni bir fizik mekanizmasını aynı deneyde başka bir yenilikle birleştirmek
  yasaktır (nedensellik okunamaz).
- Creation pre-roll yalnız doğal transient'i gizleyebilir; başlangıç
  patlamasını veya sonraki çöküşü örtmek için kullanılamaz (§18'in loading
  sözleşmesi).
- Işık/besin/sıcaklık/akış alanları intrinsic morfoloji kanıtı üretmede
  KAPALI kalır — dış alan yapıyı suni olarak bir arada tutabilir ve "kendi
  kendine örgütlenme" iddiasını çürütür; alanlı koşular ayrı senaryodur.
- Vent'li koşu intrinsic morfoloji kanıtı sayılmaz; ayrım aşağıdadır.

**İntrinsic/ekolojik senaryo ayrımı — vent kolu:** intrinsic morfoloji ölçümü
`MatterReturnPolicy: none` (vent KAPALI) kolunda koşar; vent'li kol
("ekolojik nüfus bakımı senaryosu") ayrı koşudur ve ikisinin artefakt'ları
karıştırılmaz. Bugün intrinsic senaryo vent AÇIK koşuyor (§3) — bu bir
ölçüm kararıdır ve yeni aile turundan önce kapatılır: vent'in geri bastığı
madde retention metriğini "ekolojik sağkalım" yönünde şişirir ve intrinsic
yapı iddiasını kontamine eder. Vent'li ürün kanaryası ayrıca korunur; ürün
davranışı değişmez, yalnız ölçümün okuduğu şey değişir.

Huni AYRI komutlardır (E13): `calibrate`, `seeding`, `broad`, `refine`,
`audition`, `shortlist`, `qualify`, `accept`, `promote`, `canary`. Hiçbir komut
önceki aşamayı örtük olarak koşmaz ve `--stage all` yoktur; tek komutla saatler
süren bir zincir, hangi sonucun hangi girdiden çıktığını takip edilemez hâle
getiriyordu. Her komut koşmadan önce aday, seed, tick, worker ve KALİBRASYONDAN
hesaplanmış tahmini süreyi yazar; kalibrasyon yoksa süre uydurulmaz, "ölçülmedi"
yazar. Tahmini süresi 10 dakikayı aşan koşu `--yes` ister, çıktı dizini olmayan
koşu reddedilir (checkpoint zorunlu), ve `accept` açık bir karar olmadan
koşmaz — insan kararı asla uydurulmaz.

Arama candidate/seed işlerini deterministic work ID ile shard edebilir.
Paralel sonuç aynı seri referansla bit düzeyinde eşit olmadan worker yolu
güvenilir sayılmaz. Bütçe ölçülmeden aday sayısı büyütülmez.

Qualification artefaktı clean source revision, config digest, korpus, tam
`SubstrateCandidate`, bütçe, seed sınırları korunmuş zaman serisi, red nedeni
kodları ve human-acceptance durumunu taşır. Bunların hepsi v4 şemasında
ALANDIR (E12): kaynak revizyonu, dirty bayrağı, eligibility, senaryo, korpus
kimliği, seed başına AYRI zaman serisi ve aşama/iş birimi başına ÖLÇÜLMÜŞ
bütçe (duvar saati, tick, tick başı maliyet). Bütçe alanları sıfır kalmaz;
sıfır bırakmak maliyeti bilmiyoruz demenin süslü hâli olurdu.

Paralel koşu ile seri koşu AYNI `runSeedUnit` fonksiyonunu çağırır; eşitlik
kurulumdan gelir, umuda bırakılmaz. Bölme deterministiktir (iş kimliğinin
hash'i) ve birleştirme iş kimliğine göre sıralıdır, yani worker'ların bitiş
sırası sonucu etkileyemez. Checkpoint her iş birimini JSONL'e yazar ve config
digest'i satır başına taşır: farklı bir yapılandırmadan kalan kayıt sessizce
kullanılamaz. Dirty ağaç exploration için
kullanılabilir ama production qualification üretemez. Qualified olmayan aday
runtime URL/env ile production'a enjekte edilemez.

### F1 ve F2 ölçümleri: varsayılan fizik/seeding FAIL

**F1 (seeding taraması, 2026-09-17).** Ön-kayıtlı aralıklarda 512 seeding
profili scrambled Sobol ile örneklendi; her profil 8 seed × 30 saniye koştu
(76,9 dk, geçersiz örnek 0). §8.4 launch envelope'unu seed'lerin ≥ %90'ında
geçen profil sayısı **sıfırdır**. En iyi profil (#202: 11 yama, yama yarıçapı
28,9 birim, yama payı 0,30, bulut payı 0,22) 10 saniyede medyan %99,4 madde
tutuyor ama kapıyı yalnız seed'lerin **%25'inde** geçiyor. Varsayılan seeding
E9 taban ölçümünde 10 saniyede medyan 0,828 ile zaten düşüyordu.

Sonuç: **varsayılan fizik/seeding FAIL.** Seeding'i tek başına değiştirmek
launch envelope'unu kurtarmıyor; fizik ve seeding BİRLİKTE aranmak zorunda
(F3'ün tanımı budur). Bu, huniyi kısaltma gerekçesi değildir: aralıklar
gevşetilmedi, eşik düşürülmedi, seed seçilmedi.

**F2 (V1 negatif kontrolü, 2026-09-17).** Reddedilen triangular kernel ile
üretim multi-band kerneli AYNI aday, AYNI 8 tohum ve aynı ölçüm hattından
geçirildi (7200 tick). Ölçülen:

| Kol                        | Medyan koruma | Medyan kümeli madde | Faz dağılımı                                       |
| -------------------------- | ------------- | ------------------- | -------------------------------------------------- |
| triangular-v1 (REDDEDİLEN) | 0,725         | 0,968               | 3 GAS, 3 VOID_LOSS, 1 DYNAMIC_STRUCTURED, 1 STASIS |
| multi-band (üretim)        | 0,398         | 0,913               | 8 VOID_LOSS_DOMINATED                              |

Negatif kontrol beklenen yönde ÇIKMADI: reddedilen kernel maddeyi üretim
kernelinden daha iyi tutuyor ve üretim kerneli bütün tohumlarda Void kaybına
teslim oluyor. Bu, triangular kernel'in geri alınması gerektiği anlamına
gelmez — o kernel yapı üretmiyor, yalnız maddeyi kaybetmiyor — ama F1'le aynı
şeyi söyler: **bugünkü varsayılan aday teknik kapıyı geçmiyor** ve Adım 3'ün
arayacağı aday varsayılanın komşuluğunda değildir.

**F3 (broad tarama ve launch envelope, 2026-09-17).** 2048 aday × 4 seed
(123,1 dk, geçersiz örnek 0) koştu. Faz dağılımı: VOID_LOSS_DOMINATED %60,84,
DEAD %30,81, DYNAMIC_STRUCTURED %6,64, çoğunluk yok %1,71. N↔2N yakınsama GEÇTİ
(en büyük fark 0,39 puan, eşik 2). 103 yapısal aday belirlendi (`f3-candidates.jsonl`).

103 yapısal aday launch envelope testine alındı (`scripts/research/f3-launch-envelope.mts`,
4 seed × 30 sn, 12,4 dk, 8 worker). Sonuç:

- Seed'lerin ≥ %75'inde hem launch envelope'u geçen hem yapısal olan aday sayısı: **13**.
- Bu oran 2048 broad adayın **%0,63'üdür** (13/2048).
- §8.4 ön-kayıtlı çürütme kuralı (a): oran < %1 ise aile çürür.
- Karar: **`generalized-asymmetric-multi-band` AİLESİ ÇÜRÜDÜ** (`benchmarks/results/f3-launch-envelope.json`).
  Sıradaki ön-kayıtlı alternatif aile `multi-lobe`dur. Aile çürümüş olsa da F5
  kısa listesi ve F7 uzun ufuk koşusu bu 103 yapısal aday arasından seçilen en
  iyi adaylarla K15 protokolü gereği işletilmeye devam eder.

### Audition kataloğu ve tohum korpusu (F5, F7)

Kısa liste 3–8 adaydır ve yalnız en yüksek skorlardan seçilmez: önce her fazın
en iyisi alınır, kalan yerler metrik uzayında birbirine EN UZAK adaylarla
doldurulur. En yüksek skorlu sekiz aday birbirinin kopyası olabilir ve insan
ön-elemesi o listeden hiçbir şey öğrenemez.

Katalog `research-out/audition-catalog.json`dur; `research:audition` yazar,
dev sunucusu çalışma anında okur ve üretim derlemesine GİRMEZ. Yokluk build
testiyle kanıtlanır: test katalogu gerçekten yazar, üretim ve dev bayraklı iki
derleme koşar, katalog yolunun dev derlemesinde görünüp üretimde görünmediğini
ölçer. Her girişin digest'i genomundan yeniden hesaplanır; elle düzenlenmiş bir
katalog başka bir adayı o adayın kimliğiyle gösteremez. Her aday AYNI üç
tohumla gösterilir (`?audition=<n>&seed=<n>`); aralık dışı istek kırpılmaz,
reddedilir. Audition koşusu kayıt tutmaz: kalifiye olmamış bir genomla açılan
dünya oyuncunun kaydını ezemez.

Davranış ailesi yalnız ÖLÇÜLEN metriklerden çıkar (`core-like`,
`membrane-like`, `mobile`, `fragile`). `chasing`, `symbiotic` ve `recovering`
bu koşunun ölçmediği şeyleri ister ve otomatik ATANMAZ; karşılığı olmayan aday
`unclassified` kalır.

Tohum korpusu `corpus-v1` 32 benzersiz uint32 tohumdur, bir kez üretilir ve
veri olarak commit'lenir (`benchmarks/fixtures/corpus-v1.json`). Dosya
üreticisiyle testte birebir karşılaştırılır: koşu sonrasında tohum listesini
değiştirmek (seed reroll) böylece kırmızı test olur. Audition'ın üç tohumu bu
korpusun ilk üçüdür, yani ön-eleme ile uzun koşu aynı dünyalarda konuşur.

Kullanıcı yokken (K15) uzun koşuya yalnız otomatik teknik ön-elemeyi geçen ve
faz/metrik çeşitliliğine göre seçilen en fazla 8 aday girer; bu artefaktlar
`humanPreselection: pending` taşır ve kullanıcı ön-elemesi gelene kadar
promotion'a giremez.

Adım 3 ancak **technical gate + long-horizon + kullanıcı visual audition**
birlikte geçtiğinde kapanır. Bütün `SubstrateCandidate` production'a taşınır;
matris tek başına kopyalanmaz.

### Uzun ufuk koşusu ve geç çöküş analizi (F7, F8, 2026-09-17)

K15 kısa listesindeki 8 aday için kullanıcı kararıyla 8 tohum × 10 simüle
dakika (36.000 tick/birim, 128 birim, 8 worker) uzun ufuk ve perturbation
koşusu yapıldı (`benchmarks/results/f7-long-horizon.json`).

Sonuçlar:

- 8 adayın **hiçbiri** §8.4 teknik kapısını geçemedi (0/8).
- 10 dakikalık koruma medyanları %0,4 ile %7,4 arasında kaldı (eşik ≥ %70).
- Tüm adaylarda `VOID_LOSS_DOMINATED` ve `DEAD` fazları baskın çıktı.
- Geç çöküş (F8): `54bbf81b62270b94` (%38 tohumda 8. dk sonrası çöküş) ve
  `e31f112e312e6031` (%25 tohumda 8. dk sonrası çöküş) için canary bayrağı
  tetiklendi. Ancak hiçbir aday teknik sağkalım eşiğini geçemediği için
  mevcut aday ailesi (`generalized-asymmetric-multi-band`) uzun ufukta da
  kalifiye olamamıştır.
- P2 ve P3 kabul paketleri bu ölçüm verileriyle üretildi (`research-out/P2-insan-onelemesi.md`,
  `research-out/P3-final-audition.md`).

### Ölçüm katmanı açıkları (2026-09-18 kaynak doğrulaması)

K3 sonrası "%90 koruma, 3/4 DYNAMIC_STRUCTURED" tablosu (§16) ancak aşağıdaki
açıklarla birlikte okunur; hiçbiri K3'ü geçersiz kılmaz ama etiketi morfoloji
kanıtından ayırır:

1. **Üç gerekçe kodu hunide hiç ateşlenemez.** `PhaseClassifier.classify`'in
   `ClassificationContext`'i (startup-massacre bayrağı, micro-orbit serisi,
   fringe-dependent kontrolü) hiçbir üretim çağrısında bağlı değil:
   `seedRunner`, `harness` ve `longRun` hep boş context ile sınıflandırır.
   `STARTUP_MASSACRE`, `FRINGE_DEPENDENT` ve `MICRO_ORBIT_PERSISTENT` yalnız
   birim testlerinde görülür — dondurulmuş enum'da var ama ölçüm hattında ölü.
2. **Vent Void kaybını ölçümden gizler.** `voidLossRate` aktif sayım farkından
   hesaplanır; vent rezervuardan geri bastığı için net sayım sabit kalır ve
   VOID_LOSS_DOMINATED vent'li koşularda yapısal olarak tetiklenemez. Gerçek
   kayıp `reservoir.voidLossTotal`'da durur ve her örnekte kaydedilir ama
   sınıflandırıcı onu okumaz.
3. **`DYNAMIC_STRUCTURED` zayıf bir son-örnek kapısıdır.** Koşul yalnız son
   örnekte global `clusterCompactness > 0,3` ve `meanSpeed > 0,05`. Global
   compactness halka dağılıma ≈1 veren dağılım-eşitliği ölçüsüdür; per-cluster
   kayıtlar (solidity, holeRatio, normalizedGyration, radialProfile, churn,
   yaş) hesaplanır ama karara girmez. Temas mesafesinde sıkışmış topaklar da
   bu kapıyı geçer — K3 uzun koşusunda `meanNeighborCount = 80,76` ölçüldü:
   48 birim komşuluk yarıçapında bu, ortalama komşu uzaklığının parçacık
   çapına (9 birim) indiği, yani yapıların JAMMED paket olduğu anlamına gelir.
   "Structured" etiketi bu hâliyle okunabilir morfoloji kanıtı değildir.
4. **Broad ufku fazların çoğunu gözlemleyemez.** Süre-şartlı kurallar seri
   pencereden kısaysa ateşlemez (üstteki sözleşme). 30 saniyelik broad'da
   STASIS (60 sn), SPEED_CAP_CHAOS (60 sn), GAS, SINGLE_COLLAPSE ve
   MICRO_ORBIT_PERSISTENT (300 sn) hiçbir koşulda üretilemez; broad dağılımı
   fiilen DEAD / VOID_LOSS_DOMINATED / CRYSTAL_FROZEN / DYNAMIC_STRUCTURED'a
   indirgenir. Bu, F3 dağılımının okuma kılavuzudur.
5. **`kernelId` tek aileye kilitlidir.** `SubstratePhysicsProfile.kernelId`
   tip seviyesinde `MULTIBAND_KERNEL_ID`'ye sabitlidir; çürütülen aile
   dışında bir aday `SubstrateCandidate` ile ifade bile edilemez. Multi-lobe
   turu için önce kernel kimlik/profil sözleşmesi gerekir. "Üç production
   kernel taşınmaz" kuralı korunur: deneme ailesi qualified olmadan ürün
   çekirdeği olmaz.
6. **Vent intrinsic morfolojinin yerine geçmez.** Homeostaz nüfusu korur ama
   yapıyı kurmaz; vent'in güvenli iç bölgeye eklediği taze serbest madde
   ölçümü dalgalandırır (B3 analizi: ekim anında yapılı madde payı ~%73'e
   gevşer, ekimler arasında %96–%99'a yükselir). İntrinsic senaryo bugün vent
   AÇIK koşar; vent'siz kontrol kolu ayrı karar ister.

Bu açıklar kapanmadan yeni aile koşulsa bile çıkan etiketler aynı zafiyetleri
taşır; karşılık gelen işler TODO Adım 3 altındadır.

### Adım 4 gözlemci değişmezliği

Organizma identity tracker fizik çekirdeğinden bağımsız gözlemcidir.
Tracker OFF ve ON koşuları aynı seed/adayda particle state'i bit düzeyinde
aynı üretmelidir. Stable organism ID üye örtüşmesiyle sürer; split, merge ve
geçici fragmentation olaydır. Üyelik storage slotuyla değil stable particle ID
ile izlenir. Adım 3 kapanmadan Adım 4 başlamaz.

Anlık cluster doğum değildir. Yoğunluk, iç yapı ve üyelik sürekliliğini bir
süre koruyan yapı organism candidate olur. Kareler arası eşleme üye örtüşmesi,
merkez/ölçek yakınlığı ve kısa kayıp toleransını birlikte kullanır. Merge ve
geçici fragmentation olay günlüğüne yazılır. Save/load identity sayacını ve açık
eşleme durumunu korur. Tracker'ın çıktısı Adım 5'e kadar hiçbir particle
kuvvetine geri beslenmez.

Geometrik süreklilik biyolojik yaşam sürekliliği değildir; bölünme iki ayrı
sözleşme taşır:

- **Geometrik fragmentation (kaza):** en büyük süreklilik eski ID'yi
  koruyabilir; kopan küçük parça geçici ya da yeni ID alır.
- **Biyolojik fission (üreme, Adım 5):** ebeveynin yaşam döngüsü biter; bütün
  yavrular yeni organizma ID'si alır (#42 → #57 + #58) ve lineage olayı
  ebeveyn→yavru ilişkisini korur. Ebeveyn ID'si yavruya taşınmaz; soy ağacı
  böyle temiz kalır.

Aynı ayrım ölümde de geçerlidir: çekirdek avcısı nucleus'u öldürdüğünde bedenin
%80'i yerinde kalsa bile organizma ölmüştür; üyelik izleyicisinin aynı kümeyi
görmesi yaşamın sürdüğü anlamına gelmez.

## 9. Android ve fiziksel kabul

VOL.LIFE masaüstü-önce geliştirilir; Android ilk gerçek dilimden itibaren smoke
hedefidir. Kabuğa, kamera veya sunuma dokunan tur Samsung ve Lenovo'da açılır.
`benchmark:device` referanstır, donanıma bağlı olduğu için local kalite kapısı
değildir.

Android'de kalite düşebilir, dünya kuralı düşemez. Particle LOD ve Void efekt
yoğunluğu azalabilir; SDF, kuvvet, ölüm, olay ve organizma aynı kalır.

**512 bütçesi ölçüldü (D4, 2026-09-17).**

| Hedef                                          | Derleme            | Süre  | Kare                              | Kare süresi                                   | Bellek                      | Renderer               |
| ---------------------------------------------- | ------------------ | ----- | --------------------------------- | --------------------------------------------- | --------------------------- | ---------------------- |
| Lenovo Tab M11 (TB350FU, Android 14)           | debug APK, aarch64 | 60 sn | 5244 kare (~87,4 fps), jank %2,56 | p50 6 ms, p90 11 ms, p99 20 ms, kaçan vsync 3 | PSS 196 MB (grafik 83 MB)   | webgl (geri düşüş yok) |
| Samsung SM-G990B2 (Android 16)                 | debug APK, aarch64 | 60 sn | 2965 kare, jank %0,24             | p50 7 ms, p90 9 ms, p99 11 ms, kaçan vsync 0  | PSS 198 MB (grafik 41,9 MB) | webgl (GPU p99 3 ms)   |
| Chromium masaüstü viewport (SwiftShader)       | üretim derlemesi   | 62 sn | 1279 kare                         | p50 4,70 ms, p95 16,40 ms                     | —                           | YAZILIM WebGL          |
| Chromium mobil viewport (Pixel 5, SwiftShader) | üretim derlemesi   | 62 sn | 636 kare                          | p50 7,50 ms, p95 17,80 ms                     | —                           | YAZILIM WebGL          |

Soğuk açılış (Lenovo, üç koşu): 702 / 667 / 651 ms.

İki cihaz aynı APK'yı koşuyor ve ikisi de kare bütçesini rahat tutuyor. Lenovo
120 Hz panelde daha çok kare üretiyor ama jank'ı (%2,56–%3,65) ve p99'u (19–20 ms)
Samsung'a göre daha yüksek; Samsung 60 Hz'de 2965 kare, jank %0,24 ve p99 11 ms.
Darboğaz GPU değil: Samsung'da GPU p99 3 ms. Lenovo'da `FieldRenderer` doku yüklemesi
WebGL modunda `texSubImage2D` ile GPU'da yerinde güncellemeye geçirildi; `gl.texImage2D`
kaynaklı yeniden tahsis çağrıları ortadan kaldırıldı.

Simülasyonun kare içindeki payı ölçüldü: masaüstü viewport'ta tick maliyeti
3,248 ms ve p50 4,70 ms, yani karenin ~%69'u SİMÜLASYON. Mobil viewport'ta
3,283 ms / 7,50 ms ile ~%44. Render değil, fizik baskın terim.

Chromium satırı GPU ÖLÇÜMÜ DEĞİLDİR: bu ortamda headless tarayıcı yazılım
rasterleme (SwiftShader) kullanıyor ve ölçülen kare hızı ürünün değil ortamın
hızıdır. Gerçek GPU rakamları cihaz satırından okunur. Ölçüm sayfası yalnız
`VOL_LIFE_BENCH=1` ile derlenir; üretim bundle'ı ölçüm kancası taşımaz.

Samsung SM-G990B2 (Android 16) cihazı bağlandıktan sonra aynı güncel APK ile
ölçüldü (2965 kare, jank %0,24, p50 7 ms); D4 ölçümleri üç hedefte de tamamlandı.

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

**Mesafe sözleşmesinin bedeli** (2026-09-16, C6): kernel tick maliyeti 512
parçacıkta p50 1,21 → 3,00 ms, p95 1,44 → 4,90 ms yükseldi. Artış gerçek
izdüşümün bedelidir; yaklaşık mesafe bantta 0,9 birime kadar şaşırıyordu ve
`edgeDistance`, fringe stresi ile render fade aynı sayıyı tüketiyor. Çağrı başına
maliyet kaba tarama kurulum tablosuna taşınarak 21,8 µs'den düşürüldü: aynı
doğrulukla (tam alan hatası 4,3e-5 birim) p50 20,47 ms yerine 3,00 ms.

Ölçekleme benchmark'ı İKİ seri raporlar ve ikisi farklı soruya cevap verir
(2026-09-16):

| Seri                  | 512 p50 | 2048 p50 | Oran (5 koşu medyanı) | Azami hücre doluluğu |
| --------------------- | ------- | -------- | --------------------- | -------------------- |
| Algoritmik (tabakalı) | 3,01 ms | 14,26 ms | **4,752**             | 38 → 40              |
| Ürün (gerçek seeder)  | 2,41 ms | 22,87 ms | 9,744                 | 105 → 416            |

Algoritmik seride parçacıklar habitat içinde tabakalı ızgaraya yerleşir; dünya
kenarı da parçacıkla birlikte iki katına çıktığı için YEREL yoğunluk girdiden
bağımsızdır. Süre oranı ancak o zaman hash + kuvvet karmaşıklığını ölçer ve
doğrusal davranışı (4,0) karesel sızmadan (16,0) ayırır. `quality.json` tavanı
bu seriye bağlıdır: medyan × 1,10 = **5,23**.

Ürün serisi gerçek seeder'ı kullanır; sabit yama yarıçapı yüzünden 4× parçacık
aynı yamalara gömülür ve hücre doluluğu 105'ten 416'ya çıkar. Buradaki 9,744'lük
oran gerçek iş yükünü anlatır ama karmaşıklık kapısı olamaz — eski 14 tavanı bu
seriyi ölçtüğü için O(n²) sızmasına tehlikeli biçimde yakındı. Her iki seri de
aktif sayı, azami hücre doluluğu, parçacık başına aday çift ve p50/p95 taşır.
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
  üretebilmesi. 2026-09-19 analizinin buradan aldığı iki ölçülü ders: yapısal
  zenginlik ancak binlerce parçacıkta belirginleşiyor (v2 rejiminin 1024
  kararıyla uyumlu taban) ve görsel okunabilirlik parçacık sayısından değil
  aralarındaki negatif boşluğun korunmasından gelir.
- [Reynolds — Steering Behaviors for Autonomous Characters](https://www.red3d.com/cwr/papers/1999/gdc99steer.pdf):
  hedef seçimi, steering ve locomotion katmanlarının ayrılması; containment'ın
  çarpışma sonrası sekmeden farklı olması.
- [Flow-Lenia](https://arxiv.org/abs/2212.07906): madde korunumu ve yerel
  parametrelerin aynı dünyada çoklu yapı üretimi için tasarım aracı olması.
  Ders: korunumlu alan yaklaşımı bir PİVOT YEDEGİDİR — dört parçacık ailesi de
  çürürse masaya gelir, önce gelmez.
- [Primordial Particle Systems](https://www.nature.com/articles/srep37969):
  basit yerel kurallar, yoğunluk ve hareketin büyüyen/iyileşen/çoğalan
  yaşam-benzeri yapıların faz davranışıyla birlikte incelenmesi. Analizin
  buradan aldığı ders: PPS protocell-benzeri yapıya self-propelled
  parçacıklarla ulaşır — yani "yaşam görünümü" için BİLİŞ gerekmez, aktif
  mekanik yeterlidir; bu `active-particle` ailesinin neden `multi-lobe`'dan
  sonraki basamak olduğunun emsalidir.
- Atomic Clusters (mechanics emsali, kaynak gözlemi): merkez-dışı yük
  noktaları taşıyan parçacıklar tork ve moleküler geometri üretir —
  `oriented-torque-v1` ailesinin ifade hedefi budur. Ders: directionality'nin
  bir kısmı Adım 6'nın AI'ını beklemeden fiziğin kendisinden çıkabilir;
  kuyruk/aktüatör davranışı (§4) böyle bir substrate üzerinde doğal kurulur.

Ortak ders (2026-09-19): bu emsallerin hiçbirinde "okunabilir morfoloji" AI,
koloni, tehdit veya besin döngüsünün ürünü değildir — hepsi düşük seviyeli
etkileşim modelinin kendi çıktısıdır. Bu, "ecology/AI blob'u organizmaya
çevirir" beklentisini reddeder: Adım 5–7 o substrate üstüne kurulur, onun
yerine geçmez. Yine de emsal denklemler kopyalanmaz; yalnız ilkeler alınır.

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
Kod yazılmadan önce biyokütle/rezerv defteri §3'teki iki adaydan biriyle kapanır
ve korunum testiyle kilitlenir. Gerçek üreme §8'deki fission sözleşmesine uyar:
ebeveyn ID'si yavruya geçmez.

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
dünya hızlandırılmaz ve yavaşlatılmaz. Canlı dünyada kullanıcı arayüzü pause'u
gerçek bir 0× dondurmadır — simülasyon tick, fizik, alan, enerji, AI, RNG ve
Void olayları tamamen durur; resume pause süresini catch-up etmez. Replay
0×/0.5×/1×/2×/4× zaman ölçeklemesi taşır ve bu hızlar yalnız deterministik
replay'dedir. Replay kural, domain ve creation sürümlerini taşır (§7).
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

Organizma genomu `SubstratePhysicsProfile`ın pair yasasını birey başına
değiştirmez; kalıtılabilir fenotip parametreleri morphology'nin izin verdiği
güvenli aralıkta yaşar. Kalıtım,
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

Implementation snapshot 2026-09-18; tasarım kararları 2026-09-19'a kadar
günceldir — bölüm iki zamanı anlatır: kod state'i eski, tasarım state'i yeni.

**Uzun ufuk taban ölçümü (E17, 2026-09-17 taban vs 2026-09-18 K3 sonrası).**
4 seed × 30 simüle dakika, `tests/long/defaultLongRun.long.ts`:

| seed | 30 dk koruma (taban) | 30 dk koruma (K3 sonrası) | gerekçe (taban)     | gerekçe (K3 sonrası) |
| ---- | -------------------- | ------------------------- | ------------------- | -------------------- |
| 1    | 0,123                | 0,896                     | VOID_LOSS_DOMINATED | DYNAMIC_STRUCTURED   |
| 2    | 0,309                | 0,895                     | VOID_LOSS_DOMINATED | DYNAMIC_STRUCTURED   |
| 3    | 0,264                | 0,957                     | VOID_LOSS_DOMINATED | GAS                  |
| 4    | 0,172                | 0,912                     | VOID_LOSS_DOMINATED | DYNAMIC_STRUCTURED   |

Eski varsayılan 30 dakikada maddesinin %70-88'ini kaybediyordu (koruma 0,123–0,309)
ve dört seed'in dördünde de Void kaybı baskındı. K3 çözümü sonrası madde koruması
%89,6–%95,7 bandına fırladı ve tohumların 3/4'ü DYNAMIC_STRUCTURED olarak tamamlandı.
Muhasebe değişmezi her örnekte korundu (aktif + rezervuar = başlangıç), bütün
değerler sonlu kaldı ve 10. dakikada alınan snapshot'tan restore edilen kopya 30. dakikada kesintisiz koşuyla BAYT DÜZEYİNDE aynı parmak izini verdi.

Bu tablonun üç gölgesi vardır (§8 "Ölçüm katmanı açıkları"): koruma sayısı
vent'in rezervuardan geri bastığı maddeyi içerir, yani ekolojik sağkalımdır,
intrinsic morfoloji kanıtı değildir; `DYNAMIC_STRUCTURED` etiketi zayıf
son-örnek kapısından gelir ve K3'te `meanNeighborCount = 80,76` ölçülmüştür —
yapılar temas mesafesinde sıkışmış paketlerdir; snapshot/restore bayt eşitliği
AYNI örnek üzerinde ölçüldüğü için vent state'inin snapshot dışında kalması
burada gözlenmez (persistence yüklemesi maskeyi kaldırır, §3).

Maliyet sapması PARÇACIK BAŞINA ölçülür. Ham tick maliyeti sapması 0,34-0,53
çıktı ama bu nüfus düşüşüdür: madde yarıya inince tick doğal olarak ucuzluyor.
Çalışma zamanı bozulmasını ölçen sayı parçacık başına olandır ve %20 sınırının
altında kaldı.

- Paket kabuğu, i18n, Sheet, FPS, haptics, orientation ve persistence çalışır.
- FieldSet, fixed-step, stateful RNG, world metadata, SoA store, interpolation
  ve counting-sort spatial hash korunacak temeldir.
- Alan temposu `fixedStepMs`den türetilir; config ve snapshot doğrulaması tek
  girişte tamamlanır; config/metadata sahipliği kopyayla yalıtılır ve restore
  her katmanda atomiktir. Yarım runtime kurulumu ile sahne, autosave ve çıkış
  yaşam döngüleri kaynaklarını idempotent toplar.
- **Particle Substrate v2 uygulanmıştır**: `SubstrateConfig`, `PhysicsGenome`
  (üretim config'i fizik+seeding+fringe'i tek nesnede taşır; araştırma tarafı
  `SubstrateCandidate` profillerine ayrılmıştır), `DynamicsGenes`,
  `PairForceKernel` (generalized multi-band directional),
  capacity-managed `ParticleStore` (512 aktif/kapasite), `ParticleSpatialHash`
  (yalnız aktif slot), organik `HabitatSDF`/`WorldDomain`, `VoidSink`
  (geri dönüşsüz deaktivasyon + `MatterReservoir`), `InitialMatterSeeder`
  (patch+cloud dağılımı), v4 snapshot codec ve persistence (adlandırılmış RNG
  akış tablosu + kanonik pasif slot doğrulaması), çok bantlı field güncelleme,
  alt sistem başına ayrı RNG akışı, camera-domain handling, Void-death rendering.
- Eski 100 parçacıklı triangular fizik ve dikdörtgen impulse sınırı artık
  production'da DEĞİLDİR; yalnız negatif baseline olarak benchmark fixture'ında
  korunur.
- **Adım 3 araştırma kütüphanesi uygulanmıştır** (`scripts/morphology/`):
  `GenomeSampler`/`physicsSampler` (Sobol), `MorphologyMetrics` (VACF, MSD,
  yineleme, per-cluster kayıtlar), stable-ID'li `ClusterTracker`
  (split/merge/gap sözleşmesi), 11 kodlu `PhaseClassifier`, `ResearchHarness`
  (broad→refinement→qualification), `PerturbationSystem`, `worker_threads`
  havuzu (seri referansla bayt-eşit), checkpoint JSONL, v4
  `QualificationArtefact` (seed sınırları, ölçülmüş bütçe, dirty-eligibility),
  `PromotionFlow`/`canary`, `falsification` ve `collapseDetector`. Headless —
  Phaser import etmez, `runtime/sim` çekirdeğini kullanır. İskelet tamam ama
  ölçüm katmanında altı açık vardır (§8 "Ölçüm katmanı açıkları"): üç gerekçe
  kodu huniye bağlı değil, `voidLossRate` vent altında kaybı göstermez ve
  `DYNAMIC_STRUCTURED` per-cluster kanıt tüketmez.
- **Brute-force oracle testi uygulanmıştır**: spatial-hash/kernel yolu doğrudan
  all-pairs referans implementation ile karşılaştırılır; aktif/pasif slot ve
  tür çifti davranışını floating-point tolerans içinde doğrular.
- 2026-09-14 geliştirici koşusunda 384 test geçti ve coverage
  96,93/93,13/93,51 (statement/branch/function) ölçüldü; 384 test 2026-09-15'te
  yeniden koşuldu. Test sayısı ve coverage ürün kabulü değildir.
- 512 parçacıkta p50 ≈ 0,98 ms, p95 ≈ 0,998 ms; 2048 parçacıkta p50 ≈ 13,9 ms.
- 256² field ≈ 5,4 ms/tick; 512²/4-band ≈ 5,6 ms/tick (tam tazeleme ≈ 22,4 ms).
- Qualified aday henüz çıkmamıştır; araştırma kütüphanesi production'a aday
  taşımamıştır. Bu beklenen durumdur — Adım 3 ancak technical gate +
  long-horizon + kullanıcı visual audition birlikte geçtiğinde kapanır ve
  bugün AÇIKTIR (F7'de 0/8; §8 ölçüm katmanı açıkları kapanmadan yeni aile
  koşusu anlamlı etiket üretmez).
- Üretimdeki varsayılan çekirdek **çürütülmüş bir aileye** aittir
  (`generalized-asymmetric-multi-band`, F3 kural a). Yeni aile qualified olana
  dek varsayılan "en iyi bilinen" değil "en son ölçülen"dir; negatif baseline
  (triangular-v1) bile F2'de ondan daha iyi madde tuttu (0,725 vs 0,398).
  Sıradaki ön-kayıtlı aile `multi-lobe`dur ve ifade edilebilmesi için önce
  `kernelId` kilidinin açılması gerekir.
- **2026-09-19 analizi belgelendi:** Adım 3'ün kabul tanımı genişledi — teknik
  ön-kapı + insan görsel kabulü iki katmandır (§8 "Pozitif morfoloji");
  kanonik araştırma rejimi `1024 / 1536² / 8 yama` olarak yazıldı (§1, §8);
  intrinsic senaryonun vent-KAPALI koşması kararı alındı (§8); kernel
  soyutlaması `SubstrateInteractionModel` olarak yeniden tanımlandı (§3);
  glyph/fiziksel yarıçap ayrımı ve 1536² kamera sonuçları §6'da. Bunların
  hiçbiri uygulanmadı — tümü TODO Adım 3 işidir.
- **2026-09-19 devam analizi (spawn/vent) belgelendi:** v2 seeding'e üç
  revizyon kararı (origin min ayrımı, doğum overlap yasağı, origin başına tip
  kapsama; oran/yarıçap/hız ilk turda sabit — §2); vent mimarisi kararları
  (kalıcı `VentSite` coğrafyası, tip-korunumlu rezervuar, emisyon başına
  tüketim, jitter/dormancy — §3) ve iki tescilli kusur: burst rezervasyonu
  snapshot-dışı bekleyen maddeyle **madde kaybı** üretir, doğum konumu
  fringe içine düşebilir (§3); vent sunum yönü §6'da.
- **2026-09-19 consistency pass belgelendi:** çapraz denetimin bulduğu
  semantik çelişkiler kapatıldı — 512 statüsü Adım 2 baseline'ına çekildi
  (§1, §18); zorunlu ECOSYSTEM açılışı kaldırıldı (§18); kabul üç
  taksonomiye ayrıldı (`PhaseClassification` donmuş /
  `MorphologyGateFailure` / `HumanAcceptance`) ve `DYNAMIC_STRUCTURED`
  kaba anlamını korudu (§8); 512 katastrofik ön-filtreye indirildi,
  morfoloji kararları 1024'e taşındı (§8); vent muhasebesi düzeltmesi
  Step 5'i beklemeden P0'a çekildi (TODO). Aile adlandırması `familyId`
  standardına bağlandı (§8); seeding deterministik başarısızlık
  sözleşmesi ve RNG akışları §2'de; VentSite versioning ve tip-başına
  korunum invariantı §3'te.
- Kamera özellikleri arttı fakat kullanıcı ergonomi kabulü hâlâ FAIL'dir.
- Adım 4+ (identity, energy, nucleus, predators, viruses) hâlâ blokelidir.

## 17. Ölçülmemiş varsayımlar

Aşağıdakiler ölçülmeden karar veya tamamlanmış iş sayılmaz. (2026-09-19
consistency pass: 512 cihaz bütçesi, `HabitatSDF` hata sınırı — 4,3e-5
birimde ölçüldü — ve "512 rejiminde okunabilir morfoloji mümkün mü" sorusu
bu listeden çıkarıldı; ilki ölçüldü, sonuncusu 1024/1536² kararıyla
superseded oldu — ölçülenler §11 ve ölçüm geçmişinde kalır.)

- **1024/1536² kanonik rejimin hedef cihaz bütçesi:** yeni default world için
  simulation p50/p95, frame p50/p95/p99, jank, GPU, PSS, başlangıç maliyeti
  ve snapshot boyutu Samsung/Lenovo/Chromium'da yeniden ölçülür — 512'nin
  kapanmış bütçesi yeni rejime taşınamaz.
- Habitat şekli, fringe genişliği ve tidal stress'in morphology'yi bozmayan
  aralığı.
- Kamera Void margin'i, zoom limitleri ve modality bazlı momentum değerleri.
- Aktif aile profili arama uzayının boyutluğu ile arama bütçesi arasındaki
  denge — ilk ölçülecek aday `multi-lobe-v1` profilidir (çürütülmüş
  multi-band'e değil).
- Deterministik worker shard'larının seri referansla maliyet kazancı.
- Matter reservoir dönüş hızının extinction ve taşıma kapasitesine etkisi.
- Particle glyph/semantic LOD'un okunabilirlik ve GPU maliyeti.
- Donmuş Main Menu'de render temposunu düşürmenin kazancı.
- `1024 / 1536² / 8-yama` kanonik rejiminde okunabilir (gözenekli, sınırlı,
  iç organizasyonlu) morfolojinin fiziksel olarak mümkün olup olmadığı —
  soru eski 512 rejiminden yeni kanonik tabana taşındı.
- İntrinsic/ekolojik senaryo ayrımının ölçülen etkisi: §8 kararı intrinsic
  kolu `MatterReturnPolicy: none` ile koşturur; vent'siz kontrol kolunun
  intrinsic kanıt üzerindeki ölçülen farkı ve vent'li kolun ürün kanaryası
  olarak kapsamı ilk koşuda ölçülecek.
- Glyph/fiziksel yarıçap ayrımının okunabilirlik kazancı (aday aralık
  2,5–3,5 birim) cihazda insan kabulüyle ölçülmeden kilitlenmez.
- `1024 / 1536² / 8-yama` kanonik rejiminin v1'e göre metrik ayrımı — iki
  rejim aynı ailede koşulup karşılaştırılmadan "daha büyük daha iyi" varsayımı
  kanıtlanmış sayılmaz.

## 18. Screen loop ve oturum yaşam döngüsü

VOL.LIFE bir simülasyon test harness değil, bir üründür. Uygulama açılışı
kaotik bir dünyaya doğrudan dalmak yerine, donmuş bir dünya gözlemi ile başlar.

Bu akış VOL.LIFE için CORE üzerine yeniden kurulur. VOL.HELL'in
`MainMenuScene`, `PauseScreen`, `LoadingTransition` ve `PauseController` akışı
yalnız referans ve ders kaynağıdır: kopyalanmaz ve VOL.HELL bu işte migrate
edilmez. CORE'a eklenen genel API yalnız VOL.LIFE ihtiyacıyla kanıtlanır; diğer
oyunlara zorunlu refactor getirmez.

### Main Menu donmuş dünyanın en uzak gözlem ölçeğidir

Main Menu oyundan önceki ayrı bir ekran değildir; aynı yaşayan dünyanın
frozen presentation state'idir. Dünya RAM'de kalır, simulation frozen'dır,
renderer alive'dır. LIFE'a tekrar basınca reload, parser veya reconstruction
yoktur — seamless resume.

Main Menu'de dünya tamamen durur: particle hareket etmez, fields ilerlemez,
AI ilerlemez, energy azalmaz, organism ölmez, RNG ilerlemez, Void olayları
oluşmaz. Yalnız presentation-only dekoratif efektler (habitat glow/breathing)
yaşayabilir.

Görünür ana aksiyon `LIFE` / `YAŞAM` düğmesidir. Settings, Continue, New
World, Quit gibi klasik menü butonları görünürde yoktur. Kayıt varsa LIFE =
devam et, kayıt yoksa LIFE = yeni hayatı başlat. Android Back: Quit Confirm
açar.

Bunun dışında ekranın en alt ortasında çok hafif, yarı saydam, çerçevesiz bir
yukarı ok/chevron affordance'ı yer alır:

    ˄

Bu klasik bir mobil yatay "drag handle" çizgisi değildir:

- Horizontal bir bar değil, dikey yukarı ok `˄` semantiğindedir.
- Mobilde yukarı sürükleme (swipe up) veya tek dokunma (tap).
- Masaüstünde fare ile tıklama (click).
- Controller ve klavyede odaklanılabilir (focusable) semantik buton.

Bu affordance tetiklendiğinde:

- Ekranın alt %45–50'sini kaplayan yarı saydam bir **Genesis Drawer** açılır.
- Arkadaki donmuş (frozen) dünya hafifçe yukarı **reframe** edilir (kamera
  merkezi yukarı ötelenir, böylece drawer arkasındaki dünya gizlenmez ve
  okunabilir kalır). Kapatıldığında dünya yumuşakça merkez konumuna geri döner.
- Drawer içinde yalnızca doğrulanmış ve kanıtlanmış parametreler yer alır:
  - **World Scale (Dünya Ölçeği):** Yalnızca doğrulanmış ölçekler sunulur.
    Ölçek seçici yalnız EN AZ İKİ qualified world scale olduğunda görünür —
    tek ölçek varken "Standard" diye seçim yaptırmak anlamsızdır, v1'de
    seçici hiç gösterilmez; Standard / Vast / Micro preset'leri gerçekten
    ölçülüp qualified oldukça açılır. (512'nin "üretimde kanıtlanmış tek
    ölçek" statüsü Adım 2 baseline'ına aittir; 1024/1536² kanonik rejimi
    henüz uygulanıp cihazda doğrulanmadı — §8.)
  - **Seed (Tohum Seçimi):** Random Seed (varsayılan) veya Explicit Seed girişi.
  - **Live / Seed Preview:** Seçilen tohum ve ölçeğin deterministik önizleme
    özeti (başlangıç yoğunluğu, habitat formu).
  - **Launch (Başlat):** Seçilen tohum ve ölçek parametreleriyle dünyayı başlatır.

**Controller Ergonomisi (Steam Deck & Gamepad):**

- Main Menu açıldığında varsayılan klavye/gamepad odağı `LIFE` düğmesindedir.
- D-pad Down ile `˄` affordance'ına inilir.
- A tuşu Genesis Drawer'ı açar (drawer 0.0 → ~0.48 yüksekliğe kayar, kamera yukarı reframe olur).
- Drawer açılınca odak otomatik olarak Drawer'ın ilk etkileşimli elemanına geçer (Focus Trap).
- D-pad Up/Down ile drawer elemanları arasında dolaşılır; Left/Right ile preset/seçenekler değiştirilir.
- B tuşu veya Back/Escape Drawer'ı kapatır, dünyayı tekrar merkezler ve odağı alt ok affordance'ına iade eder.
- Start veya Launch üzerindeyken A tuşu dünyayı başlatır.

Main Menu kamerası bütün habitat overview'ındadır (`contain`). Gameplay'e
dönüşte kayıtlı dünyada oyuncunun hatırlanan kamerası (x, y, zoom), taze
dünyada `contain` overview açılır — zorunlu ECOSYSTEM açılış zoom'u yoktur
(uygulandı, kullanıcı cihazda beğenmedi ve geri alındı; açılış
`fit:'contain'` + zoom 1). Menu overview gameplay camera state'ini
overwrite etmez — oyuncunun son gameplay camera ayrı saklanır.

Oyundan Main Menu'ye dönüş güvenli bir oturum checkpoint'idir: PAUSED → kayıt
flush'ı → gameplay kamerası saklanır → kamera overview'a açılır → donmuş menu
önizlemesi. Dünya yeniden yüklenmez; flush tamamlanmadan menu güvenli sayılmaz.

Main Menu görünür olduğunda ilk klavye odağı LIFE düğmesindedir ve alttaki
gameplay kontrolleri inert'tir. LIFE görsel olarak borderless olsa da semantik
bir düğmedir ve klavye odağında görünen focus ring'ini korur. Düğme habitatın
ekrana izdüşen görsel merkezine bağlıdır ama safe-area içine kıstırılır;
asimetrik bir habitat onu notch, sistem çubuğu veya ekran kenarına itemez.

### LIFE düğmesi menüden çıkış değil, dünyayı uyandırma eylemidir

LIFE tıklandığında üç aşamalı transition: (1) Activation ~120-180ms — letter
spacing hafif sıkışır, haptic, input kilitlenir, AudioContext resume(). (2)
Awakening ~300-450ms — scrim çözülür, LIFE yazısı küçük loading/life pulse'a
dönüşür, world kontrastına gelir. (3) Entry ~700-1100ms — camera hedef
kameraya geçer (saved world: hatırlanan gameplay kamerası; fresh world:
`contain` overview) ve fresh world'de simulation ilk hareketleri başlar,
saved world'de restore tamamlanana kadar hareket başlamaz. Otomatik
ECOSYSTEM dalışı kullanıcı kararıyla geri alınmıştır; ileride güzel bir
transition bulunursa ayrı human-acceptance deneyi olarak döner, bugün
gereksinim değildir. Reduced motion: kısa fade + cut to target camera.

### Boot hazırlığı ile dünya girişi ayrı yüklemelerdir

Boot hazırlığı Main Menu'nün var olabilmesi için gereken en azdır: locale,
tercihler, ekran yönü, snapshot, dünya önizlemesi ve renderer. Bunlar hazır
olmadan menu gösterilemez. Dünya girişi LIFE'a basınca başlar: ses kilidinin
açılması, creation protokolü, kamera hedefi ve oturumun etkinleşmesi. Kısa bir
boot yükleme yüzeyini flash ettirmez; gösterge ancak küçük bir anti-flicker
gecikmesinden sonra görünür, eşik ölçümle seçilir.

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

Genesis sürümlüdür: `creationProtocolVersion` ve creation pre-roll tick/config'i
dünya metadata'sına ve replay formatına yazılır (§7). Aynı seed farklı bir
protokolle sessizce aynı dünya sayılmaz.

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
(gerektiğinde), autosave. Resume: pause süresini catch-up etmez. Uygulama
tamamen kapalıyken de dünya donar ve açılışta catch-up yapılmaz (§7).

Creation Phase ayrı bir session modudur — `FROZEN`, `CREATION`, `LIVE`
semantics. Fresh LIFE entry'de substrate ilerler ama Step 5'te energy/ageing/
metabolism başlamaz. Yalnız `paused: boolean` ile çözülmez.

### Screen state-machine explicit'tir

`LifeAppFlowController` şu state'leri yönetir: BOOTING, MENU,
ENTERING_FRESH_WORLD, ENTERING_SAVED_WORLD, PLAYING, PAUSED,
RETURNING_TO_MENU. Scattered boolean değil. Controller simulation fiziği
bilmez — `ParticleStore` import edilirse reddedilir.

`LifeScreenStack` tek lifecycle owner'dır: MainMenu, LoadingScreen, LifeHud,
PauseSheet, `ToastManager` vb. kurar, destroy'da güvenli temizler. State kararları
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

Çıkış platform yeteneğine bağlıdır. Native kabukta QUIT kayıt flush'ından sonra
uygulamayı gerçekten kapatır. Pencereyi kapatma yeteneği olmayan web'de QUIT'in
görünürlüğü ve anlamı platform politikasıyla belirlenir; bu politika henüz
kararlaştırılmamıştır (TODO).

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
adaptif: yakın ~700-800ms, uzak→yakın ölçek geçişi ~900-1100ms, maksimum ~1200ms.
Reduced motion: 100-150ms fade/cut.

## 19. Steam Deck ve taşınabilir konsol sözleşmesi

Steam Deck (LCD ve OLED) doğrudan hedeflenen birincil donanım profilidir.
Valve'in "Steam Deck Verified" (Yeşil Onay Rozeti) standartları ürün ve mimari
sözleşmesine dahildir.

### Dört temel sütun

1. **Girdi (Input):**
   - Oyun tam kontrolcü desteğine sahip olmalıdır; harici klavye/fare
     gerektiremez.
   - Kontrolcü bağlıyken arayüzde asla klavye/fare glifleri ("Click", "Press
     Enter") görünemez; standart gamepad ikonları (`[A]`, `[B]`, `[X]`, `[Y]`,
     `[D-Pad]`) gösterilir.
   - Metin girişi gereken alanlarda (Explicit Seed, adlandırma vb.) sistem
     ekran klavyesi (Steamworks `ShowFloatingGamepadTextInput` veya native
     protokol köprüsü) otomatik açılmalıdır.
2. **Ekran (Display):**
   - 1280×800 (16:10) yerel çözünürlük letterbox'sız desteklenir; 1280×720 (16:9)
     uyumludur.
   - 1280×800 çözünürlükte hiçbir metin **9 pikselin** altına düşemez (Valve
     sert eşiği). Gövde metinleri 12–14 piksel bandında tutulur.
   - Varsayılan grafik ayarları Steam Deck donanımında doğrudan 60 FPS verecek
     şekilde yapılandırılır.
3. **Sorunsuzluk (Seamlessness):**
   - Oyun harici veya ara bir başlatıcı (launcher) olmadan doğrudan başlar.
   - Açılışta veya çalışma sırasında uyarı/hata diyaloğu çıkarmaz.
4. **Sistem (System Support):**
   - SteamOS / Linux Runtime (Sniper) altında yerel ya da Proton üzerinden
     çökmesiz, sızıntısız çalışır.

### WebKitGTK ve Gamescope uyumluluğu

- WebKitGTK, SteamOS Gamescope altında DMA-BUF donanım ivmesi veya Wayland
  compositing kusurları yaşayabilir. `linux.AppRun` şablonu ortam değişkenlerini
  oturum türüne göre yönetir (`WEBKIT_DISABLE_DMABUF_RENDERER` fallback'i ve
  `GDK_BACKEND=x11` çevirisi).
- HTML5 Gamepad API Linux sandboxing'inde `/run/udev` izinleri gerektirir; AppImage
  ve yerel ikililerde bu doğrudan sağlanır. `getGamepads()` poll döngüsü 60 Hz
  `requestAnimationFrame` ile senkronize çalışır.
- VSync ve Frame Pacing: Gamescope Wayland kompozitörü VSync'i zorunlu kılar.
  Oyun içi yapay frame limiter eklenmez; VSync motorun doğal rAF temposuna
  bırakılır.

### Güç profili ve askıya alma (Suspend / Resume)

- **TDP Bütçesi:** VOL.LIFE 2D WebGL mimarisiyle 4W–6W TDP profilinde 60 FPS
  vererek 6–8+ saat pil ömrünü hedefler.
- **Suspend / Resume:** Konsol uykuya alınıp uyandırıldığında WebAudio
  `AudioContext` genellikle `suspended` durumuna geçer. `visibilitychange` ve
  ilk kullanıcı girdisiyle kontrollü `audioContext.resume()` çağrısı
  yapılarak ses motorunun çökmesi veya sessiz kalması önlenir. WebGL dokuları
  bağlam kaybı (`webglcontextlost` / `webglcontextrestored`) durumunda
  yeniden oluşturulur.
