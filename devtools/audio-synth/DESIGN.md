# Ses üretim tasarımı

Paket çevrimdışı ses üretir, çıktıyı ölçer ve kaynağına bağlı manifest ile
yayımlar. Çalışma zamanı hazır tampon çalar. Parametre, registry ve komut
kataloğu belgeye kopyalanmaz; `audio:job context --json` çalışan koddan
üretilen kaynaktır. Bu belge katmanların sorumluluğunu ve üretim garantisini
tanımlar.

## Katmanlar

| Katman                                     | Sorumluluk                                            |
| ------------------------------------------ | ----------------------------------------------------- |
| `src/guard/`                               | Parametre, kombinasyon ve kaynak bütçesi doğrulaması  |
| `src/synthesis/`, `src/engine/`            | Örnek üretimi ve ortak mastering                      |
| `src/instruments/`, `src/presets/`         | Fiziksel modeller ve adlandırılmış parametre kümeleri |
| `src/arrange/`                             | Zaman yerleşimi, perde sözlüğü ve mix veriyolu        |
| `src/program/`                             | Kanonik akustik program, registry ve render grafiği   |
| `src/analysis/`                            | Yükseklik, tepe, spektrum, dikiş ve teslim ölçüleri   |
| `src/search/`, `src/family/`, `src/music/` | Arama, varyant ve müzik sözleşmeleri                  |
| `src/protocol/`                            | Dosya tabanlı iş akışı, yayın ve doğrulama            |
| `src/writer.ts`                            | Node ortamında WAV ve FFmpeg ile OGG yazımı           |

Model yeni DSP taşır; preset mevcut modelin parametre kümesidir. Yeni preset
motor yüzeyini büyütmez. Public yüzey ve registry metadata'sı yönetişim
kapılarıyla kilitlidir. Saf program katmanı dosya ve süreç yönetmez;
protokol Node ortamına aittir.

## Determinizm ve sürüm

Aynı program, tohum, düğüm sürümleri ve renderer sürümü aynı PCM'i üretir.
Rastgelelik adıyla türetilmiş bağımsız alt akışlardan gelir; katman eklemek
ya da sırasını değiştirmek mevcut katmanın akışını kaydırmaz. Yerel ayara
bağlı sıralama ve saat üretim kimliğine girmez. Farklı JavaScript runtime
ana sürümlerinde bit eşitliği ölçülmeden varsayılmaz; manifest runtime
bilgisini taşır.

Registry kimliği ve sürümü birlikte çözümlenir. Aynı sürümde render
sözleşmesi değiştirilemez; parametre alanı, varsayılan ya da yönlendirme
anlamı değişince yeni sürüm açılır. Eski program kesin eski sürümü ister.
Kilit kullanılan düğümün render yüzeyini korur; kullanılmayan düğüm eklemek
eski programın kimliğini değiştirmez.

## Sentez ve mix

Kaynak ya da exciter, rezonatör dizisi, artikülasyon ve yerleşim bir katman
oluşturur. Seri ve paralel rezonatörler açık topolojiyle tanımlanır.
Gesture zaman eğrisini, modülasyon ayrı stokastik değişimi sağlar. Fiziksel
modelin materyal, gerilim, temas ve sönüm parametreleri ses üzerinde etkili
olmak zorundadır; metadata ile uygulamanın kopması registry testini düşürür.

Osilatör, gürültü, sample, fiziksel enstrüman ve olay temelli temas aynı mix
yoluna girer. Bus, send ve sidechain yönlendirmesi ayrı grafiktir; döngü,
bilinmeyen hedef ve geçersiz bağ render öncesinde reddedilir. Preset yeni
bir mix ya da mastering yolu açmaz.

