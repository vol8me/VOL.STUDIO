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

Linux çizim yolu ölçülmüş ortama göre seçilir. Tam ekranın gerçek durumu
pencere yöneticisinden okunur; yalnız önceki uygulama isteğine güvenilmez.
Gamescope oturumunda pencere yönetimi seçenekleri oturum yeteneklerine göre
sunulur. Çıkış niyeti uygulama düzeyinde sonlandırmaya dönüşür.

Platform kuralları [Linux](../docs/linux.md),
[Steam Deck](../docs/steam-deck.md) ve [Android](../docs/android.md)
belgelerinde; ortak davranış JS testleri ve Rust kapısıyla korunur.
