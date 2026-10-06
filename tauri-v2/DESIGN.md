# Paylaşılan kabuk tasarımı

Rust kütüphanesi ortak eklenti kurulumunu ve platform davranışını taşır.
`tauri::generate_context!()` tüketici uygulamanın crate'inde çalışır;
kabuk kendi bağlamını üretirse ürün kimliği ve gömülü assetler yanlış
uygulamadan gelir. Ortak giriş `run_with_context`, uygulamaya özel eklenti
kurulumu için `run_with_context_and` yüzeyidir.

## Ürün sınırı

Her uygulamanın kimliği, izinleri, native projesi ve ikonları ürünündür.
JS eklenti bağımlılığı, Rust kaydı ve uygulama izni birlikte doğrulanır.
Native kaynak taşıyan eklenti yalnız onu kullanan uygulamada kaydedilir.
Rust tek workspace ve tek kilit kullanır.

## Platform adaptörleri

JS adaptörleri CORE sözleşmelerini uygular. Web tüketicisi native API'ye
mecbur bırakılmaz. Kabuk türü, oturum türü, dokunma gereksinimi, titreşim
sürücüsü ve geri hareketi ayrı yüklemlerle seçilir. Sistem askıya alınırken
kalıcılık boşaltılır; aboneliklerin kaldırılması tüketicinin yaşam döngüsüne
bağlanır. Atomik yazıcı depolamanın native karşılığıdır.

`migrateScopedStores` eski oyun dosyasını koruyarak mevcut hedefleri ezmeden
iki kapsama taşır. Native ayrı dosyadaki kapsamlı anahtar kendi kapsamını
korur; tarayıcı göçü yalnız oyunun önekini okur. Oyun göçü state yüklemeden
bekler. Adapter önbelleği yalnız başarılı native yazımdan sonra ilerler;
reddedilen yazım aynı adapter ile yeniden denenebilir.

Kapanış/uyku ACK'i `requestId`, `reason` ve gerçek `success`/`failed` sonucunu
taşır; süre native kabuğa aittir. Süre dolmadan kabul edilen ACK, bekleyen
iş parçacığı geç koşsa da `timedOut` olmaz. 1.500 ms kayıt süresi ve 2.000 ms
çıkış koruması cihazdaki tarihsel timeout'un kök nedeni bulundu demek değildir.

Steam SDK callback tutuşları session boyunca yaşar; kapanış önce pump'ı
durdurup birleştirir, sonra callback'leri ve istemciyi bırakır. Metin isteği
kimliği native sonucu JS owner'a bağlar. İptal sonucu bastırır; native popup'ın
terminal callback'i gelmeden busy sahipliği bırakılmaz. JS abort'u beklemeden
sonuçlanır, geç abonelikleri söker; yeni isteğe eski sonuç uygulanmaz.

Linux çizim yolu ölçülmüş ortama göre seçilir. Tam ekranın gerçek durumu
pencere yöneticisinden okunur; yalnız önceki uygulama isteğine güvenilmez.
Gamescope oturumunda pencere yönetimi seçenekleri oturum yeteneklerine göre
sunulur. Çıkış niyeti uygulama düzeyinde sonlandırmaya dönüşür.

Platform kuralları [Linux](../docs/linux.md),
[Steam Deck](../docs/steam-deck.md) ve [Android](../docs/android.md)
belgelerinde; ortak davranış JS testleri ve Rust kapısıyla korunur.