Sesler mix öncesinde ayrı normalize edilmez. Seviye ortak master'da bir kez
verilir; DC temizliği, ölçüm, kazanç, sınırlama ve kenar sönümü bu çekirdekte
koordine edilir. Yazıcı ek kazanç uygulamaz. PCM kelepçeleme ve deterministik
16-bit dither teslim kimliğine dahildir. Tepe eşitleme ile algılanan
yükseklik eşitleme farklı işlemlerdir; RMS ve LUFS ayrı ölçülerdir.

Loop'ta taşan kuyruk başa sarılır. Program loop katlaması kuyruk ile başın
ilintisine göre eşit güç geçişi uygular. Kaynak dikişinin temiz olması
kayıplı kodek sonrası dikişi kanıtlamaz; yayın gönderilen dosyayı ayrıca
ölçer. Tek atışın kesiminde kısa sönüm vardır; sınırsız efekt kuyruğu
kendiliğinden eklenmez.

## İş akışı ve özet zinciri

`AudioJobV1` dosya tabanlıdır. Brief, program, render, analiz, seçim ve yayın
birbirinin kanonik SHA-256 özetini taşır. Durum alanı tek başına kanıt
sayılmaz; geçerli aşama dosyalardan ve bağlardan hesaplanır. Bir üst girdi
değişince ardıllar bayat olur ve yayın reddedilir. Protokol dışında değişen
ya da yarım yazılan dosya geçerli kabul edilmez.

Yazımlar aynı dizindeki geçici dosya üzerinden atomiktir. Tek yazıcı kilidi
çakışan üretimi önler; ölü sürecin kilidi devralınabilir. Yol sözleşmesi
repo göreli ve normalize edilmiş yoldur. Mutlak yol, traversal, sürücü
harfi ve sembolik bağ reddedilir. Yayın yalnız kendi referans köküne veya
`audio-target.json` ile yeteneğini beyan eden aktif oyuna yapılır; frozen
paket hedef olamaz.

Yayın nihai render'ı yeniden üretir ve kodek sonrası politikayı sınar.
Seçim gerekçesi teknik karardır; insan dinleme onayı gibi sunulmaz. Asset
önce staging'de hazırlanır, kapıyı geçince hedefe ve manifestine taşınır.
İşin kimliği farklı bir asset'in üzerine sessizce yazamaz.

## Manifest ve doğrulama

`AudioAssetManifestV1` brief ve programı gömülü taşır. Kaynak tohumunu,
renderer sürümünü, kullanılan render yüzeyini, PCM ve kodlanmış bayt
özetlerini, encoder araç zincirini, analizör ve politika sürümlerini,
entegrasyon ve teslim kökenini kaydeder. Bir asset yalnız manifestinden
yeniden render edilip doğrulanabilir; sohbet ya da scratch dosyası gerekmez.

Doğrulama PCM değişimini, yalnız encoder değişimini ve aynı encoder
kimliğindeki bayt sapmasını ayrı sınıflar. FFmpeg libvorbis sürümünü tam
raporlamadığından encoder parmak izinin körlüğü manifestte açık taşınır.
PCM kimliği ses değişiminin bağlayıcı kanıtıdır.

`audio:production-check` bütün manifestleri, aramaları, kayıtlı aileleri,
müzik bundle'larını ve sample kayıtlarını doğrular. Kayıtlı ailede bank
bulunmaması eksik yayın sayılır. Kullanımı biten aile ve bank aktif üretim
kaydında ölü bağ bırakmaz; geçmiş git veya git dışı koruma kaydında tutulur.

## Ölçüm ve QA

Tek analiz çekirdeği kaynak PCM ve çözülmüş gönderim üzerinde kullanılır;
rapor ölçümün hangisinden geldiğini söyler. Yükseklik, sample peak, true
peak, RMS, kanal bazlı kırpma, spektrum ve zaman betimleyicileri ayrı
alanlardır. Kısa sesin integrated yüksekliği tanımsız olabilir; değer
uydurulmaz, kısa olay için en yüksek momentary ölçüsü kullanılır.

