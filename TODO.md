# VOL.STUDIO — iş listesi

Repo genelinde **sıradaki işi** tutar: ne yapılacak, neden gerekli, ne zaman
kapanmış sayılır. Tek pakete sığan kalemler o paketin kendi `TODO.md`sinde
yaşar; buraya yalnız birden çok pakete ya da kök altyapıya (`scripts/`,
`justfile`, `quality.json`) dokunan işler girer.

Kapanan madde **silinir** — ne yapıldığının kaydı commit'in kendisidir. Kalıcı
kararlar burada değil ait oldukları belgede yaşar: [core/docs](core/docs),
[docs/gates.md](docs/gates.md), paketlerin `DESIGN.md` dosyaları.

## Aktif cephe — VOL.LIFE

Repo şu an tek bir yöne çalışıyor: VOL.LIFE'ı kurulu zeminden oynanabilir bir
oyuna taşımak. `vol-hell` ve `vol-arachnid` özellik işi beklemiyor; onlardan
istenen yalnız kapıları yeşil tutmak.

Sıradaki adım **Adım 1 — dünya substratı**. Kalemler, gerekçeler ve kabul
ölçütleri [games/vol-life/TODO.md](games/vol-life/TODO.md)'de; ürün kararları
ve inşa sırası [games/vol-life/DESIGN.md](games/vol-life/DESIGN.md)'de.

Kök altyapıdan beklenen iki kalem o listede duruyor ve **bilerek** erken
alınmıyor: `justfile`ın `e2e` tarifi VOL.LIFE'ın `test:e2e` script'i yazıldığı
turda, `quality.json`daki ölçekleme bütçesi de benchmark betiği yazıldığı turda
eklenir. İkisi de öncesinde eklenirse tarif var olmayan bir script'i çağırır ve
kapı, ölçtüğü bir şey olmadan yeşil görünür.

## Taşınan borçlar

Kapatılmamış, bilinçli kararla açık bırakılan maddeler. Her biri neden açık
durduğunu ve kapanması için neyin gerektiğini söyler.

- **iOS/WKWebView MP3 fallback'i manuel** (`pnpm convert:ios`). Ses ardışık
  düzeni OGG üretir; WKWebView OGG çalmaz. Dönüştürme elle koşulur çünkü iOS
  bugün hedeflenmiyor — hedefler Windows ve Android. iOS hedefe girdiği gün bu
  adım ses build'ine bağlanır.
