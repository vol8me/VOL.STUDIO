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
Native store kaydı UTF-8 baytlarıyla en çok 1 MiB'dir; yazım JSON
ayrıştırmasından önce sınırlanır, disk okuması yalnız bir ek bayt alır.
Boyut aşımı bozuk kayıt değildir: hata döner, eski jenerasyona düşmez ve
dosyaları karantinaya taşımaz. Bu tavan mevcut oyunun küçük ayar ve ilerleme
kayıtlarına geniş pay bırakır; daha büyük kayıt ayrı bir depolama sözleşmesi
ister. Ad kilitleri yalnız etkin işler boyunca yaşar; aynı adın eşzamanlı
okuma/yazmaları sırada kalırken bitmiş adlar registry'de birikmez.
Native kurtarma sağlam geçici dosyayı güncel ada atomik taşır; yedekten
kurtarmada yedek korunarak güncel dosya kurulur. Bu yerleştirme tamamlanmadan
başarılı okuma dönmez. Böylece sonraki yazımın geçici dosyayı boşaltması
kurtarılmış jenerasyonu kaybetmez; bir sonraki yedek de o jenerasyondur.
Yeni native yazım da güncel kayıt yoksa veya bozuksa aynı kurtarmayı önce
uygular; ilk yazıdan önce okuma yapılmamış olsa bile sağlam geçici jenerasyon
yeni kaydın yedeği olarak korunur.

Kapanış/uyku ACK'i `requestId`, `reason` ve gerçek `success`/`failed` sonucunu
taşır; süre native kabuğa aittir. Süre dolmadan kabul edilen ACK, bekleyen
iş parçacığı geç koşsa da `timedOut` olmaz. 1.500 ms kayıt süresi ve 2.000 ms
çıkış koruması cihazdaki tarihsel timeout'un kök nedeni bulundu demek değildir.

Steam SDK callback tutuşları session boyunca yaşar; kapanış önce pump'ı
durdurup birleştirir, sonra callback'leri ve istemciyi bırakır. Metin isteği
kimliği native sonucu JS owner'a bağlar. İptal sonucu bastırır; native popup'ın
terminal callback'i gelmeden busy sahipliği bırakılmaz. JS abort'u beklemeden
sonuçlanır, geç abonelikleri söker; yeni isteğe eski sonuç uygulanmaz.
Steam Cloud kayıtları okuma ve yazmada 1 MiB ile sınırlıdır; native okuma
SDK boyutunu önceden denetler ve yalnız bir ek bayt alır. Tek senkron
`FileRead`, sarmalayıcının süresiz async tamamlanma spin'ini kullanmaz;
başarısız, kısa veya boyut sorgusundan sonra değişmiş kayıt IPC'ye çıkmaz.
Eksik dosya `null`, sağlam boş dosya boş base64 döner.
Base64 girdisinin üst sınırı ayrıştırmadan önce denetlenir.
Bulut yazımı tek `FileWrite` çağrısının gerçek SDK bool sonucunu taşır;
stream sarmalayıcısının Drop sırasında yuttuğu Close sonucu başarı sayılmaz.
Bu onay yerel Steam SDK teslimidir; uzak bulut eşzamanlama ve fiziksel
cihaz kabulünün yerine geçmez. `inputReady` gerçek `Steam Input::Init`
sonucudur; init reddinde manifesto uygulanmaz ve Input komutları açık hata
döner. Steam Utils metin girişi ve Cloud aynı istemcide bağımsız kalır.
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
Eşzamanlı `start()` çağrıları aynı kurulumun tamamlanmasını bekler. Kendi
tam ekran isteğinin gecikmiş native/DOM olayı daha yeni tercihi geri alamaz.
Dış pencere değişiminden doğan tercih yazımları da `flush()` kapsamındadır;
reddedilen yazım kapanışa hata olarak ulaşır, sonraki başarılı yazım hatayı
temizler. Pencere ve tercih abonelikleri ile F11 dinleyicisi tek
`DisposableScope` altında kapanır; bir temizleme hatası diğerlerini sızdırmaz.
`reportDiagnostics` IPC ve native append/sync hatasını reddeder;
oyun hata sınırı reddi yakalar, ölçüm sahibi kaybı sayar. Kayıp veya eksik
pencere cihaz ölçümünde başarılı kabul üretmez; hata metni yerel dosya yolu taşımaz.
Diagnostics IPC tek JSON nesnesi kabul eder ve giriş ile normalize edilmiş
kaydı 64 KiB ile sınırlar. Native sınır `src` alanını `js` yapar; çok satırlı
girdi ayrı JSONL gözlemleri üretemez ve ön yüz Rust gözlemi taklit edemez.
Ürün ve yeni oyun capability'leri JS `emit`/`emit_to` çağrılarını açıkça
reddeder; native kabuğun `app.emit` olayları ve ön yüzün dinleme yetkisi
korunur. Rust kayıt zarfının sürüm, kaynak, tür ve saatleri payload'dan
değiştirilemez; ek alanlar yalnız kapanış kimliği/nedeni/sinyali/sonucu ve
uyku süresi için kayıt türünün izin listesine göre taşınır.

Platform kuralları [Linux](../docs/linux.md),
[Steam Deck](../docs/steam-deck.md) ve [Android](../docs/android.md)
belgelerinde; ortak davranış JS testleri ve Rust kapısıyla korunur.