Sınıf politikası yol ya da açık sınıf beyanından seçilir. UI ve SFX kısa
olay, ambience ve music sürekli çıktı ölçüsüyle sınanır. Geçerli aralıklar
`ASSET_CLASS_POLICIES` ve context çıktısındadır; belge ikinci eşik kaynağı
olmaz. Kodek kalite seviyesi ölçülmüş sınıf profilinden gelir ve encode
baseline kilidine bağlıdır. Kalite düşürme insan dinleme kararına bağlıdır.

Kanal ve yerleşim beyanı mono/stereo görüntüyle doğrulanır. Loop dikişi,
transient/gövde dengesi, stereo mono uyumu ve teslim yönü ilgili sınıfa
uygulanır. Brief'in opt-in karakter sınırları tüm kanallarda ve tam süre
boyunca ölçülür; zıt fazlı stereo enerji ortalamayla gizlenmez.

Tık sayacı süreksizlik adayını işaretler; tek başına algısal kusur kararı
vermez. Transient basınç atağı aday olabilir. Otomatik QA dinleme beğenisini
kanıtlamaz. Canary kabulü, güncel görev sürümüne ve PCM kimliğine bağlı insan
beyanıyla kapanır. Yetenek matrisi yapı taşının mevcut olması ile mekanik
benchmark geçişini ve insanın kabul ettiği üretim yeteneğini ayırır.

## Arama ve aileler

Arama spec'i boyut alanlarını, stratejiyi ve bütçeyi açık tanımlar. Aday
kimliği ve sırası deterministiktir; ön denetim toplam maliyeti render
öncesinde sınar. Aday seçimi ile production job seçimi ayrı kayıttır.
Onaylı aday job'a terfi eder ve standart yayın kapısından geçer.

Opt-in semantic scorer harici argv sürecidir, kabuk çalıştırmaz. Skor
laboratuvar sıralamasına danışman olur; kalite kapısının yerine geçmez.
Referans uydurma deneyleri production provenance değildir.

`SoundFamilyProgramV1` aynı akustik tabandan adlı varyantlar üretir. Genel
rol ve durum eksenleri tüketicinin oyun kavramından ayrı tutulur. Varyant
alt akışı kimlik ve boyut adına bağlıdır; yeni varyant eklemek mevcut
varyantı yeniden rastgeleleştirmez. Roller boyutların açık alt aralıklarıdır.

Aile QA'sı çeşitlilik, yakın özdeşlik, aykırılık ve beyan edilmiş tını
kimliğini ölçer. Durum yönü iddiası diğer rolleri aynı tutan üye çiftlerinde
sınanır; sınanabilir çift yoksa iddia geçmez. Kaydırılabilir tını zarfı
sabit formant kimliği için fazla hoşgörülü olabilir; o alanda genel bir
algısal kimlik garantisi sayılmaz.

Aile üyeleri aynı tek yayın kapısından geçer; bank son adımda yazılır.
Kısmi başarısızlık bütünlüğü tamamlanmış gibi göstermez ve aynı protokolle
sürdürülebilir. Bank sıralı anahtarlar, roller, asset/manifest bağları ve
ölçüleri taşıyan çalışma zamanı JSON'udur; oyun üreticiyi import etmez.

## Müzik

Brief ve theme book ile niyet, palet ve ortak müzikal kimlik tanımlanır.
Program tek deterministik genişletmeyle score'a dönüşür. Tracker desenleri,
armoni, motif, groove ve orkestrasyon render öncesi sembolik yapıdır;
gerçek zamanlı MIDI veya DAW entegrasyonu değildir.

Enstrüman beyanı preset, sampler, davul kiti, retro ya da katmanlı kaynağı
belirtir. Artikülasyon ve velocity kaynak sözleşmesidir; preset çalma
adıyla karıştırılmaz. Sembolik analiz nota ve armoni iddialarını ses render
etmeden doğrular.

