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
Native kurtarma sağlam geçici dosyayı güncel ada atomik taşır; yedekten
kurtarmada yedek korunarak güncel dosya kurulur. Bu yerleştirme tamamlanmadan
başarılı okuma dönmez. Böylece sonraki yazımın geçici dosyayı boşaltması
kurtarılmış jenerasyonu kaybetmez; bir sonraki yedek de o jenerasyondur.

Kapanış/uyku ACK'i `requestId`, `reason` ve gerçek `success`/`failed` sonucunu
taşır; süre native kabuğa aittir. Süre dolmadan kabul edilen ACK, bekleyen
iş parçacığı geç koşsa da `timedOut` olmaz. 1.500 ms kayıt süresi ve 2.000 ms
çıkış koruması cihazdaki tarihsel timeout'un kök nedeni bulundu demek değildir.

Steam SDK callback tutuşları session boyunca yaşar; kapanış önce pump'ı
durdurup birleştirir, sonra callback'leri ve istemciyi bırakır. Metin isteği
kimliği native sonucu JS owner'a bağlar. İptal sonucu bastırır; native popup'ın
terminal callback'i gelmeden busy sahipliği bırakılmaz. JS abort'u beklemeden
sonuçlanır, geç abonelikleri söker; yeni isteğe eski sonuç uygulanmaz.
Metin sağlayıcısı parola amacını IPC'de `password`, diğer amaçları `normal`
kipine çevirir. Native komut yalnız bu iki enum değerini kabul eder;
Steam klavyesi parola kipinde SDK maskesini kullanır. Stub aynı komut
tipini taşır; yerel klavye yedeği de parola amacını korur.

Linux çizim yolu ölçülmüş ortama göre seçilir. Tam ekranın gerçek durumu
pencere yöneticisinden okunur; yalnız önceki uygulama isteğine güvenilmez.
Gamescope oturumunda pencere yönetimi seçenekleri oturum yeteneklerine göre
sunulur. Çıkış niyeti uygulama düzeyinde sonlandırmaya dönüşür.

`DisplayModeController` native durum sorgusunu ve tercih uygulamasını aynı
kuyrukta tutar. Kapanış önce bu niyeti yerleştirir, sonra ayar snapshot'ını
yazar; destroy sonrası geç sorgu eski sahibin tercihini değiştirmez.
`reportDiagnostics` IPC ve native append/sync hatasını reddeder;
oyun hata sınırı reddi yakalar, ölçüm sahibi kaybı sayar. Kayıp veya eksik
pencere cihaz ölçümünde başarılı kabul üretmez; hata metni yerel dosya yolu taşımaz.

Platform kuralları [Linux](../docs/linux.md),
[Steam Deck](../docs/steam-deck.md) ve [Android](../docs/android.md)
belgelerinde; ortak davranış JS testleri ve Rust kapısıyla korunur.
