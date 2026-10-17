# Güncel monorepo denetimi

Bu belge güncel monoreponun mimari sınırlarını ve kalan risklerini tutar.
Açık işler [TODO](../TODO.md), çalışma kuralları [AGENTS](../AGENTS.md),
kapı bileşimi [gates](gates.md) sahibindedir. Eski kusur listeleri, oturum
anlatıları ve ölçüm dökümleri Git geçmişindedir; burada tekrar edilmez.

## Mimari ve taksonomi

| Katman       | Sorumluluk                                        | Ayrıntı                                     |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| CORE         | Oyundan bağımsız mekanizma, sunum ve opt-in tarif | [Tasarım](../core/DESIGN.md)                |
| Network      | Sürümlü protokol, istemci ve sunucu zemini        | [Tasarım](../network/DESIGN.md)             |
| Native kabuk | Platform adaptörleri ve eklentiler                | [Tasarım](../tauri-v2/DESIGN.md)            |
| Devtools     | Asset üretimi, katalog ve ölçüm                   | [Repo haritası](../AGENTS.md#repo-haritası) |
| VOL.TEST     | CORE/network/kabuğun gerçek tüketicisi            | [Tasarım](../games/vol-test/DESIGN.md)      |

CORE oyun, network ve devtool import etmez. Network oyun/native kabuk
import etmez. Oyun runtime'ı devtool tüketmez; paket sınırı exports
haritasıdır. Tüketicisiz UI, testi ve vitrin örneği bulunan bilinçli katalogdur.
Asset kaynağı yazara, ara çıktı üreticiye, gönderilen dosya tüketiciye aittir.

Kaynak ve test ağaçları aynı modül sınırını izler. Eski toplu test dosyaları
büyütülmez. Geçici araç çıktısı ilgili paketin git dışı records/export alanındadır;
audio-synth `records` altındaki kanonik program/protokol girdileri ise üretim
kaynağıdır ve yeniden yayın doğrulamasında kullanılır. Çıktı, kişisel IDE ayarı
veya bağımlılık önbelleği yeni kaynak paketi değildir.
Pencil kaynağı yalnız [Pencil sözleşmesine](../devtools/pen.dev/AGENTS.md) göre okunur.

## Sürüm ve teslim

Kök package sürümü monorepo sürümüdür. Aktif JS paketleri aynı sürümü taşır;
Rust crate'leri workspace sürümünü, Tauri uygulamaları kök package dosyasını
tüketir. [Sürüm bekçisi](../scripts/quality/releaseVersion.mjs) sapmayı contract'ta
reddeder; yeni oyun üreticisi de bu sürümden başlar. Frozen ağaç değiştirilmez.

İş feature/bugfix dalında yürür. Sürüm dalı `dev`e, doğrulanmış `dev` de
`main`e `--no-ff` ile birleştirilir; iki ebeveyn geçmişi korunur. Annotated
sürüm etiketi kaynak commit'ini, koşulan kapıları ve kapsam sınırlarını belirtir.
Kanca atlanmaz. Yapılmayan native kabul, sürüm numarasıyla tamamlanmış olmaz.

## CORE ve kaynak ömrü

CORE kaynak/betiklerinde sıkı indeks denetimi açıktır; seyrek hücre ile dolu
`undefined` ayrılır. Sayısal sıcak tampon erişimi invariantı korur; sıkı tür
kontrolü performans ölçümünün yerine geçmez. Simülasyon saati, RNG ve audio
çıktısı deterministiktir. Yeni genel mekanizma CORE'da, oyun kuralı oyunda kalır.

Yapılandırma alanları prototip/getter üzerinden de gelebilir. Doğrulanan
alanlar bir kez okunup saklanır; spread ile kaybolmaz veya ikinci okumada
başka değere dönüşmez. Saat/adımlama, rig ve listener regresyonları bu sınırı
korur. Sonlu olmayan rig geometrisi/ayarları pozu zehirlemeden reddedilir.

Listener, timer ve abonelik sahibi bellidir; birden çok bağımsız kaynak
DisposableScope ile kapanır. Kapanış yeniden girişe dayanır; geç async sonuç
eski sahneyi, odağı, kullanıcı tercihini veya yeni isteğin kilidini değiştirmez.
UI malzeme/hareket/tek niyet ve durum kanıtının sahibi [UI sözleşmesidir](ui/CONTRACT.md).

## Kalıcılık ve yaşam döngüsü

İlerleme `synced`, cihaz tercihi `device` kapsamındadır. Yazma adapter arkasında,
atomik ve sıra/generation sahipliğiyle yapılır. Son başarısız flush görünürdür;
geç success önceki veri kaybını örtemez. Bozuk kayıt, yedek ve kurtarma ayrı
sonuçlardır; kullanıcı verisi sessizce sıfırlanmaz.

Native tanı sürümü/damgası native taraftan gelir. UUID, sıra, monoton saat,
kayıp kayıt ve native sonuç doğrulanır. `failed`, `timedOut` veya bilinmeyen
son flush ölçümün complete kabulünü düşürür. Linux runtime sınıfı sürecin
kendi os-release bilgisidir; launcher yolu konteynerde koşulduğunu kanıtlamaz.

## Network ve ölçüm sınırı

Sunucu otoriterdir; istemci beyanı otorite olmaz. Şema, oyun simülasyonu ve
oda oyuna; bağlantı, protokol, sınır ve gözlem network paketine aittir.
Gerçek SDK botları oyunun aynı PredictedPilot ve PredictionStepper'ını kullanır.
Hareket/fren/dönüş/atış sonucu sınanır; yalnız girdi göndermek başarı değildir.

SDK tek simülasyon saati sahibidir. Uzun kare sınırlı ara tick'lere bölünür,
her dilimin girdileri sonraki tick'ten önce tüketilir. Çok uzun duraklamada
sınırlı adım kaybı sürer; kare başına girdi tavanı, ağda birleşme ve önceki
tampon doluluğunda sıfır taşma garantisi değildir. İkinci saat veya sınırsız
catch-up yoktur. Gerçek paket kaybı ve üretim WSS/auth kalan işleri TODO'dadır.

Metrics sayaçları sahiplik/hız/monotonlukta doğrulanır. Gerçek soket baytları
JSON boyutundan ayrıdır; ölçüm yoksa açıkça belirtilir. MetricsPoller tek uçuş,
timeout/abort ve sınırlı bellek kullanır; istek bitmeden JSONL kapatılmaz.
TCP stall benzetimi gerçek paket kaybı, yerel bot sonucu üretim kapasitesi değildir.

## Audio teknik kabul

Yayın kabulü güncel program/PCM/manifest, deterministik yeniden render,
codec sonrası teknik QA ve gönderilen dosyanın doğrulamasıdır.
[Audio tasarımı](../devtools/audio-synth/DESIGN.md) tek sahibidir.
Dinleme ve görsel beğeni isteğe bağlı feedback'tir; teknik kapı yerine geçmez.
Runtime decode/cihaz hoparlörü sonucu yalnız ölçüldüğü hedef için geçerlidir.

## Windows

Araç, MSVC, native süreç ve paket üretim sözleşmesi [Windows rehberindedir](windows.md).
Derlenen NSIS paketi görünür kurulum/açılış, WebView2, DPI 125/150/200,
clipboard, fiziksel kol veya uyku/uyanma kabulü değildir. F09.1, UI-12.4 ve
UI-13.2'nin ölçülmeyen bölümleri açık kalır; PC kullanımının durdurulması
bu kabulleri otomatik PASS yapmaz.

## Diğer platformlar

[Linux](linux.md), [Steam Deck](steam-deck.md) ve [Android](android.md)
ölçümlerinin her biri kendi kaynak/paket/runtime'ına bağlıdır. Önceki kaynağın
host/SLR4 veya Lenovo sonucu 0.2.0 paketinin yeni cihaz kabulü diye taşınmaz.
Samsung, fiziksel giriş, Steam olayları ve paketli ağ kabulünün kalanı TODO'dadır.
Monorepo kaynak sürümü, bütün platform dağıtımlarının kabul edildiği iddiası değildir.

## Kanıt ve kalan risk

Kapı sonucunun kaynak bağı, komut/çıkış kodu, PASS/FAIL/NOT-RUN ve mevcut
SKIP sayıları birlikte tutulur. `high` E2E içermez; tam `signoff` taze koşar.
Sürümün kapı kaydı annotated etiket ve yerel makine-okunur rapordadır.
Çalışma sırasında değişen ağaç kabul edilmez; eski makbuz değişmiş girdiyi örtemez.

p95 güven üst sınırı ve A/A gürültü payı raporlanır; farklı kapsamların
p95'leri toplanmaz. Başsız DOM commit yanıtı fiziksel ekrana sunum değildir.
CPU/GPU/sunum atfı desteklenmiyorsa unsupported/NOT-RUN kalır; sıfır yazılmaz.
Güvenlik kapısı yalnız kanıtlı [risk kaydını](../scripts/quality/securityPolicy.json)
kabul eder; yeni advisory, bayat muafiyet ve kapsam/eşik düşüşü sessiz geçmez.
