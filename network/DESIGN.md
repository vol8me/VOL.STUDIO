# Network tasarımı

Network, oyunlardan bağımsız multiplayer protokolü, istemci ve sunucu
zeminidir. [README](README.md) kullanım, [sunucu sözleşmesi](docs/server.md)
işletim/güvenlik, [sürücü](docs/drive.md) gerçek bot ölçümü sahibidir.
Bu belge framework seçiminin ve mimari sınırın gerekçesidir; eski aday,
ücret ve prototip karşılaştırmaları Git geçmişindedir.

## Model ve sahiplik

Colyseus 0.18 üzerinde sunucu otoriteli TypeScript simülasyonu seçilidir.
Oda, şema, savaş/üretim kuralları ve dünya geometrisi oyuna aittir. CORE
saf mekanizmaları verir; network ne oyun ne native kabuk import eder.
Paketler yalnız public exports haritasından tüketilir.

Mevcut TS/Phaser simülasyonunu paylaşmak, ayrı dilde ikinci oyun kuralı
uygulamasını önler. Colyseus bağlantı, oda, şema ve öngörü zemini sunar;
oyunun tick maliyetini, interest politikasını, kalıcılığını veya anti-cheat
sınırını kendiliğinden çözmez. Wire protokol sürümü monorepo sürümünden
ayrıdır; paket sürümünü değiştirmek protokol değişikliği değildir.

## Dağıtım ve otorite

Hedef Windows/Linux/Android native istemciler ve resmî sunucudur; oyuncunun
sunucu açması veya web ürünü dağıtımı mevcut hedef değildir. Chromium ve
WebKit, gönderilen JS ve WebView uyumunun teknik sınamalarıdır.

İstemci yalnız izin verilen niyeti yollar; yetkili durum sunucuda hesaplanır.
Origin/IP/katılım/oda, mesaj/girdi ve yavaş tüketici sınırları vardır.
İstemci uzlaştırma sayaçları beyan niteliğindedir; oyun otoritesi veya kimlik
doğrulaması değildir. Sunucu adımı ve soket baytları sunucuda ölçülür.
Hesap sağlayıcısı, internet WSS/sertifika/endpoint CSP, süreç keşfi, savaş
sisi ve gerçek paketli bağlantı matrisi kalan işlerdir; [TODO](../TODO.md)
bunları ayrı tutar. Yerel ağ sonucu internet üretim kabulü olmaz.

## Öngörü ve gerçek tüketici

Oyun ve betikli bot aynı PredictedPilot, geometri ve network PredictionStepper
adaptörünü tüketir. SDK tek saat sahibidir; uzun render aralığı sınırlı ara
tick'lere bölünür, her tick'in girdisi sonraki tick ve poz okumasından önce
tüketilir. Toplam iş sunucu tamponuna göre seçilir. Çok uzun duraklamada
sınırlı adım kaybı/taşma mümkündür; sınırsız yakalama veya ikinci saat kurulmaz.

Reconnect/iptal/geç olay ve kaynak temizliği bağlantı yaşamına bağlıdır.
Sonlu/monoton sayaç, sahiplik ve hız sınırları kaydı korur. Soketin gerçek
baytları, JSON boyutu ve ölçüm yokluğu ayrı verilir. HTTP metrics tek
uçuşta, timeout/abort ile kapanır; rapor istek bitmeden kapatılmaz.

## Kapasite ve işletim kararı

Oda başına oyuncu sayısı tek başına kapasite ölçüsü değildir. Aktif nesne,
değişen veri/patch boyutu, simülasyon p95/p99, olay döngüsü gecikmesi,
bant genişliği ve kalıcılık maliyeti birlikte ölçülür. Bir odanın tek
simülasyon döngüsü CPU darboğazını kendiliğinden dağıtamaz.

Gerçek SDK botları hareket/fren/dönüş/atışın yetkili sonucunu kanıtlar.
Profilsiz senaryo performans kabulü üretmez. Yerel tek makine, TCP stall
benzetimi ve sentetik yük; gerçek paket kaybı, uzak donanım veya sürekli
dünya kapasitesi değildir. Dünya sayısı ve barındırma bütçesi ölçümle seçilir;
eski fiyat tablosu bugünkü işletim kararı olarak tutulmaz.

Transport/framework ancak ölçülen darboğaz veya karşılanmayan ürün
sözleşmesi varsa değiştirilir. Şema/protokol ve kalıcılık adapter'ları dar
tutulur; mevcut çalışan altyapı varsayımsal kapasite için sıfırdan yazılmaz.

Resmî başvuru: [Colyseus belgeleri](https://docs.colyseus.io/).
Yayımlanmış destek/ücret bilgisi gerektiğinde güncel resmî kaynaktan doğrulanır.
