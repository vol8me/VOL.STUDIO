# Deck ölçüm tasarımı

Sonda, gerçek cihaz koşullarını ölçen ayrı bir Tauri uygulamasıdır. Sonda
sonucu ile gönderilen oyunun sonucu ayrı kayıtlardır; oyun kabulü gerçek
ürünün paketiyle doğrulanır. Cihaz ölçümleri kalite kapısı yerine geçmez,
sonraki ölçümün karşılaştırılacağı referansı sağlar.

## Ölçüm sözleşmesi

Web sonda ile native kabuk aynı ölçüm protokolünü taşır. Ortam bilgisi,
yük ve zaman penceresi sonuçla birlikte okunur. Kısa ya da eksik pencere
tam ölçüm gibi raporlanmaz. Kullanılan çizim yolu ve oturum sonucu
etkileyebileceğinden kıyas aynı koşullar üzerinden yapılır.

Devkit otomasyonu cihaz üzerinde geçici dosya ve kısayol bırakabilir;
çalışma sonunda bunların durumu bildirilir. Kimlik, adres, oturum bilgisi ve
ayıklanmamış ham çıktı repo belgesine ya da loguna girmez. Kalıcı teknik
karar [Steam Deck rehberine](../../docs/steam-deck.md), ham ölçüm yerel
records/ dizinine aittir.

Paylaşılan rapor kapanışın `reason` (`close`, `signal`, `suspend`) ve
`outcome` (`success`, `failed`, `timedOut`) sınıflarını korur. İstek kimliği
taşınmaz; `hasRequestId` yalnız tanınan kapanış/uyku protokol kimliğinin
varlığını bildirir. Serbest hata metni `hasError` olur; normal kapanış
nedeni hata sayılmaz. Runtime ölçümü yoksa veya temizleyici ham runtime'ı
tanıyamadıysa `unknown` yazılır. `host`, yalnız tam ortam dökümünde runtime
değişkeninin açık yokluğu ile bildirilir; paylaşılmış kaydın yeniden
temizlenmesi bu sınıfları kaybetmez.

Testler protokolü ve ölçüm hesaplarını doğrular. Gerçek cihazda elle
ölçüm yapılmadıysa bu adım tamamlanmış sayılmaz.