Referans mix ve stemler tek planı paylaşır. Başlangıç, loop, bitiş,
stinger ve geçişler bundle segmentidir. Stem hizası, dikiş ve cue/loop
örtüşmesindeki tepe birlikte sınanır. Mastering mix'in akustik referansını
korur; ayrı stem normalize etme dinamik ilişkiyi bozmaz.

`MusicBundleV1` CORE çalma sözleşmesini taşır. Ölçüden kareye dönüşüm üretim
ile çalışma zamanında aynı yüzeyden gelir. Opt-in teslim dosyası haritası
paket göreli OGG yollarını seçer; aynı hedefe iki dosya, geçersiz ad ve
traversal reddedilir. Opt-in ambience teslimi kendi sınıf politikasını
kullanır; music varsayılanı değişmez.

## Sample ve teslim varyantı

Sample beyanı dosya ve PCM kimliğine bağlıdır. Ses kaynağı render'dan önce
doğrulanır; fixture WAV'ları deterministik yeniden üretilebilir. Sample,
granular, germe ve konvolüsyon kaynağı kaynak bütçesine dahil olur.

`derive` yayımlanmış kaynak manifestinden yeni teslim işi üretir. Kaynak
program ve tohum korunur; kanal, kuyruk, zincir ve göreli seviye ayrı
`treatment` katmanıdır. İşleme kaynak master ve loop katlaması sonrasında
uygulanır. Loop'a sınırsız kuyruk eklenmez. Teslim profili kimliği ve
sürümü manifestte kaydedilir; mesafe yön iddiası gerçek çözülmüş dosyada
ölçülür. Kaynak program ile teslim profili elle kopyalanıp kökensiz asset
olarak gönderilmez.

## Kaynak bütçesi ve yineleme

Bellek ve iş sayımı ayrı bütçelerdir. Tahmin tampon ayırmadan ve programı
job'a kabul etmeden uygulanır; hatalar parametre adıyla bildirilir.
Sonlu olmayan değer, desteklenmeyen kombinasyon ve aşırı kaynak isteği
sessizce kelepçelenmez. Ölçüm araçları maliyet modelini kalibre eder;
performans kararı ölçümle desteklenir.

Taslak ve nihai kalite aynı program ve tohumla çalışır, iç aşırı örnekleme
oranları ayrıdır. Taslak kayıt kimliği ayrıdır ve yayımlanamaz. Üretim
seçimi ve arama kararı nihai kalite ister.

İçerik adresli önbellek renderer, kalite, tohum, kaynak, katman ve bağımlı
modülasyonları içerir. Yerinde işleyen düğümler önbellek tamponuna sahip
olmaz; okuma ve yazma kopyadır. Sample doğrulaması cache hit öncesinde
çalışır. Kod import kapanışının parmak izi değişince eski PCM okunmaz;
bozuk cache girdisi miss sayılır. Doğrulama önbelleği kullanmaz.

Paralel toplu işler seri yolla aynı saf görevi çalıştırır. Sonuç girdi
sırasına yerleşir, tamamlanma sırası kimliği değiştirmez. Worker sayısı
CPU ve bellek bütçesiyle sınırlanır; timeout ve worker hatası tamamlanmış
sonuç olarak sunulmaz.

## Kapsam ve kabul

Çalışma zamanında canlı sentez, gerçek zamanlı MIDI, beatmatching ve
DAW/VST entegrasyonu bu paketin üretim hattı değildir. Fiziksel model ve
QA gerçekçi foley ya da insan sesi beğenisini kendiliğinden garanti etmez.
Yeni yapı taşı davranışı testle, sürümle ve render yüzeyiyle korunur.

`pnpm exec just audio-verify` reçete tazeliğini, referans ölçüm çekirdeğini,
production provenance'ı, aktif gönderim sınıf politikasını ve izlenen asset
bütünlüğünü birlikte sınar. Koşulmayan kapı geçmiş sayılmaz; dinleme kararı
ayrı ve bekleyen durumuyla raporlanır.
