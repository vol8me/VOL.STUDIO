# UI vitrini tasarımı

Vitrin CORE DOM UI kataloğunun tüketicisidir. Bileşen uygulaması CORE'da,
örnek düzen ve etkileşimler bu pakettedir. Phaser ya da Tauri döngüsü
gerekmez. Bir üründe tüketicisi olmayan CORE bileşeni vitrinde görünür ve
kendi adıyla CORE testinde sınanır.

## Görsel sözleşme

E2E gönderilen build'i sınar: Chromium okunabilirlik dışındaki testleri,
WebKit yalnız okunabilirlik dosyasını çalıştırır. Yerleşim testi
taşma, ezilme ve dokunma hedefini; görsel test piksel temelini denetler.
Deterministik çizim testi saatin ve rastgeleliğin sonuçta etkili olmadığını
ayrı doğrular. Piksel temeli yalnız bilinçli görsel değişiklikte yenilenir;
beklenmeyen fark temel güncellemesiyle kapatılmaz.

## Girdi ve erişilebilirlik

Örnekler klavye, gamepad ve dokunma etkileşimini göstermek için yeterli
kalır; oyun kuralı taşımaz. Dokunma hedefi `pointer: coarse` altında gerçek
kutu ölçüsüyle uygulanır. Azaltılmış hareket kipinde kapanış ve temizlik
animasyon bitişine bağlı kalmaz. Kaydırma dış panelde tanımlanır.

[Sekme kataloğu, komutlar ve hedef politikası](README.md)

[UI sözleşmesi ve uygulama fazları](../../docs/ui/README.md) tasarımın
hedef halini tanımlar; mevcut paket henüz web vitrini olarak çalışır.
