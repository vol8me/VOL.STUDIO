# VOL.TEST tasarımı

VOL.TEST, CORE, network ve native kabuğun gerçek oyun tüketicisidir. Amaç
paylaşılan mekanizmaları oyun akışında sınamak ve eksik genel yeteneği sahibine
kazandırmaktır. Oyun kuralı CORE'a taşınmaz; oyun içinde ikinci bir ortak UI,
saat, RNG, depolama veya ağ altyapısı kurulmaz. Başlangıç komutları
[README](README.md), ortak sınırlar [CORE tasarımındadır](../../core/DESIGN.md).

## Sahiplik ve klasörler

| Kaynak                  | Sorumluluk                                                    |
| ----------------------- | ------------------------------------------------------------- |
| `src/app/`              | Girdi, tercihler, native ömür, dünya sürücüsü ve laboratuvar  |
| `src/config/`           | Oynanış, araç, hava, ses, sunum ve ağ sayılarının tek kaynağı |
| `src/sim/`              | DOM/Phaser taşımayan dünya, fizik, savaş ve bot kuralları     |
| `src/view/`             | Modelden poz alan Phaser çizimi ve efektler                   |
| `src/scenes/`           | Sahne kurulumu ve model/sunum bileşimi                        |
| `src/hud/`, `src/menu/` | CORE UI tüketimi, menü ve oyun HUD'u                          |
| `server/`               | Yetkili oyun dünyasının network sunucu adaptörü               |
| `tests/`                | Kaynak ağacını yansıtan regresyonlar ve iki motorlu E2E       |
| `scripts/`              | Build, ölçüm ve gerçek SDK sürüş araçları                     |
| records (yerel)         | Git dışı yerel kanıtlar; ürün kaynağı değildir                |

Asset kaynağı üreticiye, gönderilen dosya oyuna aittir. Runtime yalnız paket
exports yüzeylerini tüketir; audio-synth ve pen.dev geliştirme bağımlılığıdır.
Oyun build'i bu araçları çalıştırmayı gerektirmez. Rig geometri/metadata
sözleşmesini CORE doğrular; `.pen` kaynağına erişim Pencil kurallarına tabidir.

## Model, saat ve yaşam döngüsü

`Simulation` oyun durumunun sahibidir. Çizim, ses ve HUD modelin sonucunu
sunar; kendi can, hasar, savaş veya kayıt defterini taşımaz. Çevrimdışı ve
sunuculu dünya aynı simülasyon ve araç kurallarını tüketir. Tohumlu RNG ve
sabit adım, render kare hızından ayrıdır; sayılar `src/config/` içindedir.

Çevrimdışı dünya CORE `SimulationClock` ile 60 Hz ilerler. Fizik kuvvetleri
iki alt adımda çözülür; önceki/güncel poz çizimde ara değerlenir. Sıfır süreli
adım oyun olayı üretmez. Çevrimdışı duraklatma dünya saatini dondurur;
çevrimiçi menü sunucuyu durdurmaz ve yalnız boş oyuncu girdisi yollar.

Her sahnenin listener, timer, abonelik ve native callback ömrü bellidir;
bağımsız kaynaklar `DisposableScope` altında kapanır. Yeniden başlatma ve
ekran geçişleri her zaman yeni veri nesnesi verir: Phaser'ın önceki sahne
verisini koruması eski çevrimiçi sürücüyü yeniden kurmamalıdır. Geç gelen
async sonuç kapanmış sahneyi veya daha yeni kullanıcı tercihini ezemez.

## Dünya, iklim ve araçlar

Dünya; göl, kaya, bitki, yüzey ve mevsim durumunu modelde tutar. Çizim bu
veriyi kullanır. Tutuş, hava direnci, birikim, erime, sıkışma ve batış kuralları
simülasyon/config sahibindedir; görsel parçacıklar fizik kararını değiştirmez.
Çevrimiçi iklim sunucudan gelir; istemci hava ve yeşillik sunumunu uygular,
yerel tercih yetkili dünyanın yüzey kuralını değiştirmez.

Araç aileleri paletli tanklar, Arachnid/Widow/Goliath yürüyücüleri,
Manta/Barracuda/Leviathan süzülenleri, Warhound/Templar/Juggernaut mech'leri ve
Jackal/Panther/Rhino sıçrayıcılarıdır. Ortak araç/şasi/komut yüzeyi farklı
hareket modellerini aynı savaş, hasar, bot ve ağ akışına bağlar. Araç başına
denge, ayak, gövde, silah, kalkan ve kuşatma sayıları config'ten okunur;
bu belgede ikinci bir denge tablosu tutulmaz.

Sürüş, fren, kayma, gövde/taret dönüşü, süspansiyon ve geri tepme ayrı
sorumluluklardır. Bacaklılarda model ayak teması ile rig pozu ayrılır;
süzülenlerde görsel salınım yetkili konumu değiştirmez. Sıçrama/iniş, göl/buz
ve parça hasarı aynı model olaylarına bağlanır. Görsel oran veya sürüş hissi
için insan değerlendirmesi sayısal regresyonun yerine geçmez.

