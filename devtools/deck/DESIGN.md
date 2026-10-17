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
Süreli yük fazları kare aralıklarını yalnız kendi ölçüm penceresinde toplar;
sondaki süresiz etkileşim fazı kare örneği biriktirmez.
Sondanın kare özeti `@volstudio/core/time` dışa açık yüzeyinden tüketilir.
İzlenen ESM girdisi, yardımcı bağımlılıklarıyla `web/` altında tek tarayıcı modülüne
paketlenir. Çıktı web/vendor/frame-summary.js yolunda derlemede üretilir ve Git'te
izlenmez; tek TypeScript dosyasını çevirmek bağımlılıkları çözmez.

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
tanıyamadıysa `unknown` yazılır. Eski ortam dökümünde `host`, runtime
değişkeninin açık yokluğu ile bildirilir; paylaşılmış kaydın yeniden
temizlenmesi bu sınıfları kaybetmez. Güncel native ortam ayrıca
`VOL_DIAGNOSTICS_RUNTIME` sınıfını üretir: Linux'ta sürecin kendi
`/etc/os-release` dosyasındaki `ID=steamrt` ve `VERSION_ID=3/4` SLR ailesini
kanıtlar; farklı geçerli ID host, okunamayan/çelişen bilgi unknown'dır.
Bu sınıf başlatıcı ortamındaki runtime yoluna üstün gelir; yolun verilmesi
konteynerin gerçekten girildiğini kanıtlamaz. Sürüm/derleme numarası ölçülmediyse
aile etiketi onu varmış gibi taşımaz.
Mevcut fakat geçersiz native sınıf `unknown` olarak korunur; tekrar temizleme
başlatıcı ortamını onun yerine yetkili kılamaz.
Bilinmeyen alanlar, prototype adları dahil, izinli kayıt alanlarını
düşürmeden çıkarılır. Sinyal ve uyku aralığı kanıtı yalnız `src: rust`
kayıtlarından türetilir; JavaScript bildirimi native kabul üretmez.
`nativeExits` yalnız Rust'ın `exit-after-grace` sonuçlarını taşır. Başarısız,
zaman aşımına uğramış veya eksik/tanınmayan sonucu olan kapanış `complete: false`
üretir; sonradan gelen başarı bu kaybı örtemez. Boş liste native kapanışın
gözlenmediğini söyler; faz kayıtlarının tam olması kapanışın doğrulandığı anlamına gelmez.

JS teslim sınırı `v: 1` ve Unix milisaniyesi `stamp` alanlarını kendisi
yazar; gönderen bunları değiştiremez. Oyun pencereleri UUID biçimli,
ölçüm ömrüne ait `runId` taşır. Okuyucu oturum başına 1'den başlayan
kesintisiz pencere sırasını ve geriye gitmeyen teslim damgasını doğrular.
Tekrarlı pencere, bilinmeyen sürüm, eksik/geçersiz damga, bozuk JSON ve
ayıklamada kaybolan satır `complete: false` üretir; son geçerli satır
önceki kaybı örtemez. Eski damgasız oyun kaydı tam kabul değildir.
Ayıklayıcı bozuk/adsız satırı kişisel içeriği taşımayan `report-loss`
işaretine çevirir. Böylece JSONL tek başına yeniden okunduğunda da kayıp
silinmez. UUID yazımı küçük harfe normalleştirilir; harf farkı aynı
oturumu ikiye bölüp tekrar eden pencereyi gizleyemez.
Beklenen dış kayıt sayısı gerçek satır sayısından düşük veya geçersizse kabul
reddedilir; kayıp işaretçisinin varlığı sayısal alanından bağımsız olarak eksiktir.

Testler protokolü ve ölçüm hesaplarını doğrular. Gerçek cihazda elle
ölçüm yapılmadıysa bu adım tamamlanmış sayılmaz.
