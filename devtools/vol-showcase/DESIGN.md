# UI vitrini tasarımı

Vitrin CORE DOM UI kataloğunun tüketicisidir. Bileşen uygulaması CORE'da,
örnek düzen ve etkileşimler bu pakettedir. Phaser ya da Tauri döngüsü
tarayıcı yolu için gerekmez; native vitrin ortak kabuğu tüketir.
Bir üründe tüketicisi olmayan CORE bileşeni vitrinde görünür ve
kendi adıyla CORE testinde sınanır.

## Görsel sözleşme

E2E gönderilen build'i sınar; mevcut motor kapsamı [README](README.md)
ve hedef genişleme [UI TODO](../../docs/ui/TODO.md) sahibindedir. Yerleşim testi
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
hedef halini tanımlar; web ve native girişleri mevcuttur. Tema ve ses
laboratuvarları çalışır; kalan aile/native kabulü UI TODO’da açıktır.

## Yerel (native) vitrin

`src-tauri` ortak `tauri-v2` kabuğunu tüketir (kimlik `studio.vol.showcase`, ürün adı VOL.UI).
Tarayıcı vitrini kabul hedefi değildir; cihaz kabulü yerel pencerede ve gerçek cihazda yapılır.

```bash
pnpm --filter @volstudio/vol-showcase tauri dev        # masaüstü, sıcak yeniden yükleme
pnpm --filter @volstudio/vol-showcase tauri build      # Windows: NSIS/exe; Linux: --bundles appimage
```

Linux paketi (AppImage) Windows'ta WSL Ubuntu 24.04 içinde üretilir:
`node scripts/linux/build-appimage.mjs devtools/vol-showcase` ve Deck'e
`pnpm deck deploy devtools/vol-showcase --appdir <AppDir>` ile yüklenir. Bu HOST derlemesidir, steamrt4
(SLR4) kabulü değildir; tuzaklar ve ölçümler [steam-deck.md](../../docs/steam-deck.md) içindedir.

## Gerçek cihazda sınama

Android (Chrome, adb): `node devtools/vol-showcase/scripts/device-ui.mjs --orientation both --tag <ad>`
yerel sunucuyu `adb reverse` ile cihaza bağlar, CDP ile `tests/device/tablet.spec.ts` koşar (dokunma
hedefi, yerleşim, ekran klavyesi, ses bağlamı, gecikme) ve köprüleri geri alır. Çıktı paketin git dışı
records alanına yazılır. Preview doğrudan Node çocuğudur; aracın kapanışı
yalnız sahip olunan süreci ve adb köprülerini bırakır. Dolu port başka
sunucuya bağlanmak yerine reddedilir; kabul kararı [VERIFICATION](../../docs/ui/VERIFICATION.md) içindedir.
Deck: `pnpm deck run … --release <kayıt>` ve `pnpm deck shot <ad>`; her ekran görüntüsü incelenir,
koşulmayan hücre NOT-RUN kalır.