## Çarpışma, ateş ve savaş

Mermi adımı segment boyunca ilk teması çözer. Tank OBB'si, duvar ve dünya
sınırı aynı segment parametresini kullanır; önce aday bulup sonra kaynaklara
göre ayrı uzaklık sıralaması yapılmaz. Gövde çarpışması SAT ve ayrıştırma
kurallarıyla çözülür. Efekt havuzları çizim kaynaklarını sınırlar; görsel efekt
silinmesi merminin hasar sonucunu değiştirmez.

Can, parça hasarı, ölüm/enkaz, doğma ve koruma simülasyon durumudur. Oyuncu ve
bot araçları cephe taşır; aynı cepheden ve kendine hasar engellenir. `War`
bölgeler, cepheler, nüfus ve kazanma kuralını taşır; Colyseus odası bu kuralın
ikinci uygulaması değildir. Savaş kazanılınca skor ve bölgeler sıfırlanır,
bağlı oyuncular dünyada kalır. Bot niyeti insanla aynı komut yoluna girer.

## Ekranlar, girdi ve ayarlar

Ana menü, garaj, senaryo seçimi, ayarlar ve pause ekranı CORE bileşenlerini
kullanır. Görünen metinler TR/EN i18n anahtarıdır; dil ve tema değişimi canlı
uygulanır. Geliştirici HUD'u simülasyonun okunabilir sunumudur. Menü arka
planı ve araç alayı oyunun config/sunum katmanında yaşar.

Odak gezinmesi, modal LIFO sırası ve geri eyleminin tek sahibi vardır.
Dünyada B fren, Escape/Start menü eylemidir; Steam Input action set'i bu
bağlamı izler. Açık üst katman girdiyi alır, alttaki dünya veya ikinci modal
aynı niyeti tekrar işlemez. İşaretçi/kol geçişi, dokunma alanı, kamera ve
HUD; [UI sözleşmesine](../../docs/ui/CONTRACT.md) tabidir.

İlerleme `synced`, cihaz tercihi `device` kapsamındadır. Depolama adapter
arkasındadır; son kayıt, kapanış hatası ve native flush sonucu gizlenmez.
Ölçüm oturumunda senaryo/tohum/kalite seçimi kalıcı tercihten önce gelir;
ses veya titreşim ayarı ölçüm koşullarını değiştirmez ve bu seçim kayda yazılmaz.

Ses üretimi audio-synth, çalma CORE sahibindedir. Oyun olayları ses niyetini
tek kez üretir; ayar değişimi ve sahne kapanışı eski ses/haptik kaynağı
bırakmaz. Yayın kabulü [audio teknik sözleşmesidir](../../devtools/audio-synth/DESIGN.md);
dinleme değerlendirmesi ayrı geri bildirimdir.

## Çok oyunculu

[Network tasarımı](../../network/DESIGN.md) taşıma, protokol ve genel
mekanizmaları; VOL.TEST dünya kuralını sahiplenir. Sunucu yalnız `TankInput`
niyetini kabul eder; poz, hasar, skor, bölge ve ateş sonucu yetkilidir.
Katılımda araç/cephe/protokol doğrulanır. Birincil dünya süreç içi yetkiyle
kurulur; ağdan gelen JSON aynı yetkiyi üretemez. Dolu dünyadan sonra taşma
odası açılır; `maxRooms` toplam oda güvenlik sınırıdır, ölçülmüş kapasite değildir.

`OnlineDriver` ve betikli sürücü aynı `PredictedPilot` ve network
`PredictionStepper` mekanizmasını tüketir. SDK saatinin önüne ikinci bir
biriktirici konmaz. Uzun kare sınırlı SDK dilimlerine ayrılır; her dilimin
girdisi hemen gönderilir, toplam iş girdi tamponunu aşmaz. Çok uzun kesintide
eski süre/girdi bırakılabilir; sınırlı iş, sınırsız yetişme garantisi değildir.
Poz bütün dilimlerden sonra okunur; kapanış veya callback hatası üretimi durdurur.

Yerel araç aynı simülasyonla öngörülür ve yetkili snapshot sonrası bekleyen
girdiler yeniden oynatılır. Uzak araçlar yama zamanları arasında gecikmeli
çizilir; olaylar görüntü zamanına ertelenir. Yerel atışın sunucu yankısı
ikinci görsel atış üretmez. Gecikme telafisi yoktur: isabet sunucunun o
adımdaki dünyasına göredir. İlgi alanı süzmesi ve savaş sisi henüz yoktur.

Bilerek ayrılma hemen tamamlanır; geçici kopma config'teki süre boyunca aynı
oturuma dönüşü dener. İlk başarılı katılımdan itibaren yeniden deneme açıktır.
Kopuk oyuncunun eski girdisi tutulmaz; dönüşte tampon ve yavaş tüketici
zamanları sıfırlanır, iklim yeniden istenir. Süre aşımında çevrimdışı dünyaya
bildirimle dönülür. Ölüm/doğma ve art arda kopuş aynı aracı iki kez kaydetmez;
sunucu kapanışı bekleyen yeniden bağlanmadan işlenmemiş ret sızdırmaz.

Girdi/olay paketleri tür, sayı ve boyut sınırından geçer. Kuyruk sınırını
tolerans süresince aşan yavaş tüketici atılır. Başlangıçta birincil dünya veya
ops portu açılamazsa sunucu geri kapanır. Ortam değişkenleri, origin/IP/soket
sınırları ve yerel `/healthz`, `/metrics`, `/logs` uçları
[sunucu belgesinin](../../network/docs/server.md) sahibindedir.

Gerçek soket baytları ve oda adım süreleri sunucuda ölçülür. Uzlaştırma/replay
sayaçları gerçek SDK callback'lerinden gelir; istemci beyanı sunucuda şema,
monotonluk ve hız denetiminden geçer, `client-reported` ve yaş bilgisiyle
sunulur. Düzeltme büyüklüğü sayısal poz alanlarının en büyük mutlak farkıdır;
Öklid mesafesi değildir. Eksik ölçüm sıfır başarı olarak yazılmaz.

Bozuk ağ E2E'si gerçek sunucunun önündeki TCP vekiliyle gecikme, titreşim ve
parça bekletmeyi sınar. TCP bekletme gerçek paket kaybı değildir. Profiller ve
bütçeler `quality.json` içindedir. Loopback sonucu internet, paketli uygulama,
cihazlar arası determinizm veya tam oda kapasitesi kabulüne taşınmaz. Auth,
internet WSS/CSP, keşif ve cihaz matrisi kalan işleri [kök TODO](../../TODO.md)
içinde izlenir.

### Ajan laboratuvarı

`?lab=1` ile açılan `window.volLab`, insan girdisiyle aynı `PlayerControls`
yolunu kullanır. Bayrak yoksa kurulmaz. CORE `RingBuffer` ile sınırlı
telemetri/olay halkalarının boyutları `src/config/lab.ts` içindedir. Dışarı
verilen kayıt kopyadır; geri akan/geçersiz saat atlanır ve olay verisi zaman
ve türü ezemez. Kapanınca girdi bırakılır, saklanmış API işlem yapamaz.

Çağrı `volLab.run('state')` biçimindedir; aşağıdaki adlar komut kimlikleridir.
Tablo `tests/app/AgentLab.test.ts` ile gerçek kayıtla eşitlenir.

| Komut              | Ne yapar                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `volLab.help`      | Komut adlarını ve açıklamalarını verir.                                        |
| `volLab.state`     | Oyuncu, dünya, senaryo ve tohum özetini verir.                                 |
| `volLab.telemetry` | Son durum örneklerini eskiden yeniye verir (`count`).                          |
| `volLab.events`    | Son olay ve işaretleri eskiden yeniye verir (`count`).                         |
| `volLab.input`     | `moveX/moveY/aimX/aimY` [-1,1] ve `fire/boost/brake` girdisini geçersiz kılar. |
| `volLab.teleport`  | `x/y` ve isteğe bağlı radyan `hull`; çevrimiçi oturumda reddedilir.            |
| `volLab.release`   | Girdi geçersiz kılmayı bırakır.                                                |
| `volLab.mark`      | `label` ile zamanlı işaret ekler.                                              |
| `volLab.jsonl`     | Telemetri ve olayları zamana göre sıralı JSONL verir.                          |

Sunucu sürüşü `scripts/drive.ts` üzerinden gerçek SDK ile boşta bekleme,
sürüş/fren/dönüş ve nişan/ateş senaryolarını koşar. `--profile` her senaryoya
ayrı bütçe uygular; ops ölçümü eksikse tam kabul üretmez. Komutlar ve
kimlik taşımayan kayıt biçimi [sürücü belgesindedir](../../network/docs/drive.md).

## Doğrulama ve sınırlar

`tests/sim/feel.test.ts` sürüş, fren, kayma, dönüş, taret, geri tepme ve sekmenin
sayısal zarfını korur. Tohumlu testler sonlu sayı, dünya sınırı ve fizik
sınırlarını; kare hızı testleri sabit adım sonucunu; hava testleri takvim,
birikim/erime ve model/sunum ayrımını sınar. Zarf değişimi tasarım kararıdır.

E2E build'i Chromium/WebKit'te açar: menü, garaj, ayarlar, dil, dar ekran,
senaryo, pause, hava ve temiz konsol; gerçek sunucuyla çok oyunculu dünya,
cephe, bot, uzlaştırma, ateş, ölüm/doğuş, ayrılma ve ulaşılamayan sunucu
sınanır. Ölüm gibi kurulumlar yetkili test dünyasında tetiklenir.

Kapsam, bundle ve ölçekleme eşikleri kök `quality.json` sahibindedir.
[Kapı sözleşmesine](../../docs/gates.md) göre E2E `signoff` içindedir;
`high` E2E koşmaz. Sanal girdi fiziksel kol değildir; headless ölçüm native
pencere/ses/haptik veya gerçek cihaz performansını kanıtlamaz. Ölçülmeyen
platform kabulü NOT-RUN kalır ve açık işinden silinerek tamamlanmış sayılmaz.
